import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { randomCode } from "@/lib/utils";

const ROLES_STOCK = ["almacen", "controller", "admin"];
const ROLES_LECTURA = ["vendedora", "agendadora", "almacen", "controller", "admin"];

// GET /api/tandas
// Filas para la vista "Imprimir QRs": cada producto único con su tanda, IMEI y talla.
export async function GET() {
  const { user, error } = await requireRoles(ROLES_LECTURA);
  if (error) return error;
  void user;

  const supabase = getSupabase();
  const { data, error: dbError } = await supabase
    .from("productos_unicos")
    .select(
      "id, codigo_qr, fecha_ingreso, tallas!productos_unicos_talla_id_fkey(nombre), productos(imei, nombre), tandas(id, codigo, fecha_creacion)"
    )
    .neq("estado", "eliminado");

  if (dbError) {
    return Response.json({ error: "No se pudieron obtener las tandas" }, { status: 500 });
  }

  const filas = (data ?? []).map((u: any) => ({
    id: u.id,
    codigo_qr: u.codigo_qr,
    imei: u.productos?.imei ?? null,
    producto_nombre: u.productos?.nombre ?? null,
    talla: u.tallas?.nombre ?? null,
    tanda_codigo: u.tandas?.codigo ?? null,
    fecha_creacion: u.tandas?.fecha_creacion ?? u.fecha_ingreso ?? null,
  }));

  // Orden descendente por fecha de creación (las más recientes al inicio).
  filas.sort((a: any, b: any) => {
    const da = a.fecha_creacion ? new Date(a.fecha_creacion).getTime() : 0;
    const db = b.fecha_creacion ? new Date(b.fecha_creacion).getTime() : 0;
    return db - da;
  });

  // Resumen por tanda (solo unidades que existen, no eliminadas)
  const tandasMap = new Map<string, { id: string; codigo: string; fecha_creacion: string; unidades: number }>();
  for (const u of (data ?? []) as any[]) {
    const t = u.tandas as { id?: string; codigo?: string; fecha_creacion?: string } | null;
    if (!t?.id) continue;
    const entry =
      tandasMap.get(t.id) ??
      { id: t.id, codigo: t.codigo ?? "", fecha_creacion: t.fecha_creacion ?? "", unidades: 0 };
    entry.unidades += 1;
    tandasMap.set(t.id, entry);
  }
  const tandas = [...tandasMap.values()].sort(
    (a, b) => new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime()
  );

  return Response.json({ filas, tandas });
}

// POST /api/tandas
// Crea una tanda: varias filas (producto + talla + cantidad) -> N productos únicos nuevos.
// body: { items: [{ producto_id, talla_id, cantidad }] }
export async function POST(request: NextRequest) {
  const { user, error } = await requireRoles(ROLES_STOCK);
  if (error) return error;

  const body = await request.json();
  const items = Array.isArray(body.items) ? body.items : [];

  if (items.length === 0) {
    return Response.json({ error: "Agrega al menos un producto a la tanda" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Validar todos los items antes de crear nada
  for (const item of items) {
    const productoId = String(item.producto_id ?? "");
    const tallaId = String(item.talla_id ?? "");
    const cantidad = Number(item.cantidad);
    if (!productoId || !tallaId) {
      return Response.json({ error: "Cada fila necesita un producto y una talla" }, { status: 400 });
    }
    if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 5000) {
      return Response.json({ error: "Cantidad inválida (debe ser un entero entre 1 y 5000)" }, { status: 400 });
    }
    const { data: pt } = await supabase
      .from("producto_tallas")
      .select("id")
      .eq("producto_id", productoId)
      .eq("talla_id", tallaId)
      .maybeSingle();
    if (!pt) {
      return Response.json({ error: "El producto no tiene la talla seleccionada" }, { status: 400 });
    }
  }

  // Crear la tanda
  const { data: tanda, error: tandaError } = await supabase
    .from("tandas")
    .insert({ creado_por: user.id })
    .select("id, codigo, fecha_creacion")
    .single();
  if (tandaError || !tanda) {
    return Response.json({ error: "No se pudo crear la tanda" }, { status: 500 });
  }

  // Crear los productos únicos
  const usados = new Set<string>();
  const unidades: any[] = [];
  const movimientos: any[] = [];

  for (const item of items) {
    const cantidad = Number(item.cantidad);
    for (let i = 0; i < cantidad; i++) {
      let qr = "";
      do {
        qr = randomCode(10);
      } while (usados.has(qr));
      usados.add(qr);
      unidades.push({
        producto_id: item.producto_id,
        talla_id: item.talla_id,
        codigo_qr: qr,
        tanda_id: tanda.id,
      });
    }
    movimientos.push({
      producto_id: item.producto_id,
      talla_id: item.talla_id,
      tipo: "entrada",
      cantidad,
      referencia_tipo: "ajuste",
      persona_id: user.id,
      nota: `Tanda ${tanda.codigo}`,
    });
  }

  const { data: creados, error: insertError } = await supabase
    .from("productos_unicos")
    .insert(unidades)
    .select("id, codigo_qr, talla_id");

  if (insertError || !creados) {
    return Response.json({ error: "No se pudieron crear los productos únicos" }, { status: 500 });
  }

  // Kardex por producto/talla
  await supabase.from("movimientos_stock").insert(movimientos);

  // Historial de ingreso de cada unidad
  await supabase
    .from("historial_producto_unicos")
    .insert(
      creados.map((u: any) => ({
        producto_unico_id: u.id,
        evento: "ingreso",
        persona_id: user.id,
        nota: `Ingreso por tanda ${tanda.codigo}`,
      }))
    );

  return Response.json(
    {
      tanda: { id: tanda.id, codigo: tanda.codigo, fecha_creacion: tanda.fecha_creacion },
      creados: creados.length,
      productos_unicos: creados,
    },
    { status: 201 }
  );
}
