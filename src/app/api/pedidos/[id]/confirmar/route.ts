import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { confirmarPedido } from "@/lib/pedidos";

// POST /api/pedidos/[id]/confirmar
// Confirma el pedido: estado -> confirmado, crea el viaje inicial automáticamente.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;

  const { id } = await params;
  const { pedido, viaje, error: err } = await confirmarPedido(id, user.id);
  if (err || !pedido) {
    return Response.json({ error: err ?? "No se pudo confirmar el pedido" }, { status: 400 });
  }

  return Response.json({ pedido, viaje });
}
