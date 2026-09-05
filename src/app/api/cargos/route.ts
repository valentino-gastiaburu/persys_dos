import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { esRetrasado, obtenerFechaHoyLima } from "@/lib/retraso";

// GET /api/cargos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&q=CODIGO_VIAJE&tipo=envio|visita
// Devuelve UN Cargo por viaje de ENTREGA (los de recojo no tienen cargo).
// Sin filtros, devuelve todos los viajes de entrega no cancelados.
// - desde/hasta: filtran por fecha del viaje (rango opcional).
// - q: filtra por código de viaje (búsqueda parcial).
// - tipo: filtra por tipo_pedido del pedido ('envio' o 'visita').
// Los productos que salen en el cargo son los del viaje (viaje_id), no todos
// los del pedido. Ordenados por fecha de entrega ascendente.
export async function GET(request: NextRequest) {
  const { user, error } = await requireRoles([
    "vendedora",
    "agendadora",
    "almacen",
    "controller",
    "admin",
  ]);
  if (error) return error;
  void user;

  const today = await obtenerFechaHoyLima();
  const desde = request.nextUrl.searchParams.get("desde");
  const hasta = request.nextUrl.searchParams.get("hasta");
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const tipo = request.nextUrl.searchParams.get("tipo");

  const supabase = getSupabase();

  // 1. Configuración (datos de la dueña + encargado de despacho)
  const { data: configData } = await supabase
    .from("configuraciones")
    .select("clave, valor");
  const config: Record<string, string> = {};
  for (const c of configData ?? []) config[c.clave] = c.valor;

  // 1b. Si se filtra por tipo de pedido, obtener los pedido_ids de ese tipo.
  let pedidoIdsFiltroTipo: string[] | null = null;
  if (tipo) {
    const { data: pedidosTipo } = await supabase
      .from("pedidos")
      .select("id")
      .eq("tipo_pedido", tipo);
    pedidoIdsFiltroTipo = (pedidosTipo ?? []).map((p) => p.id);
  }

  // 2. Viajes de entrega (no cancelados), con filtros opcionales.
  let query = supabase
    .from("viajes")
    .select("id, codigo, fecha, estado, tipo, pedido_id, costo_envio, total, direccion")
    .eq("tipo", "entrega")
    .neq("estado", "cancelado")
    .order("fecha", { ascending: true });
  if (desde) query = query.gte("fecha", desde);
  if (hasta) query = query.lte("fecha", hasta);
  if (q) query = query.ilike("codigo", `%${q}%`);
  if (pedidoIdsFiltroTipo) {
    query = query.in("pedido_id", pedidoIdsFiltroTipo);
  }
  const { data: viajes, error: viajesErr } = await query;

  if (viajesErr) {
    return Response.json({ error: viajesErr.message }, { status: 500 });
  }

  if (!viajes || viajes.length === 0) {
    return Response.json({ cargos: [], config });
  }

  const pedidoIds = [...new Set(viajes.map((v) => v.pedido_id))];
  const viajeIds = viajes.map((v) => v.id);

  // 2b. Todos los viajes de ENTREGA NO CANCELADOS de estos pedidos (ordenados por
  //     creación) para saber el número de viaje de entrega (1ro, 2do, ...) de
  //     cada uno. Los viajes cancelados NO cuentan.
  const { data: todosViajesEntrega } = await supabase
    .from("viajes")
    .select("id, pedido_id, fecha, creado_el")
    .eq("tipo", "entrega")
    .neq("estado", "cancelado")
    .in("pedido_id", pedidoIds)
    .order("creado_el", { ascending: true });

  // Indice: nro de viaje de entrega por pedido.
  const nroViajePorViajeId: Record<string, number> = {};
  const contadorPorPedido: Record<string, number> = {};
  for (const v of todosViajesEntrega ?? []) {
    contadorPorPedido[v.pedido_id] = (contadorPorPedido[v.pedido_id] ?? 0) + 1;
    nroViajePorViajeId[v.id] = contadorPorPedido[v.pedido_id];
  }

  // 3. Pedidos con joins completos
  const { data: pedidos, error: pedidosErr } = await supabase
    .from("pedidos")
    .select(
      `id, codigo, estado, fecha_entrega, tipo_pedido, metodo_entrega, empresa_envio,
       direccion_entrega, ciudad, canal_venta, costo_envio, metodo_pago, monto_total,
       observaciones, regalo, confirmado_el, creado_el,
       clientes (nombre, apellido, telefono, dni, direccion),
       vendedora:usuarios!pedidos_vendedora_1_id_fkey (nombre, apellido)`
    )
    .in("id", pedidoIds);

  if (pedidosErr) {
    return Response.json({ error: pedidosErr.message }, { status: 500 });
  }

  // 4. Detalles SOLO de los viajes de este rango (líneas del cargo por viaje)
  const { data: detalles } = await supabase
    .from("detalles_pedido")
    .select(
      `id, viaje_id, pedido_id, producto_id, cantidad, precio_unitario, subtotal, genero,
       entalle, talla_stock, talla_vendida, estado,
       productos (imei, nombre),
       talla_stock:tallas!detalles_pedido_talla_stock_fkey (nombre),
       talla_vendida:tallas!detalles_pedido_talla_vendida_fkey (nombre)`
    )
    .in("viaje_id", viajeIds)
    .neq("estado", "devuelto");

  // 5. Primer pago de cada pedido (para "Fecha de pago"); solo cobros pagados.
  const { data: pagos } = await supabase
    .from("pagos")
    .select("pedido_id, fecha")
    .eq("estado", "pagado")
    .in("pedido_id", pedidoIds)
    .order("fecha", { ascending: true });

  const primerPago: Record<string, string> = {};
  for (const p of pagos ?? []) {
    if (!primerPago[p.pedido_id]) primerPago[p.pedido_id] = p.fecha;
  }

  const pedidoById: Record<string, any> = {};
  for (const p of pedidos ?? []) pedidoById[p.id] = p;

  // 6. Armar un cargo por viaje
  const cargos = (viajes ?? []).map((viaje) => {
    const p = pedidoById[viaje.pedido_id] ?? null;
    const cliente = p?.clientes;
    const vendedora = p?.vendedora;
    const lineasViaje = (detalles ?? []).filter((d) => d.viaje_id === viaje.id);
    const detallesLineas = lineasViaje.map((d: any) => ({
      imei: d.productos?.imei ?? "—",
      producto_nombre: d.productos?.nombre ?? "",
      talla_stock: d.talla_stock?.nombre ?? null,
      talla_vendida: d.talla_vendida?.nombre ?? null,
      cantidad: d.cantidad,
      precio_unitario: d.precio_unitario,
      genero: d.genero,
      entalle: d.entalle,
    }));

    return {
      // Código de viaje (va en Cod. Envío y es el de la caja)
      codigo_viaje: viaje.codigo,
      codigo: p?.codigo ?? null,
      // Número de viaje de entrega (1ro, 2do, ...) para identificarlo en la esquina
      nro_viaje: nroViajePorViajeId[viaje.id] ?? 1,
      // Código de pedido (columna nueva "Código del pedido")
      codigo_pedido: p?.codigo ?? null,
      viaje_id: viaje.id,
      pedido_id: viaje.pedido_id,
      tipo_pedido: p?.tipo_pedido ?? null,
      metodo_entrega: p?.metodo_entrega ?? null,
      fecha_entrega: p?.fecha_entrega ?? null,
      fecha_viaje: viaje.fecha,
      fecha_pago: primerPago[viaje.pedido_id] ?? null,
      metodo_pago: p?.metodo_pago ?? null,
      empresa_envio: p?.empresa_envio ?? null,
      direccion_entrega: p?.direccion_entrega ?? null,
      ciudad: p?.ciudad ?? null,
      observaciones: p?.observaciones ?? null,
      monto_total: viaje.total ?? p?.monto_total ?? 0,
      regalo: p?.regalo ?? null,
      cliente: cliente
        ? {
            nombre: `${cliente.nombre}${cliente.apellido ? " " + cliente.apellido : ""}`,
            dni: cliente.dni,
            telefono: cliente.telefono,
            direccion: cliente.direccion,
          }
        : null,
      vendedora: vendedora ? { nombre: vendedora.nombre } : null,
      viaje: {
        codigo: viaje.codigo,
        fecha: viaje.fecha,
        estado: viaje.estado,
        retrasado: esRetrasado(viaje.estado, viaje.fecha, today),
      },
      detalles: detallesLineas,
    };
  });

  return Response.json({ cargos, config });
}
