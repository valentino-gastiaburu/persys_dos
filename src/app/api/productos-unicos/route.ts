import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

// GET /api/productos-unicos
// Lista de productos únicos (unidades físicas) con su IMEI y talla.
export async function GET() {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "almacen", "controller", "admin"]);
  if (error) return error;
  void user;

  const supabase = getSupabase();
  // productos_unicos tiene dos FKs a tallas (talla_id, talla_original) -> hint para evitar embed ambiguo.
  const { data, error: dbError } = await supabase
    .from("productos_unicos")
    .select(
      "id, codigo_qr, estado, fecha_ingreso, productos(imei, nombre), tallas!productos_unicos_talla_id_fkey(nombre)"
    )
    .neq("estado", "eliminado")
    .order("fecha_ingreso", { ascending: false });

  if (dbError) {
    return Response.json({ error: "No se pudo obtener los productos únicos" }, { status: 500 });
  }

  return Response.json({ productos_unicos: data ?? [] });
}
