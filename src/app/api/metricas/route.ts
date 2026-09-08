import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { obtenerFechaHoyLima } from "@/lib/retraso";

// Zona: la app opera en Lima (UTC-5 fijo). Todas las fechas se interpretan/agrupan en Lima.
const LIMA_MS = 5 * 3600 * 1000;

export function aFechaYMD(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() - LIMA_MS).toISOString().slice(0, 10);
}

export function aHoraLima(ts: string | null | undefined): number {
  if (!ts) return 0;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return 0;
  return new Date(d.getTime() - LIMA_MS).getUTCHours();
}

// Convierte un YYYY-MM-DD (fecha local Lima) al timestamp UTC de inicio/fin del día.
const diaInicioUTC = (ymd: string) => `${ymd}T05:00:00.000Z`;
const diaFinUTC = (ymd: string) => `${ymd}T05:00:00.000Z`;

const ESTADOS_VENTA = [
  "confirmado",
  "alistado",
  "enviado",
  "entregado",
  "cerrado",
  "esperando_devolucion",
  "esperando_cambio",
];

// Un PEDIDO es todo lo que se registra (creado_el, cualquier estado).
// Una VENTA es un pedido confirmado en adelante (confirmado_el NOT NULL).
// Este endpoint diferencia ambas dimensiones según lo que se esté midiendo.
export async function GET(request: NextRequest) {
  const { error } = await requireRoles(["controller", "admin"]);
  if (error) return error;

  const sp = request.nextUrl.searchParams;
  const hoy = await obtenerFechaHoyLima();
  const hasta = sp.get("hasta")?.trim() || hoy;
  const desde = sp.get("desde")?.trim() || nuevoDesde(30, hasta);
  const dias = (fechasFn(hasta) - fechasFn(desde)) / 86400000;
  if (Number.isNaN(dias) || dias < 0 || dias > 400) {
    return Response.json({ error: "Rango de fechas inválido (máx. 400 días)" }, { status: 400 });
  }

  const supabase = getSupabase();
  const startIso = diaInicioUTC(desde);
  const endIso = diaFinUTC(newDate(hasta, 1));

  // 1. Pedidos del rango: registrados por creado_el OR confirmados por confirmado_el.
  const { data: pedidosRaw, error: errP } = await supabase
    .from("pedidos")
    .select(
      "id, estado, creado_el, confirmado_el, monto_total, ciudad, oculto, canal_venta, vendedora_1_id, vendedora_contribuyente_id, vendedora_contribuyente_2_id, clientes(region)"
    )
    .or(`creado_el.gte.${startIso},confirmado_el.gte.${startIso}`)
    .or(`creado_el.lte.${endIso},confirmado_el.lte.${endIso}`)
    .limit(10000);
  if (errP) return Response.json({ error: "Error de base de datos" }, { status: 500 });

  const pedidos = (pedidosRaw ?? []).filter((p: any) => !p.oculto);

  // Dimensión "registrados": creado dentro del rango, cualquier estado.
  const registrados = pedidos.filter((p: any) => {
    const f = aFechaYMD(p.creado_el);
    return f && f >= desde && f <= hasta;
  });

  // Dimensión "ventas": confirmadas dentro del rango.
  const ventaContinuos = pedidos.filter(
    (p: any) =>
      p.confirmado_el &&
      ESTADOS_VENTA.includes(p.estado) &&
      new Date(p.confirmado_el).getTime() >= new Date(startIso).getTime() &&
      new Date(p.confirmado_el).getTime() <= new Date(endIso).getTime()
  );

  // KPIs de desglose (destino de los registrados del rango).
  const confirmados = registrados.filter(
    (p: any) => p.confirmado_el && !["cancelado", "devuelto"].includes(p.estado)
  ).length;
  const cancelados = registrados.filter((p: any) => p.estado === "cancelado").length;
  const devueltos = registrados.filter((p: any) => p.estado === "devuelto").length;
  const sin_confirmar = registrados.length - confirmados - cancelados - devueltos;

  // 2. Detalles de las ventas (cantidad + productos más vendidos + ticket).
  const ventaIds = ventaContinuos.map((p: any) => p.id);
  let detalles: { pedido_id: string; producto_id: string; cantidad: number; subtotal: number; productos: { nombre: string; imei: string }[] | null }[] = [];
  if (ventaIds.length > 0) {
    const { data, error: errD } = await supabase
      .from("detalles_pedido")
      .select("pedido_id, producto_id, cantidad, subtotal, productos(nombre, imei)")
      .in("pedido_id", ventaIds)
      .eq("estado", "activo");
    if (errD) return Response.json({ error: "Error de base de datos" }, { status: 500 });
    detalles = (data ?? []) as typeof detalles;
  }

  // 3. Pagos pagados (cobros recibidos) del rango, por fecha_pagada.
  const { data: pagosRaw, error: errPagos } = await supabase
    .from("pagos")
    .select("monto, metodo_pago, fecha, fecha_pagada, pedido_id")
    .eq("estado", "pagado")
    .not("monto", "is", null)
    .limit(10000);
  if (errPagos) return Response.json({ error: "Error de base de datos" }, { status: 500 });

  const pagos = (pagosRaw ?? []).filter((p: any) => {
    const f = aFechaYMD(p.fecha_pagada ?? p.fecha);
    return f && f >= desde && f <= hasta;
  });

  // 4. Vendedoras activas.
  const { data: vendedorasRaw } = await supabase
    .from("usuarios")
    .select("id, nombre, apellido")
    .eq("rol", "vendedora")
    .eq("estado", "activo");
  const vendedorasUsuarios = vendedorasRaw ?? [];

  // ---- Agregación diaria ----
  const ejes = ejesDeFechas(desde, hasta);
  const mapVentas = new Map<string, { fecha: string; monto: number; cantidad: number }>();
  for (const f of ejes) mapVentas.set(f, { fecha: f, monto: 0, cantidad: 0 });
  const mapPagos = new Map<string, { fecha: string; monto: number }>();
  for (const f of ejes) mapPagos.set(f, { fecha: f, monto: 0 });

  for (const p of ventaContinuos) {
    const f = aFechaYMD(p.confirmado_el);
    const c = mapVentas.get(f!);
    if (c) c.monto += Number(p.monto_total ?? 0);
  }
  const cantidadPorPedido = new Map<string, number>();
  for (const d of detalles) {
    cantidadPorPedido.set(d.pedido_id, (cantidadPorPedido.get(d.pedido_id) ?? 0) + Number(d.cantidad ?? 0));
  }
  for (const p of ventaContinuos) {
    const f = aFechaYMD(p.confirmado_el);
    const c = mapVentas.get(f!);
    if (c) c.cantidad += cantidadPorPedido.get(p.id) ?? 0;
  }
  for (const pg of pagos) {
    const f = aFechaYMD(pg.fecha_pagada ?? pg.fecha);
    const c = mapPagos.get(f!);
    if (c) c.monto += Number(pg.monto ?? 0);
  }

  // ---- Agregaciones varias ----
  const portaHora = Array.from({ length: 24 }, () => 0);
  for (const p of registrados) {
    if (p.creado_el) portaHora[aHoraLima(p.creado_el)] += 1;
  }

  // Productos más vendidos (solo ventas del rango).
  const porProducto = new Map<string, { producto_id: string; nombre: string; imei: string; cantidad: number; monto: number }>();
  for (const d of detalles) {
    const pad = porProducto.get(d.producto_id) ?? {
      producto_id: d.producto_id,
      nombre: d.productos?.[0]?.nombre ?? "—",
      imei: d.productos?.[0]?.imei ?? "",
      cantidad: 0,
      monto: 0,
    };
    pad.cantidad += Number(d.cantidad ?? 0);
    pad.monto += Number(d.subtotal ?? 0);
    porProducto.set(d.producto_id, pad);
  }
  const productos = [...porProducto.values()].sort((a, b) => b.cantidad - a.cantidad || b.monto - a.monto).slice(0, 8);

  // Ciudades de las ventas.
  const porCiudad = new Map<string, number>();
  for (const p of ventaContinuos) {
    const ciudad = ((p as any).ciudad ?? (p as any).clientes?.region ?? "").toString().trim().replace(/\s+/g, " ");
    if (!ciudad) continue;
    const key = ciudad[0].toUpperCase() + ciudad.slice(1);
    porCiudad.set(key, (porCiudad.get(key) ?? 0) + 1);
  }
  const ciudades = [...porCiudad.entries()]
    .map(([ciudad, pedidos]) => ({ ciudad, pedidos }))
    .sort((a, b) => b.pedidos - a.pedidos)
    .slice(0, 8);

  // Canales de venta.
  const porCanal = new Map<string, { canal: string; pedidos: number; monto: number }>();
  for (const p of ventaContinuos) {
    const canal = p.canal_venta ?? "otro";
    const c = porCanal.get(canal) ?? { canal, pedidos: 0, monto: 0 };
    c.pedidos += 1;
    c.monto += Number(p.monto_total ?? 0);
    porCanal.set(canal, c);
  }
  const canales = [...porCanal.values()].sort((a, b) => b.pedidos - a.pedidos);

  // Métodos de pago (cobros pagados del rango).
  const porMetodo = new Map<string, { metodo: string; pagos: number; monto: number }>();
  for (const pg of pagos) {
    const metodo = pg.metodo_pago ?? "desconocido";
    const m = porMetodo.get(metodo) ?? { metodo, pagos: 0, monto: 0 };
    m.pagos += 1;
    m.monto += Number(pg.monto ?? 0);
    porMetodo.set(metodo, m);
  }
  const metodos_pago = [...porMetodo.values()].sort((a, b) => b.monto - a.monto);

  // Vendedoras: pedidos registrados por puesto + ventas confirmadas (monto y ticket).
  const ventasPorId = new Map<string, { monto: number; count: number }>();
  for (const p of ventaContinuos) {
    if (!p.vendedora_1_id) continue;
    const v = ventasPorId.get(p.vendedora_1_id) ?? { monto: 0, count: 0 };
    v.monto += Number(p.monto_total ?? 0);
    v.count += 1;
    ventasPorId.set(p.vendedora_1_id, v);
  }
  const vendedoras = vendedorasUsuarios.map((u: any) => {
    const titular = registrados.filter((p: any) => p.vendedora_1_id === u.id).length;
    const colaboradora_1 = registrados.filter((p: any) => p.vendedora_contribuyente_id === u.id).length;
    const colaboradora_2 = registrados.filter((p: any) => p.vendedora_contribuyente_2_id === u.id).length;
    const ventas = ventasPorId.get(u.id) ?? { monto: 0, count: 0 };
    return {
      id: u.id,
      nombre: `${u.nombre}${u.apellido ? " " + u.apellido : ""}`,
      titular,
      colaboradora_1,
      colaboradora_2,
      participaciones: titular + colaboradora_1 + colaboradora_2,
      monto: ventas.monto,
      ventas_confirmadas: ventas.count,
      ticket: ventas.count > 0 ? ventas.monto / ventas.count : 0,
    };
  }).sort((a: any, b: any) => b.participaciones - a.participaciones);

  // Pagos vinculados a las ventas del rango (para la deuda real).
  let pagadoVentas = 0;
  if (ventaIds.length > 0) {
    for (const pg of pagosRaw ?? []) {
      if (ventaIds.includes(pg.pedido_id) && pg.monto != null) {
        pagadoVentas += Number(pg.monto);
      }
    }
  }

  const ventasMonto = ventaContinuos.reduce((s: number, p: any) => s + Number(p.monto_total ?? 0), 0);
  const cantidadVendida = construCantidad(detalles);
  const pagosMonto = pagos.reduce((s: number, pg: any) => s + Number(pg.monto ?? 0), 0);

  return Response.json({
    desde,
    hasta,
    kpis: {
      ventas_monto: Math.round(ventasMonto * 100) / 100,
      ventas_count: ventaContinuos.length,
      cantidad_vendida: cantidadVendida,
      pagos_monto: Math.round(pagosMonto * 100) / 100,
      deuda_ventas: Math.round((ventasMonto - pagadoVentas) * 100) / 100,
      ticket_promedio: ventaContinuos.length > 0 ? Math.round((ventasMonto / ventaContinuos.length) * 100) / 100 : 0,
      registrados: registrados.length,
      confirmados,
      cancelados,
      devueltos,
      sin_confirmar,
      conversion_pct: registrados.length > 0 ? Math.round((confirmados / registrados.length) * 1000) / 10 : 0,
    },
    series_ventas: [...mapVentas.values()],
    series_pagos: [...mapPagos.values()],
    pedidos_por_hora: portaHora,
    productos,
    ciudades,
    vendedoras,
    canales,
    metodos_pago,
  });
}

function fechasFn(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getTime();
}

function nuevoDesde(dias: number, hasta: string): string {
  const d = new Date(fechasFn(hasta) - dias * 86400000);
  return d.toISOString().slice(0, 10);
}

function newDate(ymd: string, days: number): string {
  const d = new Date(fechasFn(ymd) + days * 86400000);
  return d.toISOString().slice(0, 10);
}

function ejesDeFechas(desde: string, hasta: string): string[] {
  const ejes: string[] = [];
  const inicio = new Date(fechasFn(desde)).getTime();
  const fin = new Date(fechasFn(hasta)).getTime();
  for (let t = inicio; t <= fin; t += 86400000) {
    ejes.push(new Date(t).toISOString().slice(0, 10));
  }
  return ejes;
}

function construCantidad(detalles: { cantidad: number }[]): number {
  return detalles.reduce((s, d) => s + Number(d.cantidad ?? 0), 0);
}