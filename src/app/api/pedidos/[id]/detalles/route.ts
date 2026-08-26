import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { sincronizarTotalesPedido } from "@/lib/pedidos";
import { getStockVentasPorTalla } from "@/lib/productos";
import { recalcularEstadoViaje } from "@/lib/pedidos";

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
  // talla_stock = la que hay en almacén (origen, consume stock).
  // talla_vendida = lo que pidió el cliente (destino); si no hay entalle = talla_stock.
  const tallaStock = body.talla_stock || null;
  const tallaVendida = body.entalle ? (body.talla_vendida || tallaStock) : tallaStock;
  const cantidad = Number(body.cantidad ?? 1);
  const precioUnitario = Number(body.precio_unitario ?? 0);

  if (!productoId) return Response.json({ error: "Producto requerido" }, { status: 400 });
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return Response.json({ error: "Cantidad inválida" }, { status: 400 });
  }
  if (precioUnitario < 0) return Response.json({ error: "Precio inválido" }, { status: 400 });

  // Verificar stock de ventas disponible (almacén − comprometidas en pedidos).
  // La talla que se consume es la STOCK (la unidad física que se toma y modifica).
  const stockVentas = await getStockVentasPorTalla();
  const tallaReserva = tallaStock ?? tallaVendida;
  const disponible = Number(stockVentas[`${productoId}|${tallaReserva}`] ?? 0);
  if (tallaReserva && disponible < cantidad) {
    return Response.json(
      { error: `Stock insuficiente: solo hay ${disponible} en esa talla` },
      { status: 400 }
    );
  }

  const subtotal = cantidad * precioUnitario;

  // Verificar si ya existe un detalle con la misma (producto, talla_stock, talla_vendida)
  const { data: existente } = await supabase
    .from("detalles_pedido")
    .select("id, cantidad, subtotal")
    .eq("pedido_id", id)
    .eq("producto_id", productoId)
    .eq("talla_stock", tallaStock)
    .eq("talla_vendida", tallaVendida)
    .single();

  if (existente) {
    // Mergear: sumar cantidades y subtotales
    const nuevaCant = Number(existente.cantidad) + cantidad;
    const nuevoSubtotal = Number(existente.subtotal) + subtotal;
    const { data: detalle, error: err } = await supabase
      .from("detalles_pedido")
      .update({ cantidad: nuevaCant, subtotal: nuevoSubtotal })
      .eq("id", existente.id)
      .select("*, productos(imei, nombre), tallas!detalles_pedido_talla_vendida_fkey(nombre)")
      .single();
    if (err || !detalle) {
      return Response.json({ error: `No se pudo actualizar el detalle: ${err?.message ?? "sin detalle"}` }, { status: 500 });
    }
    const montoTotal = await sincronizarTotalesPedido(id);
    await supabase.from("pedidos").update({ monto_total: montoTotal }).eq("id", id);
    return Response.json({ detalle, monto_total: montoTotal }, { status: 200 });
  }

  const { data: detalle, error: err } = await supabase
    .from("detalles_pedido")
    .insert({
      pedido_id: id,
      producto_id: productoId,
      talla_stock: tallaStock,
      talla_vendida: tallaVendida,
      entalle: Boolean(tallaStock && tallaVendida && tallaStock !== tallaVendida),
      cantidad,
      precio_unitario: precioUnitario,
      subtotal,
      genero: body.genero || "dama",
      es_extra_motorizado: Boolean(body.es_extra_motorizado),
      anadido_por: user.id,
    })
    .select("*, productos(imei, nombre), tallas!detalles_pedido_talla_vendida_fkey(nombre)")
    .single();

  if (err || !detalle) {
    return Response.json({ error: `No se pudo agregar el detalle: ${err?.message ?? "sin detalle"}` }, { status: 500 });
  }

  // Si el pedido ya tiene viaje de entrega, la línea nueva pertenece a ese viaje
  // (el pedido es una colección de viajes; cada producto vive en el suyo).
  const { data: viaje } = await supabase
    .from("viajes")
    .select("id")
    .eq("pedido_id", id)
    .eq("tipo", "entrega")
    .order("creado_el")
    .limit(1)
    .maybeSingle();
  if (viaje) {
    await supabase
      .from("detalles_pedido")
      .update({ viaje_id: viaje.id, confirmado_el: new Date().toISOString() })
      .eq("id", detalle.id);
  }

  const montoTotal = await sincronizarTotalesPedido(id);
  await supabase.from("pedidos").update({ monto_total: montoTotal }).eq("id", id);

  if (viaje) {
    await recalcularEstadoViaje(viaje.id);
  }

  return Response.json({ detalle, monto_total: montoTotal }, { status: 201 });
}
