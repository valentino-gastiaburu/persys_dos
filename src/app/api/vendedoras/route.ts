import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

// GET /api/vendedoras — lista de vendedoras activas
export async function GET() {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "almacen", "controller", "admin"]);
  if (error) return error;
  void user;

  const supabase = getSupabase();
  const { data, error: err } = await supabase
    .from("usuarios")
    .select("id, nombre")
    .eq("rol", "vendedora")
    .eq("estado", "activo")
    .order("nombre");

  if (err) return Response.json({ error: "Error de base de datos" }, { status: 500 });
  return Response.json({ vendedoras: data ?? [] });
}
