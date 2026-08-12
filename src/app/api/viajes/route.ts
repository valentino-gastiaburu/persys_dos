import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

// GET /api/viajes?fecha=YYYY-MM-DD&estado= — lista viajes para el almacén
export async function GET(request: NextRequest) {
  const { user, error } = await requireRoles(["almacen", "controller", "admin", "vendedora", "agendadora"]);
  if (error) return error;
  void user;

  const sp = request.nextUrl.searchParams;
  const fecha = sp.get("fecha");
  const estado = sp.get("estado");
  const supabase = getSupabase();

  let query = supabase
    .from("viajes")
    .select(`
      *, 
      pedidos(codigo, estado, cliente_id, fecha_entrega, direccion_entrega, ciudad, 
        clientes(nombre, apellido, telefono, direccion))
    `)
    .order("fecha", { ascending: true });

  if (fecha) query = query.eq("fecha", fecha);
  if (estado) query = query.eq("estado", estado);

  const { data, error: err } = await query.limit(200);
  if (err) return Response.json({ error: "Error de base de datos" }, { status: 500 });

  // Contar unidades alistadas por viaje
  const ids = (data ?? []).map((v: any) => v.id);
  let alistadosPorViaje: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: alist } = await supabase
      .from("viaje_producto_unicos")
      .select("viaje_id")
      .in("viaje_id", ids);
    alistadosPorViaje = {};
    for (const a of alist ?? []) {
      alistadosPorViaje[a.viaje_id] = (alistadosPorViaje[a.viaje_id] ?? 0) + 1;
    }
  }

  const viajes = (data ?? []).map((v: any) => ({
    ...v,
    cliente_nombre: v.pedidos?.clientes
      ? `${v.pedidos.clientes.nombre}${v.pedidos.clientes.apellido ? " " + v.pedidos.clientes.apellido : ""}`
      : null,
    cliente_telefono: v.pedidos?.clientes?.telefono ?? null,
    cliente_direccion: v.pedidos?.clientes?.direccion ?? null,
    pedido_codigo: v.pedidos?.codigo ?? null,
    pedido_estado: v.pedidos?.estado ?? null,
    unidades_alistadas: alistadosPorViaje[v.id] ?? 0,
  }));

  return Response.json({ viajes });
}
