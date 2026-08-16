import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { registrarHistorialPedido, syncEstadoPedidoPorViajes } from "@/lib/pedidos";

// GET /api/viajes/[id] — detalle del viaje: productos a alistar + alistados
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["almacen", "controller", "admin", "vendedora", "agendadora"]);
  if (error) return error;
  void user;

  const { id } = await params;
  const supabase = getSupabase();

  const { data: viaje, error: err } = await supabase
    .from("viajes")
    .select(`
      *, pedidos(codigo, estado, cliente_id, fecha_entrega, direccion_entrega, ciudad,
        clientes(nombre, apellido, telefono, direccion))
    `)
    .eq("id", id)
    .single();
  if (err || !viaje) return Response.json({ error: "Viaje no encontrado" }, { status: 404 });

  // Productos a alistar: detalles activos del viaje (imei, talla, cantidad)
  const { data: detalles } = await supabase
    .from("detalles_pedido")
    .select(`
      id, producto_id, talla_stock, talla_vendida, cantidad, es_extra_motorizado, entalle,
      productos(imei, nombre), tallas!detalles_pedido_talla_vendida_fkey(nombre),
      tallas_stock: tallas!detalles_pedido_talla_stock_fkey(nombre)
    `)
    .eq("viaje_id", id)
    .eq("estado", "activo")
    .order("creado_el");

  // Unidades ya alistadas en este viaje
  const { data: alistados } = await supabase
    .from("viaje_producto_unicos")
    .select(`
      id, detalle_pedido_id, estado, fecha_alistado, fecha_enviado,
      productos_unicos(id, codigo_qr, talla_id, talla_original, productos(imei))
    `)
    .eq("viaje_id", id);

  const porDetalle: Record<string, any[]> = {};
  for (const a of alistados ?? []) {
    const key = a.detalle_pedido_id ?? "sin-detalle";
    porDetalle[key] = porDetalle[key] ?? [];
    porDetalle[key].push(a);
  }

  const items = (detalles ?? []).map((d: any) => {
    const lista = porDetalle[d.id] ?? [];
    const falta = Number(d.cantidad) - lista.length;
    return {
      detalle_id: d.id,
      producto_id: d.producto_id,
      imei: d.productos?.imei,
      nombre: d.productos?.nombre,
      talla: d.tallas?.nombre ?? null,
      talla_id: d.talla_vendida,
      talla_stock: d.talla_stock ?? null,
      talla_stock_nombre: d.tallas_stock?.nombre ?? null,
      talla_vendida: d.talla_vendida ?? null,
      talla_vendida_nombre: d.tallas?.nombre ?? null,
      cantidad: Number(d.cantidad),
      es_extra_motorizado: d.es_extra_motorizado,
      entalle: d.entalle,
      alistados: lista.length,
      falta,
      completo: falta <= 0,
    };
  });

  return Response.json({
    viaje,
    cliente: viaje.pedidos?.clientes ?? null,
    pedido_codigo: viaje.pedidos?.codigo,
    pedido_estado: viaje.pedidos?.estado,
    items,
    alistados: alistados ?? [],
  });
}

// PATCH /api/viajes/[id] — { estado: "alistado" | "enviado" | "terminado" }
// Transiciones de estado del viaje; sincroniza el estado del pedido.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["almacen", "controller", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const nuevoEstado = body.estado;
  if (!["alistado", "enviado", "terminado"].includes(nuevoEstado)) {
    return Response.json({ error: "Estado de viaje inválido" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: viaje } = await supabase
    .from("viajes")
    .select("id, pedido_id, estado, tipo")
    .eq("id", id)
    .single();
  if (!viaje) return Response.json({ error: "Viaje no encontrado" }, { status: 404 });

  const orden = ["programado", "alistado", "enviado", "terminado"];
  if (orden.indexOf(nuevoEstado) < orden.indexOf(viaje.estado)) {
    return Response.json({ error: "No se puede retroceder el estado" }, { status: 400 });
  }

  // Al "alistado" se exige que todas las unidades del viaje estén alistadas
  if (nuevoEstado === "alistado" && viaje.tipo === "entrega") {
    const { data: detalles } = await supabase
      .from("detalles_pedido")
      .select("id, cantidad")
      .eq("viaje_id", id)
      .eq("estado", "activo");
    const { data: alistados } = await supabase
      .from("viaje_producto_unicos")
      .select("detalle_pedido_id")
      .eq("viaje_id", id);

    const contador: Record<string, number> = {};
    for (const a of alistados ?? []) contador[a.detalle_pedido_id] = (contador[a.detalle_pedido_id] ?? 0) + 1;

    const incompleto = (detalles ?? []).some(
      (d) => (contador[d.id] ?? 0) < Number(d.cantidad)
    );
    if (incompleto) {
      return Response.json(
        { error: "Faltan unidades por alistar antes de marcar el viaje como alistado" },
        { status: 400 }
      );
    }
  }

  // Obtener las unidades del viaje
  const { data: unidades } = await supabase
    .from("viaje_producto_unicos")
    .select("producto_unico_id, detalle_pedido_id")
    .eq("viaje_id", id);

  const unicoIds = (unidades ?? []).map((u) => u.producto_unico_id);

  const estadoPedidoAnterior = (
    await supabase.from("pedidos").select("estado").eq("id", viaje.pedido_id).single()
  ).data?.estado;

  if (nuevoEstado === "enviado") {
    // Las unidades salen del almacén: estado en_viaje + kardex de salida
    if (unicoIds.length > 0) {
      await supabase
        .from("productos_unicos")
        .update({ estado: "en_viaje", fecha_salida: new Date().toISOString() })
        .in("id", unicoIds);
      await supabase
        .from("viaje_producto_unicos")
        .update({ estado: "enviado", fecha_enviado: new Date().toISOString() })
        .eq("viaje_id", id);
      const { data: unicosInfo } = await supabase
        .from("productos_unicos")
        .select("producto_id, talla_id")
        .in("id", unicoIds);
      const agrupado: Record<string, { producto_id: string; talla_id: string; cantidad: number }> = {};
      for (const u of unicosInfo ?? []) {
        const key = `${u.producto_id}:${u.talla_id}`;
        agrupado[key] = agrupado[key] ?? { producto_id: u.producto_id, talla_id: u.talla_id, cantidad: 0 };
        agrupado[key].cantidad += 1;
      }
      const kardex = Object.values(agrupado).map((g) => ({
        producto_id: g.producto_id,
        talla_id: g.talla_id,
        tipo: "salida",
        cantidad: g.cantidad,
        referencia_tipo: "viaje",
        referencia_id: id,
        persona_id: user.id,
        nota: `Salida por envío de viaje`,
      }));
      if (kardex.length > 0) await supabase.from("movimientos_stock").insert(kardex);
      await supabase.from("historial_producto_unicos").insert(
        unicoIds.map((uid) => ({
          producto_unico_id: uid,
          evento: "enviado",
          pedido_id: viaje.pedido_id,
          viaje_id: id,
          persona_id: user.id,
          nota: "Enviado con el motorizado",
        }))
      );
    }
  }

  if (nuevoEstado === "terminado") {
    if (viaje.tipo === "entrega") {
      // Entrega: los productos quedan entregados al cliente
      if (unicoIds.length > 0) {
        await supabase.from("productos_unicos").update({ estado: "entregado" }).in("id", unicoIds);
        await supabase.from("viaje_producto_unicos").update({ estado: "enviado" }).eq("viaje_id", id);
        await supabase.from("historial_producto_unicos").insert(
          unicoIds.map((uid) => ({
            producto_unico_id: uid,
            evento: "entregado",
            pedido_id: viaje.pedido_id,
            viaje_id: id,
            persona_id: user.id,
            nota: "Entregado al cliente",
          }))
        );
      }
    } else {
      // Recojo: los productos vuelven a almacén (devueltos)
      if (unicoIds.length > 0) {
        await supabase
          .from("productos_unicos")
          .update({ estado: "en_almacen", fecha_salida: null })
          .in("id", unicoIds);
        await supabase.from("viaje_producto_unicos").update({ estado: "devuelto" }).eq("viaje_id", id);
        const { data: unicosInfo } = await supabase
          .from("productos_unicos")
          .select("producto_id, talla_id")
          .in("id", unicoIds);
        const agrupado: Record<string, { producto_id: string; talla_id: string; cantidad: number }> = {};
        for (const u of unicosInfo ?? []) {
          const key = `${u.producto_id}:${u.talla_id}`;
          agrupado[key] = agrupado[key] ?? { producto_id: u.producto_id, talla_id: u.talla_id, cantidad: 0 };
          agrupado[key].cantidad += 1;
        }
        const kardex = Object.values(agrupado).map((g) => ({
          producto_id: g.producto_id,
          talla_id: g.talla_id,
          tipo: "entrada",
          cantidad: g.cantidad,
          referencia_tipo: "viaje",
          referencia_id: id,
          persona_id: user.id,
          nota: `Entrada por devolución (recojo de viaje)`,
        }));
        if (kardex.length > 0) await supabase.from("movimientos_stock").insert(kardex);
        await supabase.from("historial_producto_unicos").insert(
          unicoIds.map((uid) => ({
            producto_unico_id: uid,
            evento: "devuelto",
            pedido_id: viaje.pedido_id,
            viaje_id: id,
            persona_id: user.id,
            nota: "Devuelto al almacén (recojo)",
          }))
        );
      }
    }
  }

  // Actualizar el estado del viaje
  const { data: viajeActualizado, error: vErr } = await supabase
    .from("viajes")
    .update({ estado: nuevoEstado })
    .eq("id", id)
    .select()
    .single();
  if (vErr || !viajeActualizado) {
    return Response.json({ error: "No se pudo actualizar el viaje" }, { status: 500 });
  }

  // Sincronizar estado del pedido según sus viajes
  const nuevoEstadoPedido = await syncEstadoPedidoPorViajes(viaje.pedido_id);
  const { data: pedidoActualizado } = await supabase
    .from("pedidos")
    .update({ estado: nuevoEstadoPedido })
    .eq("id", viaje.pedido_id)
    .select()
    .single();

  if (estadoPedidoAnterior !== nuevoEstadoPedido) {
    await registrarHistorialPedido({
      pedido_id: viaje.pedido_id,
      estado_anterior: estadoPedidoAnterior ?? null,
      estado_nuevo: nuevoEstadoPedido,
      persona_id: user.id,
      motivo: `Estado del viaje cambiado a ${nuevoEstado}`,
    });
  }

  return Response.json({
    viaje: viajeActualizado,
    pedido: pedidoActualizado,
  });
}
