import { getSupabase } from "./supabase";
import { randomCode } from "./utils";

// Genera un código de pedido de 8 caracteres único.
export async function generarCodigoPedido(): Promise<string> {
  const supabase = getSupabase();
  for (let i = 0; i < 20; i++) {
    const codigo = randomCode(8);
    const { data } = await supabase.from("pedidos").select("id").eq("codigo", codigo).maybeSingle();
    if (!data) return codigo;
  }
  throw new Error("No se pudo generar un código de pedido único");
}

export async function generarCodigoViaje(): Promise<string> {
  const supabase = getSupabase();
  for (let i = 0; i < 20; i++) {
    const codigo = "V" + randomCode(7);
    const { data } = await supabase.from("viajes").select("id").eq("codigo", codigo).maybeSingle();
    if (!data) return codigo;
  }
  throw new Error("No se pudo generar un código de viaje único");
}

// Calcula monto_total = suma subtotales de detalles activos + costo_envio
export function calcularTotal(detalles: { subtotal: number }[], costoEnvio: number): number {
  const subtotales = detalles.reduce((acc, d) => acc + Number(d.subtotal || 0), 0);
  return subtotales + Number(costoEnvio || 0);
}

// Genera el resumen de productos: "IMEI (Cantidad/Talla/DamaOCaballero), ..."
export async function generarResumen(
  detalles: { producto_id: string; cantidad: number; talla: string | null; genero: string; es_extra_motorizado: boolean }[]
): Promise<string> {
  const supabase = getSupabase();
  const productoIds = [...new Set(detalles.map((d) => d.producto_id))];
  const { data: productos } = await supabase
    .from("productos")
    .select("id, imei")
    .in("id", productoIds);
  const imeiPorId: Record<string, string> = {};
  for (const p of productos ?? []) imeiPorId[p.id] = p.imei;

  return detalles
    .map((d) => {
      const imei = imeiPorId[d.producto_id] ?? "?";
      const extra = d.es_extra_motorizado ? " [extra]" : "";
      return `${imei} (${d.cantidad}/${d.talla ?? "Sin talla"}/${d.genero})${extra}`;
    })
    .join(", ");
}

// Insert en historial_pedidos con registro del cambio de estado.
export async function registrarHistorialPedido(params: {
  pedido_id: string;
  estado_anterior: string | null;
  estado_nuevo: string;
  persona_id: string;
  motivo?: string;
}) {
  const supabase = getSupabase();
  await supabase.from("historial_pedidos").insert({
    pedido_id: params.pedido_id,
    estado_anterior: params.estado_anterior,
    estado_nuevo: params.estado_nuevo,
    persona_id: params.persona_id,
    motivo: params.motivo ?? null,
  });
}

// Recalcula el estado del pedido a partir de sus viajes.
// Con un solo viaje: pedido sigue al viaje. Con varios: entregado cuando todos terminan.
// Si hay recojo pendiente: esperando_devolucion / esperando_cambio.
export async function syncEstadoPedidoPorViajes(pedidoId: string): Promise<string> {
  const supabase = getSupabase();
  const { data: viajes } = await supabase
    .from("viajes")
    .select("id, tipo, motivo_recojo, estado")
    .eq("pedido_id", pedidoId);

  if (!viajes || viajes.length === 0) return "confirmado";

  const tieneEntrega = viajes.some((v) => v.tipo === "entrega");
  const tieneRecojo = viajes.some((v) => v.tipo === "recojo");
  const recojoPendiente = viajes.some((v) => v.tipo === "recojo" && v.estado !== "terminado");
  const entregasSinTerminar = viajes.some((v) => v.tipo === "entrega" && v.estado !== "terminado");

  if (tieneRecojo && recojoPendiente) {
    const motivo = viajes.find((v) => v.tipo === "recojo" && v.estado !== "terminado")?.motivo_recojo;
    return motivo === "cambio" ? "esperando_cambio" : "esperando_devolucion";
  }

  if (tieneEntrega && entregasSinTerminar) {
    // seguimos el estado del viaje de entrega en curso
    const entrega = viajes.filter((v) => v.tipo === "entrega").sort(
      (a, b) => (a.estado === b.estado ? 0 : a.estado === "alistado" ? -1 : 1)
    )[0];
    if (entrega?.estado === "alistado") return "alistado";
    if (entrega?.estado === "enviado") return "enviado";
    return "confirmado";
  }

  if (tieneEntrega && !entregasSinTerminar) return "entregado";

  return "confirmado";
}

export async function getDetallesActivos(pedidoId: string) {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("detalles_pedido")
    .select("*, productos(imei, nombre), tallas!detalles_pedido_talla_id_fkey(nombre)")
    .eq("pedido_id", pedidoId)
    .eq("estado", "activo")
    .order("creado_el");
  return (data ?? []).map((d: any) => ({
    ...d,
    talla: d.tallas?.nombre ?? null,
    talla_inicial_nombre: d.talla_inicial ? undefined : undefined,
    imei: d.productos?.imei,
    producto_nombre: d.productos?.nombre,
  }));
}
