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

// Devuelve productos con su stock por talla.
// El stock es el conteo de productos_unicos existentes por talla (excluye eliminados).
export async function listarProductos() {
  const supabase = getSupabase();
  const [{ data: productos }, { data: unidades }, { data: tallasRows }] =
    await Promise.all([
      supabase
        .from("productos")
        .select("*")
        .neq("estado", "eliminado")
        .order("nombre"),
      supabase
        .from("productos_unicos")
        .select("producto_id, talla_id")
        .neq("estado", "eliminado"),
      supabase.from("tallas").select("id, tipo, nombre"),
    ]);

  const tallaTipo: Record<string, string> = {};
  const tallaNombre: Record<string, string> = {};
  for (const t of tallasRows ?? []) {
    tallaTipo[t.id] = t.tipo;
    tallaNombre[t.id] = t.nombre;
  }

  // conteos[productoId][tipo][nombreTalla] = cantidad
  const conteos: Record<string, Record<string, Record<string, number>>> = {};
  for (const u of unidades ?? []) {
    const tipo = tallaTipo[u.talla_id];
    const nombre = tallaNombre[u.talla_id];
    if (!tipo || !nombre) continue;
    conteos[u.producto_id] = conteos[u.producto_id] ?? {};
    conteos[u.producto_id][tipo] = conteos[u.producto_id][tipo] ?? {};
    conteos[u.producto_id][tipo][nombre] =
      (conteos[u.producto_id][tipo][nombre] ?? 0) + 1;
  }

  return (productos ?? []).map((p: any) => ({
    ...p,
    stock: conteos[p.id] ?? {},
  }));
}
