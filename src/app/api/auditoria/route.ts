import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const ENTIDADES_VALIDAS = [
  "producto",
  "producto_unico",
  "pedido",
  "viaje",
  "detalle_pedido",
  "pago",
];

// GET /api/auditoria?entidad=&q=&desde=&hasta=&page=&por_pagina=&accion=&sub_entidad=
// Bitácora unificada. Solo admin/controller. Paginado por fecha desc.
export async function GET(request: NextRequest) {
  const { user, error } = await requireRoles(["controller", "admin"]);
  if (error) return error;
  void user;

  const sp = request.nextUrl.searchParams;
  const entidad = sp.get("entidad") || null;
  const q = sp.get("q")?.trim() || null;
  const desde = sp.get("desde") || null;
  const hasta = sp.get("hasta") || null;
  const accion = sp.get("accion") || null;
  const sub_entidad = sp.get("sub_entidad") || null;
  const personaId = sp.get("persona_id") || null;
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const porPagina = Math.min(100, Math.max(1, Number(sp.get("por_pagina") ?? 25) || 25));

  const supabase = getSupabase();

  let query = supabase
    .from("auditoria")
    .select(
      `
      id, fecha, persona_id, rol, entidad, entidad_id, entidad_ref,
      sub_entidad, sub_entidad_id, sub_entidad_ref, accion, campo,
      valor_anterior, valor_nuevo, nota,
      usuarios(id, dni, nombre, rol)
    `,
      { count: "exact" }
    )
    .order("fecha", { ascending: false });

  if (entidad && ENTIDADES_VALIDAS.includes(entidad)) query = query.eq("entidad", entidad);
  if (sub_entidad) query = query.eq("sub_entidad", sub_entidad);
  if (accion) query = query.eq("accion", accion);
  if (personaId) query = query.eq("persona_id", personaId);
  if (desde) query = query.gte("fecha", `${desde}T00:00:00-05:00`);
  if (hasta) query = query.lte("fecha", `${hasta}T23:59:59-05:00`);
  if (q) {
    query = query.or(`entidad_ref.ilike.%${q}%,nota.ilike.%${q}%,sub_entidad_ref.ilike.%${q}%`);
  }

  const from = (page - 1) * porPagina;
  const to = from + porPagina - 1;
  query = query.range(from, to);

  const { data, count, error: err } = await query;
  if (err) return Response.json({ error: "Error de base de datos" }, { status: 500 });

  const total_paginas = Math.max(1, Math.ceil((count ?? 0) / porPagina));

  return Response.json({
    registros: data ?? [],
    total: count ?? 0,
    page,
    por_pagina: porPagina,
    total_paginas,
    entidades: ENTIDADES_VALIDAS,
  });
}