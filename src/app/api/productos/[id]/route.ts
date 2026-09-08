import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { registrarAuditoria, registrarCambios } from "@/lib/auditoria";
import {
  syncProductoTallas,
  registrarHistorialProducto,
  tienePedidos,
  TIPO_TALLA_TIPOS,
} from "@/lib/productos";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "almacen", "controller", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const supabase = getSupabase();

  const { data: actual } = await supabase
    .from("productos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!actual) {
    return Response.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const updates: Record<string, any> = {};
  const campos: string[] = [];

  if (body.imei !== undefined) {
    const imei = String(body.imei).trim();
    if (!imei) return Response.json({ error: "El IMEI no puede quedar vacío" }, { status: 400 });
    if (imei !== actual.imei) {
      if (!body.dniConfirmacion || String(body.dniConfirmacion) !== user.dni) {
        return Response.json(
          { error: "Escribe tu DNI para confirmar la edición del IMEI" },
          { status: 400 }
        );
      }
      const { data: dup } = await supabase.from("productos").select("id").eq("imei", imei).maybeSingle();
      if (dup) return Response.json({ error: "Ya existe otro producto con ese IMEI" }, { status: 409 });
      updates.imei = imei;
      campos.push("imei");
    }
  }

  if (body.nombre !== undefined) {
    const nombre = String(body.nombre).trim();
    if (!nombre) return Response.json({ error: "El nombre no puede quedar vacío" }, { status: 400 });
    if (nombre !== actual.nombre) {
      updates.nombre = nombre;
      campos.push("nombre");
    }
  }

  if (body.foto_url !== undefined && body.foto_url !== actual.foto_url) {
    updates.foto_url = body.foto_url || null;
    campos.push("imagen");
  }

  if (body.precio_referencial !== undefined && Number(body.precio_referencial) !== Number(actual.precio_referencial)) {
    updates.precio_referencial = Number(body.precio_referencial);
    campos.push("precio_referencial");
  }

  if (body.tipo_talla !== undefined && body.tipo_talla !== actual.tipo_talla) {
    const tipo = String(body.tipo_talla);
    if (!TIPO_TALLA_TIPOS[tipo]) {
      return Response.json({ error: "Tipo de talla inválido" }, { status: 400 });
    }
    // Solo se permite AGREGAR tallas, nunca quitar.
    updates.tipo_talla = tipo;
    campos.push("tipo_talla");
  }

  if (body.estado !== undefined && body.estado !== actual.estado) {
    if (actual.estado === "eliminado" || body.estado === "eliminado") {
      return Response.json({ error: "Usa el botón de eliminar para ese cambio" }, { status: 400 });
    }
    updates.estado = body.estado;
    campos.push("estado");
  }

  if (campos.length === 0) {
    return Response.json({ error: "No hay cambios que guardar" }, { status: 400 });
  }

  updates.actualizado_por = user.id;

  const { data: producto, error: updateError } = await supabase
    .from("productos")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (updateError || !producto) {
    return Response.json({ error: "No se pudo guardar el producto" }, { status: 500 });
  }

  if (updates.tipo_talla) {
    await syncProductoTallas(producto.id, producto.tipo_talla);
  }

  await registrarHistorialProducto({
    producto_id: producto.id,
    persona_id: user.id,
    tipo_evento: "edicion",
    campos_editados: campos,
    imei: producto.imei,
    nombre: producto.nombre,
    tipo_talla: producto.tipo_talla,
    foto_url: producto.foto_url,
    precio_referencial: producto.precio_referencial,
  });
  await registrarCambios({
    user,
    entidad: "producto",
    entidad_id: producto.id,
    entidad_ref: producto.imei,
    accion: "editar",
    cambios: campos.map((c) => {
      const f = c === "imagen" ? "foto_url" : c;
      return { campo: c, anterior: (actual as Record<string, any>)[f], nuevo: (producto as Record<string, any>)[f] };
    }),
  });

  return Response.json({ producto });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "almacen", "controller", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const supabase = getSupabase();

  const { data: actual } = await supabase
    .from("productos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!actual) {
    return Response.json({ error: "Producto no encontrado" }, { status: 404 });
  }
  if (actual.estado === "eliminado") {
    return Response.json({ error: "El producto ya fue eliminado" }, { status: 400 });
  }
  if (!body.dniConfirmacion || String(body.dniConfirmacion) !== user.dni) {
    return Response.json(
      { error: "Escribe tu DNI para confirmar la eliminación" },
      { status: 400 }
    );
  }
  if (await tienePedidos(id)) {
    return Response.json(
      { error: "No se puede eliminar un producto que ya tiene pedidos realizados" },
      { status: 400 }
    );
  }

  const { data: producto, error: updateError } = await supabase
    .from("productos")
    .update({ estado: "eliminado", actualizado_por: user.id })
    .eq("id", id)
    .select()
    .single();

  if (updateError || !producto) {
    return Response.json({ error: "No se pudo eliminar el producto" }, { status: 500 });
  }

  await registrarHistorialProducto({
    producto_id: producto.id,
    persona_id: user.id,
    tipo_evento: "eliminacion",
    campos_editados: ["imei", "nombre", "tipo_talla", "imagen", "precio_referencial"],
    imei: producto.imei,
    nombre: producto.nombre,
    tipo_talla: producto.tipo_talla,
    foto_url: producto.foto_url,
    precio_referencial: producto.precio_referencial,
  });
  await registrarAuditoria({
    user,
    entidad: "producto",
    entidad_id: producto.id,
    entidad_ref: producto.imei,
    accion: "eliminar",
    nota: `Eliminó el IMEI ${producto.imei} (${producto.nombre})`,
  });

  return Response.json({ ok: true });
}
