import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { generarCodigoPedido, generarResumen, calcularTotal } from "@/lib/pedidos";
import { validarStockLineas } from "@/lib/productos";
import { obtenerFechaHoyLima, esRetrasado } from "@/lib/retraso";

// POST /api/pedidos — crea el pedido completo en un solo lote.
// Body: campos del pedido + lineas[] + confirmar (boolean).
// Valida el lote contra el stock de ventas (relee la BD): si algo quedara
// negativo, no crea nada y responde { conflictos }.
// El pedido nace como borrador ("Terminar después") o solicitado ("Guardar
// Pedido", reserva stock). La confirmación (crea viaje + primer pago) es un
// paso posterior con el botón "Confirmar pedido".
export async function POST(request: NextRequest) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;

  const body = await request.json();
  const supabase = getSupabase();

  const lineas: {
    producto_id: string;
    talla_stock: string | null;
    talla_vendida: string | null;
    cantidad: number;
    precio_unitario?: number;
    entalle?: boolean;
    genero?: string;
    es_extra_motorizado?: boolean;
  }[] = body.lineas ?? [];
  if (lineas.length === 0) {
    return Response.json({ error: "El pedido no tiene productos" }, { status: 400 });
  }

  // Normalizar tallas: la talla vendida SIEMPRE queda llena (igual a la de
  // stock si no hay entalle). El entalle es que ambas difieran.
  for (const l of lineas) {
    l.talla_vendida = l.entalle ? (l.talla_vendida ?? l.talla_stock) : l.talla_stock;
  }

  // Mergear duplicados: misma (producto_id, talla_stock, talla_vendida) → sumar cantidades.
  const merged = new Map<string, typeof lineas[0]>();
  for (const l of lineas) {
    const key = `${l.producto_id}|${l.talla_stock}|${l.talla_vendida}`;
    const existing = merged.get(key);
    if (existing) {
      existing.cantidad += Number(l.cantidad);
      existing.precio_unitario = Number(l.precio_unitario ?? existing.precio_unitario ?? 0);
    } else {
      merged.set(key, { ...l });
    }
  }
  const lineasUnicas = [...merged.values()];

  const { conflictos } = await validarStockLineas(lineasUnicas);
  if (conflictos.length > 0) {
    return Response.json(
      { error: "Stock insuficiente para algunos productos", conflictos },
      { status: 409 }
    );
  }

  const codigo = await generarCodigoPedido();

  const { data: pedido, error: err } = await supabase
    .from("pedidos")
    .insert({
      codigo,
      estado: "borrador",
      creado_por: user.id,
      vendedora_1_id: body.vendedora_1_id || user.id,
      vendedora_contribuyente_id: body.vendedora_contribuyente_id || user.id,
      vendedora_contribuyente_2_id: body.vendedora_contribuyente_2_id || user.id,
      agendadora_id: body.agendadora_id || user.id,
      cliente_id: body.cliente_id || null,
      fecha_entrega: body.fecha_entrega || null,
      tipo_pedido: body.tipo_pedido || null,
      metodo_entrega: body.metodo_entrega || null,
      empresa_envio: body.empresa_envio || "motorizado",
      direccion_entrega: body.direccion_entrega || null,
      ciudad: body.ciudad || null,
      ubicacion_maps: body.ubicacion_maps || null,
      canal_venta: body.canal_venta || "whatsapp",
      costo_envio: Number(body.costo_envio ?? 0),
      metodo_pago: body.metodo_pago || null,
      partes_a_pagar: Number(body.partes_a_pagar ?? 1),
      monto_primer_pago: body.monto_primer_pago ? Number(body.monto_primer_pago) : null,
      comprobante: body.comprobante || null,
      observaciones: body.observaciones || null,
      regalo: body.regalo || null,
    })
    .select()
    .single();

  if (err || !pedido) {
    return Response.json({ error: "No se pudo crear el pedido" }, { status: 500 });
  }

  // Insertar todas las líneas en un solo batch (ya merged).
  const detalles = lineasUnicas.map((l) => {
    const precioUnitario = Number(l.precio_unitario ?? 0);
    const tallaStock = l.talla_stock || null;
    const tallaVendida = l.talla_vendida || null;
    return {
      pedido_id: pedido.id,
      producto_id: l.producto_id,
      talla_stock: tallaStock,
      talla_vendida: tallaVendida,
      entalle: Boolean(tallaStock && tallaVendida && tallaStock !== tallaVendida),
      cantidad: Number(l.cantidad),
      precio_unitario: precioUnitario,
      subtotal: Number(l.cantidad) * precioUnitario,
      genero: l.genero || "dama",
      es_extra_motorizado: Boolean(l.es_extra_motorizado),
      anadido_por: user.id,
    };
  });

  const { error: errDetalles } = await supabase.from("detalles_pedido").insert(detalles);
  if (errDetalles) {
    await supabase.from("pedidos").delete().eq("id", pedido.id);
    return Response.json({ error: "No se pudieron registrar los productos" }, { status: 500 });
  }

  // "Guardar Pedido": el pedido nace como SOLICITADO (reserva stock), NO como
  // confirmado. La confirmación (crea el viaje + primer pago) la hace la
  // vendedora después con el botón "Confirmar pedido".
  if (body.confirmar) {
    const { data: detallesData, error: errTotales } = await supabase
      .from("detalles_pedido")
      .select("producto_id, cantidad, talla_vendida, genero, es_extra_motorizado, subtotal, tallas!detalles_pedido_talla_vendida_fkey(nombre)")
      .eq("pedido_id", pedido.id)
      .eq("estado", "activo");
    if (errTotales) {
      await supabase.from("detalles_pedido").delete().eq("pedido_id", pedido.id);
      await supabase.from("pedidos").delete().eq("id", pedido.id);
      return Response.json({ error: "No se pudo calcular el total" }, { status: 500 });
    }

    const dets = (detallesData ?? []).map((d: any) => ({
      ...d,
      talla: d.tallas?.nombre ?? null,
    }));
    const resumen = await generarResumen(dets);
    const montoTotal = calcularTotal(
      dets.map((d) => ({ subtotal: Number(d.subtotal ?? 0) })),
      Number(pedido.costo_envio ?? 0)
    );

    const { data: solicitado, error: errSolicitado } = await supabase
      .from("pedidos")
      .update({
        estado: "solicitado",
        resumen_productos: resumen,
        monto_total: montoTotal,
      })
      .eq("id", pedido.id)
      .select()
      .single();
    if (errSolicitado || !solicitado) {
      await supabase.from("detalles_pedido").delete().eq("pedido_id", pedido.id);
      await supabase.from("pedidos").delete().eq("id", pedido.id);
      return Response.json({ error: "No se pudo crear el pedido" }, { status: 500 });
    }
    return Response.json({ pedido: solicitado, confirmado: false }, { status: 201 });
  }

  return Response.json({ pedido, confirmado: false }, { status: 201 });
}

// GET /api/pedidos?estado=&q=&pendientes=1&ocultos=0
export async function GET(request: NextRequest) {
  const { error } = await requireRoles(["vendedora", "agendadora", "almacen", "controller", "admin"]);
  if (error) return error;

  const sp = request.nextUrl.searchParams;
  const estado = sp.get("estado");
  const q = sp.get("q")?.trim();
  const soloPendientes = sp.get("pendientes") === "1";
  const incluirBorrador = sp.get("borradores") === "1";
  const ocultos = sp.get("ocultos") === "1";

  const supabase = getSupabase();

  let query = supabase
    .from("pedidos")
    .select(`
      *, clientes(nombre, apellido, telefono), 
      creado_por_usuario:usuarios!pedidos_creado_por_fkey(nombre), 
      vendedora:usuarios!pedidos_vendedora_1_id_fkey(nombre)
    `);

  if (estado) query = query.eq("estado", estado);
  if (!incluirBorrador) query = query.neq("estado", "borrador");
  if (soloPendientes) query = query.gt("monto_total", 0);
  if (ocultos) query = query.eq("oculto", true);
  else query = query.eq("oculto", false);

  if (q) {
    query = query.or(`codigo.ilike.%${q}%,resumen_productos.ilike.%${q}%`);
  }

  // Solo para vendedoras (no controller): ver los pedidos de cualquiera; controller los ve todos.
  const { data: pedidos, error: err } = await query
    .order("creado_el", { ascending: false })
    .limit(200);

  if (err) return Response.json({ error: "Error de base de datos" }, { status: 500 });

  // Calcular deuda por pedido
  const ids = (pedidos ?? []).map((p: any) => p.id);
  let pagosPorPedido: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: pagos } = await supabase
      .from("pagos")
      .select("pedido_id, monto")
      .eq("estado", "pagado")
      .in("pedido_id", ids);
    pagosPorPedido = {};
    for (const p of pagos ?? []) {
      pagosPorPedido[p.pedido_id] = (pagosPorPedido[p.pedido_id] ?? 0) + Number(p.monto);
    }
  }

  // Determinar qué pedidos tienen un viaje retrasado (estado visual derivado,
  // nunca persistido): algún viaje en programado/alistado con fecha < hoy.
  const retrasoPorPedido: Record<string, { entrega: boolean; recojo: boolean }> = {};
  if (ids.length > 0) {
    const hoy = await obtenerFechaHoyLima();
    const { data: viajesRows } = await supabase
      .from("viajes")
      .select("pedido_id, tipo, estado, fecha")
      .in("pedido_id", ids);
    for (const v of viajesRows ?? []) {
      if (!esRetrasado(v.estado, v.fecha, hoy)) continue;
      const r = retrasoPorPedido[v.pedido_id] ?? { entrega: false, recojo: false };
      if (v.tipo === "recojo") r.recojo = true;
      else r.entrega = true;
      retrasoPorPedido[v.pedido_id] = r;
    }
  }

  const resultado = (pedidos ?? []).map((p: any) => {
    const pagado = pagosPorPedido[p.id] ?? 0;
    const r = retrasoPorPedido[p.id];
    return {
      ...p,
      cliente_nombre: p.clientes
        ? `${p.clientes.nombre}${p.clientes.apellido ? " " + p.clientes.apellido : ""}`
        : null,
      cliente_telefono: p.clientes?.telefono ?? null,
      vendedora_nombre: p.vendedora?.nombre ?? null,
      total_pagado: pagado,
      deuda: Number(p.monto_total) - pagado,
      retraso: r ?? null,
    };
  });

  return Response.json({ pedidos: resultado });
}
