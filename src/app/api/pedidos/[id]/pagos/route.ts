import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

// GET /api/pedidos/[id]/pagos
// POST /api/pedidos/[id]/pagos — registrar un pago
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;
  void user;

  const { id } = await params;
  const supabase = getSupabase();
  const { data, error: err } = await supabase
    .from("pagos")
    .select("*")
    .eq("pedido_id", id)
    .order("fecha");
  if (err) return Response.json({ error: "Error de base de datos" }, { status: 500 });
  return Response.json({ pagos: data });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const monto = Number(body.monto);
  if (!monto || monto <= 0) {
    return Response.json({ error: "Monto inválido" }, { status: 400 });
  }
  if (!body.metodo_pago) {
    return Response.json({ error: "Método de pago requerido" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: pedido } = await supabase
    .from("pedidos")
    .select("monto_total")
    .eq("id", id)
    .single();
  if (!pedido) return Response.json({ error: "Pedido no encontrado" }, { status: 404 });

  const { data: pagosData } = await supabase.from("pagos").select("monto").eq("pedido_id", id);
  const pagadoAntes = (pagosData ?? []).reduce((a, p) => a + Number(p.monto), 0);
  const deudaAntes = Number(pedido.monto_total) - pagadoAntes;

  if (monto > deudaAntes + 0.001) {
    return Response.json({ error: `El monto supera la deuda (S/ ${deudaAntes.toFixed(2)})` }, { status: 400 });
  }

  const { data: pago, error: err } = await supabase
    .from("pagos")
    .insert({
      pedido_id: id,
      monto,
      metodo_pago: body.metodo_pago,
      persona_id: user.id,
      tipo: body.tipo || "parcial",
      numero_operacion: body.numero_operacion || null,
      validacion: body.validacion || null,
    })
    .select()
    .single();

  if (err || !pago) {
    return Response.json({ error: "No se pudo registrar el pago" }, { status: 500 });
  }

  return Response.json({ pago, deuda_restante: deudaAntes - monto }, { status: 201 });
}
