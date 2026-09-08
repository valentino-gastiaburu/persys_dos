import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { obtenerFechaHoyLima } from "@/lib/retraso";

// GET /api/pedidos/mensajes
// Devuelve los pedidos de HOY (fecha_entrega = hoy en hora de Lima) listos para
// armar el "mensaje al motorizado": una vista con VISITAS a la izquierda y
// ENVIOS a la derecha. Solo pedidos activos (no borrador/cancelado/devuelto).
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

  const { data: pedidos, error: err } = await supabase
    .from("pedidos")
    .select(
      `id, codigo, estado, tipo_pedido, fecha_entrega, direccion_entrega, ciudad,
       ubicacion_maps, observaciones, monto_total,
       clientes (nombre, apellido, telefono, dni, distrito)`
    )
    .eq("fecha_entrega", hoy)
    .neq("estado", "borrador")
    .neq("estado", "cancelado")
    .neq("estado", "devuelto")
    .eq("oculto", false)
    .order("creado_el", { ascending: true });

  if (err) return Response.json({ error: "Error de base de datos" }, { status: 500 });

  const visitas: any[] = [];
  const envios: any[] = [];

  for (const p of pedidos ?? []) {
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
        id: p.id,
        codigo: p.codigo,
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
        id: p.id,
        codigo: p.codigo,
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