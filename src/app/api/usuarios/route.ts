import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const ROLES_VALIDOS = ["vendedora", "agendadora", "almacen", "controller", "admin"];

// GET /api/usuarios — lista (solo admin)
export async function GET() {
  const { user, error } = await requireRoles(["admin"]);
  if (error) return error;
  void user;

  const supabase = getSupabase();
  const { data, error: err } = await supabase
    .from("usuarios")
    .select("id, dni, nombre, apellido, email, telefono, rol, estado, descripcion, fecha_contratacion, creado_el")
    .order("nombre");
  if (err) return Response.json({ error: "Error de base de datos" }, { status: 500 });
  return Response.json({ usuarios: data });
}

// POST /api/usuarios — crea una cuenta (admin)
export async function POST(request: NextRequest) {
  const { user, error } = await requireRoles(["admin"]);
  if (error) return error;
  void user;

  const body = await request.json();
  const dni = String(body.dni ?? "").trim();
  const nombre = String(body.nombre ?? "").trim();
  const password = String(body.password ?? "");

  if (!dni || !nombre || !password) {
    return Response.json({ error: "DNI, nombre y contraseña son obligatorios" }, { status: 400 });
  }
  if (password.length < 4) {
    return Response.json({ error: "La contraseña debe tener al menos 4 caracteres" }, { status: 400 });
  }
  if (!ROLES_VALIDOS.includes(body.rol)) {
    return Response.json({ error: "Rol inválido" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: existente } = await supabase.from("usuarios").select("id").eq("dni", dni).maybeSingle();
  if (existente) return Response.json({ error: "Ya existe un usuario con ese DNI" }, { status: 409 });

  const { data: usuario, error: err } = await supabase
    .from("usuarios")
    .insert({
      dni,
      nombre,
      apellido: body.apellido || null,
      email: body.email || null,
      telefono: body.telefono || null,
      password,
      rol: body.rol,
      estado: "activo",
      descripcion: body.descripcion || null,
      fecha_contratacion: body.fecha_contratacion || null,
    })
    .select("id, dni, nombre, rol, estado")
    .single();

  if (err || !usuario) {
    return Response.json({ error: "No se pudo crear el usuario" }, { status: 500 });
  }
  return Response.json({ usuario }, { status: 201 });
}
