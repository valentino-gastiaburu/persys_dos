import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["controller", "admin"]);
  if (error) return error;
  void user;

  const { id } = await params;
  const body = await request.json();
  const supabase = getSupabase();

  const updates: Record<string, any> = {};
  if (body.resuelto !== undefined) updates.resuelto = Boolean(body.resuelto);

  const { data, error: err } = await supabase
    .from("inconsistencias")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (err || !data) {
    return Response.json({ error: "No se pudo actualizar la inconsistencia" }, { status: 500 });
  }

  return Response.json({ inconsistencia: data });
}
