import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import type { NextRequest } from "next/server";

type UnidadRow = {
  id: string;
  codigo_qr: string;
  estado: string;
  talla_id: string | null;
  talla_original: string | null;
  fecha_ingreso: string | null;
  fecha_salida: string | null;
  tallas: { nombre: string } | null;
  talla_original_tallas: { nombre: string } | null;
};

// GET /api/historial/productos/[productoId]?talla_id=
// Historial por IMEI + talla: stock actual por talla, unidades con su
// ubicación/estado, movimientos de stock (kardex) y entalles que tocaron la talla.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productoId: string }> }
) {
  const { user, error } = await requireRoles(["controller", "admin"]);
  if (error) return error;
  void user;

  const { productoId } = await params;
  const tallaId = request.nextUrl.searchParams.get("talla_id");

  const supabase = getSupabase();

  const { data: producto, error: errP } = await supabase
    .from("productos")
    .select("id, imei, nombre, tipo_talla")
    .eq("id", productoId)
    .maybeSingle();
  if (errP || !producto) {
    return Response.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  // Tallas del producto
  const { data: tallasData } = await supabase
    .from("producto_tallas")
    .select("talla_id, tallas(nombre)")
    .eq("producto_id", productoId);

  const { data: unidadesData } = await supabase
    .from("productos_unicos")
    .select(`
      id, codigo_qr, estado, talla_id, talla_original, fecha_ingreso, fecha_salida,
      tallas!productos_unicos_talla_id_fkey(nombre),
      talla_original_tallas: tallas!productos_unicos_talla_original_fkey(nombre)
    `)
    .eq("producto_id", productoId)
    .neq("estado", "eliminado")
    .order("fecha_ingreso", { ascending: false });
  const unidades = (unidadesData ?? []) as unknown as UnidadRow[];
  const unidadIds = unidades.map((u) => u.id);

  // Ubicación/reserva actual de cada unidad (viaje/pedido, primer VPU no devuelto)
  const ubicacionMap = new Map<
    string,
    { viaje_codigo: string; viaje_tipo: string; pedido_codigo: string }
  >();
  if (unidadIds.length > 0) {
    const { data: vpus } = await supabase
      .from("viaje_producto_unicos")
      .select(`
        producto_unico_id, estado,
        viajes!viaje_producto_unicos_viaje_id_fkey(codigo, tipo, estado, pedidos!viajes_pedido_id_fkey(codigo))
      `)
      .in("producto_unico_id", unidadIds)
      .neq("estado", "devuelto")
      .order("fecha_alistado", { ascending: false });
    for (const v of (vpus ?? []) as any[]) {
      const key = v.producto_unico_id as string;
      if (ubicacionMap.has(key)) continue;
      const viaje = v.viajes as unknown as {
        codigo: string;
        tipo: string;
        estado: string;
        pedidos: { codigo: string } | null;
      } | null;
      if (!viaje) continue;
      ubicacionMap.set(key, {
        viaje_codigo: viaje.codigo,
        viaje_tipo: viaje.tipo,
        pedido_codigo: viaje.pedidos?.codigo ?? "—",
      });
    }
  }

  // Kardex: movimientos de stock del producto (todas las tallas)
  let qMov = supabase
    .from("movimientos_stock")
    .select("*, tallas(nombre), usuarios(id, dni, nombre, rol)")
    .eq("producto_id", productoId)
    .order("fecha", { ascending: false })
    .limit(500);
  if (tallaId) qMov = qMov.eq("talla_id", tallaId);
  const { data: movimientosData } = await qMov;

  // Entalles de unidades de este producto (los que tocan la talla consultada)
  let entalles: any[] = [];
  if (unidadIds.length > 0) {
    let qEnt = supabase
      .from("historial_producto_unicos")
      .select(`
        id, producto_unico_id, fecha, nota, talla_anterior, talla_nueva,
        productos_unicos(codigo_qr),
        usuarios(id, dni, nombre, rol),
        talla_antes: tallas!historial_producto_unicos_talla_anterior_fkey(nombre),
        talla_ahora: tallas!historial_producto_unicos_talla_nueva_fkey(nombre)
      `)
      .in("producto_unico_id", unidadIds)
      .eq("evento", "entallado")
      .order("fecha", { ascending: false })
      .limit(500);
    if (tallaId) qEnt = qEnt.or(`talla_anterior.eq.${tallaId},talla_nueva.eq.${tallaId}`);
    const { data: d } = await qEnt;
    entalles = d ?? [];
  }

  // Historial de ediciones del IMEI (producto)
  const { data: edicionesData } = await supabase
    .from("historial_productos")
    .select("*")
    .eq("producto_id", productoId)
    .order("fecha", { ascending: false })
    .limit(20);

  // Stock actual por talla (conteo por estado)
  const ordenEstados = ["en_almacen", "almacen_espera", "en_viaje", "entregado", "devuelto"];
  const tallas = (tallasData ?? []).map((t: any) => {
    const tid: string = t.talla_id;
    const conteo: Record<string, number> = {};
    for (const e of ordenEstados) conteo[e] = 0;
    conteo.total = 0;
    for (const u of unidades) {
      if (u.talla_id !== tid) continue;
      conteo.total += 1;
      if (conteo[u.estado] !== undefined) conteo[u.estado] += 1;
    }
    return {
      id: tid,
      nombre: (t.tallas as unknown as { nombre: string } | null)?.nombre ?? "—",
      ...conteo,
    };
  });

  // Unidades (filtradas por talla si se pidió)
  const unidadesFiltro = tallaId ? unidades.filter((u) => u.talla_id === tallaId) : unidades;

  return Response.json({
    producto: {
      id: producto.id,
      imei: producto.imei,
      nombre: producto.nombre,
      tipo_talla: producto.tipo_talla,
    },
    talla_id: tallaId ?? null,
    tallas,
    unidades: unidadesFiltro.map((u) => ({
      id: u.id,
      codigo_qr: u.codigo_qr,
      estado: u.estado,
      talla_id: u.talla_id,
      talla: u.tallas?.nombre ?? "—",
      talla_original: u.talla_original_tallas?.nombre ?? null,
      es_entallada: Boolean(u.talla_original) && u.talla_id !== u.talla_original,
      fecha_ingreso: u.fecha_ingreso,
      fecha_salida: u.fecha_salida,
      ubicacion: ubicacionMap.get(u.id) ?? null,
    })),
    movimientos: (movimientosData ?? []).map((m: any) => ({
      id: m.id,
      tipo: m.tipo,
      cantidad: m.cantidad,
      talla_id: m.talla_id,
      talla: m.tallas?.nombre ?? "—",
      fecha: m.fecha,
      nota: m.nota,
      referencia_tipo: m.referencia_tipo,
      referencia_id: m.referencia_id,
      persona: m.usuarios?.nombre ?? null,
    })),
    entalles: entalles.map((e: any) => ({
      id: e.id,
      producto_unico_id: e.producto_unico_id,
      codigo_qr: e.productos_unicos?.codigo_qr ?? null,
      talla_anterior: e.talla_antes?.nombre ?? null,
      talla_nueva: e.talla_ahora?.nombre ?? null,
      fecha: e.fecha,
      nota: e.nota,
      persona: e.usuarios?.nombre ?? null,
    })),
    ediciones: (edicionesData ?? []).map((e: any) => ({
      id: e.id,
      fecha: e.fecha,
      tipo_evento: e.tipo_evento,
      imei: e.imei,
      nombre: e.nombre,
      campos_editados: e.campos_editados ?? [],
    })),
  });
}