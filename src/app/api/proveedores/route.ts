import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { registrarAuditoria, registrarCambios } from "@/lib/auditoria";

// GET /api/proveedores
// Devuelve la lista de proveedores con cuántos productos vinculados tiene cada uno.
export async function GET() {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "almacen", "controller", "admin"]);
  if (error) return error;
  void user;

  const supabase = getSupabase();
  const { data, error: err } = await supabase
    .from("proveedores")
    .select(`
      id,
      nombre,
      telefono,
      comentario,
      creado_el,
      productos:productos(id)
    `)
    .order("nombre", { ascending: true });

  if (err) {
    return Response.json({ error: "No se pudieron cargar los proveedores" }, { status: 500 });
  }

  const proveedores = (data ?? []).map((p: any) => ({
    ...p,
    n_productos: Array.isArray(p.productos) ? p.productos.length : 0,
    productos: undefined,
  }));

  return Response.json({ proveedores });
}

// POST /api/proveedores
//   body: { nombre, telefono?, comentario? }
export async function POST(request: NextRequest) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;

  const body = await request.json();
  const nombre = String(body.nombre ?? "").trim();

  if (!nombre) {
    return Response.json({ error: "El nombre del proveedor es obligatorio" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: existente } = await supabase
    .from("proveedores")
    .select("id")
    .eq("nombre", nombre)
    .maybeSingle();
  if (existente) {
    return Response.json({ error: "Ya existe un proveedor con ese nombre" }, { status: 409 });
  }

  const { data: proveedor, error: insertError } = await supabase
    .from("proveedores")
    .insert({
      nombre,
      telefono: body.telefono ? String(body.telefono).trim() : null,
      comentario: body.comentario ? String(body.comentario).trim() : null,
      creado_por: user.id,
    })
    .select()
    .single();

  if (insertError || !proveedor) {
    return Response.json({ error: "No se pudo crear el proveedor" }, { status: 500 });
  }

  await registrarAuditoria({
    user,
    entidad: "proveedor",
    entidad_id: proveedor.id,
    entidad_ref: proveedor.nombre,
    accion: "crear",
    nota: `Creó el proveedor ${proveedor.nombre}`,
  });

  return Response.json({ proveedor }, { status: 201 });
}