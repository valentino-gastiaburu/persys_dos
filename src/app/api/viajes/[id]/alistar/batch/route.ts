import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { registrarAuditoria } from "@/lib/auditoria";
import { recalcularEstadoViaje } from "@/lib/pedidos";

// POST /api/viajes/[id]/alistar/batch
// Guarda múltiples unidades alistadas de una vez (batch).
// Body: { lineas: [{ codigo_qr, detalle_id }] }
// Valida cada línea como el alistar individual. Si todas las unidades del viaje
// quedan alistadas, el viaje pasa a "alistado" automáticamente.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["almacen", "controller", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const lineas: { codigo_qr: string; detalle_id?: string }[] = body.lineas ?? [];

  if (lineas.length === 0) {
    return Response.json({ error: "No hay unidades para alistar" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: viaje } = await supabase
    .from("viajes")
    .select("id, pedido_id, estado, tipo, codigo")
    .eq("id", id)
    .single();
  if (!viaje) return Response.json({ error: "Viaje no encontrado" }, { status: 404 });
  if (viaje.estado === "enviado" || viaje.estado === "terminado") {
    return Response.json({ error: "El viaje ya fue enviado o terminado" }, { status: 400 });
  }
  const pedidoRef = (
    await supabase.from("pedidos").select("codigo").eq("id", viaje.pedido_id).single()
  ).data?.codigo ?? viaje.pedido_id;

  const esRecojo = viaje.tipo === "recojo";
  const estadoRequerido = esRecojo ? "entregado" : "en_almacen";

  // Cargar todos los detalles del viaje (para validar tallas y cantidades)
  const { data: detallesData } = await supabase
    .from("detalles_pedido")
    .select(`
      id, producto_id, talla_stock, talla_vendida, cantidad, entalle,
      productos(imei), tallas!detalles_pedido_talla_vendida_fkey(nombre),
      tallas_stock: tallas!detalles_pedido_talla_stock_fkey(nombre)
    `)
    .eq("viaje_id", id)
    .not("estado", "eq", "oculto")
    .order("creado_el");
  const detalles = (detallesData ?? []) as any[];

  // Contar alistados actuales por detalle
  const { data: alistadosActuales } = await supabase
    .from("viaje_producto_unicos")
    .select("detalle_pedido_id")
    .eq("viaje_id", id);
  const contador: Record<string, number> = {};
  for (const a of alistadosActuales ?? []) {
    contador[a.detalle_pedido_id] = (contador[a.detalle_pedido_id] ?? 0) + 1;
  }

  // Cargar todos los productos únicos por QR (una sola consulta)
  const qrs = [...new Set(lineas.map((l) => String(l.codigo_qr).trim()).filter(Boolean))];
  const { data: unicosData } = await supabase
    .from("productos_unicos")
    .select("id, producto_id, talla_id, talla_original, estado, codigo_qr")
    .in("codigo_qr", qrs);
  const unicoPorQr = new Map((unicosData ?? []).map((u: any) => [u.codigo_qr, u]));

  // Cargar ya alistados en este viaje (para evitar duplicados)
  const { data: yaAlistadosData } = await supabase
    .from("viaje_producto_unicos")
    .select("producto_unico_id")
    .eq("viaje_id", id);
  const yaAlistadosSet = new Set((yaAlistadosData ?? []).map((a) => a.producto_unico_id));

  const guardados: { codigo_qr: string; detalle_id: string; entallado: boolean }[] = [];
  const errores: { codigo_qr: string; error: string }[] = [];

  // Procesar cada línea
  for (const linea of lineas) {
    const codigoQr = String(linea.codigo_qr).trim();
    if (!codigoQr) {
      errores.push({ codigo_qr: "", error: "Código QR vacío" });
      continue;
    }

    const unico = unicoPorQr.get(codigoQr);
    if (!unico) {
      errores.push({ codigo_qr: codigoQr, error: "No existe un producto con ese QR" });
      continue;
    }
    if (unico.estado !== estadoRequerido) {
      errores.push({
        codigo_qr: codigoQr,
        error: esRecojo ? "Ese producto no está entregado al cliente" : "Ese producto no está disponible en almacén",
      });
      continue;
    }
    if (yaAlistadosSet.has(unico.id)) {
      errores.push({ codigo_qr: codigoQr, error: "Ese producto ya fue alistado en este viaje" });
      continue;
    }

    // Buscar detalle: si se pasó detalle_id, forzar; si no, buscar por producto+talla
    let candidatos = detalles.filter(
      (d) => d.producto_id === unico.producto_id && (contador[d.id] ?? 0) < Number(d.cantidad)
    );
    if (linea.detalle_id) {
      candidatos = candidatos.filter((d) => d.id === linea.detalle_id);
    }

    let detalleElegido: any = null;
    for (const d of candidatos) {
      const tallaOrigen = esRecojo
        ? d.talla_vendida ?? d.talla_stock
        : d.talla_stock ?? d.talla_vendida;
      if (unico.talla_id !== tallaOrigen) continue;
      detalleElegido = d;
      break;
    }

    if (!detalleElegido) {
      errores.push({
        codigo_qr: codigoQr,
        error: "La talla no coincide o el producto no está en el listado del viaje",
      });
      continue;
    }

    // Aplicar entalle si aplica
    let tallaNueva = unico.talla_id;
    let fueEntallado = false;
    const tallaDestino = detalleElegido.talla_vendida ?? detalleElegido.talla_stock;
    if (tallaDestino && unico.talla_id !== tallaDestino) {
      tallaNueva = tallaDestino;
      fueEntallado = true;
    }

    // Insertar en viaje_producto_unicos
    const { error: vpuErr } = await supabase.from("viaje_producto_unicos").insert({
      viaje_id: id,
      producto_unico_id: unico.id,
      detalle_pedido_id: detalleElegido.id,
      estado: "alistado",
      alistado_por: user.id,
      fecha_alistado: new Date().toISOString(),
    });
    if (vpuErr) {
      errores.push({ codigo_qr: codigoQr, error: "No se pudo alistar el producto" });
      continue;
    }

    // Actualizar contador intra-batch para no exceder cantidad del detalle
    contador[detalleElegido.id] = (contador[detalleElegido.id] ?? 0) + 1;

    // Actualizar el único
    await supabase
      .from("productos_unicos")
      .update({
        estado: "almacen_espera",
        talla_original: fueEntallado ? unico.talla_id : unico.talla_original,
        talla_id: tallaNueva,
      })
      .eq("id", unico.id);

    // Kardex por entalle: la unidad sale de la talla original y entra a la nueva
    if (fueEntallado) {
      await supabase.from("movimientos_stock").insert([
        {
          producto_id: unico.producto_id,
          talla_id: unico.talla_id,
          tipo: "salida",
          cantidad: 1,
          referencia_tipo: "viaje",
          referencia_id: id,
          persona_id: user.id,
          nota: `Entalle: sale de su talla (${codigoQr})`,
        },
        {
          producto_id: unico.producto_id,
          talla_id: tallaNueva,
          tipo: "entrada",
          cantidad: 1,
          referencia_tipo: "viaje",
          referencia_id: id,
          persona_id: user.id,
          nota: `Entalle: entra a la talla destino (${codigoQr})`,
        },
      ]);
    }

    // Historial
    await supabase.from("historial_producto_unicos").insert({
      producto_unico_id: unico.id,
      evento: fueEntallado ? "entallado" : "alistado",
      pedido_id: viaje.pedido_id,
      viaje_id: id,
      detalle_pedido_id: detalleElegido.id,
      talla_anterior: fueEntallado ? unico.talla_id : null,
      talla_nueva: fueEntallado ? tallaNueva : null,
      persona_id: user.id,
      nota: fueEntallado ? `Entallado para viaje ${viaje.id}` : `Alistado para viaje ${viaje.id}`,
    });

    // Marcar como alistado en el set (para evitar duplicados dentro del mismo batch)
    yaAlistadosSet.add(unico.id);

    guardados.push({
      codigo_qr: codigoQr,
      detalle_id: detalleElegido.id,
      entallado: fueEntallado,
    });
  }

  // Recalcular estado del viaje (alistado si todas cubiertas, inconsistencias si exceso)
  const eraProgramado = viaje.estado === "programado";
  await recalcularEstadoViaje(id);

  if (guardados.length > 0) {
    await registrarAuditoria({
      user,
      entidad: "viaje",
      entidad_id: id,
      entidad_ref: viaje.codigo,
      sub_entidad: "producto_unico",
      accion: "alistar",
      nota: `Alistó ${guardados.length} unidad(es) en el viaje ${viaje.codigo} (pedido ${pedidoRef}). Errores: ${errores.length}`,
    });
  }

  return Response.json({
    guardados,
    errores,
    viaje_alistado: eraProgramado,
  }, { status: 201 });
}