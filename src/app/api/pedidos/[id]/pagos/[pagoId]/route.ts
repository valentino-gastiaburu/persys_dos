import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

// PATCH  /api/pedidos/[id]/pagos/[pagoId]  -> editar un cobro
//   - pendiente: cambiar fecha_pactada.
//   - pagado   : adjuntar comprobante / numero_operacion (no edita montos).
// DELETE /api/pedidos/[id]/pagos/[pagoId]   -> eliminar SOLO un cobro pendiente.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pagoId: string }> }
) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;

  const { id, pagoId } = await params;
  const body = await request.json();
  const supabase = getSupabase();

  const { data: cobro } = await supabase
    .from("pagos")
    .select("id, estado")
    .eq("id", pagoId)
    .eq("pedido_id", id)
    .single();
  if (!cobro) return Response.json({ error: "Cobro no encontrado" }, { status: 404 });

  const update: Record<string, unknown> = {};
  if (cobro.estado === "pendiente") {
    if (body.fecha_pactada) update.fecha_pactada = body.fecha_pactada;
    if (body.comprobante !== undefined) update.comprobante = body.comprobante || null;
  } else {
    // pagado: solo datos accesorios, nunca monto/metodo/estado.
    if (body.comprobante !== undefined) update.comprobante = body.comprobante || null;
    if (body.numero_operacion !== undefined) update.numero_operacion = body.numero_operacion || null;
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  const { data: pago, error: err } = await supabase
    .from("pagos")
    .update(update)
    .eq("id", pagoId)
    .eq("pedido_id", id)
    .select()
    .single();

  if (err || !pago) return Response.json({ error: "No se pudo actualizar el cobro" }, { status: 500 });
  void user;
  return Response.json({ pago });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; pagoId: string }> }
) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;
  void user;

  const { id, pagoId } = await params;
  const supabase = getSupabase();

  const { data: cobro } = await supabase
    .from("pagos")
    .select("id, estado")
    .eq("id", pagoId)
    .eq("pedido_id", id)
    .single();
  if (!cobro) return Response.json({ error: "Cobro no encontrado" }, { status: 404 });
  if (cobro.estado !== "pendiente") {
    return Response.json({ error: "Solo se pueden eliminar cobros pendientes" }, { status: 400 });
  }

  const { error: err } = await supabase.from("pagos").delete().eq("id", pagoId).eq("pedido_id", id);
  if (err) return Response.json({ error: "No se pudo eliminar el cobro" }, { status: 500 });
  return Response.json({ ok: true });
}
