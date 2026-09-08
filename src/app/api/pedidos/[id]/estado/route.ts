import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { registrarAuditoria } from "@/lib/auditoria";
import { registrarHistorialPedido, tienePendientesRetiro } from "@/lib/pedidos";

// Transiciones manuales de estado del pedido.
const TRANSICIONES: Record<string, string[]> = {
  solicitado: ["confirmado", "cancelado"],
  confirmado: ["solicitado", "cancelado"],
};

// POST /api/pedidos/[id]/estado — { estado: "cancelado" | "solicitado" }
// Cambia el estado manualmente validando la transición.
// Nota: solicitado -> confirmado sigue pasando por /api/pedidos/[id]/confirmar
// (calcula totales, crea el viaje y registra el primer pago).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const nuevoEstado = body.estado;
  if (!nuevoEstado) {
    return Response.json({ error: "Falta el estado destino" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id, estado")
    .eq("id", id)
    .single();
  if (!pedido) return Response.json({ error: "Pedido no encontrado" }, { status: 404 });

  const permitidos = TRANSICIONES[pedido.estado] ?? [];
  if (!permitidos.includes(nuevoEstado)) {
    return Response.json(
      { error: `No se puede pasar de "${pedido.estado}" a "${nuevoEstado}"` },
      { status: 400 }
    );
  }

  // Bloquear si hay productos pendientes de retiro
  const exceso = await tienePendientesRetiro(id);
  if (exceso > 0) {
    return Response.json(
      { error: `No se puede cambiar el estado: hay ${exceso} producto(s) pendiente(s) de retiro` },
      { status: 400 }
    );
  }

  // Si se revierte de confirmado a solicitado, cancelar viajes pendientes y devolver stock
  if (pedido.estado === "confirmado" && nuevoEstado === "solicitado") {
    const { data: viajesPedido } = await supabase
      .from("viajes")
      .select("id, estado")
      .eq("pedido_id", id);

    const viajesACancelar = (viajesPedido ?? []).filter(
      (v) => v.estado !== "terminado" && v.estado !== "enviado"
    );

    const viajeIds = viajesACancelar.map((v) => v.id);

    // Devolver VPU al stock y marcar los VPU como devueltos.
    // Marcarlos como devueltos evita que queden colgando como "pendiente de
    // regresar al stock" (residuo), ya que el producto físico ya volvió.
    if (viajeIds.length > 0) {
      const { data: vpus } = await supabase
        .from("viaje_producto_unicos")
        .select("producto_unico_id")
        .in("viaje_id", viajeIds);

      if (vpus && vpus.length > 0) {
        for (const vpu of vpus) {
          await supabase
            .from("productos_unicos")
            .update({ estado: "en_almacen", fecha_salida: null })
            .eq("id", vpu.producto_unico_id);
        }
        await supabase
          .from("viaje_producto_unicos")
          .update({ estado: "devuelto" })
          .in("viaje_id", viajeIds);
      }
    }

    // Cancelar los viajes
    for (const v of viajesACancelar) {
      await supabase.from("viajes").update({ estado: "cancelado" }).eq("id", v.id);
    }

    // Desvincular detalles del viaje
    await supabase
      .from("detalles_pedido")
      .update({ viaje_id: null })
      .eq("pedido_id", id)
      .in("viaje_id", viajeIds);
  }

  const { data: actualizado, error: err } = await supabase
    .from("pedidos")
    .update({ estado: nuevoEstado })
    .eq("id", id)
    .select()
    .single();

  if (err || !actualizado) {
    return Response.json({ error: "No se pudo actualizar el estado" }, { status: 500 });
  }

  await registrarHistorialPedido({
    pedido_id: id,
    estado_anterior: pedido.estado,
    estado_nuevo: nuevoEstado,
    persona_id: user.id,
    motivo: "Cambio de estado manual",
  });
  await registrarAuditoria({
    user,
    entidad: "pedido",
    entidad_id: id,
    entidad_ref: actualizado.codigo,
    accion: "cambiar_estado",
    campo: "estado",
    valor_anterior: pedido.estado,
    valor_nuevo: nuevoEstado,
    nota: "Cambio de estado manual",
  });

  return Response.json({ pedido: actualizado });
}
