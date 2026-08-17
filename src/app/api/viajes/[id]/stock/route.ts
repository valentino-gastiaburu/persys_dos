import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

// GET /api/viajes/[id]/stock?detalle_id=xxx
// Devuelve los productos_unicos disponibles (en_almacen para entregas,
// entregado para regresos) que coinciden con el producto y talla del detalle
// seleccionado, excluyendo los que ya están alistados en este viaje.
// Sirve para la búsqueda manual de la de almacén.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["almacen", "controller", "admin"]);
  if (error) return error;
  void user;

  const { id } = await params;
  const detalleId = request.nextUrl.searchParams.get("detalle_id");
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!detalleId) {
    return Response.json({ error: "Falta detalle_id" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: viaje } = await supabase
    .from("viajes")
    .select("id, tipo, estado")
    .eq("id", id)
    .single();
  if (!viaje) return Response.json({ error: "Viaje no encontrado" }, { status: 404 });

  const { data: detalle } = await supabase
    .from("detalles_pedido")
    .select("id, producto_id, talla_stock, talla_vendida, cantidad")
    .eq("id", detalleId)
    .eq("viaje_id", id)
    .single();
  if (!detalle) {
    return Response.json({ error: "Detalle no encontrado en este viaje" }, { status: 404 });
  }

  // En entregas se toma la talla STOCK (la que hay en almacén); en regresos la
  // talla que realmente tiene la unidad entregada (talla vendida).
  const esRecojo = viaje.tipo === "recojo";
  const tallaId = esRecojo
    ? detalle.talla_vendida ?? detalle.talla_stock
    : detalle.talla_stock ?? detalle.talla_vendida;
  const estadoRequerido = esRecojo ? "entregado" : "en_almacen";

  // Unidades ya alistadas en este viaje (para excluirlas)
  const { data: alistados } = await supabase
    .from("viaje_producto_unicos")
    .select("producto_unico_id")
    .eq("viaje_id", id);
  const alistadosIds = new Set((alistados ?? []).map((a) => a.producto_unico_id));

  let query = supabase
    .from("productos_unicos")
    .select("id, codigo_qr, talla_id, estado, productos(imei, nombre)")
    .eq("producto_id", detalle.producto_id)
    .eq("estado", estadoRequerido)
    .order("codigo_qr");

  if (tallaId) {
    query = query.eq("talla_id", tallaId);
  }

  // Filtro de búsqueda en vivo: por código QR o IMEI (parcial)
  if (q) {
    query = query.or(`codigo_qr.ilike.%${q}%,productos.imei.ilike.%${q}%`);
  }

  const { data: unicos, error: err } = await query.limit(50);

  if (err) {
    return Response.json({ error: "Error de base de datos" }, { status: 500 });
  }

  const disponibles = (unicos ?? [])
    .filter((u) => !alistadosIds.has(u.id))
    .map((u: any) => ({
      id: u.id,
      codigo_qr: u.codigo_qr,
      talla_id: u.talla_id,
      estado: u.estado,
      imei: u.productos?.imei,
      nombre: u.productos?.nombre,
    }));

  return Response.json({ disponibles });
}