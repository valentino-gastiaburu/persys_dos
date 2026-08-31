import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { registrarHistorialPedido, syncEstadoPedidoPorViajes, recalcularTotalViaje, sincronizarTotalesPedido, recalcularEstadoViaje } from "@/lib/pedidos";

// GET /api/viajes/[id] — detalle del viaje: productos a alistar + alistados
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["almacen", "controller", "admin", "vendedora", "agendadora"]);
  if (error) return error;
  void user;

  const { id } = await params;
  const supabase = getSupabase();

  const { data: viaje, error: err } = await supabase
    .from("viajes")
    .select(`
      *, pedidos(codigo, estado, cliente_id, fecha_entrega, direccion_entrega, ciudad,
        clientes(nombre, apellido, telefono, direccion))
    `)
    .eq("id", id)
    .single();
  if (err || !viaje) return Response.json({ error: "Viaje no encontrado" }, { status: 404 });

  // Productos a alistar: líneas del viaje (activos en entregas,
  // pendiente_devolucion en regresos). Nunca se muestran las ocultas.
  const { data: detalles } = await supabase
    .from("detalles_pedido")
    .select(`
      id, producto_id, talla_stock, talla_vendida, cantidad, precio_unitario, subtotal, es_extra_motorizado, entalle, estado, genero,
      productos(imei, nombre), tallas!detalles_pedido_talla_vendida_fkey(nombre),
      tallas_stock: tallas!detalles_pedido_talla_stock_fkey(nombre)
    `)
    .eq("viaje_id", id)
    .order("creado_el");

  // Unidades ya alistadas en este viaje
  const { data: alistados } = await supabase
    .from("viaje_producto_unicos")
    .select(`
      id, detalle_pedido_id, estado, fecha_alistado, fecha_enviado,
      productos_unicos(
        id, codigo_qr, talla_id, talla_original,
        tallas!productos_unicos_talla_id_fkey(nombre),
        tallas_original: tallas!productos_unicos_talla_original_fkey(nombre),
        productos(imei)
      )
    `)
    .eq("viaje_id", id);

  const porDetalle: Record<string, any[]> = {};
  for (const a of alistados ?? []) {
    const key = a.detalle_pedido_id ?? "sin-detalle";
    porDetalle[key] = porDetalle[key] ?? [];
    porDetalle[key].push(a);
  }

  const items = (detalles ?? []).map((d: any) => {
    const lista = porDetalle[d.id] ?? [];
    const falta = Number(d.cantidad) - lista.length;
    return {
      detalle_id: d.id,
      producto_id: d.producto_id,
      imei: d.productos?.imei,
      nombre: d.productos?.nombre,
      talla: d.tallas?.nombre ?? null,
      talla_id: d.talla_vendida,
      talla_stock: d.talla_stock ?? null,
      talla_stock_nombre: d.tallas_stock?.nombre ?? null,
      talla_vendida: d.talla_vendida ?? null,
      talla_vendida_nombre: d.tallas?.nombre ?? null,
      cantidad: Number(d.cantidad),
      precio_unitario: Number(d.precio_unitario ?? 0),
      subtotal: Number(d.subtotal ?? 0),
      es_extra_motorizado: d.es_extra_motorizado,
      entalle: d.entalle,
      estado: d.estado,
      genero: d.genero ?? "dama",
      alistados: lista.length,
      falta,
      completo: falta <= 0,
      devuelto: d.estado === "devuelto",
    };
  });

  return Response.json({
    viaje,
    cliente: viaje.pedidos?.clientes ?? null,
    pedido_codigo: viaje.pedidos?.codigo,
    pedido_estado: viaje.pedidos?.estado,
    items,
    alistados: alistados ?? [],
  });
}

// PATCH /api/viajes/[id]
// Soporta: { estado } para transiciones + cancelado, { fecha }, { direccion },
// { lineas } para reemplazar productos (solo programado).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["almacen", "controller", "admin", "vendedora", "agendadora"]);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const supabase = getSupabase();

  const { data: viaje } = await supabase
    .from("viajes")
    .select("id, pedido_id, estado, tipo, costo_envio")
    .eq("id", id)
    .single();
  if (!viaje) return Response.json({ error: "Viaje no encontrado" }, { status: 404 });

  const esActivo = viaje.estado === "programado" || viaje.estado === "alistado";

  // ── Cancelar viaje ──────────────────────────────────────────────
  if (body.estado === "cancelado") {
    if (!esActivo) {
      return Response.json({ error: "Solo se pueden cancelar viajes programados o alistados" }, { status: 400 });
    }

    const estadoPedidoAnterior = (
      await supabase.from("pedidos").select("estado").eq("id", viaje.pedido_id).single()
    ).data?.estado;

    // NOTA: Al cancelar un viaje de entrega, los productos NO se restauran
    // automáticamente a en_almacen. Quedan donde estén (almacen_espera, en_viaje,
    // etc.) hasta que personal de almacén los devuelva manualmente via la sección
    // "Pendientes a regresar al stock". Solo se desvinculan los detalles del viaje.

    // Si es recojo: encontrar detalles del recojo ANTES de desvincular
    let recojoIds: string[] = [];
    let origIds: string[] = [];
    let origCantidades: Record<string, { cantidad: number; subtotal: number }> = {};
    if (viaje.tipo === "recojo") {
      const { data: recojoDetalles } = await supabase
        .from("detalles_pedido")
        .select("id, devolucion_de, cantidad, subtotal, precio_unitario")
        .eq("viaje_id", id)
        .not("devolucion_de", "is", null);

      recojoIds = (recojoDetalles ?? []).map((d) => d.id);
      origIds = (recojoDetalles ?? [])
        .map((d) => d.devolucion_de)
        .filter(Boolean);

      // Guardar cantidades del recojo para restaurar cantidades parciales
      for (const d of recojoDetalles ?? []) {
        if (d.devolucion_de) {
          origCantidades[d.devolucion_de] = {
            cantidad: Number(d.cantidad),
            subtotal: Number(d.subtotal ?? 0),
          };
        }
      }
    }

    // Desvincular detalles de este viaje
    await supabase
      .from("detalles_pedido")
      .update({ viaje_id: null })
      .eq("viaje_id", id);

    // Si es recojo: restaurar detalles originales y eliminar detalles del recojo
    if (viaje.tipo === "recojo") {
      if (origIds.length > 0) {
        // Obtener estado y cantidad actual de los originales
        const { data: originales } = await supabase
          .from("detalles_pedido")
          .select("id, estado, cantidad, precio_unitario")
          .in("id", origIds);

        for (const orig of originales ?? []) {
          const cantRecojo = origCantidades[orig.id]?.cantidad ?? 0;
          if (orig.estado === "oculto") {
            // Retorno completo: restaurar estado a activo
            await supabase
              .from("detalles_pedido")
              .update({ estado: "activo" })
              .eq("id", orig.id);
          } else if (orig.estado === "activo" && cantRecojo > 0) {
            // Retorno parcial: restaurar cantidad y subtotal
            const nuevaCant = Number(orig.cantidad) + cantRecojo;
            const precio = Number(orig.precio_unitario ?? 0);
            await supabase
              .from("detalles_pedido")
              .update({ cantidad: nuevaCant, subtotal: nuevaCant * precio })
              .eq("id", orig.id);
          }
        }
      }
      if (recojoIds.length > 0) {
        await supabase.from("detalles_pedido").delete().in("id", recojoIds);
      }
    }

    await supabase.from("viajes").update({ estado: "cancelado" }).eq("id", id);

    // Recalcular totales: si se restauraron detalles (recojo cancelado),
    // el viaje de entrega que los contenía cambió de total
    const montoTotal = await sincronizarTotalesPedido(viaje.pedido_id);

    const nuevoEstadoPedido = await syncEstadoPedidoPorViajes(viaje.pedido_id);
    await supabase.from("pedidos").update({ estado: nuevoEstadoPedido, monto_total: montoTotal }).eq("id", viaje.pedido_id);

    // Registrar en historial
    if (estadoPedidoAnterior !== nuevoEstadoPedido) {
      await registrarHistorialPedido({
        pedido_id: viaje.pedido_id,
        estado_anterior: estadoPedidoAnterior ?? null,
        estado_nuevo: nuevoEstadoPedido,
        persona_id: user.id,
        motivo: `Cancelación de viaje ${viaje.tipo === "recojo" ? "de recojo" : "de entrega"}`,
      });
    }

    return Response.json({ ok: true });
  }

  // ── Transiciones de estado forward (alistado / enviado / terminado) ──
  if (body.estado) {
    const nuevoEstado = body.estado;
    if (!["alistado", "enviado", "terminado"].includes(nuevoEstado)) {
      return Response.json({ error: "Estado de viaje inválido" }, { status: 400 });
    }

    const orden = ["programado", "alistado", "enviado", "terminado"];
    if (orden.indexOf(nuevoEstado) < orden.indexOf(viaje.estado)) {
      return Response.json({ error: "No se puede retroceder el estado" }, { status: 400 });
    }

    if (nuevoEstado === "alistado") {
      const { data: detalles } = await supabase
        .from("detalles_pedido")
        .select("id, cantidad")
        .eq("viaje_id", id)
        .not("estado", "eq", "oculto");
      const { data: alistados } = await supabase
        .from("viaje_producto_unicos")
        .select("detalle_pedido_id")
        .eq("viaje_id", id);
      const contador: Record<string, number> = {};
      for (const a of alistados ?? []) contador[a.detalle_pedido_id] = (contador[a.detalle_pedido_id] ?? 0) + 1;
      const incompleto = (detalles ?? []).some((d) => (contador[d.id] ?? 0) < Number(d.cantidad));
      if (incompleto) {
        return Response.json({ error: "Faltan unidades por alistar antes de marcar el viaje como alistado" }, { status: 400 });
      }
    }

    const { data: unidades } = await supabase
      .from("viaje_producto_unicos")
      .select("producto_unico_id, detalle_pedido_id")
      .eq("viaje_id", id);
    const unicoIds = (unidades ?? []).map((u) => u.producto_unico_id);

    const estadoPedidoAnterior = (
      await supabase.from("pedidos").select("estado").eq("id", viaje.pedido_id).single()
    ).data?.estado;

    if (nuevoEstado === "enviado") {
      if (unicoIds.length > 0) {
        await supabase
          .from("productos_unicos")
          .update({ estado: "en_viaje", fecha_salida: new Date().toISOString() })
          .in("id", unicoIds);
        await supabase
          .from("viaje_producto_unicos")
          .update({ estado: "enviado", fecha_enviado: new Date().toISOString() })
          .eq("viaje_id", id);
        const { data: unicosInfo } = await supabase
          .from("productos_unicos")
          .select("producto_id, talla_id")
          .in("id", unicoIds);
        const agrupado: Record<string, { producto_id: string; talla_id: string; cantidad: number }> = {};
        for (const u of unicosInfo ?? []) {
          const key = `${u.producto_id}:${u.talla_id}`;
          agrupado[key] = agrupado[key] ?? { producto_id: u.producto_id, talla_id: u.talla_id, cantidad: 0 };
          agrupado[key].cantidad += 1;
        }
        const kardex = Object.values(agrupado).map((g) => ({
          producto_id: g.producto_id,
          talla_id: g.talla_id,
          tipo: "salida",
          cantidad: g.cantidad,
          referencia_tipo: "viaje",
          referencia_id: id,
          persona_id: user.id,
          nota: "Salida por envío de viaje",
        }));
        if (kardex.length > 0) await supabase.from("movimientos_stock").insert(kardex);
        await supabase.from("historial_producto_unicos").insert(
          unicoIds.map((uid) => ({
            producto_unico_id: uid,
            evento: "enviado",
            pedido_id: viaje.pedido_id,
            viaje_id: id,
            persona_id: user.id,
            nota: "Enviado con el motorizado",
          }))
        );
      }
    }

    if (nuevoEstado === "terminado") {
      if (viaje.tipo === "entrega") {
        if (unicoIds.length > 0) {
          await supabase.from("productos_unicos").update({ estado: "entregado" }).in("id", unicoIds);
          await supabase.from("viaje_producto_unicos").update({ estado: "enviado" }).eq("viaje_id", id);
          await supabase.from("historial_producto_unicos").insert(
            unicoIds.map((uid) => ({
              producto_unico_id: uid,
              evento: "entregado",
              pedido_id: viaje.pedido_id,
              viaje_id: id,
              persona_id: user.id,
              nota: "Entregado al cliente",
            }))
          );
        }
      } else {
        await supabase
          .from("detalles_pedido")
          .update({ estado: "devuelto" })
          .eq("viaje_id", id)
          .eq("estado", "pendiente_devolucion");
        if (unicoIds.length > 0) {
          await supabase
            .from("productos_unicos")
            .update({ estado: "en_almacen", fecha_salida: null })
            .in("id", unicoIds);
          await supabase.from("viaje_producto_unicos").update({ estado: "devuelto" }).eq("viaje_id", id);
          const { data: unicosInfo } = await supabase
            .from("productos_unicos")
            .select("producto_id, talla_id")
            .in("id", unicoIds);
          const agrupado: Record<string, { producto_id: string; talla_id: string; cantidad: number }> = {};
          for (const u of unicosInfo ?? []) {
            const key = `${u.producto_id}:${u.talla_id}`;
            agrupado[key] = agrupado[key] ?? { producto_id: u.producto_id, talla_id: u.talla_id, cantidad: 0 };
            agrupado[key].cantidad += 1;
          }
          const kardex = Object.values(agrupado).map((g) => ({
            producto_id: g.producto_id,
            talla_id: g.talla_id,
            tipo: "entrada",
            cantidad: g.cantidad,
            referencia_tipo: "viaje",
            referencia_id: id,
            persona_id: user.id,
            nota: "Entrada por devolución (recojo de viaje)",
          }));
          if (kardex.length > 0) await supabase.from("movimientos_stock").insert(kardex);
          await supabase.from("historial_producto_unicos").insert(
            unicoIds.map((uid) => ({
              producto_unico_id: uid,
              evento: "devuelto",
              pedido_id: viaje.pedido_id,
              viaje_id: id,
              persona_id: user.id,
              nota: "Devuelto al almacén (recojo)",
            }))
          );
        }
      }
    }

    const updates: Record<string, any> = { estado: nuevoEstado };
    if (nuevoEstado === "terminado" && viaje.tipo === "recojo") {
      updates.fecha_devolucion = new Date().toISOString();
    }
    const { data: viajeActualizado, error: vErr } = await supabase
      .from("viajes")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (vErr || !viajeActualizado) {
      return Response.json({ error: "No se pudo actualizar el viaje" }, { status: 500 });
    }

    const nuevoEstadoPedido = await syncEstadoPedidoPorViajes(viaje.pedido_id);
    const { data: pedidoActualizado } = await supabase
      .from("pedidos")
      .update({ estado: nuevoEstadoPedido })
      .eq("id", viaje.pedido_id)
      .select()
      .single();

    if (estadoPedidoAnterior !== nuevoEstadoPedido) {
      await registrarHistorialPedido({
        pedido_id: viaje.pedido_id,
        estado_anterior: estadoPedidoAnterior ?? null,
        estado_nuevo: nuevoEstadoPedido,
        persona_id: user.id,
        motivo: `Estado del viaje cambiado a ${nuevoEstado}`,
      });
    }

    return Response.json({ viaje: viajeActualizado, pedido: pedidoActualizado });
  }

  // ── Modificar fecha / dirección ───────────────────────────────────
  const patchData: Record<string, any> = {};
  if (body.fecha !== undefined) patchData.fecha = body.fecha;
  if (body.direccion !== undefined) patchData.direccion = body.direccion;

  if (Object.keys(patchData).length > 0) {
    if (!esActivo) {
      return Response.json({ error: "Solo se pueden editar viajes programados o alistados" }, { status: 400 });
    }
    await supabase.from("viajes").update(patchData).eq("id", id);
  }

  // ── Modificar productos ──
  if (body.lineas !== undefined) {
    if (!esActivo) {
      return Response.json({ error: "Solo se pueden editar viajes programados o alistados" }, { status: 400 });
    }
    const lineas: {
      detalle_id?: string;
      producto_id: string;
      talla_stock: string | null;
      talla_vendida: string | null;
      cantidad: number;
      precio_unitario?: number;
      entalle?: boolean;
      genero?: string;
      es_extra_motorizado?: boolean;
    }[] = body.lineas;

    // Consultar VPUs activos (no devueltos) para decidir handler
    const { count: vpuActivosCount } = await supabase
      .from("viaje_producto_unicos")
      .select("id", { count: "exact", head: true })
      .eq("viaje_id", id)
      .not("estado", "eq", "devuelto");
    const tieneVPUsActivos = (vpuActivosCount ?? 0) > 0;

    if (!tieneVPUsActivos) {
      // Reemplazo total limpio — atómico vía función PostgreSQL.
      // DELETE + INSERT dentro de la misma transacción; si algo falla, nada se persiste.

      const detalles = lineas.map((l) => ({
        producto_id: l.producto_id,
        talla_stock: l.talla_stock || "",
        talla_vendida: (l.entalle ? (l.talla_vendida ?? l.talla_stock) : l.talla_stock) || "",
        entalle: Boolean(l.talla_stock && l.talla_vendida && l.talla_stock !== l.talla_vendida && l.entalle),
        cantidad: Number(l.cantidad),
        precio_unitario: Number(l.precio_unitario ?? 0),
        subtotal: Number(l.cantidad) * Number(l.precio_unitario ?? 0),
        genero: (l.genero === "dama" || l.genero === "caballero") ? l.genero : "dama",
        es_extra_motorizado: Boolean(l.es_extra_motorizado),
      }));

      const { error: errDet } = await supabase.rpc("replace_viaje_detalles", {
        p_viaje_id: id,
        p_pedido_id: viaje.pedido_id,
        p_anadido_por: user.id,
        p_detalles: detalles,
      });
      if (errDet) {
        return Response.json({ error: "No se pudieron guardar los productos" }, { status: 500 });
      }
    } else {
      // Alistado: re-vincular huérfanos, actualizar cantidades, agregar nuevos, eliminar los que sobran.

      // Obtener detalles existentes en el viaje
      const { data: existentes } = await supabase
        .from("detalles_pedido")
        .select("id, producto_id, talla_stock, talla_vendida, cantidad, precio_unitario")
        .eq("viaje_id", id)
        .not("estado", "eq", "oculto");
      const existentesList = existentes ?? [];

      // Obtener VPU existentes para saber qué detalles NO se pueden borrar
      const existenteIds = existentesList.map((e) => e.id);
      const { data: vpuExistentes } = await supabase
        .from("viaje_producto_unicos")
        .select("detalle_pedido_id, estado")
        .eq("viaje_id", id)
        .in("detalle_pedido_id", existenteIds);
      const detallesConVpu = new Set((vpuExistentes ?? []).map((v) => v.detalle_pedido_id));
      // VPUs activos (no devueltos) — para limpieza de detalles cantidad=0
      const detallesConVpuActivos = new Set(
        (vpuExistentes ?? []).filter((v) => v.estado !== "devuelto").map((v) => v.detalle_pedido_id)
      );

      // Re-vincular detalles huérfanos (viaje_id = null) que están siendo restaurados
      const lineasConDetalle = lineas.filter((l) => l.detalle_id);
      if (lineasConDetalle.length > 0) {
        const orphanIds = lineasConDetalle.map((l) => l.detalle_id!);
        const { data: orphans } = await supabase
          .from("detalles_pedido")
          .select("id, producto_id, talla_stock, talla_vendida")
          .in("id", orphanIds)
          .is("viaje_id", null);
        for (const o of orphans ?? []) {
          const linea = lineasConDetalle.find((l) => l.detalle_id === o.id);
          if (linea) {
            await supabase
              .from("detalles_pedido")
              .update({
                viaje_id: id,
                cantidad: Number(linea.cantidad),
                precio_unitario: Number(linea.precio_unitario ?? 0),
                subtotal: Number(linea.cantidad) * Number(linea.precio_unitario ?? 0),
              })
              .eq("id", o.id);
            // Añadir a existentesList para que no se dupliquen
            existentesList.push({ id: o.id, producto_id: o.producto_id, talla_stock: o.talla_stock, talla_vendida: o.talla_vendida, cantidad: Number(linea.cantidad), precio_unitario: Number(linea.precio_unitario ?? 0) });
          }
        }
      }

      // Actualizar cantidades de detalles existentes que siguen en el viaje
      for (const linea of lineas) {
        const existente = existentesList.find(
          (e) => e.producto_id === linea.producto_id
            && (e.talla_stock || "") === (linea.talla_stock || "")
            && (e.talla_vendida || "") === (linea.talla_vendida || "")
        );
        if (existente && Number(existente.cantidad) !== Number(linea.cantidad)) {
          const nuevaCant = Number(linea.cantidad);
          const precio = Number(linea.precio_unitario ?? existente.precio_unitario ?? 0);
          await supabase
            .from("detalles_pedido")
            .update({ cantidad: nuevaCant, subtotal: nuevaCant * precio })
            .eq("id", existente.id);
          existente.cantidad = nuevaCant;
        }
      }

      // Eliminar detalles que sobran y no tienen VPU
      if (lineas.length > 0) {
        const nuevasKeys = new Set(
          lineas.map((l) => `${l.producto_id}|${l.talla_stock || ""}|${l.talla_vendida || ""}`)
        );
        const aEliminar = existentesList.filter(
          (e) => !nuevasKeys.has(`${e.producto_id}|${e.talla_stock || ""}|${e.talla_vendida || ""}`)
            && !detallesConVpu.has(e.id)
        );
        if (aEliminar.length > 0) {
          await supabase
            .from("detalles_pedido")
            .delete()
            .in("id", aEliminar.map((e) => e.id));
        }
      } else if (lineas.length === 0) {
        const aEliminar = existentesList.filter((e) => !detallesConVpu.has(e.id));
        if (aEliminar.length > 0) {
          await supabase
            .from("detalles_pedido")
            .delete()
            .in("id", aEliminar.map((e) => e.id));
        }
      }

      // Eliminar detalles con cantidad=0 y sin VPUs activos (devueltos no cuentan)
      const aLimpiar = existentesList.filter(
        (e) => Number(e.cantidad) === 0 && !detallesConVpuActivos.has(e.id)
      );
      if (aLimpiar.length > 0) {
        await supabase
          .from("detalles_pedido")
          .delete()
          .in("id", aLimpiar.map((e) => e.id));
      }

      // Insertar detalles NUEVOS (que no existan ya en el viaje ni sean huérfanos restaurados)
      if (lineas.length > 0) {
        const existentesSet = new Set(
          existentesList.map((e) => `${e.producto_id}|${e.talla_stock}|${e.talla_vendida}`)
        );
        const nuevos = lineas.filter(
          (l) => !existentesSet.has(`${l.producto_id}|${l.talla_stock || ""}|${l.talla_vendida || ""}`)
        );
        if (nuevos.length > 0) {
          const detalles = nuevos.map((l) => ({
            pedido_id: viaje.pedido_id,
            viaje_id: id,
            producto_id: l.producto_id,
            talla_stock: l.talla_stock || null,
            talla_vendida: (l.entalle ? (l.talla_vendida ?? l.talla_stock) : l.talla_stock) || null,
            entalle: Boolean(l.talla_stock && l.talla_vendida && l.talla_stock !== l.talla_vendida && l.entalle),
            cantidad: Number(l.cantidad),
            precio_unitario: Number(l.precio_unitario ?? 0),
            subtotal: Number(l.cantidad) * Number(l.precio_unitario ?? 0),
            genero: l.genero || "dama",
            es_extra_motorizado: Boolean(l.es_extra_motorizado),
            anadido_por: user.id,
            confirmado_el: new Date().toISOString(),
          }));
          const { error: errDet } = await supabase.from("detalles_pedido").insert(detalles);
          if (errDet) {
            return Response.json({ error: "No se pudieron guardar los productos" }, { status: 500 });
          }
        }
      }
    }

    await recalcularTotalViaje(id, viaje.tipo, viaje.costo_envio);
    await recalcularEstadoViaje(id);
  }

  // ── Desvincular detalles (quitar productos con VPU asignado) ──
  if (body.detalles_a_desvincular !== undefined) {
    if (!esActivo) {
      return Response.json({ error: "Solo se pueden editar viajes programados o alistados" }, { status: 400 });
    }
    const idsDesvincular: string[] = body.detalles_a_desvincular;
    if (idsDesvincular.length > 0) {
      // Filtrar: solo los que aún pertenecen a este viaje (ignorar ya huérfanos)
      const { data: checkDetalles } = await supabase
        .from("detalles_pedido")
        .select("id")
        .eq("viaje_id", id)
        .in("id", idsDesvincular);
      const validIds = new Set((checkDetalles ?? []).map((d) => d.id));
      const aDesvincular = idsDesvincular.filter((did) => validIds.has(did));
      if (aDesvincular.length === 0) {
        // Todos ya eran huérfanos, nada que hacer
      } else {
        // Verificar que no tengan VPU enviado/devuelto
        const { data: vpuCheck } = await supabase
          .from("viaje_producto_unicos")
          .select("detalle_pedido_id, estado")
          .eq("viaje_id", id)
          .in("detalle_pedido_id", aDesvincular)
          .in("estado", ["enviado", "devuelto"]);
        if ((vpuCheck?.length ?? 0) > 0) {
          const bloqueados = [...new Set(vpuCheck!.map((v) => v.detalle_pedido_id))];
          return Response.json(
            { error: "No se pueden desvincular detalles con productos ya enviados/devueltos", detalles_bloqueados: bloqueados },
            { status: 400 }
          );
        }

        // Desvincular: poner viaje_id = null (los VPUs quedan en el viaje)
        await supabase
          .from("detalles_pedido")
          .update({ viaje_id: null })
          .eq("viaje_id", id)
          .in("id", aDesvincular);

        await recalcularTotalViaje(id, viaje.tipo, viaje.costo_envio);
        await sincronizarTotalesPedido(viaje.pedido_id);
      }
    }
  }

  // ── Modificar productos de recojo (agregar/quitar detalles) ──
  if (body.recojo_lineas !== undefined && viaje.tipo === "recojo") {
    if (viaje.estado !== "programado") {
      return Response.json({ error: "No se pueden modificar productos en este estado" }, { status: 400 });
    }

    const seleccionados: { detalle_id: string; cantidad: number; precio_devolucion?: number }[] = body.recojo_lineas;
    const seleccionIds = new Set(seleccionados.map((s) => s.detalle_id));

    // Obtener detalles actuales del recojo
    const { data: actuales } = await supabase
      .from("detalles_pedido")
      .select("id, devolucion_de")
      .eq("viaje_id", id);

    // Verificar que no tengan VPU escaneados
    const actualesIds = (actuales ?? []).map((d: any) => d.id);
    if (actualesIds.length > 0) {
      const { data: vpuExistentes } = await supabase
        .from("viaje_producto_unicos")
        .select("detalle_pedido_id")
        .in("detalle_pedido_id", actualesIds)
        .limit(1);
      if ((vpuExistentes?.length ?? 0) > 0) {
        return Response.json({ error: "Ya hay productos escaneados en este recojo. No se pueden modificar." }, { status: 400 });
      }
    }

    // Eliminar detalles actuales que ya no están seleccionados + restaurar originales
    const aEliminar = (actuales ?? [])
      .filter((d: any) => !seleccionIds.has(d.devolucion_de))
      .map((d: any) => d);
    if (aEliminar.length > 0) {
      // Restaurar originales de los detalles eliminados
      const origIdsEliminar = aEliminar.map((d: any) => d.devolucion_de).filter(Boolean);
      if (origIdsEliminar.length > 0) {
        const { data: originalesEliminar } = await supabase
          .from("detalles_pedido")
          .select("id, estado, cantidad, precio_unitario")
          .in("id", origIdsEliminar);

        for (const orig of originalesEliminar ?? []) {
          const recojoEliminado = aEliminar.find((d: any) => d.devolucion_de === orig.id);
          const cantDevolver = Number(recojoEliminado?.cantidad ?? 0);
          if (orig.estado === "oculto") {
            await supabase.from("detalles_pedido").update({ estado: "activo" }).eq("id", orig.id);
          } else if (orig.estado === "activo" && cantDevolver > 0) {
            const nuevaCant = Number(orig.cantidad) + cantDevolver;
            const precio = Number(orig.precio_unitario ?? 0);
            await supabase.from("detalles_pedido").update({ cantidad: nuevaCant, subtotal: nuevaCant * precio }).eq("id", orig.id);
          }
        }
      }
      await supabase.from("detalles_pedido").delete().in("id", aEliminar.map((d: any) => d.id));
    }

    // Insertar nuevos detalles seleccionados que no existan aún
    const existentesDevDe = new Set((actuales ?? []).map((d: any) => d.devolucion_de));
    const aInsertar = seleccionados.filter((s) => !existentesDevDe.has(s.detalle_id));

    if (aInsertar.length > 0) {
      // Obtener los detalles originales
      const { data: originales } = await supabase
        .from("detalles_pedido")
        .select("*")
        .in("id", aInsertar.map((s) => s.detalle_id));

      const porId = new Map((originales ?? []).map((d: any) => [d.id, d]));
      const filas = aInsertar.map((s) => {
        const orig = porId.get(s.detalle_id);
        if (!orig) return null;
        const cant = Number(s.cantidad);
        const precio = Number(s.precio_devolucion ?? orig.precio_unitario);
        return {
          pedido_id: viaje.pedido_id,
          viaje_id: id,
          devolucion_de: s.detalle_id,
          producto_id: orig.producto_id,
          talla_stock: orig.talla_stock,
          talla_vendida: orig.talla_vendida,
          entalle: orig.entalle,
          cantidad: cant,
          precio_unitario: precio,
          subtotal: cant * precio,
          genero: orig.genero,
          es_extra_motorizado: orig.es_extra_motorizado,
          estado: "pendiente_devolucion",
          anadido_por: user.id,
        };
      }).filter((f): f is NonNullable<typeof f> => f !== null);

      if (filas.length > 0) {
        const { error: errIns } = await supabase.from("detalles_pedido").insert(filas);
        if (errIns) {
          return Response.json({ error: "No se pudieron agregar productos al recojo" }, { status: 500 });
        }

        // Ocultar/Reducir originales de los detalles insertados
        for (const s of aInsertar) {
          const orig = porId.get(s.detalle_id);
          if (!orig) continue;
          const cant = Number(s.cantidad);
          const cantOriginal = Number(orig.cantidad);
          const nuevaCant = cantOriginal - cant;
          const precio = Number(orig.precio_unitario ?? 0);
          if (nuevaCant <= 0) {
            await supabase.from("detalles_pedido").update({ estado: "oculto" }).eq("id", s.detalle_id);
          } else {
            await supabase.from("detalles_pedido").update({ cantidad: nuevaCant, subtotal: nuevaCant * precio }).eq("id", s.detalle_id);
          }
        }
      }
    }

    await recalcularTotalViaje(id, viaje.tipo, 0);
    await sincronizarTotalesPedido(viaje.pedido_id);
  }

  const { data: viajeFinal } = await supabase.from("viajes").select("*").eq("id", id).single();
  return Response.json({ viaje: viajeFinal });
}
