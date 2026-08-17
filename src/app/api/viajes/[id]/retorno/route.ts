import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { recalcularEstadoViaje } from "@/lib/pedidos";

// POST /api/viajes/[id]/retorno
// Escaneo de productos en viaje de recojo: valida contra la lista pre-populada
// de VPU con estado "pendiente", marca el producto como "devuelto" y restaura
// stock inmediatamente.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["almacen", "controller", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const codigoQr = String(body.codigo_qr ?? body.qr ?? "").trim();
  if (!codigoQr) return Response.json({ error: "Escanea un código QR" }, { status: 400 });

  const supabase = getSupabase();

  // Verificar que el viaje existe y es de recojo
  const { data: viaje } = await supabase
    .from("viajes")
    .select("id, pedido_id, estado, tipo")
    .eq("id", id)
    .single();
  if (!viaje) return Response.json({ error: "Viaje no encontrado" }, { status: 404 });
  if (viaje.tipo !== "recojo") {
    return Response.json({ error: "Este endpoint es solo para viajes de recojo" }, { status: 400 });
  }
  if (viaje.estado === "terminado" || viaje.estado === "cancelado") {
    return Response.json({ error: "El viaje ya fue terminado o cancelado" }, { status: 400 });
  }

  // Buscar el producto único por QR
  const { data: unico } = await supabase
    .from("productos_unicos")
    .select("id, producto_id, talla_id, talla_original, estado")
    .eq("codigo_qr", codigoQr)
    .maybeSingle();
  if (!unico) {
    return Response.json({ error: "No existe un producto con ese QR" }, { status: 404 });
  }

  // Buscar el VPU pendiente en este viaje que coincida con el producto escaneado
  const { data: vpu } = await supabase
    .from("viaje_producto_unicos")
    .select("id, detalle_pedido_id")
    .eq("viaje_id", id)
    .eq("producto_unico_id", unico.id)
    .eq("estado", "pendiente")
    .maybeSingle();

  if (!vpu) {
    // El ID exacto no está pendiente. Si hay otros pendientes para el mismo
    // detalle (cantidad > 1), aceptar y emparejar con cualquiera disponible.
    // Esto cubre el caso donde no sabés cuáles IDs específicos le diste al motorizado.
    const { data: otrosPendientes } = await supabase
      .from("viaje_producto_unicos")
      .select("id, detalle_pedido_id")
      .eq("viaje_id", id)
      .eq("estado", "pendiente")
      .limit(1);

    if (otrosPendientes && otrosPendientes.length > 0) {
      const vpuAlternativo = otrosPendientes[0];

      // Marcar ese VPU pendiente como devuelto
      await supabase
        .from("viaje_producto_unicos")
        .update({ estado: "devuelto", fecha_enviado: new Date().toISOString() })
        .eq("id", vpuAlternativo.id);

      // Restaurar stock del producto escaneado (el que realmente llegó)
      await supabase
        .from("productos_unicos")
        .update({ estado: "en_almacen", fecha_salida: null })
        .eq("id", unico.id);

      await supabase.from("movimientos_stock").insert({
        tipo: "entrada",
        producto_unico_id: unico.id,
        producto_id: unico.producto_id,
        cantidad: 1,
        nota: `Devolución registrada viaje ${viaje.id}`,
        registrado_por: user.id,
      });

      await supabase.from("historial_producto_unicos").insert({
        producto_unico_id: unico.id,
        evento: "devuelto",
        pedido_id: viaje.pedido_id,
        viaje_id: id,
        detalle_pedido_id: vpuAlternativo.detalle_pedido_id,
        persona_id: user.id,
        nota: `Devuelto al almacén via recojo (viaje ${viaje.id})`,
      });

      const { count: pendientesRestantes } = await supabase
        .from("viaje_producto_unicos")
        .select("id", { count: "exact", head: true })
        .eq("viaje_id", id)
        .eq("estado", "pendiente");

      return Response.json({
        ok: true,
        producto_devuelto: { id: unico.id, producto_id: unico.producto_id, codigo_qr: codigoQr },
        pendientes_restantes: pendientesRestantes ?? 0,
        completado: (pendientesRestantes ?? 0) === 0,
      }, { status: 200 });
    }

    // No hay pendientes de ningún tipo — producto no pertenece a este recojo
    return Response.json({ error: "Ese producto no está en la lista de retorno de este viaje" }, { status: 400 });
  }

  // Marcar VPU como devuelto
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
    producto_unico_id: unico.id,
    producto_id: unico.producto_id,
    cantidad: 1,
    nota: `Devolución registrada viaje ${viaje.id}`,
    registrado_por: user.id,
  });

  // Historial del producto único
  await supabase.from("historial_producto_unicos").insert({
    producto_unico_id: unico.id,
    evento: "devuelto",
    pedido_id: viaje.pedido_id,
    viaje_id: id,
    detalle_pedido_id: vpu.detalle_pedido_id,
    persona_id: user.id,
    nota: `Devuelto al almacén via recojo (viaje ${viaje.id})`,
  });

  // Contar cuántos pendientes quedan
  const { count: pendientesRestantes } = await supabase
    .from("viaje_producto_unicos")
    .select("id", { count: "exact", head: true })
    .eq("viaje_id", id)
    .eq("estado", "pendiente");

  const completado = (pendientesRestantes ?? 0) === 0;

  return Response.json({
    ok: true,
    producto_devuelto: {
      id: unico.id,
      producto_id: unico.producto_id,
      codigo_qr: codigoQr,
    },
    pendientes_restantes: pendientesRestantes ?? 0,
    completado,
  }, { status: 200 });
}
