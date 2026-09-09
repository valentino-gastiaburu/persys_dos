import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { getStockVentasPorTalla, TIPO_TALLA_TIPOS } from "@/lib/productos";

// GET /api/tallas — tallas del sistema, o de un producto si va ?producto_id=<id>.
// Las tallas de un producto vienen de su escala según tipo_talla (NO de
// producto_tallas, que puede estar incompleto); cada talla trae cantidad y
// cantidad_ventas (0 si no tiene stock/pedidos).
export async function GET(request: NextRequest) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "almacen", "controller", "admin"]);
  if (error) return error;
  void user;

  const supabase = getSupabase();
  const productoId = request.nextUrl.searchParams.get("producto_id");

  if (productoId) {
    const [{ data: producto }, { data: tallasRows }, { data: unidades, error: errU }, stockVentas] =
      await Promise.all([
        supabase
          .from("productos")
          .select("id, tipo_talla")
          .eq("id", productoId)
          .maybeSingle(),
        supabase
          .from("tallas")
          .select("id, nombre, tipo, orden")
          .order("orden"),
        supabase
          .from("productos_unicos")
          .select("talla_id")
          .eq("producto_id", productoId)
          .neq("estado", "eliminado"),
        getStockVentasPorTalla(),
      ]);
    if (errU) return Response.json({ error: "Error de base de datos" }, { status: 500 });

    const tipos = TIPO_TALLA_TIPOS[producto?.tipo_talla ?? ""] ?? [];
    const tallas = (tallasRows ?? []).filter((t) => tipos.includes(t.tipo));

    const conteo: Record<string, number> = {};
    for (const u of unidades ?? []) conteo[u.talla_id] = (conteo[u.talla_id] ?? 0) + 1;

    return Response.json({
      tallas: tallas.map((t) => ({
        id: t.id,
        nombre: t.nombre,
        tipo: t.tipo,
        cantidad: conteo[t.id] ?? 0,
        cantidad_ventas: stockVentas[`${productoId}|${t.id}`] ?? 0,
      })),
    });
  }

  const { data, error: err } = await supabase.from("tallas").select("id, nombre, tipo").order("orden");
  if (err) return Response.json({ error: "Error de base de datos" }, { status: 500 });
  return Response.json({ tallas: data ?? [] });
}
