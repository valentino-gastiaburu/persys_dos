import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

// GET /api/productos-unicos
// Lista de productos únicos (unidades físicas) con su IMEI, talla y, si están
// asignados a un viaje, el código de pedido y viaje (para el módulo de conteo).
export async function GET() {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "almacen", "controller", "admin"]);
  if (error) return error;
  void user;

  const supabase = getSupabase();
  // productos_unicos tiene dos FKs a tallas (talla_id, talla_original) -> hint para evitar embed ambiguo.
  const { data, error: dbError } = await supabase
    .from("productos_unicos")
    .select(
      "id, codigo_qr, estado, fecha_ingreso, producto_id, productos(imei, nombre), tallas!productos_unicos_talla_id_fkey(nombre)"
    )
    .neq("estado", "eliminado")
    .order("fecha_ingreso", { ascending: false });

  if (dbError) {
    return Response.json({ error: "No se pudo obtener los productos únicos" }, { status: 500 });
  }

  const { data: asignaciones, error: asigError } = await supabase
    .from("viaje_producto_unicos")
    .select(
      "producto_unico_id, viajes!viaje_producto_unicos_viaje_id_fkey(codigo, pedidos!viajes_pedido_id_fkey(codigo))"
    )
    .order("fecha_alistado", { ascending: false });

  if (asigError) {
    return Response.json({ error: "No se pudo obtener las asignaciones de viaje" }, { status: 500 });
  }

  const asigMap = new Map<string, { viaje: string; pedido: string }>();
  for (const a of asignaciones ?? []) {
    const key = a.producto_unico_id as string;
    if (asigMap.has(key)) continue;
    const v = a.viajes as unknown as { codigo: string; pedidos: { codigo: string } | null } | null;
    if (!v) continue;
    asigMap.set(key, { viaje: v.codigo, pedido: v.pedidos?.codigo ?? "—" });
  }

  const filas = (data ?? []).map((r) => {
    const id = r.id as string;
    const asig = asigMap.get(id);
    return {
      ...r,
      viaje: asig?.viaje ?? null,
      pedido: asig?.pedido ?? null,
    };
  });

  return Response.json({ productos_unicos: filas });
}
