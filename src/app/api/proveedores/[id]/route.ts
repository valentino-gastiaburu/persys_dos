import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { registrarAuditoria, registrarCambios } from "@/lib/auditoria";

// PATCH /api/proveedores/[id]
//   body: { nombre?, telefono?, comentario? }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const supabase = getSupabase();

  const { data: actual } = await supabase
    .from("proveedores")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!actual) {
    return Response.json({ error: "Proveedor no encontrado" }, { status: 404 });
  }

  const updates: Record<string, any> = {};
  const cambios: { campo: string; anterior: unknown; nuevo: unknown }[] = [];

  if (body.nombre !== undefined) {
    const nombre = String(body.nombre).trim();
    if (!nombre) {
      return Response.json({ error: "El nombre no puede quedar vacío" }, { status: 400 });
    }
    if (nombre !== actual.nombre) {
      const { data: dup } = await supabase
        .from("proveedores")
        .select("id")
        .eq("nombre", nombre)
        .maybeSingle();
      if (dup && dup.id !== id) {
        return Response.json({ error: "Ya existe otro proveedor con ese nombre" }, { status: 409 });
      }
      updates.nombre = nombre;
      cambios.push({ campo: "nombre", anterior: actual.nombre, nuevo: nombre });
    }
  }

  if (body.telefono !== undefined) {
    const t = body.telefono === null ? null : String(body.telefono).trim();
    if ((t ?? null) !== (actual.telefono ?? null)) {
      updates.telefono = t;
      cambios.push({ campo: "telefono", anterior: actual.telefono, nuevo: t });
    }
  }

  if (body.comentario !== undefined) {
    const c = body.comentario === null ? null : String(body.comentario).trim();
    if ((c ?? null) !== (actual.comentario ?? null)) {
      updates.comentario = c;
      cambios.push({ campo: "comentario", anterior: actual.comentario, nuevo: c });
    }
  }

  if (cambios.length === 0) {
    return Response.json({ error: "No hay cambios que guardar" }, { status: 400 });
  }

  const { data: proveedor, error: updateError } = await supabase
    .from("proveedores")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (updateError || !proveedor) {
    return Response.json({ error: "No se pudo guardar el proveedor" }, { status: 500 });
  }

  await registrarCambios({
    user,
    entidad: "proveedor",
    entidad_id: proveedor.id,
    entidad_ref: proveedor.nombre,
    accion: "editar",
    cambios,
  });

  return Response.json({ proveedor });
}

// DELETE /api/proveedores/[id]
// Elimina el proveedor SOLO si no tiene productos vinculados.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;

  const { id } = await params;
  const supabase = getSupabase();

  const { data: actual } = await supabase
    .from("proveedores")
    .select("id, nombre")
    .eq("id", id)
    .maybeSingle();
  if (!actual) {
    return Response.json({ error: "Proveedor no encontrado" }, { status: 404 });
  }

  const { data: vinculados } = await supabase
    .from("productos")
    .select("id")
    .eq("proveedor_id", id)
    .limit(1);
  if (vinculados && vinculados.length > 0) {
    return Response.json(
      { error: "No se puede eliminar un proveedor que tiene productos vinculados" },
      { status: 400 }
    );
  }

  const { error: deleteError } = await supabase
    .from("proveedores")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return Response.json({ error: "No se pudo eliminar el proveedor" }, { status: 500 });
  }

  await registrarAuditoria({
    user,
    entidad: "proveedor",
    entidad_id: id,
    entidad_ref: actual.nombre,
    accion: "eliminar",
    nota: `Eliminó el proveedor ${actual.nombre}`,
  });

  return Response.json({ ok: true });
}