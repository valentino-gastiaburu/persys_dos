import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { registrarAuditoria } from "@/lib/auditoria";
import { sincronizarTotalesPedido } from "@/lib/pedidos";
import { getStockVentasPorTalla } from "@/lib/productos";
import { recalcularEstadoViaje } from "@/lib/pedidos";

// PATCH /api/pedidos/[id]/detalles/[detalleId] — editar cantidad/precio/entalle
// DELETE — borrado lógico (estado = oculto)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; detalleId: string }> }
) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;
  void user;

  const { id, detalleId } = await params;
  const body = await request.json();
  const supabase = getSupabase();

  const { data: pedido } = await supabase.from("pedidos").select("id, estado, codigo").eq("id", id).single();
  const EDITABLES = ["borrador", "solicitado", "confirmado", "alistado"];
  if (!pedido || !EDITABLES.includes(pedido.estado)) {
    return Response.json({ error: "El pedido ya no se puede editar" }, { status: 400 });
  }

  const { data: viajesExistentes } = await supabase
    .from("viajes").select("id, estado").eq("pedido_id", id);
  const viajesActivos = (viajesExistentes ?? []).filter((v: any) => v.estado !== "cancelado");
  if (viajesActivos.length > 0) {
    return Response.json({ error: "El pedido tiene viajes; editalo desde ahi" }, { status: 400 });
  }

  const { data: detalle } = await supabase
    .from("detalles_pedido")
    .select("*")
    .eq("id", detalleId)
    .eq("pedido_id", id)
    .single();
  if (!detalle) return Response.json({ error: "Detalle no encontrado" }, { status: 404 });

  const updates: Record<string, any> = {};
  if (body.cantidad !== undefined) {
    const cantidad = Number(body.cantidad);
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      return Response.json({ error: "Cantidad inválida" }, { status: 400 });
    }
    updates.cantidad = cantidad;
  }
  if (body.precio_unitario !== undefined) {
    updates.precio_unitario = Number(body.precio_unitario);
  }
  if (body.talla_stock !== undefined) updates.talla_stock = body.talla_stock || null;
  if (body.talla_vendida !== undefined) updates.talla_vendida = body.talla_vendida || null;
  if (body.entalle !== undefined) updates.entalle = Boolean(body.entalle);
  if (body.genero !== undefined) updates.genero = body.genero;
  if (body.es_extra_motorizado !== undefined) updates.es_extra_motorizado = Boolean(body.es_extra_motorizado);

  // Normalizar: la talla vendida siempre queda llena (igual a la de stock si no
  // hay entalle); el entalle real es que ambas difieran.
  if (updates.talla_stock !== undefined || updates.entalle !== undefined || updates.talla_vendida !== undefined) {
    const tallaStock = updates.talla_stock !== undefined ? updates.talla_stock : detalle.talla_stock;
    let tallaVendida = updates.talla_vendida !== undefined ? updates.talla_vendida : detalle.talla_vendida;
    if (!updates.entalle) tallaVendida = tallaStock;
    updates.talla_stock = tallaStock;
    updates.talla_vendida = tallaVendida;
    updates.entalle = Boolean(tallaStock && tallaVendida && tallaStock !== tallaVendida);
  }

  const cantidad = Number(updates.cantidad ?? detalle.cantidad);
  const precio = Number(updates.precio_unitario ?? detalle.precio_unitario);
  updates.subtotal = cantidad * precio;

  // Al aumentar la cantidad, verificar stock de ventas (el stock ya incluye este detalle).
  // La talla que se consume es la STOCK.
  if (updates.cantidad !== undefined && cantidad > Number(detalle.cantidad)) {
    const tallaReserva = updates.talla_stock !== undefined ? updates.talla_stock : detalle.talla_stock;
    if (tallaReserva) {
      const stockVentas = await getStockVentasPorTalla();
      const disponible = Number(stockVentas[`${detalle.producto_id}|${tallaReserva}`] ?? 0);
      if (disponible + Number(detalle.cantidad) < cantidad) {
        return Response.json(
          { error: `Stock insuficiente: solo puedes llegar a ${disponible + Number(detalle.cantidad)} en esa talla` },
          { status: 400 }
        );
      }
    }
  }

  const { data: actualizado, error: err } = await supabase
    .from("detalles_pedido")
    .update(updates)
    .eq("id", detalleId)
    .select("*, productos(imei, nombre), tallas!detalles_pedido_talla_vendida_fkey(nombre)")
    .single();

  if (err || !actualizado) {
    return Response.json({ error: "No se pudo actualizar el detalle" }, { status: 500 });
  }

  // Recalcular totales (del viaje y del pedido)
  const montoTotal = await sincronizarTotalesPedido(id);
  await supabase.from("pedidos").update({ monto_total: montoTotal }).eq("id", id);

  // Recalcular estado del viaje (¿todas las líneas cubiertas? ¿exceso de alistado?)
  if (detalle.viaje_id) {
    await recalcularEstadoViaje(detalle.viaje_id);
  }

  const diffs: { campo: string; anterior: unknown; nuevo: unknown }[] = [];
  for (const key of Object.keys(updates)) {
    if (key === "subtotal") continue;
    if ((detalle as Record<string, any>)[key] !== updates[key]) {
      diffs.push({ campo: key, anterior: (detalle as Record<string, any>)[key], nuevo: updates[key] });
    }
  }
  for (const d of diffs) {
    await registrarAuditoria({
      user,
      entidad: "detalle_pedido",
      entidad_id: detalleId,
      entidad_ref: pedido.codigo,
      sub_entidad: "pedido",
      sub_entidad_id: pedido.id,
      sub_entidad_ref: pedido.codigo,
      accion: "editar",
      campo: d.campo,
      valor_anterior: d.anterior ?? null,
      valor_nuevo: d.nuevo ?? null,
      nota: `Editó línea de ${actualizado.productos?.imei ?? ""} (pedido ${pedido.codigo})`,
    });
  }

  return Response.json({ detalle: actualizado, monto_total: montoTotal });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; detalleId: string }> }
) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;
  void user;

  const { id, detalleId } = await params;
  const supabase = getSupabase();

  const { data: pedido } = await supabase.from("pedidos").select("id, estado, codigo").eq("id", id).single();
  const EDITABLES = ["borrador", "solicitado", "confirmado", "alistado"];
  if (!pedido || !EDITABLES.includes(pedido.estado)) {
    return Response.json({ error: "El pedido ya no se puede editar" }, { status: 400 });
  }

  const { data: viajesExistentes } = await supabase
    .from("viajes").select("id, estado").eq("pedido_id", id);
  const viajesActivos = (viajesExistentes ?? []).filter((v: any) => v.estado !== "cancelado");
  if (viajesActivos.length > 0) {
    return Response.json({ error: "El pedido tiene viajes; editalo desde ahi" }, { status: 400 });
  }

  const { data: detalle } = await supabase
    .from("detalles_pedido")
    .select("*")
    .eq("id", detalleId)
    .eq("pedido_id", id)
    .single();
  if (!detalle) return Response.json({ error: "Detalle no encontrado" }, { status: 404 });

  const { error: err } = await supabase
    .from("detalles_pedido")
    .update({ estado: "oculto" })
    .eq("id", detalleId);
  if (err) return Response.json({ error: "No se pudo quitar el detalle" }, { status: 500 });

  const montoTotal = await sincronizarTotalesPedido(id);
  await supabase.from("pedidos").update({ monto_total: montoTotal }).eq("id", id);

  // Recalcular estado del viaje tras quitar línea
  if (detalle.viaje_id) {
    await recalcularEstadoViaje(detalle.viaje_id);
  }

  await registrarAuditoria({
    user,
    entidad: "detalle_pedido",
    entidad_id: detalleId,
    entidad_ref: pedido.codigo,
    sub_entidad: "pedido",
    sub_entidad_id: pedido.id,
    sub_entidad_ref: pedido.codigo,
    accion: "eliminar",
    campo: "estado",
    valor_anterior: "activo",
    valor_nuevo: "oculto",
    nota: `Quitó línea de ${detalle.producto_id ?? ""} (pedido ${pedido.codigo})`,
  });

  return Response.json({ ok: true, monto_total: montoTotal });
}
