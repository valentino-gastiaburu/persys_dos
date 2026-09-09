import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

// GET /api/pagos?estado=&solo_sin_revisar=1&q=
// Lista cobros de toda la empresa con datos del pedido/cliente.
// Admin/controller pueden ver el filtro de revisión; las vendedoras ven cobros.
export async function GET(request: NextRequest) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;

  const sp = request.nextUrl.searchParams;
  const estado = sp.get("estado");
  const soloSinRevisar = sp.get("solo_sin_revisar") === "1";
  // limite=0 -> sin límite (traer todo). Default 100, tope 200.
  const limiteRaw = Number(sp.get("limite") ?? 100);
  const limite = limiteRaw > 0 ? Math.min(200, limiteRaw) : null;

  const supabase = getSupabase();

  let query = supabase
    .from("pagos")
    .select(
      `
      *, 
      pedidos(codigo, monto_total, estado, cliente_id, 
        clientes(nombre, apellido, telefono))
    `,
      { count: "exact" }
    )
    .order("fecha", { ascending: false })
    .order("fecha_pagada", { ascending: false, nullsFirst: false });

  if (limite !== null) query = query.limit(limite);

  if (estado) query = query.eq("estado", estado);
  if (soloSinRevisar) query = query.eq("revisado", false);

  const { data, count, error: err } = await query;
  if (err) return Response.json({ error: "Error de base de datos" }, { status: 500 });

  const cobros = (data ?? []).map((c: any) => ({
    ...c,
    pedido_id: c.pedidos?.id ?? c.pedido_id ?? null,
    pedido_codigo: c.pedidos?.codigo ?? null,
    pedido_estado: c.pedidos?.estado ?? null,
    cliente_nombre: c.pedidos?.clientes
      ? `${c.pedidos.clientes.nombre}${c.pedidos.clientes.apellido ? " " + c.pedidos.clientes.apellido : ""}`
      : null,
  }));

  return Response.json({
    cobros,
    total: count ?? 0,
    puede_revisar: ["admin", "controller"].includes(user.rol),
  });
}