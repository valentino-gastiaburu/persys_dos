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
// Regla: recojo pendiente -> esperando_devolucion/cambio; si no, el pedido sigue
// al viaje de entrega MENOS avanzado (rank mínimo): programado->confirmado,
// alistado->alistado, enviado->enviado, todos terminados->entregado.
// Así un pedido entregado que recibe un nuevo viaje de entrega vuelve a
// confirmado hasta que TODOS sus viajes avancen.
const VIAJE_RANK: Record<string, number> = {
  programado: 0,
  alistado: 1,
  enviado: 2,
  terminado: 3,
};

export async function syncEstadoPedidoPorViajes(pedidoId: string): Promise<string> {
  const supabase = getSupabase();
  const { data: viajes } = await supabase
    .from("viajes")
    .select("id, tipo, motivo_recojo, estado")
    .eq("pedido_id", pedidoId);

  if (!viajes || viajes.length === 0) return "confirmado";

  const recojoPendiente = viajes.find((v) => v.tipo === "recojo" && v.estado !== "terminado" && v.estado !== "cancelado");
  if (recojoPendiente) {
    return recojoPendiente.motivo_recojo === "cambio" ? "esperando_cambio" : "esperando_devolucion";
  }

  const entregas = viajes.filter((v) => v.tipo === "entrega" && v.estado !== "cancelado");
  if (entregas.length === 0) return "confirmado";
  if (entregas.every((v) => v.estado === "terminado")) return "entregado";

  const min = Math.min(...entregas.map((v) => VIAJE_RANK[v.estado] ?? 0));
  if (min >= 2) return "enviado";
  if (min >= 1) return "alistado";
  return "confirmado";
}

// Total del pedido = Σ totales de viajes de entrega − Σ totales de viajes de
// regreso (devoluciones). El costo de envío de un regreso es informativo y no
// se descuenta.
export async function calcularTotalPedido(pedidoId: string): Promise<number> {
  const supabase = getSupabase();
  const { data: viajes } = await supabase
    .from("viajes")
    .select("tipo, total")
    .eq("pedido_id", pedidoId)
    .neq("estado", "cancelado");
  let total = 0;
  for (const v of viajes ?? []) {
    const t = Number(v.total ?? 0);
    total += v.tipo === "recojo" ? -t : t;
  }
  return total;
}

// Total de un viaje = suma de subtotales de sus líneas (no ocultas). En las
// entregas se suma además el costo de envío del viaje.
export async function recalcularTotalViaje(
  viajeId: string,
  tipo: string,
  costoEnvio: number
): Promise<number> {
  const supabase = getSupabase();
  const { data: detalles } = await supabase
    .from("detalles_pedido")
    .select("subtotal")
    .eq("viaje_id", viajeId)
    .not("estado", "eq", "oculto");
  const suma = (detalles ?? []).reduce((acc, d) => acc + Number(d.subtotal || 0), 0);
  const total = suma + (tipo === "entrega" ? Number(costoEnvio || 0) : 0);
  await supabase.from("viajes").update({ total }).eq("id", viajeId);
  return total;
}

// Recalcula el monto_total de un pedido. Si ya tiene viaje(s), el total vive en
// los viajes (Σ entregas − Σ regresos); si no (borrador/solicitado sin viaje),
// usa la fórmula antigua: Σ subtotales activos + costo_envio.
export async function recalcularMontoPedido(pedidoId: string): Promise<number> {
  const supabase = getSupabase();
  const { data: viajes } = await supabase
    .from("viajes")
    .select("id")
    .eq("pedido_id", pedidoId)
    .limit(1);
  if ((viajes?.length ?? 0) > 0) return calcularTotalPedido(pedidoId);
  const { data: detalles } = await supabase
    .from("detalles_pedido")
    .select("subtotal")
    .eq("pedido_id", pedidoId)
    .eq("estado", "activo");
  const { data: pedido } = await supabase
    .from("pedidos")
    .select("costo_envio")
    .eq("id", pedidoId)
    .single();
  return calcularTotal(
    (detalles ?? []).map((d: any) => ({ subtotal: Number(d.subtotal) })),
    Number(pedido?.costo_envio ?? 0)
  );
}

// Tras agregar/editar/quitar líneas de un pedido, recalcula el total de cada
// viaje de entrega y el monto_total del pedido.
export async function sincronizarTotalesPedido(pedidoId: string): Promise<number> {
  const supabase = getSupabase();
  const { data: viajes } = await supabase
    .from("viajes")
    .select("id, costo_envio")
    .eq("pedido_id", pedidoId)
    .eq("tipo", "entrega");
  for (const v of viajes ?? []) {
    await recalcularTotalViaje(v.id, "entrega", Number(v.costo_envio ?? 0));
  }
  return recalcularMontoPedido(pedidoId);
}

export async function getDetallesActivos(pedidoId: string) {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("detalles_pedido")
    .select("*, productos(imei, nombre), tallas!detalles_pedido_talla_vendida_fkey(nombre), tallas_stock: tallas!detalles_pedido_talla_stock_fkey(nombre)")
    .eq("pedido_id", pedidoId)
    .eq("estado", "activo")
    .order("creado_el");
  return (data ?? []).map((d: any) => ({
    ...d,
    talla: d.tallas?.nombre ?? null,
    talla_stock_nombre: d.tallas_stock?.nombre ?? null,
    talla_vendida_nombre: d.tallas?.nombre ?? null,
    imei: d.productos?.imei,
    producto_nombre: d.productos?.nombre,
  }));
}

// Confirma un pedido: estado -> confirmado, crea el viaje de entrega, resumen,
// total y primer pago. Devuelve { pedido, viaje } o { error }.
export async function confirmarPedido(
  id: string,
  userId: string
): Promise<{ pedido?: any; viaje?: any; error?: string }> {
  const supabase = getSupabase();

  const { data: pedido } = await supabase.from("pedidos").select("*").eq("id", id).single();
  if (!pedido) return { error: "Pedido no encontrado" };
  if (!["borrador", "solicitado"].includes(pedido.estado)) {
    return { error: "El pedido ya fue confirmado" };
  }

  if (!pedido.cliente_id || !pedido.fecha_entrega) {
    return { error: "Falta cliente o fecha de entrega" };
  }

  const { data: detallesData } = await supabase
    .from("detalles_pedido")
    .select("producto_id, cantidad, talla_vendida, genero, es_extra_motorizado, subtotal, tallas!detalles_pedido_talla_vendida_fkey(nombre)")
    .eq("pedido_id", id)
    .eq("estado", "activo");

  const detalles = (detallesData ?? []).map((d: any) => ({
    ...d,
    talla: d.tallas?.nombre ?? null,
  }));

  if (detalles.length === 0) {
    return { error: "El pedido no tiene productos" };
  }

  const resumen = await generarResumen(detalles);
  const montoTotal = calcularTotal(
    detalles.map((d) => ({ subtotal: Number(d.subtotal ?? 0) })),
    Number(pedido.costo_envio ?? 0)
  );

  // Reusar viaje existente si ya hay uno no enviado (protección contra doble click / re-confirmación)
  const { data: viajeExistente } = await supabase
    .from("viajes")
    .select("id, codigo")
    .eq("pedido_id", id)
    .in("estado", ["programado", "alistado"])
    .limit(1)
    .single();

  let viaje: any;

  if (viajeExistente) {
    viaje = viajeExistente;
  } else {
    const viajeCodigo = await generarCodigoViaje();
    const { data: nuevoViaje, error: viajeErr } = await supabase
      .from("viajes")
      .insert({
        codigo: viajeCodigo,
        pedido_id: id,
        tipo: "entrega",
        estado: "programado",
        fecha: pedido.fecha_entrega,
        direccion: pedido.direccion_entrega,
        costo_envio: Number(pedido.costo_envio ?? 0),
        total: montoTotal,
        creado_por: userId,
      })
      .select()
      .single();

    if (viajeErr || !nuevoViaje) {
      return { error: "No se pudo crear el viaje" };
    }
    viaje = nuevoViaje;
  }

  await supabase
    .from("detalles_pedido")
    .update({ viaje_id: viaje.id, confirmado_el: new Date().toISOString() })
    .eq("pedido_id", id)
    .eq("estado", "activo");

  const { data: confirmado, error: pedidoErr } = await supabase
    .from("pedidos")
    .update({
      estado: "confirmado",
      confirmado_el: new Date().toISOString(),
      resumen_productos: resumen,
      monto_total: montoTotal,
    })
    .eq("id", id)
    .select()
    .single();

  if (pedidoErr || !confirmado) {
    return { error: "No se pudo confirmar el pedido" };
  }

  await registrarHistorialPedido({
    pedido_id: id,
    estado_anterior: pedido.estado,
    estado_nuevo: "confirmado",
    persona_id: userId,
    motivo: "Pedido confirmado por la vendedora",
  });

  if (Number(confirmado.monto_primer_pago) > 0) {
    await supabase.from("pagos").insert({
      pedido_id: id,
      monto: Number(confirmado.monto_primer_pago),
      metodo_pago: confirmado.metodo_pago || "efectivo",
      persona_id: userId,
      tipo: "primer_pago",
    });
  }

  return { pedido: confirmado, viaje };
}

// Recalcula el estado de un viaje de entrega a partir de sus detalles vs unidades
// alistadas (viaje_producto_unicos). Si todas las líneas están cubiertas → alistado.
// Si hay más unidades alistadas de las necesarias → crea inconsistencia.
export async function recalcularEstadoViaje(viajeId: string): Promise<void> {
  const supabase = getSupabase();

  const { data: viaje } = await supabase
    .from("viajes")
    .select("id, pedido_id, estado")
    .eq("id", viajeId)
    .single();
  if (!viaje || viaje.estado === "enviado" || viaje.estado === "terminado" || viaje.estado === "cancelado") return;

  // Detalles activos del viaje (excluye ocultos/devueltos)
  const { data: detalles } = await supabase
    .from("detalles_pedido")
    .select("id, cantidad, producto_id")
    .eq("viaje_id", viajeId)
    .not("estado", "eq", "oculto")
    .not("estado", "eq", "devuelto");

  // Unidades alistadas en el viaje
  const { data: alistados } = await supabase
    .from("viaje_producto_unicos")
    .select("id, detalle_pedido_id")
    .eq("viaje_id", viajeId);

  // Contar alistados por detalle
  const cntPorDetalle: Record<string, number> = {};
  for (const a of alistados ?? []) {
    cntPorDetalle[a.detalle_pedido_id] = (cntPorDetalle[a.detalle_pedido_id] ?? 0) + 1;
  }

  const totalRequerido = (detalles ?? []).reduce((s, d) => s + Number(d.cantidad), 0);
  const totalAlistado = (alistados ?? []).length;

  // ¿Hay exceso? (más unidades alistadas de las que piden los detalles activos)
  if (totalAlistado > totalRequerido && totalRequerido > 0) {
    const exceso = totalAlistado - totalRequerido;
    const { data: existente } = await supabase
      .from("inconsistencias")
      .select("id")
      .eq("entidad_id", viajeId)
      .eq("tipo", "viaje_exceso_alistado")
      .eq("resuelto", false)
      .maybeSingle();

    if (!existente) {
      await supabase.from("inconsistencias").insert({
        tipo: "viaje_exceso_alistado",
        entidad_id: viajeId,
        descripcion: `El viaje tiene ${totalAlistado} unidades alistadas pero el pedido solo pide ${totalRequerido}. Retira ${exceso} unidad(es) sobrante(s).`,
        metadata: {
          pedido_id: viaje.pedido_id,
          total_alistado: totalAlistado,
          total_requerido: totalRequerido,
          exceso,
        },
      });
    }
  } else if (totalAlistado <= totalRequerido && totalAlistado > 0) {
    await supabase
      .from("inconsistencias")
      .update({ resuelto: true })
      .eq("entidad_id", viajeId)
      .eq("tipo", "viaje_exceso_alistado")
      .eq("resuelto", false);
  }

  // ¿Todas las líneas cubiertas? → viaje pasa a alistado
  let todasCubiertas = true;
  for (const d of detalles ?? []) {
    const cubiertas = cntPorDetalle[d.id] ?? 0;
    if (cubiertas < Number(d.cantidad)) {
      todasCubiertas = false;
      break;
    }
  }

  if (todasCubiertas && (detalles?.length ?? 0) > 0 && viaje.estado === "programado") {
    await supabase.from("viajes").update({ estado: "alistado" }).eq("id", viajeId);
  }

  // Sincronizar estado del pedido
  await syncEstadoPedidoPorViajes(viaje.pedido_id);
}
