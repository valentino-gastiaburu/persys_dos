import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { registrarAuditoria } from "@/lib/auditoria";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireRoles(["controller", "admin"]);
    if (error) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { id } = await params;
    const supabase = getSupabase();

    // 1. Obtener el pedido actual
    const { data: pedido, error: pedErr } = await supabase
      .from("pedidos")
      .select("id, estado, codigo")
      .eq("id", id)
      .single();

    if (pedErr || !pedido) {
      return new Response(JSON.stringify({ error: "Pedido no encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Si el pedido ya está cancelado, no hacer nada
    if (pedido.estado === "cancelado") {
      return new Response(
        JSON.stringify({ mensaje: "Pedido ya cancelado" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 3. Obtener viajes del pedido
    const { data: viajes } = await supabase
      .from("viajes")
      .select("id, estado")
      .eq("pedido_id", id);

    // 4. Obtener unidades alistadas en esos viajes
    const viajeIds = (viajes ?? []).map((v) => v.id);
    let vpusPedido: {
      producto_unico_id: string;
      estado: string;
      productos_unicos: { producto_id: string; talla_id: string }[] | null;
    }[] = [];
    if (viajeIds.length > 0) {
      const { data: vpus } = await supabase
        .from("viaje_producto_unicos")
        .select("producto_unico_id, estado, productos_unicos(producto_id, talla_id)")
        .in("viaje_id", viajeIds);
      vpusPedido = (vpus ?? []) as typeof vpusPedido;
    }

    // 5. Devolver unidades al stock y marcar VPUs como devueltos
    const unidadesADevolver = vpusPedido.filter((v) => v.estado !== "devuelto");
    if (unidadesADevolver.length > 0) {
      const updates = unidadesADevolver.map((vpu) =>
        supabase
          .from("productos_unicos")
          .update({ estado: "en_almacen" })
          .eq("id", vpu.producto_unico_id)
      );
      await Promise.all(updates);

      // Kardex: entrada al stock por cada unidad devuelta al cancelar el pedido
      const kardex = unidadesADevolver.flatMap((v) => v.productos_unicos ?? []);
      if (kardex.length > 0) {
        await supabase.from("movimientos_stock").insert(
          kardex.map((u) => ({
            tipo: "entrada" as const,
            producto_id: u.producto_id,
            talla_id: u.talla_id,
            cantidad: 1,
            referencia_tipo: "pedido" as const,
            referencia_id: id,
            persona_id: user.id,
            nota: `Pedido ${pedido.codigo} cancelado — unidad devuelta a stock`,
          }))
        );
      }
    }

    // Marcar VPUs como devueltos para que no aparezcan en "Pendientes a regresar"
    if (viajeIds.length > 0) {
      await supabase
        .from("viaje_producto_unicos")
        .update({ estado: "devuelto" })
        .in("viaje_id", viajeIds)
        .not("estado", "eq", "devuelto");
    }

    // 6. Cancelar los viajes que no estén terminados/entregados
    const viajesACancelar = (viajes ?? []).filter(
      (v) => v.estado !== "terminado" && v.estado !== "entregado"
    );

    for (const v of viajesACancelar) {
      const { error: vErr } = await supabase
        .from("viajes")
        .update({ estado: "cancelado" })
        .eq("id", v.id);
      if (vErr) {
        console.error(`Error cancelando viaje ${v.id}:`, vErr);
      }
    }

    // 7. Actualizar el pedido a 'cancelado'
    const { error: updateErr } = await supabase
      .from("pedidos")
      .update({ estado: "cancelado" })
      .eq("id", id);

    if (updateErr) {
      return Response.json({ error: updateErr.message }, { status: 500 });
    }

    // 8. El trigger 11 (en BD) insertará la inconsistencia correspondiente
    await registrarAuditoria({
      user,
      entidad: "pedido",
      entidad_id: id,
      entidad_ref: pedido.codigo,
      accion: "cancelar",
      campo: "estado",
      valor_anterior: pedido.estado,
      valor_nuevo: "cancelado",
      nota: `Canceló el pedido ${pedido.codigo} y devolvió ${unidadesADevolver.length} unidades a stock`,
    });

    return new Response(
      JSON.stringify({
        mensaje: "Pedido cancelado y stock devuelto correctamente",
        pedidoCancelado: true,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message ?? "Error inesperado" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};