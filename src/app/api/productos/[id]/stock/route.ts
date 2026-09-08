import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { registrarAuditoria } from "@/lib/auditoria";
import { randomHexCode } from "@/lib/utils";

// POST /api/productos/[id]/stock
// Entrada manual de stock: producto + talla + cantidad -> crea N productos_unicos con QR.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["almacen", "controller", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const tallaId = body.talla_id;
  const cantidad = Number(body.cantidad);

  if (!tallaId) return Response.json({ error: "Selecciona una talla" }, { status: 400 });
  if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 5000) {
    return Response.json({ error: "Cantidad inválida" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: producto } = await supabase
    .from("productos")
    .select("id, imei")
    .eq("id", id)
    .maybeSingle();
  if (!producto) return Response.json({ error: "Producto no encontrado" }, { status: 404 });

  // Validar que la talla pertenece al producto
  const { data: pt } = await supabase
    .from("producto_tallas")
    .select("id")
    .eq("producto_id", id)
    .eq("talla_id", tallaId)
    .maybeSingle();
  if (!pt) return Response.json({ error: "El producto no tiene esa talla" }, { status: 400 });

  // Generar códigos QR únicos
  const usados = new Set<string>();
  const filas = [];
  for (let i = 0; i < cantidad; i++) {
    let qr = "";
    do {
      qr = randomHexCode(8);
    } while (usados.has(qr));
    usados.add(qr);
    filas.push({ producto_id: id, talla_id: tallaId, codigo_qr: qr });
  }

  const { data: creados, error: insertError } = await supabase
    .from("productos_unicos")
    .insert(filas)
    .select("id, codigo_qr, talla_id");

  if (insertError || !creados) {
    return Response.json({ error: "No se pudo crear el stock" }, { status: 500 });
  }

  // Kardex
  await supabase.from("movimientos_stock").insert({
    producto_id: id,
    talla_id: tallaId,
    tipo: "entrada",
    cantidad,
    referencia_tipo: "ajuste",
    persona_id: user.id,
    nota: "Entrada manual de stock",
  });

  // Historial de cada producto único
  await supabase.from("historial_producto_unicos").insert(
    creados.map((u: any) => ({
      producto_unico_id: u.id,
      evento: "ingreso",
      persona_id: user.id,
      nota: "Ingreso por entrada manual",
    }))
  );

  await registrarAuditoria({
    user,
    entidad: "producto",
    entidad_id: id,
    entidad_ref: producto.imei,
    accion: "ingresar_stock",
    valor_nuevo: { cantidad, talla_id: tallaId },
    nota: `Ingresó ${cantidad} unidades a stock`,
  });

  return Response.json({
    creados: creados.length,
    productos_unicos: creados,
  }, { status: 201 });
}
