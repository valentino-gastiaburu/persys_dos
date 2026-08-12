import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
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
  const tipoTalla = String(body.tipo_talla ?? "").trim();

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

  const { data: producto, error: insertError } = await supabase
    .from("productos")
    .insert({
      imei,
      nombre,
      precio_referencial: Number(body.precio_referencial ?? 0),
      tipo_talla: tipoTalla,
      foto_url: body.foto_url || null,
      creado_por: user.id,
    })
    .select()
    .single();

  if (insertError || !producto) {
    return Response.json({ error: "No se pudo crear el producto" }, { status: 500 });
  }

  await syncProductoTallas(producto.id, tipoTalla);
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

  return Response.json({ producto }, { status: 201 });
}
