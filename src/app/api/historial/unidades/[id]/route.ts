import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

// GET /api/historial/unidades/[id]
// Historial/timeline completo de un producto único (una unidad física/QR):
// estado actual, reserva vigente y todos sus eventos registrados.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["controller", "admin"]);
  if (error) return error;
  void user;

  const { id } = await params;
  const supabase = getSupabase();

  const { data: unidad, error: errU } = await supabase
    .from("productos_unicos")
    .select(`
      *,
      productos(imei, nombre),
      tallas!productos_unicos_talla_id_fkey(nombre),
      talla_original_tallas: tallas!productos_unicos_talla_original_fkey(nombre)
    `)
    .eq("id", id)
    .maybeSingle();

  if (errU || !unidad) {
    return Response.json({ error: "Producto único no encontrado" }, { status: 404 });
  }

  const { data: eventos } = await supabase
    .from("historial_producto_unicos")
    .select(`
      *,
      usuarios(id, dni, nombre, rol),
      pedidos(codigo),
      viajes(codigo, tipo),
      talla_antes: tallas!historial_producto_unicos_talla_anterior_fkey(nombre),
      talla_ahora: tallas!historial_producto_unicos_talla_nueva_fkey(nombre)
    `)
    .eq("producto_unico_id", id)
    .order("fecha", { ascending: true });

  const { data: reserva } = await supabase
    .from("viaje_producto_unicos")
    .select(`
      id, estado, fecha_alistado, fecha_enviado, detalle_pedido_id,
      viajes!viaje_producto_unicos_viaje_id_fkey(codigo, tipo, estado, pedidos!viajes_pedido_id_fkey(codigo))
    `)
    .eq("producto_unico_id", id)
    .order("fecha_alistado", { ascending: false })
    .limit(1);

  return Response.json({
    unidad: {
      ...unidad,
      productos: unidad.productos as unknown as { imei: string; nombre: string } | null,
      talla: (unidad.tallas as unknown as { nombre: string } | null)?.nombre ?? null,
      talla_original_nombre:
        (unidad.talla_original_tallas as unknown as { nombre: string } | null)?.nombre ?? null,
    },
    eventos: (eventos ?? []).map((e: any) => ({
      id: e.id,
      evento: e.evento,
      fecha: e.fecha,
      nota: e.nota,
      persona: e.usuarios?.nombre ?? null,
      pedido_codigo: e.pedidos?.codigo ?? null,
      viaje_codigo: e.viajes?.codigo ?? null,
      viaje_tipo: e.viajes?.tipo ?? null,
      detalle_pedido_id: e.detalle_pedido_id ?? null,
      talla_anterior: e.talla_antes?.nombre ?? null,
      talla_nueva: e.talla_ahora?.nombre ?? null,
    })),
    reserva: (reserva?.[0] as any)
      ? {
          estado: (reserva?.[0] as any).estado,
          fecha_alistado: (reserva?.[0] as any).fecha_alistado,
          fecha_enviado: (reserva?.[0] as any).fecha_enviado,
          detalle_pedido_id: (reserva?.[0] as any).detalle_pedido_id,
          viaje: (reserva?.[0] as any).viajes as unknown as {
            codigo: string;
            tipo: string;
            estado: string;
            pedidos: { codigo: string } | null;
          } | null,
        }
      : null,
  });
}