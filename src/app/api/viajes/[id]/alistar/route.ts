import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

// POST /api/viajes/[id]/alistar
// Escaneo de QR: asigna un producto_unico al viaje.
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

  const { data: viaje } = await supabase
    .from("viajes")
    .select("id, pedido_id, estado")
    .eq("id", id)
    .single();
  if (!viaje) return Response.json({ error: "Viaje no encontrado" }, { status: 404 });
  if (viaje.estado === "enviado" || viaje.estado === "terminado") {
    return Response.json({ error: "El viaje ya fue enviado o terminado" }, { status: 400 });
  }

  const { data: unico } = await supabase
    .from("productos_unicos")
    .select("id, producto_id, talla_id, talla_original, estado")
    .eq("codigo_qr", codigoQr)
    .maybeSingle();
  if (!unico) {
    return Response.json({ error: "No existe un producto con ese QR" }, { status: 404 });
  }
  if (unico.estado !== "en_almacen") {
    return Response.json({ error: "Ese producto no está disponible en almacén" }, { status: 400 });
  }

  // ¿Ya está alistado en este viaje?
  const { data: yaAlistado } = await supabase
    .from("viaje_producto_unicos")
    .select("id")
    .eq("viaje_id", id)
    .eq("producto_unico_id", unico.id)
    .maybeSingle();
  if (yaAlistado) {
    return Response.json({ error: "Ese producto ya fue alistado en este viaje" }, { status: 400 });
  }

  // Buscar un detalle del viaje que necesite este producto (mismo IMEI y talla, o entalle)
  const { data: detalles } = await supabase
    .from("detalles_pedido")
    .select(`
      id, producto_id, talla_id, cantidad, entalle,
      productos(imei), tallas!detalles_pedido_talla_id_fkey(nombre)
    `)
    .eq("viaje_id", id)
    .eq("estado", "activo")
    .eq("producto_id", unico.producto_id)
    .order("creado_el");

  if (!detalles || detalles.length === 0) {
    return Response.json(
      { error: "Este producto no está en el listado del viaje" },
      { status: 400 }
    );
  }

  // Contar alistados por detalle
  const { data: alistados } = await supabase
    .from("viaje_producto_unicos")
    .select("detalle_pedido_id")
    .eq("viaje_id", id);
  const contador: Record<string, number> = {};
  for (const a of alistados ?? []) {
    contador[a.detalle_pedido_id] = (contador[a.detalle_pedido_id] ?? 0) + 1;
  }

  // Elegir detalle: sin entalle -> talla exacta; con entalle -> cualquier talla del producto
  let detalleElegido: any = null;
  for (const d of detalles) {
    const ya = contador[d.id] ?? 0;
    if (ya >= Number(d.cantidad)) continue;
    if (!d.entalle && d.talla_id !== unico.talla_id) continue;
    detalleElegido = d;
    break;
  }

  if (!detalleElegido) {
    const pendientes = detalles
      .filter((d: any) => (contador[d.id] ?? 0) < Number(d.cantidad))
      .map((d: any) => `${d.productos?.imei} (${d.tallas?.nombre ?? "Sin talla"})`);
    if (pendientes.length === 0) {
      return Response.json(
        { error: "Ya se subieron todos los productos que necesita este viaje" },
        { status: 400 }
      );
    }
    return Response.json(
      { error: `La talla no coincide. Pendiente: ${pendientes.join(", ")}` },
      { status: 400 }
    );
  }

  // Aplicar entalle si aplica: la talla destino cambia la talla actual del único
  let tallaNueva = unico.talla_id;
  let fueEntallado = false;
  if (detalleElegido.entalle && unico.talla_id !== detalleElegido.talla_id) {
    tallaNueva = detalleElegido.talla_id;
    fueEntallado = true;
  }

  const { data: vpu, error: vpuErr } = await supabase
    .from("viaje_producto_unicos")
    .insert({
      viaje_id: id,
      producto_unico_id: unico.id,
      detalle_pedido_id: detalleElegido.id,
      estado: "alistado",
      alistado_por: user.id,
      fecha_alistado: new Date().toISOString(),
    })
    .select("*, productos_unicos(codigo_qr, talla_original, productos(imei))")
    .single();

  if (vpuErr || !vpu) {
    return Response.json({ error: "No se pudo alistar el producto" }, { status: 500 });
  }

  // Actualizar el único a almacén de espera y entallar si corresponde
  await supabase
    .from("productos_unicos")
    .update({
      estado: "almacen_espera",
      talla_original: fueEntallado ? unico.talla_id : unico.talla_original,
      talla_id: tallaNueva,
    })
    .eq("id", unico.id);

  await supabase.from("historial_producto_unicos").insert({
    producto_unico_id: unico.id,
    evento: fueEntallado ? "entallado" : "alistado",
    pedido_id: viaje.pedido_id,
    viaje_id: id,
    detalle_pedido_id: detalleElegido.id,
    talla_anterior: fueEntallado ? unico.talla_id : null,
    talla_nueva: fueEntallado ? tallaNueva : null,
    persona_id: user.id,
    nota: fueEntallado
      ? `Entallado para viaje ${viaje.id}`
      : `Alistado para viaje ${viaje.id}`,
  });

  return Response.json({
    vpu,
    detalle: detalleElegido,
    entallado: fueEntallado,
    talla_anterior: fueEntallado ? unico.talla_id : null,
    talla_nueva: fueEntallado ? tallaNueva : null,
  }, { status: 201 });
}
