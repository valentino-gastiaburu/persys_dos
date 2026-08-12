import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const ROLES_VALIDOS = ["vendedora", "agendadora", "almacen", "controller", "admin"];

// PATCH /api/usuarios/[id] — deshabilitar/habilitar, cambiar rol o contraseña (admin)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const supabase = getSupabase();

  const { data: actual } = await supabase.from("usuarios").select("*").eq("id", id).single();
  if (!actual) return Response.json({ error: "Usuario no encontrado" }, { status: 404 });

  if (id === user.id && body.estado === "inactivo") {
    return Response.json({ error: "No puedes deshabilitar tu propia cuenta" }, { status: 400 });
  }

  const updates: Record<string, any> = {};
  if (body.estado !== undefined) {
    if (!["activo", "inactivo"].includes(body.estado)) {
      return Response.json({ error: "Estado inválido" }, { status: 400 });
    }
    updates.estado = body.estado;
  }
  if (body.rol !== undefined) {
    if (!ROLES_VALIDOS.includes(body.rol)) return Response.json({ error: "Rol inválido" }, { status: 400 });
    updates.rol = body.rol;
  }
  if (body.password !== undefined) {
    if (String(body.password).length < 4) {
      return Response.json({ error: "La contraseña debe tener al menos 4 caracteres" }, { status: 400 });
    }
    updates.password = String(body.password);
  }
  if (body.nombre !== undefined) updates.nombre = String(body.nombre);
  if (body.apellido !== undefined) updates.apellido = body.apellido || null;
  if (body.email !== undefined) updates.email = body.email || null;
  if (body.telefono !== undefined) updates.telefono = body.telefono || null;

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "Sin cambios" }, { status: 400 });
  }

  const { data: usuario, error: err } = await supabase
    .from("usuarios")
    .update(updates)
    .eq("id", id)
    .select("id, dni, nombre, rol, estado")
    .single();

  if (err || !usuario) {
    return Response.json({ error: "No se pudo actualizar el usuario" }, { status: 500 });
  }
  return Response.json({ usuario });
}
