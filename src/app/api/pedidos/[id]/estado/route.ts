import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { registrarHistorialPedido } from "@/lib/pedidos";

// Transiciones manuales de estado del pedido.
const TRANSICIONES: Record<string, string[]> = {
  solicitado: ["confirmado", "cancelado"],
  confirmado: ["solicitado", "cancelado"],
};

// POST /api/pedidos/[id]/estado — { estado: "cancelado" | "solicitado" }
// Cambia el estado manualmente validando la transición.
// Nota: solicitado -> confirmado sigue pasando por /api/pedidos/[id]/confirmar
// (calcula totales, crea el viaje y registra el primer pago).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const nuevoEstado = body.estado;
  if (!nuevoEstado) {
    return Response.json({ error: "Falta el estado destino" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id, estado")
    .eq("id", id)
    .single();
  if (!pedido) return Response.json({ error: "Pedido no encontrado" }, { status: 404 });

  const permitidos = TRANSICIONES[pedido.estado] ?? [];
  if (!permitidos.includes(nuevoEstado)) {
    return Response.json(
      { error: `No se puede pasar de "${pedido.estado}" a "${nuevoEstado}"` },
      { status: 400 }
    );
  }

  const { data: actualizado, error: err } = await supabase
    .from("pedidos")
    .update({ estado: nuevoEstado })
    .eq("id", id)
    .select()
    .single();

  if (err || !actualizado) {
    return Response.json({ error: "No se pudo actualizar el estado" }, { status: 500 });
  }

  await registrarHistorialPedido({
    pedido_id: id,
    estado_anterior: pedido.estado,
    estado_nuevo: nuevoEstado,
    persona_id: user.id,
    motivo: "Cambio de estado manual",
  });

  return Response.json({ pedido: actualizado });
}
