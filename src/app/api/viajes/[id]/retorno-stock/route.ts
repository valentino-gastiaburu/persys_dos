import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { registrarAuditoria } from "@/lib/auditoria";

// POST /api/viajes/[id]/retorno-stock
// Devuelve productos al almacén desde cualquier viaje que tenga unidades pendientes.
// Funciona para viajes cancelados (entrega) con VPU alistado/enviado, y viajes
// de recojo con VPU pendiente/alistado. Acepta escaneo QR o búsqueda manual.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["almacen", "controller", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const codigoQr = String(body.codigo_qr ?? body.qr ?? "").trim();
  const busquedaManual = body.producto_id && body.talla_id;
  if (!codigoQr && !busquedaManual) {
    return Response.json({ error: "Escanea un código QR o proporciona producto_id + talla_id" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Verificar que el viaje existe
  const { data: viaje } = await supabase
    .from("viajes")
    .select("id, pedido_id, estado, tipo, codigo")
    .eq("id", id)
    .single();
  if (!viaje) return Response.json({ error: "Viaje no encontrado" }, { status: 404 });
  if (viaje.estado === "terminado") {
    return Response.json({ error: "El viaje ya fue terminado" }, { status: 400 });
  }

  // Buscar producto_unico por QR o por producto_id + talla_id
  let unico: any = null;
  if (codigoQr) {
    const { data } = await supabase
      .from("productos_unicos")
      .select("id, producto_id, talla_id, estado, codigo_qr")
      .eq("codigo_qr", codigoQr)
      .maybeSingle();
    unico = data;
  } else {
    // Búsqueda manual: buscar un producto_unico con el producto+talla que NO esté en_almacen
    const { data } = await supabase
      .from("productos_unicos")
      .select("id, producto_id, talla_id, estado, codigo_qr")
      .eq("producto_id", body.producto_id)
      .eq("talla_id", body.talla_id)
      .neq("estado", "en_almacen")
      .neq("estado", "eliminado")
      .limit(1)
      .maybeSingle();
    unico = data;
  }

  if (!unico) {
    return Response.json({ error: "No se encontró el producto" }, { status: 404 });
  }

  // Buscar VPU no-devuelto en este viaje que coincida con el producto escaneado
  const { data: vpu } = await supabase
    .from("viaje_producto_unicos")
    .select("id, detalle_pedido_id")
    .eq("viaje_id", id)
    .eq("producto_unico_id", unico.id)
    .not("estado", "eq", "devuelto")
    .not("estado", "eq", "pendiente")
    .maybeSingle();

  if (!vpu) {
    // Fuzzy match: buscar cualquier VPU no-devuelto del viaje
    const { data: otrosPendientes } = await supabase
      .from("viaje_producto_unicos")
      .select("id, detalle_pedido_id")
      .eq("viaje_id", id)
      .not("estado", "eq", "devuelto")
      .not("estado", "eq", "pendiente")
      .limit(1);

    if (otrosPendientes && otrosPendientes.length > 0) {
      const vpuAlternativo = otrosPendientes[0];

      await supabase
        .from("viaje_producto_unicos")
        .update({ estado: "devuelto", fecha_enviado: new Date().toISOString() })
        .eq("id", vpuAlternativo.id);

      await supabase
        .from("productos_unicos")
        .update({ estado: "en_almacen", fecha_salida: null })
        .eq("id", unico.id);

      await supabase.from("movimientos_stock").insert({
        tipo: "entrada",
        producto_id: unico.producto_id,
        talla_id: unico.talla_id,
        cantidad: 1,
        referencia_tipo: "viaje",
        referencia_id: id,
        persona_id: user.id,
        nota: `Devolución al stock viaje ${viaje.codigo}`,
      });

      await supabase.from("historial_producto_unicos").insert({
        producto_unico_id: unico.id,
        evento: "devuelto",
        pedido_id: viaje.pedido_id,
        viaje_id: id,
        detalle_pedido_id: vpuAlternativo.detalle_pedido_id,
        persona_id: user.id,
        nota: `Devuelto al almacén (viaje ${viaje.codigo})`,
      });

      const { count: pendientesRestantes } = await supabase
        .from("viaje_producto_unicos")
        .select("id", { count: "exact", head: true })
        .eq("viaje_id", id)
        .not("estado", "eq", "devuelto")
        .not("estado", "eq", "pendiente");

      await registrarAuditoria({
        user,
        entidad: "viaje",
        entidad_id: id,
        entidad_ref: viaje.codigo,
        sub_entidad: "producto_unico",
        sub_entidad_id: unico.id,
        sub_entidad_ref: unico.codigo_qr ?? codigoQr ?? null,
        accion: "devolver_stock",
        campo: "estado",
        valor_anterior: unico.estado,
        valor_nuevo: "en_almacen",
        nota: `Devolvió ${codigoQr || "producto"} al stock motorizado (viaje ${viaje.codigo})`,
      });

      return Response.json({
        ok: true,
        producto_devuelto: { id: unico.id, producto_id: unico.producto_id, codigo_qr: codigoQr || null },
        pendientes_restantes: pendientesRestantes ?? 0,
        completado: (pendientesRestantes ?? 0) === 0,
      }, { status: 200 });
    }

    return Response.json({ error: "Ese producto no está pendiente de retorno en este viaje" }, { status: 400 });
  }

  // Match exacto: marcar VPU como devuelto
  await supabase
    .from("viaje_producto_unicos")
    .update({ estado: "devuelto", fecha_enviado: new Date().toISOString() })
    .eq("id", vpu.id);

  // Restaurar stock: producto vuelve al almacén
  await supabase
    .from("productos_unicos")
    .update({ estado: "en_almacen", fecha_salida: null })
    .eq("id", unico.id);

  // Kardex: entrada de stock
  await supabase.from("movimientos_stock").insert({
    tipo: "entrada",
    producto_id: unico.producto_id,
    talla_id: unico.talla_id,
    cantidad: 1,
    referencia_tipo: "viaje",
    referencia_id: id,
    persona_id: user.id,
    nota: `Devolución al stock viaje ${viaje.codigo}`,
  });

  // Historial del producto único
  await supabase.from("historial_producto_unicos").insert({
    producto_unico_id: unico.id,
    evento: "devuelto",
    pedido_id: viaje.pedido_id,
    viaje_id: id,
    detalle_pedido_id: vpu.detalle_pedido_id,
    persona_id: user.id,
    nota: `Devuelto al almacén (viaje ${viaje.codigo})`,
  });

  // Contar cuántos pendientes quedan
  const { count: pendientesRestantes } = await supabase
    .from("viaje_producto_unicos")
    .select("id", { count: "exact", head: true })
    .eq("viaje_id", id)
    .not("estado", "eq", "devuelto")
    .not("estado", "eq", "pendiente");

  await registrarAuditoria({
    user,
    entidad: "viaje",
    entidad_id: id,
    entidad_ref: viaje.codigo,
    sub_entidad: "producto_unico",
    sub_entidad_id: unico.id,
    sub_entidad_ref: unico.codigo_qr ?? codigoQr ?? null,
    accion: "devolver_stock",
    campo: "estado",
    valor_anterior: unico.estado,
    valor_nuevo: "en_almacen",
    nota: `Devolvió ${codigoQr || "producto"} al stock motorizado (viaje ${viaje.codigo})`,
  });

  return Response.json({
    ok: true,
    producto_devuelto: {
      id: unico.id,
      producto_id: unico.producto_id,
      codigo_qr: codigoQr || null,
    },
    pendientes_restantes: pendientesRestantes ?? 0,
    completado: (pendientesRestantes ?? 0) === 0,
  }, { status: 200 });
}
