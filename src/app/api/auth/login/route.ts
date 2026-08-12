import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { createSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { dni, password } = await request.json();
  if (!dni || !password) {
    return Response.json({ error: "DNI y contraseña requeridos" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, dni, nombre, apellido, password, rol, estado")
    .eq("dni", String(dni).trim())
    .maybeSingle();

  if (error) {
    return Response.json({ error: "Error de base de datos" }, { status: 500 });
  }
  if (!data || data.password !== String(password)) {
    return Response.json({ error: "DNI o contraseña incorrectos" }, { status: 401 });
  }
  if (data.estado !== "activo") {
    return Response.json({ error: "Cuenta deshabilitada. Contacta al admin." }, { status: 403 });
  }

  await createSession({
    id: data.id,
    dni: data.dni,
    nombre: data.nombre + (data.apellido ? ` ${data.apellido}` : ""),
    rol: data.rol,
  });

  return Response.json({
    user: { id: data.id, dni: data.dni, nombre: data.nombre, rol: data.rol },
  });
}
