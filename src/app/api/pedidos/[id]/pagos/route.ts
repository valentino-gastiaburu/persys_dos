import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { registrarAuditoria } from "@/lib/auditoria";

// GET /api/pedidos/[id]/pagos
//   Devuelve los cobros (pagos) de un pedido, con su estado y el total pagado/deuda.
// POST /api/pedidos/[id]/pagos
//   1) { pago_id, monto, metodo_pago, ... }  -> settle un cobro PENDIENTE (lo marca pagado).
//   2) { estado:'pendiente', fecha_pactada }  -> crea un cobro pendiente NUEVO (deuda futura).
//   3) { monto, metodo_pago, ... }            -> registra un cobro pagado nuevo.
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
    .order("fecha_pactada", { ascending: true })
    .order("fecha", { ascending: true });

  if (err) return Response.json({ error: "Error de base de datos" }, { status: 500 });

  const pagados = (data ?? []).filter((p) => p.estado === "pagado");
  const total_pagado = pagados.reduce((a, p) => a + Number(p.monto ?? 0), 0);

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("monto_total")
    .eq("id", id)
    .single();

  const deuda_restante = Number(pedido?.monto_total ?? 0) - total_pagado;

  return Response.json({ pagos: data ?? [], total_pagado, deuda_restante });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const supabase = getSupabase();

  // Verificar el pedido y su deuda (suma solo pagos pagados).
  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id, monto_total, codigo")
    .eq("id", id)
    .single();
  if (!pedido) return Response.json({ error: "Pedido no encontrado" }, { status: 404 });

  const { data: pagosData } = await supabase
    .from("pagos")
    .select("monto")
    .eq("pedido_id", id)
    .eq("estado", "pagado");
  const pagadoAntes = (pagosData ?? []).reduce((a, p) => a + Number(p.monto), 0);
  const deudaAntes = Number(pedido.monto_total) - pagadoAntes;

  // --- Caso 1: settle de un cobro pendiente existente ---------------------
  if (body.pago_id) {
    const monto = Number(body.monto);
    if (!monto || monto <= 0) {
      return Response.json({ error: "Monto inválido" }, { status: 400 });
    }
    if (!body.metodo_pago) {
      return Response.json({ error: "Método de pago requerido" }, { status: 400 });
    }
    if (monto > deudaAntes + 0.001) {
      return Response.json({ error: `El monto supera la deuda (S/ ${deudaAntes.toFixed(2)})` }, { status: 400 });
    }

    const { data: cobro } = await supabase
      .from("pagos")
      .select("id, estado")
      .eq("id", body.pago_id)
      .eq("pedido_id", id)
      .single();
    if (!cobro) return Response.json({ error: "Cobro no encontrado" }, { status: 404 });
    if (cobro.estado !== "pendiente") {
      return Response.json({ error: "Ese cobro ya fue pagado" }, { status: 400 });
    }

    const { data: pago, error: err } = await supabase
      .from("pagos")
      .update({
        estado: "pagado",
        fecha_pagada: body.fecha_pagada || new Date().toISOString().slice(0, 10),
        monto,
        metodo_pago: body.metodo_pago,
        persona_id: user.id,
        tipo: body.tipo || "parcial",
        numero_operacion: body.numero_operacion || null,
        validacion: body.validacion || null,
        comprobante: body.comprobante || null,
      })
      .eq("id", body.pago_id)
      .eq("pedido_id", id)
      .select()
      .single();

    if (err || !pago) return Response.json({ error: "No se pudo registrar el pago" }, { status: 500 });

    // Si el pago cubre toda la deuda, sobran los cobros pendientes: se limpian.
    const deudaRestante = Math.max(0, deudaAntes - monto);
    let limpiados = 0;
    if (deudaRestante <= 0.001) {
      const { error: limpiezaErr } = await supabase
        .from("pagos").delete().eq("pedido_id", id).eq("estado", "pendiente");
      if (!limpiezaErr) limpiados = 1;
    }

    await registrarAuditoria({
      user,
      entidad: "pago",
      entidad_id: pago.id,
      entidad_ref: `PEDIDO ${pedido.codigo}`,
      sub_entidad: "pedido",
      sub_entidad_id: pedido.id,
      sub_entidad_ref: pedido.codigo,
      accion: "cobrar",
      campo: "estado",
      valor_anterior: cobro.estado,
      valor_nuevo: "pagado",
      nota: `Cobró S/ ${monto.toFixed(2)} (${body.metodo_pago}) del pedido ${pedido.codigo}${limpiados ? " y liquidó cobros pendientes" : ""}`,
    });

    return Response.json({ pago, deuda_restante: deudaRestante, cobrado: true }, { status: 200 });
  }

  // --- Caso 2: crear un cobro pendiente nuevo (deuda futura) ---------------
  if (body.estado === "pendiente") {
    const fechaPactada = body.fecha_pactada || null;
    if (!fechaPactada) {
      return Response.json({ error: "Falta la fecha pactada" }, { status: 400 });
    }
    if (deudaAntes <= 0.001) {
      return Response.json({ error: "La deuda ya está cubierta" }, { status: 400 });
    }
    const { data: pago, error: err } = await supabase
      .from("pagos")
      .insert({
        pedido_id: id,
        estado: "pendiente",
        fecha_pactada: fechaPactada,
        persona_id: user.id,
      })
      .select()
      .single();
    if (err || !pago) return Response.json({ error: "No se pudo crear el cobro" }, { status: 500 });
    await registrarAuditoria({
      user,
      entidad: "pago",
      entidad_id: pago.id,
      entidad_ref: `PEDIDO ${pedido.codigo}`,
      sub_entidad: "pedido",
      sub_entidad_id: pedido.id,
      sub_entidad_ref: pedido.codigo,
      accion: "crear",
      valor_nuevo: { estado: "pendiente", fecha_pactada: fechaPactada },
      nota: `Creó cobro pendiente para el ${fechaPactada} (pedido ${pedido.codigo})`,
    });
    return Response.json({ pago }, { status: 201 });
  }

  // --- Caso 3: registrar un cobro pagado nuevo ------------------------------
  const monto = Number(body.monto);
  if (!monto || monto <= 0) {
    return Response.json({ error: "Monto inválido" }, { status: 400 });
  }
  if (!body.metodo_pago) {
    return Response.json({ error: "Método de pago requerido" }, { status: 400 });
  }
  if (monto > deudaAntes + 0.001) {
    return Response.json({ error: `El monto supera la deuda (S/ ${deudaAntes.toFixed(2)})` }, { status: 400 });
  }

  const { data: pago, error: err } = await supabase
    .from("pagos")
    .insert({
      pedido_id: id,
      estado: "pagado",
      fecha_pactada: body.fecha_pactada || null,
      fecha_pagada: body.fecha_pagada || new Date().toISOString().slice(0, 10),
      monto,
      metodo_pago: body.metodo_pago,
      persona_id: user.id,
      tipo: body.tipo || "parcial",
      numero_operacion: body.numero_operacion || null,
      validacion: body.validacion || null,
      comprobante: body.comprobante || null,
    })
    .select()
    .single();

  if (err || !pago) {
    return Response.json({ error: "No se pudo registrar el pago" }, { status: 500 });
  }

  // Si el pago cubre toda la deuda, sobran los cobros pendientes: se limpian.
  const deudaRestante = Math.max(0, deudaAntes - monto);
  let limpiados = 0;
  if (deudaRestante <= 0.001) {
    const { error: limpiezaErr } = await supabase
      .from("pagos").delete().eq("pedido_id", id).eq("estado", "pendiente");
    if (!limpiezaErr) limpiados = 1;
  }

  await registrarAuditoria({
    user,
    entidad: "pago",
    entidad_id: pago.id,
    entidad_ref: `PEDIDO ${pedido.codigo}`,
    sub_entidad: "pedido",
    sub_entidad_id: pedido.id,
    sub_entidad_ref: pedido.codigo,
    accion: "cobrar",
    valor_nuevo: { estado: "pagado", monto, metodo_pago: body.metodo_pago, fecha_pagada: pago.fecha_pagada },
    nota: `Registró cobro de S/ ${monto.toFixed(2)} (${body.metodo_pago}) del pedido ${pedido.codigo}${limpiados ? " y liquidó cobros pendientes" : ""}`,
  });

  return Response.json({ pago, deuda_restante: deudaRestante, cobrado: true }, { status: 201 });
}
