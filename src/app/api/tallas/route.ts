import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

// GET /api/tallas?producto_id=<id> — tallas de un producto
export async function GET(request: NextRequest) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "almacen", "controller", "admin"]);
  if (error) return error;
  void user;

  const supabase = getSupabase();
  const productoId = request.nextUrl.searchParams.get("producto_id");

  if (productoId) {
    const { data, error: err } = await supabase
      .from("producto_tallas")
      .select("tallas(id, nombre, tipo)")
      .eq("producto_id", productoId)
      .order("tallas(orden)");
    if (err) return Response.json({ error: "Error de base de datos" }, { status: 500 });
    return Response.json({
      tallas: (data ?? []).map((r: any) => r.tallas),
    });
  }

  const { data, error: err } = await supabase.from("tallas").select("id, nombre, tipo").order("orden");
  if (err) return Response.json({ error: "Error de base de datos" }, { status: 500 });
  return Response.json({ tallas: data ?? [] });
}
