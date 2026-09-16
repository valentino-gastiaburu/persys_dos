import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  syncProductoTallas,
  registrarHistorialProducto,
  listarProductos,
  TIPO_TALLA_TIPOS,
} from "@/lib/productos";

export async function GET() {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "almacen", "controller", "admin"]);
  if (error) return error;
  void user;
  const productos = await listarProductos();
  return Response.json({ productos });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "almacen", "controller", "admin"]);
  if (error) return error;

  const body = await request.json();
  const imei = String(body.imei ?? "").trim();
  const nombre = String(body.nombre ?? "").trim();
  const esDropship = Boolean(body.es_dropship);
  const tipoTalla = esDropship
    ? "sin_talla"
    : String(body.tipo_talla ?? "").trim();

  if (!imei || !nombre) {
    return Response.json({ error: "IMEI y nombre son obligatorios" }, { status: 400 });
  }
  if (!TIPO_TALLA_TIPOS[tipoTalla]) {
    return Response.json({ error: "Tipo de talla inválido" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: existente } = await supabase
    .from("productos")
    .select("id")
    .eq("imei", imei)
    .maybeSingle();
  if (existente) {
    return Response.json({ error: "Ya existe un producto con ese IMEI" }, { status: 409 });
  }

  // El id se genera en el cliente al abrir el form (oculto e inmutable): así la
  // foto de Drive se nombra "prod-{codigo}-{imei}" con el MISMO id del producto.
  // Solo se acepta en creación (aún no hay referencias que romper); de no venir,
  // genera uno la BD.
  const idExplicito = String(body.id ?? "").trim();
  const uuidValido = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idExplicito);
  if (idExplicito && !uuidValido) {
    return Response.json({ error: "El id del producto es inválido" }, { status: 400 });
  }

  if (body.proveedor_id !== undefined && body.proveedor_id !== null) {
    const { data: prov } = await supabase
      .from("proveedores")
      .select("id")
      .eq("id", String(body.proveedor_id))
      .maybeSingle();
    if (!prov) {
      return Response.json({ error: "El proveedor seleccionado no existe" }, { status: 400 });
    }
  }

  const { data: producto, error: insertError } = await supabase
    .from("productos")
    .insert({
      ...(idExplicito && uuidValido ? { id: idExplicito } : {}),
      imei,
      nombre,
      precio_referencial: Number(body.precio_referencial ?? 0),
      tipo_talla: tipoTalla,
      foto_url: body.foto_url || null,
      es_dropship: esDropship,
      detalles: body.detalles ? String(body.detalles).trim() : null,
      proveedor_id: body.proveedor_id || null,
      creado_por: user.id,
    })
    .select()
    .single();

  if (insertError || !producto) {
    return Response.json({ error: "No se pudo crear el producto" }, { status: 500 });
  }

  if (!esDropship) {
    await syncProductoTallas(producto.id, tipoTalla);
  }
  await registrarHistorialProducto({
    producto_id: producto.id,
    persona_id: user.id,
    tipo_evento: "creacion",
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
    accion: "crear",
    nota: `Creó el IMEI ${producto.imei} (${producto.nombre})`,
  });

  return Response.json({ producto }, { status: 201 });
}
