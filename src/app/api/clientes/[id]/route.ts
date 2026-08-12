import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;
  void user;

  const { id } = await params;
  const body = await request.json();
  const supabase = getSupabase();

  const campos: Record<string, any> = {};
  const permitidos = [
    "nombre", "apellido", "dni", "email", "region", "distrito",
    "direccion", "fecha_nacimiento", "genero", "observaciones",
  ];
  for (const c of permitidos) {
    if (body[c] !== undefined) campos[c] = body[c] === "" ? null : body[c];
  }
  if (body.telefono !== undefined) {
    const telefono = String(body.telefono).trim();
    if (!telefono) return Response.json({ error: "El teléfono es obligatorio" }, { status: 400 });
    campos.telefono = telefono;
  }
  if (Object.keys(campos).length === 0) {
    return Response.json({ error: "Sin cambios" }, { status: 400 });
  }

  const { data: cliente, error: err } = await supabase
    .from("clientes")
    .update(campos)
    .eq("id", id)
    .select()
    .single();

  if (err || !cliente) {
    return Response.json({ error: "No se pudo actualizar el cliente" }, { status: 500 });
  }
  return Response.json({ cliente });
}
