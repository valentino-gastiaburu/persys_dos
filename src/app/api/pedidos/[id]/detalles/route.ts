import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { calcularTotal } from "@/lib/pedidos";
import { getStockVentasPorTalla } from "@/lib/productos";

// POST /api/pedidos/[id]/detalles — agrega un detalle al pedido (borrador)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const supabase = getSupabase();

  const { data: pedido } = await supabase.from("pedidos").select("id, estado").eq("id", id).single();
  if (!pedido) return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
  const EDITABLES = ["borrador", "solicitado", "confirmado", "alistado"];
  if (!EDITABLES.includes(pedido.estado)) {
    return Response.json({ error: "El pedido ya no se puede editar" }, { status: 400 });
  }

  const productoId = body.producto_id;
  const tallaId = body.talla_id || null;
  const cantidad = Number(body.cantidad ?? 1);
  const precioUnitario = Number(body.precio_unitario ?? 0);

  if (!productoId) return Response.json({ error: "Producto requerido" }, { status: 400 });
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return Response.json({ error: "Cantidad inválida" }, { status: 400 });
  }
  if (precioUnitario < 0) return Response.json({ error: "Precio inválido" }, { status: 400 });

  // Verificar stock de ventas disponible (almacén − comprometidas en pedidos)
  const stockVentas = await getStockVentasPorTalla();
  const disponible = Number(stockVentas[`${productoId}|${tallaId}`] ?? 0);
  if (tallaId && disponible < cantidad) {
    return Response.json(
      { error: `Stock insuficiente: solo hay ${disponible} en esa talla` },
      { status: 400 }
    );
  }

  const subtotal = cantidad * precioUnitario;

  const { data: detalle, error: err } = await supabase
    .from("detalles_pedido")
    .insert({
      pedido_id: id,
      producto_id: productoId,
      talla_id: tallaId,
      entalle: Boolean(body.entalle),
      talla_inicial: body.talla_inicial || null,
      cantidad,
      precio_unitario: precioUnitario,
      subtotal,
      genero: body.genero || "dama",
      es_extra_motorizado: Boolean(body.es_extra_motorizado),
      anadido_por: user.id,
    })
    .select("*, productos(imei, nombre), tallas!detalles_pedido_talla_id_fkey(nombre)")
    .single();

  if (err || !detalle) {
    return Response.json({ error: `No se pudo agregar el detalle: ${err?.message ?? "sin detalle"}` }, { status: 500 });
  }

  // Recalcular monto_total del pedido
  const detalles = await supabase
    .from("detalles_pedido")
    .select("subtotal")
    .eq("pedido_id", id)
    .eq("estado", "activo");
  const { data: pedidoActual } = await supabase
    .from("pedidos")
    .select("costo_envio")
    .eq("id", id)
    .single();
  const montoTotal = calcularTotal(
    (detalles.data ?? []).map((d) => ({ subtotal: Number(d.subtotal) })),
    Number(pedidoActual?.costo_envio ?? 0)
  );
  await supabase.from("pedidos").update({ monto_total: montoTotal }).eq("id", id);

  return Response.json({ detalle, monto_total: montoTotal }, { status: 201 });
}
