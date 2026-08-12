import { getSupabase } from "./supabase";

// Mapa tipo_talla -> tipos de talla a los que corresponde.
export const TIPO_TALLA_TIPOS: Record<string, string[]> = {
  A: ["A"],
  B: ["B"],
  C: ["C"],
  AC: ["A", "C"],
  BC: ["B", "C"],
  sin_talla: [],
};

export const TIPO_TALLA_LABEL: Record<string, string> = {
  A: "A",
  B: "B",
  C: "C",
  AC: "A + C",
  BC: "B + C",
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

// Devuelve productos con su stock por talla (vista tipo ProductosxTalla).
export async function listarProductos() {
  const supabase = getSupabase();
  const [{ data: productos }, { data: stockRows }, { data: tallasRows }] =
    await Promise.all([
      supabase
        .from("productos")
        .select("*")
        .neq("estado", "eliminado")
        .order("nombre"),
      supabase
        .from("v_productosx_talla")
        .select("producto_id, talla, cantidad, stock_almacen, precio"),
      supabase
        .from("producto_tallas")
        .select("producto_id, talla_id"),
    ]);

  const tallasById: Record<string, string> = {};
  for (const r of tallasRows ?? []) tallasById[r.talla_id] = r.talla_id;

  // talla nombre lookup from v (contains talla name) — build from stockRows
  const stockPorProducto: Record<string, any[]> = {};
  for (const s of stockRows ?? []) {
    stockPorProducto[s.producto_id] = stockPorProducto[s.producto_id] ?? [];
    stockPorProducto[s.producto_id].push(s);
  }

  return (productos ?? []).map((p: any) => {
    let stock = stockPorProducto[p.id] ?? [];
    stock = [...stock].sort((a, b) =>
      (a.talla ?? "").localeCompare(b.talla ?? "", undefined, {
        numeric: true,
      })
    );
    return { ...p, stock };
  });
}
