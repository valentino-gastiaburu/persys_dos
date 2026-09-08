import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  generarCodigoViaje,
  recalcularTotalViaje,
  calcularTotalPedido,
  syncEstadoPedidoPorViajes,
  generarResumen,
  registrarHistorialPedido,
  getDetallesActivos,
} from "@/lib/pedidos";
import { validarStockLineas } from "@/lib/productos";
import { obtenerFechaHoyLima, esRetrasado } from "@/lib/retraso";

// POST /api/viajes — crea un viaje extra sobre un pedido.
// Body para tipo "entrega" (agregar productos):
//   { pedido_id, tipo: "entrega", fecha, direccion?, costo_envio?, lineas: LineaStock[] }
// Body para tipo "recojo" (devolución/cambio):
//   { pedido_id, tipo: "recojo", motivo: "devolucion"|"cambio", fecha?, lineas: [{detalle_id, cantidad, precio_devolucion}] }
// Tras crear, recalcula el total del pedido y sincroniza su estado.
export async function POST(request: NextRequest) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;

  const body = await request.json();
  const supabase = getSupabase();
  const tipo: string = body.tipo;

  if (!["entrega", "recojo"].includes(tipo)) {
    return Response.json({ error: "Tipo de viaje inválido" }, { status: 400 });
  }

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("*")
    .eq("id", body.pedido_id)
    .single();
  if (!pedido) return Response.json({ error: "Pedido no encontrado" }, { status: 404 });

  if (tipo === "entrega") {
    // Bloquear solo si ya hay un viaje de entrega sin enviar (programado/alistado).
    // En ese caso se agregan productos al viaje existente.
    const { data: viajesEntregaPendientes } = await supabase
      .from("viajes")
      .select("id")
      .eq("pedido_id", pedido.id)
      .eq("tipo", "entrega")
      .in("estado", ["programado", "alistado"]);

    if ((viajesEntregaPendientes?.length ?? 0) > 0) {
      return Response.json(
        { error: "Ya hay un viaje de entrega pendiente. Agrega los productos a ese viaje." },
        { status: 400 }
      );
    }

    const lineas: {
      producto_id: string;
      talla_stock: string | null;
      talla_vendida: string | null;
      cantidad: number;
      precio_unitario?: number;
      entalle?: boolean;
      genero?: string;
      es_extra_motorizado?: boolean;
    }[] = body.lineas ?? [];
    if (lineas.length === 0) {
      return Response.json({ error: "El viaje no tiene productos" }, { status: 400 });
    }
    for (const l of lineas) {
      l.talla_vendida = l.entalle ? (l.talla_vendida ?? l.talla_stock) : l.talla_stock;
    }
    const { conflictos } = await validarStockLineas(lineas);
    if (conflictos.length > 0) {
      return Response.json(
        { error: "Stock insuficiente para algunos productos", conflictos },
        { status: 409 }
      );
    }

    const costoEnvio =
      body.costo_envio !== undefined
        ? Number(body.costo_envio)
        : Number((pedido as any).costo_envio ?? 0);
    const direccion = body.direccion || pedido.direccion_entrega || null;
    const viajeCodigo = await generarCodigoViaje();
    const { data: viaje, error: viajeErr } = await supabase
      .from("viajes")
      .insert({
        codigo: viajeCodigo,
        pedido_id: pedido.id,
        tipo: "entrega",
        estado: "programado",
        fecha: body.fecha || new Date().toISOString().slice(0, 10),
        direccion,
        costo_envio: costoEnvio,
        total: 0,
        creado_por: user.id,
      })
      .select()
      .single();
    if (viajeErr || !viaje) {
      return Response.json({ error: "No se pudo crear el viaje" }, { status: 500 });
    }

    const detalles = lineas.map((l) => {
      const precioUnitario = Number(l.precio_unitario ?? 0);
      const tallaStock = l.talla_stock || null;
      const tallaVendida = l.talla_vendida || null;
      return {
        pedido_id: pedido.id,
        viaje_id: viaje.id,
        producto_id: l.producto_id,
        talla_stock: tallaStock,
        talla_vendida: tallaVendida,
        entalle: Boolean(tallaStock && tallaVendida && tallaStock !== tallaVendida),
        cantidad: Number(l.cantidad),
        precio_unitario: precioUnitario,
        subtotal: Number(l.cantidad) * precioUnitario,
        genero: l.genero || "dama",
        es_extra_motorizado: Boolean(l.es_extra_motorizado),
        anadido_por: user.id,
        confirmado_el: new Date().toISOString(),
      };
    });
    const { error: errDetalles } = await supabase.from("detalles_pedido").insert(detalles);
    if (errDetalles) {
      await supabase.from("viajes").delete().eq("id", viaje.id);
      return Response.json({ error: "No se pudieron registrar los productos" }, { status: 500 });
    }

    const total = await recalcularTotalViaje(viaje.id, "entrega", costoEnvio);
    await refrescarPedido(pedido.id, user.id);

    await registrarAuditoria({
      user,
      entidad: "viaje",
      entidad_id: viaje.id,
      entidad_ref: viajeCodigo,
      sub_entidad: "pedido",
      sub_entidad_id: pedido.id,
      sub_entidad_ref: pedido.codigo,
      accion: "crear",
      valor_nuevo: { tipo: "entrega", fecha: viaje.fecha, costo_envio: costoEnvio, lineas },
      nota: `Creó viaje de entrega ${viajeCodigo} con ${detalles.length} línea(s) (pedido ${pedido.codigo})`,
    });

    return Response.json({ viaje: { ...viaje, total } }, { status: 201 });
  }

  // tipo === "recojo"
  if (!["enviado", "entregado", "esperando_devolucion", "esperando_cambio", "cerrado"].includes(pedido.estado)) {
    return Response.json(
      { error: "Solo se pueden registrar devoluciones en pedidos ya entregados" },
      { status: 400 }
    );
  }
  const motivo: string = body.motivo;
  if (!["devolucion", "cambio"].includes(motivo)) {
    return Response.json({ error: "Indica un motivo de regreso (devolución o cambio)" }, { status: 400 });
  }
  const lineas: { detalle_id: string; cantidad: number; precio_devolucion?: number }[] = body.lineas ?? [];
  if (lineas.length === 0) {
    return Response.json({ error: "El viaje de regreso no tiene productos" }, { status: 400 });
  }
  const ids = lineas.map((l) => l.detalle_id);
  const { data: orig } = await supabase
    .from("detalles_pedido")
    .select("*")
    .in("id", ids);
  const porId = new Map((orig ?? []).map((d: any) => [d.id, d]));
  for (const l of lineas) {
    const d = porId.get(l.detalle_id);
    if (!d || d.pedido_id !== pedido.id) {
      return Response.json({ error: "Línea de producto inválida" }, { status: 400 });
    }
    if (d.estado !== "activo") {
      return Response.json({ error: "El producto ya fue devuelto" }, { status: 400 });
    }
    const cant = Number(l.cantidad);
    if (!cant || cant <= 0) {
      return Response.json({ error: "Indica una cantidad válida a devolver" }, { status: 400 });
    }
    if (cant > Number(d.cantidad)) {
      return Response.json(
        { error: `No puedes devolver ${cant} si solo hay ${d.cantidad}` },
        { status: 400 }
      );
    }
  }

  const viajeCodigo = await generarCodigoViaje();
  const { data: viaje, error: viajeErr } = await supabase
    .from("viajes")
    .insert({
      codigo: viajeCodigo,
      pedido_id: pedido.id,
      tipo: "recojo",
      motivo_recojo: motivo,
      estado: "programado",
      fecha: body.fecha || new Date().toISOString().slice(0, 10),
      costo_envio: 0,
      total: 0,
      creado_por: user.id,
    })
    .select()
    .single();
  if (viajeErr || !viaje) {
    return Response.json({ error: "No se pudo crear el viaje" }, { status: 500 });
  }

  for (const l of lineas) {
    const d: any = porId.get(l.detalle_id);
    const precioDev = Number(l.precio_devolucion ?? d.precio_unitario);
    const cant = Number(l.cantidad);

    // Insertar detalle del recojo y capturar su ID para vincular VPU
    const { data: nuevoDetalle } = await supabase
      .from("detalles_pedido")
      .insert({
        pedido_id: pedido.id,
        viaje_id: viaje.id,
        devolucion_de: d.id,
        producto_id: d.producto_id,
        talla_stock: d.talla_stock,
        talla_vendida: d.talla_vendida,
        entalle: d.entalle,
        cantidad: cant,
        precio_unitario: precioDev,
        subtotal: cant * precioDev,
        genero: d.genero,
        es_extra_motorizado: d.es_extra_motorizado,
        estado: "pendiente_devolucion",
        anadido_por: user.id,
      })
      .select("id")
      .single();

    // Pre-popular viaje_producto_unicos: buscar los productos únicos que fueron
    // entregados originalmente para este detalle y asignarlos como "pendientes"
    // de devolución en el viaje de recojo.
    if (d.viaje_id && nuevoDetalle) {
      const { data: vpuOriginales } = await supabase
        .from("viaje_producto_unicos")
        .select("producto_unico_id")
        .eq("viaje_id", d.viaje_id)
        .eq("detalle_pedido_id", d.id)
        .eq("estado", "enviado");

      // Tomar solo los que coincidan con la cantidad a devolver
      const aDevolver = (vpuOriginales ?? []).slice(0, cant);
      if (aDevolver.length > 0) {
        await supabase.from("viaje_producto_unicos").insert(
          aDevolver.map((vpu) => ({
            viaje_id: viaje.id,
            producto_unico_id: vpu.producto_unico_id,
            detalle_pedido_id: nuevoDetalle.id,
            estado: "pendiente" as const,
            alistado_por: user.id,
          }))
        );
      }
    }

    const nuevaCant = Number(d.cantidad) - cant;
    if (nuevaCant <= 0) {
      // Devuelto todo: la línea queda oculta (sale del pedido) pero conserva su
      // cantidad/subtotal originales como historial del viaje de ida.
      await supabase
        .from("detalles_pedido")
        .update({ estado: "oculto" })
        .eq("id", d.id);
    } else {
      await supabase
        .from("detalles_pedido")
        .update({
          cantidad: nuevaCant,
          subtotal: nuevaCant * Number(d.precio_unitario || 0),
          estado: "activo",
        })
        .eq("id", d.id);
    }
    if (d.viaje_id) {
      const { data: vOrigen } = await supabase
        .from("viajes")
        .select("costo_envio")
        .eq("id", d.viaje_id)
        .maybeSingle();
      await recalcularTotalViaje(d.viaje_id, "entrega", Number(vOrigen?.costo_envio ?? 0));
    }
  }

  await recalcularTotalViaje(viaje.id, "recojo", 0);
  await refrescarPedido(pedido.id, user.id);

  await registrarAuditoria({
    user,
    entidad: "viaje",
    entidad_id: viaje.id,
    entidad_ref: viajeCodigo,
    sub_entidad: "pedido",
    sub_entidad_id: pedido.id,
    sub_entidad_ref: pedido.codigo,
    accion: "crear",
    valor_nuevo: { tipo: "recojo", motivo_recojo: motivo, fecha: viaje.fecha, lineas },
    nota: `Creó viaje de recojo ${viajeCodigo} (${motivo}) con ${lineas.length} línea(s) (pedido ${pedido.codigo})`,
  });

  return Response.json({ viaje }, { status: 201 });
}

// Recalcula resumen, total y estado del pedido tras cambios en sus viajes.
async function refrescarPedido(pedidoId: string, userId: string) {
  const supabase = getSupabase();
  const detalles = await getDetallesActivos(pedidoId);
  const resumen = await generarResumen(
    detalles.map((d: any) => ({
      producto_id: d.producto_id,
      cantidad: d.cantidad,
      talla: d.talla_vendida_nombre ?? null,
      genero: d.genero,
      es_extra_motorizado: d.es_extra_motorizado,
    }))
  );
  const nuevoEstado = await syncEstadoPedidoPorViajes(pedidoId);
  const montoTotal = await calcularTotalPedido(pedidoId);
  const { data: pedido } = await supabase.from("pedidos").select("estado").eq("id", pedidoId).single();
  if (pedido && pedido.estado !== nuevoEstado) {
    await registrarHistorialPedido({
      pedido_id: pedidoId,
      estado_anterior: pedido.estado,
      estado_nuevo: nuevoEstado,
      persona_id: userId,
      motivo: "Actualización de viajes",
    });
  }
  await supabase
    .from("pedidos")
    .update({ estado: nuevoEstado, monto_total: montoTotal, resumen_productos: resumen })
    .eq("id", pedidoId);
}

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
    .order("actualizado_el", { ascending: false });

  if (fecha) query = query.eq("fecha", fecha);
  if (estado) query = query.eq("estado", estado);

  const { data, error: err } = await query.limit(200);
  if (err) return Response.json({ error: "Error de base de datos" }, { status: 500 });

  // Contar unidades alistadas por viaje + unidades pendientes de retorno
  const ids = (data ?? []).map((v: any) => v.id);
  const viajeInfo: Record<string, { estado: string; tipo: string }> = {};
  for (const v of data ?? []) {
    viajeInfo[v.id] = { estado: v.estado, tipo: v.tipo };
  }
  let alistadosPorViaje: Record<string, number> = {};
  let pendientesRetornoPorViaje: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: vpuRows } = await supabase
      .from("viaje_producto_unicos")
      .select("viaje_id, estado, detalle_pedido_id")
      .in("viaje_id", ids);
    alistadosPorViaje = {};
    pendientesRetornoPorViaje = {};

    // Agrupar VPUs no devueltos por viaje+detalle para detectar excedentes.
    // Los VPU devueltos NO cuentan: si un exceso ya se regresó al stock, el
    // aviso de "Pendiente a devolver" debe desaparecer.
    const vpuNoDevueltos = (vpuRows ?? []).filter((v) => v.estado !== "devuelto");
    const vpPorDetalle: Record<string, number> = {};
    for (const vpu of vpuRows ?? []) {
      alistadosPorViaje[vpu.viaje_id] = (alistadosPorViaje[vpu.viaje_id] ?? 0) + 1;
    }
    for (const vpu of vpuNoDevueltos) {
      const key = `${vpu.viaje_id}|${vpu.detalle_pedido_id}`;
      vpPorDetalle[key] = (vpPorDetalle[key] ?? 0) + 1;
    }

    // 1) Cancelados / recojo activo (flujo original)
    for (const vpu of vpuNoDevueltos) {
      const info = viajeInfo[vpu.viaje_id];
      if (!info) continue;
      const esCancelado = info.estado === "cancelado";
      const esRecojoActivo = info.tipo === "recojo" && info.estado !== "terminado";
      if ((esCancelado || esRecojoActivo) && vpu.estado !== "pendiente") {
        pendientesRetornoPorViaje[vpu.viaje_id] = (pendientesRetornoPorViaje[vpu.viaje_id] ?? 0) + 1;
      }
    }

    // 2) VPUs excedentes en viajes de entrega activos (cantidad del detalle < VPUs no devueltos).
    //    Se excluyen recojo (ya cubierto en 1) y estados enviado/terminado/cancelado.
    if (ids.length > 0) {
      const detalleIds = [...new Set(vpuNoDevueltos.map((v) => v.detalle_pedido_id).filter(Boolean))];
      if (detalleIds.length > 0) {
        const { data: detalles } = await supabase
          .from("detalles_pedido")
          .select("id, viaje_id, cantidad")
          .in("id", detalleIds);
        for (const det of detalles ?? []) {
          if (!det.viaje_id) continue;
          const info = viajeInfo[det.viaje_id];
          if (!info || info.tipo === "recojo" || info.estado === "terminado" || info.estado === "cancelado" || info.estado === "enviado") continue;
          const key = `${det.viaje_id}|${det.id}`;
          const totalVpu = vpPorDetalle[key] ?? 0;
          const exceso = totalVpu - Number(det.cantidad);
          if (exceso > 0) {
            pendientesRetornoPorViaje[det.viaje_id] = (pendientesRetornoPorViaje[det.viaje_id] ?? 0) + exceso;
          }
        }
      }
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
    pendientes_retorno: pendientesRetornoPorViaje[v.id] ?? 0,
  }));

  return Response.json({ viajes });
}
