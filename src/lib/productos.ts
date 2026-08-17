import { getSupabase } from "./supabase";

// Mapa tipo_talla -> tipos de talla a los que corresponde.
export const TIPO_TALLA_TIPOS: Record<string, string[]> = {
  A: ["A"],
  B: ["B"],
  C: ["C"],
  AB: ["A", "B"],
  AC: ["A", "C"],
  BC: ["B", "C"],
  ABC: ["A", "B", "C"],
  sin_talla: [],
};

export const TIPO_TALLA_LABEL: Record<string, string> = {
  A: "A",
  B: "B",
  C: "C",
  AB: "A + B",
  AC: "A + C",
  BC: "B + C",
  ABC: "A + B + C",
  sin_talla: "Sin talla",
};

export async function getTallasPorTipo(): Promise<Record<string, any[]>> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("tallas")
    .select("*")
    .order("orden", { ascending: true });
  const map: Record<string, any[]> = {};
  for (const t of data ?? []) {
    map[t.tipo] = map[t.tipo] ?? [];
    map[t.tipo].push(t);
  }
  return map;
}

// Devuelve los ids de talla que debe tener un producto según su tipo_talla.
export async function tallasParaTipo(tipoTalla: string): Promise<string[]> {
  if (!TIPO_TALLA_TIPOS[tipoTalla]) return [];
  const porTipo = await getTallasPorTipo();
  const ids: string[] = [];
  for (const tipo of TIPO_TALLA_TIPOS[tipoTalla]) {
    for (const t of porTipo[tipo] ?? []) ids.push(t.id);
  }
  return ids;
}

// Crea las filas de producto_tallas faltantes para un producto (solo agrega, nunca elimina).
export async function syncProductoTallas(productoId: string, tipoTalla: string) {
  const supabase = getSupabase();
  const tallaIds = await tallasParaTipo(tipoTalla);
  if (tallaIds.length === 0) return;

  const { data: actuales } = await supabase
    .from("producto_tallas")
    .select("talla_id")
    .eq("producto_id", productoId);

  const existentes = new Set((actuales ?? []).map((r: any) => r.talla_id));
  const faltantes = tallaIds.filter((id) => !existentes.has(id));

  if (faltantes.length > 0) {
    await supabase.from("producto_tallas").insert(
      faltantes.map((talla_id) => ({ producto_id: productoId, talla_id }))
    );
  }
}

export async function tienePedidos(productoId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("detalles_pedido")
    .select("id")
    .eq("producto_id", productoId)
    .eq("estado", "activo")
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// Inserta un registro en historial_productos.
export async function registrarHistorialProducto(params: {
  producto_id: string;
  persona_id: string;
  tipo_evento: "creacion" | "edicion" | "eliminacion";
  campos_editados?: string[];
  imei?: string | null;
  nombre?: string | null;
  tipo_talla?: string | null;
  foto_url?: string | null;
  precio_referencial?: number | null;
}) {
  const supabase = getSupabase();
  const row: Record<string, any> = {
    producto_id: params.producto_id,
    persona_id: params.persona_id,
    tipo_evento: params.tipo_evento,
    campos_editados: params.campos_editados ?? [],
    imei: params.imei ?? null,
    nombre: params.nombre ?? null,
    tipo_talla: params.tipo_talla ?? null,
    foto_url: params.foto_url ?? null,
    precio_referencial: params.precio_referencial ?? null,
  };
  await supabase.from("historial_productos").insert(row);
}

// conteo por (producto_id|talla_id) de productos_unicos existentes (excluye eliminados)
async function getConteoPorTalla() {
  const supabase = getSupabase();
  const { data: unidades } = await supabase
    .from("productos_unicos")
    .select("producto_id, talla_id")
    .eq("estado", "en_almacen");
  const conteo: Record<string, number> = {};
  for (const u of unidades ?? []) {
    if (!u.talla_id) continue;
    const k = `${u.producto_id}|${u.talla_id}`;
    conteo[k] = (conteo[k] ?? 0) + 1;
  }
  return conteo;
}

// comprometido por (producto_id|talla_id): cantidad en pedidos realizados.
// Reservan stock los pedidos en estados activos (solicitado, confirmado, alistado,
// enviado, entregado, cerrado, esperando_devolucion, esperando_cambio);
// NO reservan los borradores ni los cancelados/devueltos.
// Un detalle con entalle consume la talla STOCK (la unidad física que se toma y
// modifica), no la talla vendida.
async function getComprometidasPorTalla() {
  const supabase = getSupabase();
  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("id")
    .not("estado", "in", "(borrador,cancelado,devuelto)");
  const ids = (pedidos ?? []).map((p: any) => p.id);
  const comprometidas: Record<string, number> = {};
  if (ids.length === 0) return comprometidas;
  const { data: detalles } = await supabase
    .from("detalles_pedido")
    .select("producto_id, talla_stock, talla_vendida, cantidad")
    .eq("estado", "activo")
    .in("pedido_id", ids);
  for (const d of detalles ?? []) {
    const tallaReserva = d.talla_stock ?? d.talla_vendida;
    if (!tallaReserva) continue;
    const k = `${d.producto_id}|${tallaReserva}`;
    comprometidas[k] = (comprometidas[k] ?? 0) + Number(d.cantidad);
  }
  return comprometidas;
}

// Stock de ventas por (producto_id|talla_id): conteo − comprometidas.
// Es la regla única que usan las validaciones de pedidos (no stock de almacén).
export async function getStockVentasPorTalla() {
  const [conteo, comprometidas] = await Promise.all([
    getConteoPorTalla(),
    getComprometidasPorTalla(),
  ]);
  const stock: Record<string, number> = {};
  const keys = new Set([...Object.keys(conteo), ...Object.keys(comprometidas)]);
  for (const k of keys) stock[k] = (conteo[k] ?? 0) - (comprometidas[k] ?? 0);
  return stock;
}

// Devuelve productos con su stock por talla.
// stock = conteo de productos_unicos existentes por talla (excluye eliminados).
// stock_ventas = stock almacén − unidades comprometidas en pedidos realizados
// (NO reservan borrador, cancelado ni devuelto).
export async function listarProductos() {
  const supabase = getSupabase();
  const [{ data: productos }, { data: tallasRows }, stockVentas, conteo] =
    await Promise.all([
      supabase.from("productos").select("*").neq("estado", "eliminado").order("nombre"),
      supabase.from("tallas").select("id, tipo, nombre"),
      getStockVentasPorTalla(),
      getConteoPorTalla(),
    ]);

  const tallaTipo: Record<string, string> = {};
  const tallaNombre: Record<string, string> = {};
  for (const t of tallasRows ?? []) {
    tallaTipo[t.id] = t.tipo;
    tallaNombre[t.id] = t.nombre;
  }

  const nombreDe = (k: string) => {
    const [, tallaId] = k.split("|");
    return { tipo: tallaTipo[tallaId], nombre: tallaNombre[tallaId] };
  };

  // stock[productoId][tipo][nombreTalla] = cantidad
  const stock: Record<string, Record<string, Record<string, number>>> = {};
  for (const [k, n] of Object.entries(conteo)) {
    const { tipo, nombre } = nombreDe(k);
    if (!tipo || !nombre) continue;
    const [productoId] = k.split("|");
    stock[productoId] = stock[productoId] ?? {};
    stock[productoId][tipo] = stock[productoId][tipo] ?? {};
    stock[productoId][tipo][nombre] = n;
  }

  // stockVentas[productoId][tipo][nombreTalla] = conteo − comprometidas
  const stockVentasNombres: Record<string, Record<string, Record<string, number>>> = {};
  for (const [k, n] of Object.entries(stockVentas)) {
    const { tipo, nombre } = nombreDe(k);
    if (!tipo || !nombre) continue;
    const [productoId] = k.split("|");
    stockVentasNombres[productoId] = stockVentasNombres[productoId] ?? {};
    stockVentasNombres[productoId][tipo] = stockVentasNombres[productoId][tipo] ?? {};
    stockVentasNombres[productoId][tipo][nombre] = n;
  }

  return (productos ?? []).map((p: any) => ({
    ...p,
    stock: stock[p.id] ?? {},
    stock_ventas: stockVentasNombres[p.id] ?? {},
  }));
}

export interface LineaStock {
  producto_id: string;
  talla_stock: string | null;
  talla_vendida: string | null;
  cantidad: number;
}

export interface ConflictoStock {
  producto_id: string;
  talla_id: string | null;
  producto_imei: string | null;
  producto_nombre: string | null;
  talla_nombre: string | null;
  cantidad: number;
  disponible: number;
  pedidos: {
    codigo: string | null;
    estado: string;
    cliente: string | null;
    cantidad: number;
  }[];
}

// Valida un lote de líneas contra el stock de ventas actual (relee la BD).
// Si algo quedara negativo, devuelve los conflictos con los pedidos que ya
// reservaron esa talla (para mostrarlos en el modal).
export async function validarStockLineas(
  lineas: LineaStock[]
): Promise<{ conflictos: ConflictoStock[]; stockVentas: Record<string, number> }> {
  const supabase = getSupabase();
  const stockVentas = await getStockVentasPorTalla();

  const necesitado: Record<string, number> = {};
  for (const l of lineas) {
    // Un entalle consume la talla STOCK: la unidad física que se toma y se
    // modifica a la talla vendida.
    const tallaReserva = l.talla_stock ?? l.talla_vendida;
    if (!tallaReserva) continue;
    const k = `${l.producto_id}|${tallaReserva}`;
    necesitado[k] = (necesitado[k] ?? 0) + Number(l.cantidad || 0);
  }

  const conflictos: ConflictoStock[] = [];
  for (const [k, requerido] of Object.entries(necesitado)) {
    const disponible = (stockVentas[k] ?? 0) - requerido;
    if (disponible >= 0) continue;

    const [productoId, tallaId] = k.split("|");
    const [{ data: producto }, { data: talla }, { data: pedidos }] = await Promise.all([
      supabase.from("productos").select("imei, nombre").eq("id", productoId).maybeSingle(),
      supabase.from("tallas").select("nombre").eq("id", tallaId).maybeSingle(),
      supabase
        .from("pedidos")
        .select("id, codigo, estado, clientes(nombre, apellido)")
        .not("estado", "in", "(borrador,cancelado,devuelto)"),
    ]);
    const ids = (pedidos ?? []).map((p: any) => p.id);
    const cantidades: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: detalles } = await supabase
        .from("detalles_pedido")
        .select("pedido_id, cantidad")
        .eq("estado", "activo")
        .eq("producto_id", productoId)
        .eq("talla_id", tallaId)
        .in("pedido_id", ids);
      for (const d of detalles ?? []) {
        cantidades[d.pedido_id] = (cantidades[d.pedido_id] ?? 0) + Number(d.cantidad);
      }
    }

    const reservantes = (pedidos ?? [])
      .filter((p: any) => cantidades[p.id])
      .map((p: any) => ({
        codigo: p.codigo,
        estado: p.estado,
        cliente: p.clientes
          ? `${p.clientes.nombre}${p.clientes.apellido ? " " + p.clientes.apellido : ""}`
          : null,
        cantidad: cantidades[p.id],
      }));

    conflictos.push({
      producto_id: productoId,
      talla_id: tallaId,
      producto_imei: producto?.imei ?? null,
      producto_nombre: producto?.nombre ?? null,
      talla_nombre: talla?.nombre ?? null,
      cantidad: requerido,
      disponible: stockVentas[k] ?? 0,
      pedidos: reservantes,
    });
  }

  return { conflictos, stockVentas };
}
