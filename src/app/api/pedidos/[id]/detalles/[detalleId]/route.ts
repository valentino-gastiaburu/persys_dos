import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { calcularTotal } from "@/lib/pedidos";

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
  if (body.entalle !== undefined) updates.entalle = Boolean(body.entalle);
  if (body.talla_inicial !== undefined) updates.talla_inicial = body.talla_inicial || null;
  if (body.genero !== undefined) updates.genero = body.genero;
  if (body.es_extra_motorizado !== undefined) updates.es_extra_motorizado = Boolean(body.es_extra_motorizado);

  const cantidad = Number(updates.cantidad ?? detalle.cantidad);
  const precio = Number(updates.precio_unitario ?? detalle.precio_unitario);
  updates.subtotal = cantidad * precio;

  const { data: actualizado, error: err } = await supabase
    .from("detalles_pedido")
    .update(updates)
    .eq("id", detalleId)
    .select("*, productos(imei, nombre), tallas!detalles_pedido_talla_id_fkey(nombre)")
    .single();

  if (err || !actualizado) {
    return Response.json({ error: "No se pudo actualizar el detalle" }, { status: 500 });
  }

  // Recalcular total
  const detalles = await supabase
    .from("detalles_pedido")
    .select("subtotal")
    .eq("pedido_id", id)
    .eq("estado", "activo");
  const { data: pedidoActual } = await supabase
    .from("pedidos")
    .select("costo_envio")
    .eq("id", id)
    .single();
  const montoTotal = calcularTotal(
    (detalles.data ?? []).map((d) => ({ subtotal: Number(d.subtotal) })),
    Number(pedidoActual?.costo_envio ?? 0)
  );
  await supabase.from("pedidos").update({ monto_total: montoTotal }).eq("id", id);

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

  const detalles = await supabase
    .from("detalles_pedido")
    .select("subtotal")
    .eq("pedido_id", id)
    .eq("estado", "activo");
  const { data: pedidoActual } = await supabase
    .from("pedidos")
    .select("costo_envio")
    .eq("id", id)
    .single();
  const montoTotal = calcularTotal(
    (detalles.data ?? []).map((d) => ({ subtotal: Number(d.subtotal) })),
    Number(pedidoActual?.costo_envio ?? 0)
  );
  await supabase.from("pedidos").update({ monto_total: montoTotal }).eq("id", id);

  return Response.json({ ok: true, monto_total: montoTotal });
}
