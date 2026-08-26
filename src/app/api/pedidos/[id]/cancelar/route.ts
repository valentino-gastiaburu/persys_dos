import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

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
      .select("id, estado")
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
    let unidadesAlistadas: { producto_unico_id: string }[] = [];
    if (viajeIds.length > 0) {
      const { data: vpus } = await supabase
        .from("viaje_producto_unicos")
        .select("producto_unico_id")
        .in("viaje_id", viajeIds);
      unidadesAlistadas = vpus ?? [];
    }

    // 5. Devolver unidades al stock y marcar VPUs como devueltos
    if (unidadesAlistadas.length > 0) {
      const updates = unidadesAlistadas.map((vpu) =>
        supabase
          .from("productos_unicos")
          .update({ estado: "en_almacen" })
          .eq("id", vpu.producto_unico_id)
      );
      await Promise.all(updates);

      // Marcar VPUs como devueltos para que no aparezcan en "Pendientes a regresar"
      const viajeIdsSet = new Set(viajeIds);
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