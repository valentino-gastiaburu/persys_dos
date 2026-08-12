import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import {
  generarResumen,
  generarCodigoViaje,
  calcularTotal,
  registrarHistorialPedido,
} from "@/lib/pedidos";

// POST /api/pedidos/[id]/confirmar
// Confirma el pedido: estado -> confirmado, crea el viaje inicial automáticamente.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;

  const { id } = await params;
  const supabase = getSupabase();

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("*")
    .eq("id", id)
    .single();
  if (!pedido) return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
  if (!["borrador", "solicitado"].includes(pedido.estado)) {
    return Response.json({ error: "El pedido ya fue confirmado" }, { status: 400 });
  }

  if (!pedido.cliente_id || !pedido.fecha_entrega) {
    return Response.json({ error: "Falta cliente o fecha de entrega" }, { status: 400 });
  }

  const { data: detallesData } = await supabase
    .from("detalles_pedido")
    .select("producto_id, cantidad, talla_id, genero, es_extra_motorizado, subtotal, tallas!detalles_pedido_talla_id_fkey(nombre)")
    .eq("pedido_id", id)
    .eq("estado", "activo");

  const detalles = (detallesData ?? []).map((d: any) => ({
    ...d,
    talla: d.tallas?.nombre ?? null,
  }));

  if (detalles.length === 0) {
    return Response.json({ error: "El pedido no tiene productos" }, { status: 400 });
  }

  const resumen = await generarResumen(detalles);
  const montoTotal = calcularTotal(
    detalles.map((d) => ({ subtotal: Number(d.subtotal ?? 0) })),
    Number(pedido.costo_envio ?? 0)
  );

  const viajeCodigo = await generarCodigoViaje();

  // Crear viaje inicial (entrega)
  const { data: viaje, error: viajeErr } = await supabase
    .from("viajes")
    .insert({
      codigo: viajeCodigo,
      pedido_id: id,
      tipo: "entrega",
      estado: "programado",
      fecha: pedido.fecha_entrega,
      creado_por: user.id,
    })
    .select()
    .single();

  if (viajeErr || !viaje) {
    return Response.json({ error: "No se pudo crear el viaje" }, { status: 500 });
  }

  // Asignar viaje a los detalles
  await supabase
    .from("detalles_pedido")
    .update({ viaje_id: viaje.id, confirmado_el: new Date().toISOString() })
    .eq("pedido_id", id)
    .eq("estado", "activo");

  const { data: confirmado, error: pedidoErr } = await supabase
    .from("pedidos")
    .update({
      estado: "confirmado",
      confirmado_el: new Date().toISOString(),
      resumen_productos: resumen,
      monto_total: montoTotal,
    })
    .eq("id", id)
    .select()
    .single();

  if (pedidoErr || !confirmado) {
    return Response.json({ error: "No se pudo confirmar el pedido" }, { status: 500 });
  }

  await registrarHistorialPedido({
    pedido_id: id,
    estado_anterior: pedido.estado,
    estado_nuevo: "confirmado",
    persona_id: user.id,
    motivo: "Pedido confirmado por la vendedora",
  });

  // Registrar el pago del primer pago si existe
  if (Number(confirmado.monto_primer_pago) > 0) {
    await supabase.from("pagos").insert({
      pedido_id: id,
      monto: Number(confirmado.monto_primer_pago),
      metodo_pago: confirmado.metodo_pago || "efectivo",
      persona_id: user.id,
      tipo: "primer_pago",
    });
  }

  return Response.json({ pedido: confirmado, viaje });
}
