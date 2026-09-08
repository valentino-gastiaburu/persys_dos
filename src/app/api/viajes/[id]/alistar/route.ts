import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { registrarAuditoria } from "@/lib/auditoria";
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

  await registrarAuditoria({
    user,
    entidad: "viaje",
    entidad_id: id,
    entidad_ref: viaje.codigo,
    sub_entidad: "producto_unico",
    sub_entidad_id: unico.id,
    sub_entidad_ref: vpu.productos_unicos?.codigo_qr ?? codigoQr,
    accion: fueEntallado ? "entallar" : "alistar",
    campo: "estado",
    valor_anterior: unico.estado,
    valor_nuevo: fueEntallado ? "almacen_espera (entallado)" : "almacen_espera",
    nota: fueEntallado
      ? `Entalló ${vpu.productos_unicos?.productos?.imei ?? codigoQr} para el viaje ${viaje.codigo} (pedido ${pedidoRef})`
      : `Alistó ${vpu.productos_unicos?.productos?.imei ?? codigoQr} en el viaje ${viaje.codigo} (pedido ${pedidoRef})`,
  });

  return Response.json({
    vpu,
    detalle: detalleElegido,
    entallado: fueEntallado,
    talla_anterior: fueEntallado ? unico.talla_id : null,
    talla_nueva: fueEntallado ? tallaNueva : null,
  }, { status: 201 });
}

// DELETE /api/viajes/[id]/alistar — quitar productos alistados (VPU)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["almacen", "controller", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const vpuIds: string[] = body.vpu_ids ?? [];
  if (vpuIds.length === 0) {
    return Response.json({ error: "Falta vpu_ids" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: viaje } = await supabase
    .from("viajes")
    .select("id, estado, codigo, pedido_id")
    .eq("id", id)
    .single();
  if (!viaje) return Response.json({ error: "Viaje no encontrado" }, { status: 404 });
  if (viaje.estado === "enviado" || viaje.estado === "terminado") {
    return Response.json({ error: "El viaje ya fue enviado o terminado" }, { status: 400 });
  }
  const pedidoRef = (
    await supabase.from("pedidos").select("codigo").eq("id", viaje.pedido_id).single()
  ).data?.codigo ?? viaje.pedido_id;

  // Traer los VPU que pertenecen a este viaje
  const { data: vpus } = await supabase
    .from("viaje_producto_unicos")
    .select("id, producto_unico_id, productos_unicos(producto_id, talla_id)")
    .eq("viaje_id", id)
    .in("id", vpuIds);

  if (!vpus || vpus.length === 0) {
    return Response.json({ error: "No se encontraron productos para quitar" }, { status: 404 });
  }

  let eliminados = 0;
  for (const vpu of vpus) {
    // Restaurar producto a en_almacen
    await supabase
      .from("productos_unicos")
      .update({ estado: "en_almacen", fecha_salida: null })
      .eq("id", vpu.producto_unico_id);

    // Kardex: entrada al stock (se quitó del viaje y vuelve al almacén)
    const u = (vpu.productos_unicos as unknown as { producto_id: string; talla_id: string } | null) ?? null;
    if (u) {
      await supabase.from("movimientos_stock").insert({
        tipo: "entrada",
        producto_id: u.producto_id,
        talla_id: u.talla_id,
        cantidad: 1,
        referencia_tipo: "viaje",
        referencia_id: id,
        persona_id: user.id,
        nota: `Producto removido del viaje ${viaje.codigo} — devuelto a stock`,
      });
    }

    // Historial
    await supabase.from("historial_producto_unicos").insert({
      producto_unico_id: vpu.producto_unico_id,
      evento: "alistado",
      viaje_id: id,
      persona_id: user.id,
      nota: `Removido del viaje ${id}`,
    });

    // Eliminar el VPU
    await supabase.from("viaje_producto_unicos").delete().eq("id", vpu.id);
    eliminados++;
  }

  // Recalcular estado del viaje
  await recalcularEstadoViaje(id);

  await registrarAuditoria({
    user,
    entidad: "viaje",
    entidad_id: id,
    entidad_ref: viaje.codigo,
    sub_entidad: "producto_unico",
    sub_entidad_id: vpus[0]?.producto_unico_id,
    accion: "desalistar",
    campo: "estado",
    valor_anterior: "almacen_espera",
    valor_nuevo: "en_almacen",
    nota: `Quitó ${eliminados} producto(s) del viaje ${viaje.codigo} (pedido ${pedidoRef})`,
  });

  return Response.json({ eliminados });
}
