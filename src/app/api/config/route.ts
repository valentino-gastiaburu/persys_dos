import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

// GET /api/config — configuración del sistema
// PUT /api/config — actualiza (admin)
export async function GET() {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "almacen", "controller", "admin"]);
  if (error) return error;
  void user;

  const supabase = getSupabase();
  const { data } = await supabase.from("configuraciones").select("clave, valor");
  const config: Record<string, string> = {};
  for (const c of data ?? []) config[c.clave] = c.valor;
  return Response.json({ config });
}

export async function PUT(request: NextRequest) {
  const { user, error } = await requireRoles(["admin"]);
  if (error) return error;
  void user;

  const body = await request.json();
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const supabase = getSupabase();
  const entradas = Object.entries(body).map(([clave, valor]) => ({
    clave,
    valor: String(valor),
  }));

  const { error: err } = await supabase.from("configuraciones").upsert(entradas);
  if (err) return Response.json({ error: "No se pudo guardar la configuración" }, { status: 500 });

  const { data } = await supabase.from("configuraciones").select("clave, valor");
  const config: Record<string, string> = {};
  for (const c of data ?? []) config[c.clave] = c.valor;
  return Response.json({ config });
}
