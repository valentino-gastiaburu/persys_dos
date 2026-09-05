import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { calcularTotal, calcularTotalPedido, getDetallesActivos, recalcularTotalViaje } from "@/lib/pedidos";
import { obtenerFechaHoyLima, esRetrasado } from "@/lib/retraso";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "almacen", "controller", "admin"]);
  if (error) return error;
  void user;

  const { id } = await params;
  const supabase = getSupabase();

  const { data: pedido, error: err } = await supabase
    .from("pedidos")
    .select(`
      *, clientes(*),
      creado_por_usuario:usuarios!pedidos_creado_por_fkey(id, nombre),
      vendedora:usuarios!pedidos_vendedora_1_id_fkey(id, nombre),
      contribuyente:usuarios!pedidos_vendedora_contribuyente_id_fkey(id, nombre),
      contribuyente2:usuarios!pedidos_vendedora_contribuyente_2_id_fkey(id, nombre),
      agendadora:usuarios!pedidos_agendadora_id_fkey(id, nombre)
    `)
    .eq("id", id)
    .single();

  if (err || !pedido) {
    return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  const detalles = await getDetallesActivos(id);

  const { data: pagos } = await supabase
    .from("pagos")
    .select("*")
    .eq("pedido_id", id)
    .order("fecha_pactada", { ascending: true })
    .order("fecha", { ascending: true });

  const totalPagado = (pagos ?? [])
    .filter((p) => p.estado === "pagado")
    .reduce((acc, p) => acc + Number(p.monto), 0);
  const { data: viajesData } = await supabase
    .from("viajes")
    .select("*")
    .eq("pedido_id", id)
    .order("creado_el");

  // Líneas de cada viaje (incluye las de devolución; excluye las ocultas).
  const { data: detallesViaje } = await supabase
    .from("detalles_pedido")
    .select(`
      id, viaje_id, producto_id, talla_stock, talla_vendida, cantidad, precio_unitario,
      subtotal, genero, entalle, es_extra_motorizado, estado, devolucion_de,
      productos(imei, nombre), tallas!detalles_pedido_talla_vendida_fkey(nombre),
      tallas_stock: tallas!detalles_pedido_talla_stock_fkey(nombre)
    `)
    .eq("pedido_id", id)
    .order("creado_el");

  const lineasPorViaje: Record<string, any[]> = {};
  for (const dd of (detallesViaje ?? []) as any[]) {
    const d = dd;
    lineasPorViaje[d.viaje_id] = lineasPorViaje[d.viaje_id] ?? [];
    lineasPorViaje[d.viaje_id].push({
      id: d.id,
      producto_id: d.producto_id,
      imei: d.productos?.imei,
      producto_nombre: d.productos?.nombre,
      talla_stock: d.talla_stock,
      talla_stock_nombre: d.tallas_stock?.nombre ?? null,
      talla_vendida: d.talla_vendida,
      talla_vendida_nombre: d.tallas?.nombre ?? null,
      cantidad: Number(d.cantidad),
      precio_unitario: Number(d.precio_unitario),
      subtotal: Number(d.subtotal),
      genero: d.genero,
      entalle: d.entalle,
      es_extra_motorizado: d.es_extra_motorizado,
      estado: d.estado,
      devolucion: d.estado === "devuelto" || d.estado === "pendiente_devolucion" || d.estado === "oculto",
      devolucion_de: d.devolucion_de ?? null,
    });
  }

  // Contar VPUs y recopilar sus códigos QR por detalle para TODOS los viajes.
  // Se excluyen los devueltos: cuando un producto se retira al stock, deja de
  // contar y su código desaparece de la lista.
  const viajeIds = (viajesData ?? []).map((v: any) => v.id);
  const vpuCountMap: Record<string, number> = {};
  const vpuCodigosMap: Record<string, string[]> = {};
  // Conteo de VPU AÚN "pendiente" por detalle. Una línea de devolución se
  // considera COMPLETA cuando su recojo ya no tiene VPUs pendientes (todos
  // fueron devueltos), aunque el viaje quede en un estado inconsistente.
  const vpuPendientesMap: Record<string, number> = {};
  if (viajeIds.length > 0) {
    const { data: allVpus } = await supabase
      .from("viaje_producto_unicos")
      .select("viaje_id, detalle_pedido_id, estado, producto_unico_id, productos_unicos(codigo_qr)")
      .in("viaje_id", viajeIds);

    // Un producto único ya devuelto al stock (VPU en estado "devuelto", ya sea
    // en el viaje de entrega o vía un recojo) NO debe contar como exceso del
    // pedido final. El VPU del viaje de ida puede quedar en "enviado" como
    // historial inmutable, pero físicamente volvió: se excluye de la cuenta.
    const productosDevueltos = new Set(
      (allVpus ?? []).filter((v: any) => v.estado === "devuelto").map((v: any) => v.producto_unico_id)
    );

    for (const vpu of (allVpus ?? []) as any[]) {
      if (!vpu.detalle_pedido_id) continue;
      if (vpu.estado === "pendiente") {
        vpuPendientesMap[vpu.detalle_pedido_id] = (vpuPendientesMap[vpu.detalle_pedido_id] ?? 0) + 1;
      }
      if (vpu.estado === "devuelto") continue;
      if (productosDevueltos.has(vpu.producto_unico_id)) continue;
      vpuCountMap[vpu.detalle_pedido_id] = (vpuCountMap[vpu.detalle_pedido_id] ?? 0) + 1;
      const qr = vpu.productos_unicos?.codigo_qr;
      if (qr) {
        vpuCodigosMap[vpu.detalle_pedido_id] = vpuCodigosMap[vpu.detalle_pedido_id] ?? [];
        vpuCodigosMap[vpu.detalle_pedido_id].push(qr);
      }
    }
  }
  // Adjuntar vpu_count, códigos QR y pendientes a cada línea normal
  for (const viajeId of Object.keys(lineasPorViaje)) {
    for (const linea of lineasPorViaje[viajeId]) {
      linea.vpu_count = vpuCountMap[linea.id] ?? 0;
      linea.vpu_codigos = vpuCodigosMap[linea.id] ?? [];
      linea.vpu_pendientes = vpuPendientesMap[linea.id] ?? 0;
    }
  }

  // Eliminar detalles zombie: cantidad=0 y sin VPUs activos
  for (const viajeId of Object.keys(lineasPorViaje)) {
    lineasPorViaje[viajeId] = lineasPorViaje[viajeId].filter(
      (l) => !(l.cantidad === 0 && l.vpu_count === 0)
    );
  }

  // Detalles huérfanos: desvinculados del viaje pero con VPU todavía asignado.
  // Estos aparecen como "Pendiente a devolver al stock" en la tarjeta del viaje.
  const detallesHuermanos: Record<string, any[]> = {};
  if (viajeIds.length > 0) {
    const { data: vpuRows } = await supabase
      .from("viaje_producto_unicos")
      .select("viaje_id, detalle_pedido_id")
      .in("viaje_id", viajeIds)
      .not("estado", "eq", "devuelto");

    const orphanPairs = (vpuRows ?? []).filter((vpu) => {
      const detalle = (detallesViaje ?? []).find((d: any) => d.id === vpu.detalle_pedido_id);
      return detalle && !detalle.viaje_id;
    });

    if (orphanPairs.length > 0) {
      const orphanIds = [...new Set(orphanPairs.map((vpu) => vpu.detalle_pedido_id))];
      const { data: orphanDetalles } = await supabase
        .from("detalles_pedido")
        .select(`
          id, viaje_id, producto_id, talla_stock, talla_vendida, cantidad, precio_unitario,
          subtotal, genero, entalle, es_extra_motorizado, estado, devolucion_de,
          productos(imei, nombre), tallas!detalles_pedido_talla_vendida_fkey(nombre),
          tallas_stock: tallas!detalles_pedido_talla_stock_fkey(nombre)
        `)
        .in("id", orphanIds);

      for (const d of (orphanDetalles ?? []) as any[]) {
        const vpuEnViaje = orphanPairs.filter((vpu) => vpu.detalle_pedido_id === d.id);
        const viajeConVpu = vpuEnViaje[0]?.viaje_id;
        if (!viajeConVpu) continue;
        detallesHuermanos[viajeConVpu] = detallesHuermanos[viajeConVpu] ?? [];
        detallesHuermanos[viajeConVpu].push({
          id: d.id,
          producto_id: d.producto_id,
          imei: d.productos?.imei,
          producto_nombre: d.productos?.nombre,
          talla_stock: d.talla_stock,
          talla_stock_nombre: d.tallas_stock?.nombre ?? null,
          talla_vendida: d.talla_vendida,
          talla_vendida_nombre: d.tallas?.nombre ?? null,
          cantidad: Number(d.cantidad),
          precio_unitario: Number(d.precio_unitario),
          subtotal: Number(d.subtotal),
          genero: d.genero,
          entalle: d.entalle,
          es_extra_motorizado: d.es_extra_motorizado,
          estado: d.estado,
          devolucion: false,
          devolucion_de: null,
          pendiente_retorno: true,
          vpu_count: vpuEnViaje.length,
          vpu_pendientes: vpuPendientesMap[d.id] ?? 0,
          vpu_codigos: vpuCodigosMap[d.id] ?? [],
        });
      }
    }
  }

  const hoy = await obtenerFechaHoyLima();
  const viajes = (viajesData ?? []).map((v: any) => ({
    ...v,
    retrasado: esRetrasado(v.estado, v.fecha, hoy),
    lineas: [
      ...(lineasPorViaje[v.id] ?? []),
      ...(detallesHuermanos[v.id] ?? []),
    ],
  }));

  // Estado visual derivado "retraso" del pedido: algún viaje retrasado.
  const retraso = viajes.reduce<{ entrega: boolean; recojo: boolean }>(
    (acc, v: any) => {
      if (!v.retrasado) return acc;
      if (v.tipo === "recojo") acc.recojo = true;
      else acc.entrega = true;
      return acc;
    },
    { entrega: false, recojo: false }
  );
  const retrasoActivo = retraso.entrega || retraso.recojo;

  return Response.json({
    pedido,
    detalles,
    pagos: pagos ?? [],
    viajes,
    total_pagado: totalPagado,
    deuda: Number(pedido.monto_total) - totalPagado,
    retraso: retrasoActivo ? retraso : null,
  });
}

// PATCH /api/pedidos/[id] — actualizar datos del pedido (borrador o edición)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;
  void user;

  const { id } = await params;
  const body = await request.json();
  const supabase = getSupabase();

  const { data: actual } = await supabase
    .from("pedidos")
    .select("*")
    .eq("id", id)
    .single();
  if (!actual) return Response.json({ error: "Pedido no encontrado" }, { status: 404 });

  const EDITABLES = ["borrador", "solicitado", "confirmado", "alistado"];
  if (!EDITABLES.includes(actual.estado)) {
    return Response.json({ error: "El pedido ya no se puede editar" }, { status: 400 });
  }

  const { data: viajesExistentes } = await supabase
    .from("viajes").select("id").eq("pedido_id", id).limit(1);
  if ((viajesExistentes?.length ?? 0) > 0) {
    return Response.json({ error: "El pedido tiene viajes; editalo desde ahi" }, { status: 400 });
  }

  const permitidos = [
    "cliente_id", "fecha_entrega", "tipo_pedido", "metodo_entrega", "empresa_envio",
    "direccion_entrega", "ciudad", "ubicacion_maps", "canal_venta", "costo_envio",
    "metodo_pago", "partes_a_pagar", "monto_primer_pago", "fecha_siguiente_pago",
    "observaciones", "regalo", "vendedora_1_id", "vendedora_contribuyente_id",
    "vendedora_contribuyente_2_id", "agendadora_id",
  ];
  const updates: Record<string, any> = {};
  for (const c of permitidos) {
    if (body[c] !== undefined) {
      updates[c] = body[c] === "" ? null : body[c];
    }
  }

  if (body.costo_envio !== undefined) {
    updates.costo_envio = Number(body.costo_envio);
  }
  // El cuerpo ya maneja `regalo` como texto (descripción) dentro del loop de permitidos.
  // No convertir a boolean: regalo es texto ahora.
  if (body.monto_total !== undefined) updates.monto_total = Number(body.monto_total);

  // Si cambia el costo de envío, recalcular el monto_total. El total vive en el
  // viaje de entrega original (pedido = colección de viajes): se actualiza su
  // costo_envio y total, y monto_total = Σ entregas − Σ regresos.
  if (updates.costo_envio !== undefined && body.monto_total === undefined) {
    const { data: viajes } = await supabase
      .from("viajes")
      .select("id")
      .eq("pedido_id", id)
      .eq("tipo", "entrega")
      .order("creado_el")
      .limit(1);
    const primerEntrega = viajes?.[0];
    if (primerEntrega) {
      await supabase
        .from("viajes")
        .update({ costo_envio: updates.costo_envio })
        .eq("id", primerEntrega.id);
      await recalcularTotalViaje(primerEntrega.id, "entrega", updates.costo_envio);
      updates.monto_total = await calcularTotalPedido(id);
    } else {
      const { data: detalles } = await supabase
        .from("detalles_pedido")
        .select("subtotal")
        .eq("pedido_id", id)
        .eq("estado", "activo");
      updates.monto_total = calcularTotal(
        (detalles ?? []).map((d: any) => ({ subtotal: Number(d.subtotal) })),
        updates.costo_envio
      );
    }
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "Sin cambios" }, { status: 400 });
  }

  const { data: pedido, error: err } = await supabase
    .from("pedidos")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (err || !pedido) {
    return Response.json({ error: "No se pudo actualizar el pedido" }, { status: 500 });
  }
  return Response.json({ pedido });
}