import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

// GET /api/historial/pedidos/[id]
// Historial de un pedido: timeline de estados, ediciones/eventos (auditoría),
// viajes del pedido, movimientos de stock (entradas/salidas) y resumen de VPUs.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["controller", "admin"]);
  if (error) return error;
  void user;

  const { id } = await params;
  const supabase = getSupabase();

  const { data: pedido, error: errP } = await supabase
    .from("pedidos")
    .select("id, codigo, estado, monto_total, clientes(nombre, telefono)")
    .eq("id", id)
    .single();
  if (errP || !pedido) {
    return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  const { data: estados } = await supabase
    .from("historial_pedidos")
    .select("*, usuarios(id, dni, nombre, rol)")
    .eq("pedido_id", id)
    .order("fecha", { ascending: true });

  const { data: viajesData } = await supabase
    .from("viajes")
    .select("id, codigo, tipo, estado, fecha, creado_el")
    .eq("pedido_id", id)
    .order("creado_el", { ascending: true });
  const viajes = viajesData ?? [];
  const viajeIds = viajes.map((v: any) => v.id);

  const { data: detallesData } = await supabase
    .from("detalles_pedido")
    .select("id")
    .eq("pedido_id", id);
  const detalleIds = (detallesData ?? []).map((d: any) => d.id);

  // Eventos de auditoría del pedido, sus viajes y sus detalles
  const auditoria: any[] = [];
  const aa = await supabase
    .from("auditoria")
    .select("*, usuarios(id, dni, nombre, rol)")
    .eq("entidad", "pedido")
    .eq("entidad_id", id);
  if (aa.data) auditoria.push(...aa.data);
  if (viajeIds.length > 0) {
    const av = await supabase
      .from("auditoria")
      .select("*, usuarios(id, dni, nombre, rol)")
      .eq("entidad", "viaje")
      .in("entidad_id", viajeIds);
    if (av.data) auditoria.push(...av.data);
  }
  if (detalleIds.length > 0) {
    const ad = await supabase
      .from("auditoria")
      .select("*, usuarios(id, dni, nombre, rol)")
      .eq("entidad", "detalle_pedido")
      .in("entidad_id", detalleIds);
    if (ad.data) auditoria.push(...ad.data);
  }
  auditoria.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  // Movimientos de stock con referencia a este pedido o a sus viajes
  const movimientos: any[] = [];
  const mPed = await supabase
    .from("movimientos_stock")
    .select("*, tallas(nombre), usuarios(id, dni, nombre, rol), productos(imei, nombre)")
    .eq("referencia_tipo", "pedido")
    .eq("referencia_id", id);
  if (mPed.data) movimientos.push(...mPed.data);
  if (viajeIds.length > 0) {
    const mVia = await supabase
      .from("movimientos_stock")
      .select("*, tallas(nombre), usuarios(id, dni, nombre, rol), productos(imei, nombre)")
      .eq("referencia_tipo", "viaje")
      .in("referencia_id", viajeIds);
    if (mVia.data) movimientos.push(...mVia.data);
  }
  movimientos.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  // Resumen de VPUs del pedido (por estado)
  const resumen: Record<string, number> = { alistado: 0, enviado: 0, devuelto: 0, pendiente: 0 };
  if (viajeIds.length > 0) {
    const { data: vpus } = await supabase
      .from("viaje_producto_unicos")
      .select("estado")
      .in("viaje_id", viajeIds);
    for (const v of vpus ?? []) {
      resumen[v.estado] = (resumen[v.estado] ?? 0) + 1;
    }
  }

  return Response.json({
    pedido: {
      ...pedido,
      cliente: (pedido.clientes as unknown as { nombre: string; telefono: string } | null) ?? null,
    },
    estados: (estados ?? []).map((e: any) => ({
      id: e.id,
      estado_anterior: e.estado_anterior,
      estado_nuevo: e.estado_nuevo,
      motivo: e.motivo,
      fecha: e.fecha,
      persona: e.usuarios?.nombre ?? null,
    })),
    viajes: viajes.map((v: any) => ({
      id: v.id,
      codigo: v.codigo,
      tipo: v.tipo,
      estado: v.estado,
      fecha: v.fecha,
    })),
    auditoria: auditoria.map((a: any) => ({
      id: a.id,
      fecha: a.fecha,
      entidad: a.entidad,
      entidad_id: a.entidad_id,
      entidad_ref: a.entidad_ref,
      sub_entidad: a.sub_entidad,
      sub_entidad_ref: a.sub_entidad_ref,
      accion: a.accion,
      campo: a.campo,
      valor_anterior: a.valor_anterior,
      valor_nuevo: a.valor_nuevo,
      nota: a.nota,
      persona: a.usuarios?.nombre ?? null,
      rol: a.usuarios?.rol ?? null,
    })),
    movimientos: movimientos.map((m: any) => ({
      id: m.id,
      tipo: m.tipo,
      cantidad: m.cantidad,
      fecha: m.fecha,
      nota: m.nota,
      referencia_tipo: m.referencia_tipo,
      referencia_id: m.referencia_id,
      imei: m.productos?.imei ?? null,
      talla: m.tallas?.nombre ?? null,
      persona: m.usuarios?.nombre ?? null,
    })),
    resumen,
  });
}