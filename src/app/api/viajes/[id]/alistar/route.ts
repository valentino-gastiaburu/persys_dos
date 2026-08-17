import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { recalcularEstadoViaje } from "@/lib/pedidos";

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
  const detalleId = body.detalle_id ? String(body.detalle_id) : null;

  if (!codigoQr) return Response.json({ error: "Escanea un código QR" }, { status: 400 });

  const supabase = getSupabase();

  const { data: viaje } = await supabase
    .from("viajes")
    .select("id, pedido_id, estado, tipo")
    .eq("id", id)
    .single();
  if (!viaje) return Response.json({ error: "Viaje no encontrado" }, { status: 404 });
  if (viaje.estado === "enviado" || viaje.estado === "terminado") {
    return Response.json({ error: "El viaje ya fue enviado o terminado" }, { status: 400 });
  }

  // En una entrega se alistan unidades de almacén; en un regreso (recojo) se
  // recogen las unidades que ya fueron entregadas al cliente.
  const esRecojo = viaje.tipo === "recojo";

  const { data: unico } = await supabase
    .from("productos_unicos")
    .select("id, producto_id, talla_id, talla_original, estado")
    .eq("codigo_qr", codigoQr)
    .maybeSingle();
  if (!unico) {
    return Response.json({ error: "No existe un producto con ese QR" }, { status: 404 });
  }
  const estadoRequerido = esRecojo ? "entregado" : "en_almacen";
  if (unico.estado !== estadoRequerido) {
    return Response.json(
      { error: esRecojo ? "Ese producto no está entregado al cliente" : "Ese producto no está disponible en almacén" },
      { status: 400 }
    );
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

  // Buscar un detalle del viaje que necesite este producto. Si se pasó un
  // detalle_id (producto seleccionado en la UI), se fuerza la asignación a ese
  // detalle; si no, se busca automáticamente el que coincida con IMEI y talla.
  let queryDetalles = supabase
    .from("detalles_pedido")
    .select(`
      id, producto_id, talla_stock, talla_vendida, cantidad, entalle,
      productos(imei), tallas!detalles_pedido_talla_vendida_fkey(nombre),
      tallas_stock: tallas!detalles_pedido_talla_stock_fkey(nombre)
    `)
    .eq("viaje_id", id)
    .not("estado", "eq", "oculto")
    .eq("producto_id", unico.producto_id)
    .order("creado_el");

  if (detalleId) {
    queryDetalles = queryDetalles.eq("id", detalleId);
  }

  const { data: detalles } = await queryDetalles;

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

  // Elegir detalle: la unidad debe tener la talla que corresponde. En entregas
  // se toma la talla STOCK (la que hay en almacén); en regresos la talla que
  // realmente tiene la unidad entregada (talla vendida). Si el detalle tiene
  // entalle se modifica a la talla vendida (destino).
  let detalleElegido: any = null;
  for (const d of detalles) {
    const ya = contador[d.id] ?? 0;
    if (ya >= Number(d.cantidad)) continue;
    const tallaOrigen = esRecojo
      ? d.talla_vendida ?? d.talla_stock
      : d.talla_stock ?? d.talla_vendida;
    if (unico.talla_id !== tallaOrigen) continue;
    detalleElegido = d;
    break;
  }

  if (!detalleElegido) {
    const pendientes = detalles
      .filter((d: any) => (contador[d.id] ?? 0) < Number(d.cantidad))
      .map((d: any) =>
        d.entalle
          ? `${d.productos?.imei} (toma ${d.tallas_stock?.nombre ?? "Sin talla"} → ${d.tallas?.nombre ?? "Sin talla"})`
          : `${d.productos?.imei} (${d.tallas?.nombre ?? "Sin talla"})`
      );
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

  // Aplicar entalle si aplica: la talla vendida (destino) cambia la talla actual del único
  let tallaNueva = unico.talla_id;
  let fueEntallado = false;
  const tallaDestino = detalleElegido.talla_vendida ?? detalleElegido.talla_stock;
  if (tallaDestino && unico.talla_id !== tallaDestino) {
    tallaNueva = tallaDestino;
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

  await recalcularEstadoViaje(id);

  return Response.json({
    vpu,
    detalle: detalleElegido,
    entallado: fueEntallado,
    talla_anterior: fueEntallado ? unico.talla_id : null,
    talla_nueva: fueEntallado ? tallaNueva : null,
  }, { status: 201 });
}
