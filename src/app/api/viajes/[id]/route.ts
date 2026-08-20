import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { registrarHistorialPedido, syncEstadoPedidoPorViajes, recalcularTotalViaje } from "@/lib/pedidos";

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

    // Restaurar stock si hay unidades alistadas
    const { data: unidades } = await supabase
      .from("viaje_producto_unicos")
      .select("producto_unico_id, detalle_pedido_id")
      .eq("viaje_id", id);

    if ((unidades?.length ?? 0) > 0) {
      const vpuIds = unidades!.map((u) => u.producto_unico_id);
      await supabase
        .from("productos_unicos")
        .update({ estado: "en_almacen", fecha_salida: null })
        .in("id", vpuIds);
      await supabase.from("viaje_producto_unicos").delete().eq("viaje_id", id);

      const { data: unicosInfo } = await supabase
        .from("productos_unicos")
        .select("producto_id, talla_id")
        .in("id", vpuIds);
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
        nota: "Entrada por cancelación de viaje",
      }));
      if (kardex.length > 0) await supabase.from("movimientos_stock").insert(kardex);
    }

    // Desvincular detalles de este viaje
    await supabase
      .from("detalles_pedido")
      .update({ viaje_id: null })
      .eq("viaje_id", id);

    await supabase.from("viajes").update({ estado: "cancelado" }).eq("id", id);

    const nuevoEstadoPedido = await syncEstadoPedidoPorViajes(viaje.pedido_id);
    await supabase.from("pedidos").update({ estado: nuevoEstadoPedido }).eq("id", viaje.pedido_id);

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
    const lineas: {
      producto_id: string;
      talla_stock: string | null;
      talla_vendida: string | null;
      cantidad: number;
      precio_unitario?: number;
      entalle?: boolean;
      genero?: string;
      es_extra_motorizado?: boolean;
    }[] = body.lineas;

    if (viaje.estado === "programado") {
      // Reemplazo total: verificar que no haya VPU escaneados
      const { data: existentes } = await supabase
        .from("viaje_producto_unicos")
        .select("id")
        .eq("viaje_id", id)
        .limit(1);
      if ((existentes?.length ?? 0) > 0) {
        return Response.json({ error: "Ya hay productos alistados en este viaje. Quita los productos alistados primero." }, { status: 400 });
      }

      // Eliminar detalles anteriores
      await supabase.from("detalles_pedido").delete().eq("viaje_id", id);

      if (lineas.length > 0) {
        const detalles = lineas.map((l) => ({
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
    } else if (viaje.estado === "alistado") {
      // Alistado: solo AGREGAR productos nuevos (los existentes con VPU escaneado se mantienen)
      if (lineas.length > 0) {
        const detalles = lineas.map((l) => ({
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

    await recalcularTotalViaje(id, viaje.tipo, viaje.costo_envio);
  }

  // ── Modificar productos de recojo (agregar/quitar detalles) ──
  if (body.recojo_lineas !== undefined && viaje.tipo === "recojo") {
    if (viaje.estado === "alistado" || viaje.estado === "enviado" || viaje.estado === "terminado") {
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

    // Eliminar detalles actuales que ya no están seleccionados
    const aEliminar = (actuales ?? [])
      .filter((d: any) => !seleccionIds.has(d.devolucion_de))
      .map((d: any) => d.id);
    if (aEliminar.length > 0) {
      await supabase.from("detalles_pedido").delete().in("id", aEliminar);
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
      }
    }

    await recalcularTotalViaje(id, viaje.tipo, 0);
  }

  const { data: viajeFinal } = await supabase.from("viajes").select("*").eq("id", id).single();
  return Response.json({ viaje: viajeFinal });
}
