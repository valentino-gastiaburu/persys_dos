import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { obtenerFechaHoyLima } from "@/lib/retraso";

// GET /api/pedidos/mensajes
// Devuelve los VIAJES de HOY (fecha = hoy, tipo = entrega, no cancelados) para
// armar el "mensaje al motorizado": VISITAS a la izquierda, ENVIOS a la derecha.
// La info viene del pedido asociado a cada viaje.
export async function GET() {
  const { error } = await requireRoles([
    "vendedora",
    "agendadora",
    "almacen",
    "controller",
    "admin",
  ]);
  if (error) return error;

  const hoy = await obtenerFechaHoyLima();
  const supabase = getSupabase();

  // 1. Viajes de entrega de hoy (no cancelados)
  const { data: viajes, error: viajesErr } = await supabase
    .from("viajes")
    .select("id, codigo, pedido_id, tipo, estado, fecha")
    .eq("fecha", hoy)
    .eq("tipo", "entrega")
    .neq("estado", "cancelado")
    .order("creado_el", { ascending: true });

  if (viajesErr) return Response.json({ error: "Error de base de datos" }, { status: 500 });

  if (!viajes || viajes.length === 0) {
    return Response.json({ fecha: hoy, visitas: [], envios: [] });
  }

  // 2. Pedidos asociados con datos del cliente
  const pedidoIds = [...new Set(viajes.map((v) => v.pedido_id))];
  const { data: pedidos, error: pedidosErr } = await supabase
    .from("pedidos")
    .select(
      `id, codigo, tipo_pedido, direccion_entrega, ciudad, ubicacion_maps,
       observaciones, monto_total,
       clientes (nombre, apellido, telefono, dni, distrito)`
    )
    .in("id", pedidoIds);

  if (pedidosErr) return Response.json({ error: "Error de base de datos" }, { status: 500 });

  const pedidoById: Record<string, any> = {};
  for (const p of pedidos ?? []) pedidoById[p.id] = p;

  // 3. Armar mensajes
  const visitas: any[] = [];
  const envios: any[] = [];

  for (const v of viajes) {
    const p = pedidoById[v.pedido_id];
    if (!p) continue;
    if (p.tipo_pedido !== "envio" && p.tipo_pedido !== "visita") continue;

    const cliente: any = p.clientes;
    const nombre = cliente
      ? `${cliente.nombre}${cliente.apellido ? " " + cliente.apellido : ""}`
      : "";
    const monto = fmtMonto(p.monto_total);

    if (p.tipo_pedido === "visita") {
      const mensaje = [
        `Celular: ${cliente?.telefono ?? ""}`,
        `Distrito: ${cliente?.distrito ?? ""}`,
        `Dirección: ${p.direccion_entrega ?? ""}`,
        `Nombre Cliente: ${nombre}`,
        `Monto Total: ${monto}`,
        `OBSERVACIÓN: ${p.observaciones ?? ""}`,
        `PUNTO GPS: ${p.ubicacion_maps ?? ""}`,
      ].join("\n");
      visitas.push({
        id: v.id,
        codigo: v.codigo,
        mensaje,
        telefono: cliente?.telefono ?? "",
        distrito: cliente?.distrito ?? "",
        direccion: p.direccion_entrega ?? "",
        nombre,
        monto_total: Number(p.monto_total ?? 0),
        observaciones: p.observaciones ?? "",
        gps: p.ubicacion_maps ?? "",
      });
    } else {
      const mensaje = [
        `Celular: ${cliente?.telefono ?? ""}`,
        `Ciudad: ${p.ciudad ?? ""}`,
        `Dirección: ${p.direccion_entrega ?? ""}`,
        `Nombre Cliente: ${nombre}`,
        `Monto Total: ${monto}`,
        `OBSERVACIÓN: ${p.observaciones ?? ""}`,
        `PUNTO GPS: ${p.ubicacion_maps ?? ""}`,
      ].join("\n");
      envios.push({
        id: v.id,
        codigo: v.codigo,
        mensaje,
        nombre,
        dni: cliente?.dni ?? "",
        telefono: cliente?.telefono ?? "",
        direccion: p.direccion_entrega ?? "",
        ciudad: p.ciudad ?? "",
        monto_total: Number(p.monto_total ?? 0),
        observaciones: p.observaciones ?? "",
        gps: p.ubicacion_maps ?? "",
      });
    }
  }

  return Response.json({ fecha: hoy, visitas, envios });
}

function fmtMonto(n: unknown): string {
  const num = Number(n ?? 0);
  if (!Number.isFinite(num)) return "0";
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}