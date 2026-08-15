import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { generarCodigoPedido } from "@/lib/pedidos";

// POST /api/pedidos — crea un pedido en estado borrador
export async function POST(request: NextRequest) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;

  const body = await request.json();
  const supabase = getSupabase();
  const codigo = await generarCodigoPedido();

  const { data: pedido, error: err } = await supabase
    .from("pedidos")
    .insert({
      codigo,
      estado: "borrador",
      creado_por: user.id,
      vendedora_1_id: body.vendedora_1_id || user.id,
      vendedora_contribuyente_id: body.vendedora_contribuyente_id || user.id,
      cliente_id: body.cliente_id || null,
      fecha_entrega: body.fecha_entrega || null,
      tipo_pedido: body.tipo_pedido || null,
      metodo_entrega: body.metodo_entrega || null,
      empresa_envio: body.empresa_envio || "motorizado",
      direccion_entrega: body.direccion_entrega || null,
      ciudad: body.ciudad || null,
      ubicacion_maps: body.ubicacion_maps || null,
      canal_venta: body.canal_venta || "whatsapp",
      costo_envio: Number(body.costo_envio ?? 0),
      metodo_pago: body.metodo_pago || null,
      partes_a_pagar: Number(body.partes_a_pagar ?? 1),
      monto_primer_pago: body.monto_primer_pago ? Number(body.monto_primer_pago) : null,
      observaciones: body.observaciones || null,
      regalo: Boolean(body.regalo),
    })
    .select()
    .single();

  if (err || !pedido) {
    return Response.json({ error: "No se pudo crear el pedido" }, { status: 500 });
  }
  return Response.json({ pedido }, { status: 201 });
}

// GET /api/pedidos?estado=&q=&pendientes=1&ocultos=0
export async function GET(request: NextRequest) {
  const { error } = await requireRoles(["vendedora", "agendadora", "almacen", "controller", "admin"]);
  if (error) return error;

  const sp = request.nextUrl.searchParams;
  const estado = sp.get("estado");
  const q = sp.get("q")?.trim();
  const soloPendientes = sp.get("pendientes") === "1";
  const incluirBorrador = sp.get("borradores") === "1";
  const ocultos = sp.get("ocultos") === "1";

  const supabase = getSupabase();

  let query = supabase
    .from("pedidos")
    .select(`
      *, clientes(nombre, apellido, telefono), 
      creado_por_usuario:usuarios!pedidos_creado_por_fkey(nombre), 
      vendedora:usuarios!pedidos_vendedora_1_id_fkey(nombre)
    `);

  if (estado) query = query.eq("estado", estado);
  if (!incluirBorrador) query = query.neq("estado", "borrador");
  if (soloPendientes) query = query.gt("monto_total", 0);
  if (ocultos) query = query.eq("oculto", true);
  else query = query.eq("oculto", false);

  if (q) {
    query = query.or(`codigo.ilike.%${q}%,resumen_productos.ilike.%${q}%`);
  }

  // Solo para vendedoras (no controller): ver los pedidos de cualquiera; controller los ve todos.
  const { data: pedidos, error: err } = await query
    .order("fecha_entrega", { ascending: true })
    .limit(200);

  if (err) return Response.json({ error: "Error de base de datos" }, { status: 500 });

  // Calcular deuda por pedido
  const ids = (pedidos ?? []).map((p: any) => p.id);
  let pagosPorPedido: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: pagos } = await supabase
      .from("pagos")
      .select("pedido_id, monto")
      .in("pedido_id", ids);
    pagosPorPedido = {};
    for (const p of pagos ?? []) {
      pagosPorPedido[p.pedido_id] = (pagosPorPedido[p.pedido_id] ?? 0) + Number(p.monto);
    }
  }

  const resultado = (pedidos ?? []).map((p: any) => {
    const pagado = pagosPorPedido[p.id] ?? 0;
    return {
      ...p,
      cliente_nombre: p.clientes
        ? `${p.clientes.nombre}${p.clientes.apellido ? " " + p.clientes.apellido : ""}`
        : null,
      cliente_telefono: p.clientes?.telefono ?? null,
      vendedora_nombre: p.vendedora?.nombre ?? null,
      total_pagado: pagado,
      deuda: Number(p.monto_total) - pagado,
    };
  });

  return Response.json({ pedidos: resultado });
}
