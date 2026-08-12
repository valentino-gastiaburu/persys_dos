import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

// GET /api/clientes?q=busqueda — busca por teléfono o nombre
// POST /api/clientes — crear cliente
export async function GET(request: NextRequest) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "almacen", "controller", "admin"]);
  if (error) return error;
  void user;

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const supabase = getSupabase();

  let query = supabase.from("clientes").select("*").order("creado_el", { ascending: false });
  if (q) {
    query = query.or(`telefono.ilike.%${q}%,nombre.ilike.%${q}%,apellido.ilike.%${q}%`);
  }
  const { data, error: err } = await query.limit(50);
  if (err) return Response.json({ error: "Error de base de datos" }, { status: 500 });
  return Response.json({ clientes: data });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;

  const body = await request.json();
  const telefono = String(body.telefono ?? "").trim();
  const nombre = String(body.nombre ?? "").trim();

  if (!telefono || !nombre) {
    return Response.json({ error: "Teléfono y nombre son obligatorios" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: existente } = await supabase
    .from("clientes")
    .select("id")
    .eq("telefono", telefono)
    .maybeSingle();
  if (existente) {
    return Response.json({ error: "Ya existe un cliente con ese teléfono" }, { status: 409 });
  }

  const { data: cliente, error: err } = await supabase
    .from("clientes")
    .insert({
      telefono,
      nombre,
      apellido: body.apellido || null,
      dni: body.dni || null,
      email: body.email || null,
      region: body.region || null,
      distrito: body.distrito || null,
      direccion: body.direccion || null,
      fecha_nacimiento: body.fecha_nacimiento || null,
      genero: body.genero || null,
      observaciones: body.observaciones || null,
      creado_por: user.id,
    })
    .select()
    .single();

  if (err || !cliente) {
    return Response.json({ error: "No se pudo registrar el cliente" }, { status: 500 });
  }
  return Response.json({ cliente }, { status: 201 });
}
