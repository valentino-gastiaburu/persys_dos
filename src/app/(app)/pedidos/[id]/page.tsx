"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button, Input, Select, Badge, Modal, Spinner, ErrorBanner } from "@/components/ui";

const ESTADO_BADGE: Record<string, string> = {
  borrador: "slate",
  solicitado: "amber",
  confirmado: "blue",
  alistado: "purple",
  enviado: "amber",
  entregado: "green",
  esperando_devolucion: "red",
  esperando_cambio: "purple",
  cerrado: "slate",
  cancelado: "red",
  devuelto: "amber",
};

const ESTADO_LABEL: Record<string, string> = {
  borrador: "Borrador",
  solicitado: "Solicitado",
  confirmado: "Confirmado",
  alistado: "Alistado",
  enviado: "Enviado",
  entregado: "Entregado",
  esperando_devolucion: "Esperando devolución",
  esperando_cambio: "Esperando cambio",
  cerrado: "Cerrado",
  cancelado: "Cancelado",
  devuelto: "Devuelto",
};

const VIAJE_ESTADO_LABEL: Record<string, string> = {
  programado: "Programado",
  alistado: "Alistado",
  enviado: "Enviado",
  terminado: "Terminado",
  cancelado: "Cancelado",
};

type Pedido = {
  id: string;
  codigo: string;
  estado: string;
  vendedora_1_id: string | null;
  vendedora_contribuyente_id: string | null;
  vendedora_contribuyente_2_id: string | null;
  agendadora_id: string | null;
  vendedora: { id: string; nombre: string } | null;
  contribuyente: { id: string; nombre: string } | null;
  contribuyente2: { id: string; nombre: string } | null;
  agendadora: { id: string; nombre: string } | null;
  cliente_id: string | null;
  fecha_entrega: string | null;
  tipo_pedido: string | null;
  metodo_entrega: string | null;
  empresa_envio: string | null;
  direccion_entrega: string | null;
  ciudad: string | null;
  canal_venta: string | null;
  costo_envio: number;
  metodo_pago: string | null;
  partes_a_pagar: number;
  monto_primer_pago: number | null;
  fecha_siguiente_pago: string | null;
  observaciones: string | null;
  monto_total: number;
  resumen_productos: string | null;
  regalo: boolean;
  clientes: { nombre: string; apellido: string | null; telefono: string; direccion: string | null } | null;
};
type Detalle = {
  id: string;
  producto_id: string;
  talla: string | null;
  talla_stock: string | null;
  talla_stock_nombre: string | null;
  talla_vendida: string | null;
  talla_vendida_nombre: string | null;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  imei: string;
  producto_nombre: string;
  entalle: boolean;
  es_extra_motorizado: boolean;
};

type Pago = { id: string; monto: number; metodo_pago: string; tipo: string; fecha: string };
type ViajeLinea = {
  id: string;
  imei: string;
  producto_id: string;
  producto_nombre: string;
  talla_stock: string | null;
  talla_stock_nombre: string | null;
  talla_vendida: string | null;
  talla_vendida_nombre: string | null;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  entalle: boolean;
  es_extra_motorizado: boolean;
  estado: string;
  devolucion: boolean;
  genero: string | null;
  devolucion_de: string | null;
  pendiente_retorno?: boolean;
  vpu_count?: number;
};
type Viaje = {
  id: string;
  codigo: string;
  tipo: string;
  motivo_recojo: string | null;
  estado: string;
  fecha: string | null;
  fecha_devolucion: string | null;
  direccion: string | null;
  costo_envio: number;
  total: number;
  creado_el: string | null;
  lineas: ViajeLinea[];
};

export default function PedidoDetallePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [detalles, setDetalles] = useState<Detalle[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [totalPagado, setTotalPagado] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rol, setRol] = useState<string | null>(null);
  const [showPago, setShowPago] = useState(false);
  const [showEditarPedido, setShowEditarPedido] = useState(false);
  const [showEditarProductos, setShowEditarProductos] = useState(false);
  const [showNuevoViajeEntrega, setShowNuevoViajeEntrega] = useState(false);
  const [showViajeRegreso, setShowViajeRegreso] = useState(false);
  const [editarViaje, setEditarViaje] = useState<Viaje | null>(null);
  const [cancelarViajeId, setCancelarViajeId] = useState<string | null>(null);
  const [inconsistencias, setInconsistencias] = useState<any[]>([]);
  const [confirmando, setConfirmando] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);

  useEffect(() => {
    api<{ user: { rol: string } }>("/api/auth/me").then(({ data }) => {
      setRol(data?.user?.rol ?? null);
    });
  }, []);

  const cargar = useCallback(async () => {
    const { data, error } = await api<{
      pedido: Pedido;
      detalles: Detalle[];
      pagos: Pago[];
      viajes: Viaje[];
      total_pagado: number;
      deuda: number;
    }>(`/api/pedidos/${id}`);
    if (error) setError(error);
    else {
      setPedido(data?.pedido ?? null);
      setDetalles(data?.detalles ?? []);
      setPagos(data?.pagos ?? []);
      setViajes(data?.viajes ?? []);
      setTotalPagado(data?.total_pagado ?? 0);

      const viajeIds = (data?.viajes ?? []).map((v: any) => v.id);
      if (viajeIds.length > 0) {
        const { data: incData } = await api<{ inconsistencias: any[] }>("/api/inconsistencias?limit=200");
        const viajeIdsSet = new Set(viajeIds);
        setInconsistencias(
          (incData?.inconsistencias ?? []).filter(
            (i: any) => viajeIdsSet.has(i.entidad_id) && !i.resuelto
          )
        );
      } else {
        setInconsistencias([]);
      }
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (loading) return <Spinner />;
  if (!pedido) return <ErrorBanner message={error ?? "Pedido no encontrado"} />;

  const deuda = Number(pedido.monto_total) - totalPagado;
  const puedeConfirmar = ["borrador", "solicitado"].includes(pedido.estado);
  const puedeCancelar = ["solicitado", "confirmado"].includes(pedido.estado);
  const puedeVolverSolicitado = pedido.estado === "confirmado";
  const tuvoViajes = viajes.length > 0;
  const puedeEditar = !tuvoViajes && ["borrador", "solicitado", "confirmado", "alistado"].includes(pedido.estado);
  const puedeCrearViajes =
    rol != null && ["vendedora", "agendadora", "controller", "admin"].includes(rol);
  const gestionarViajes = !puedeEditar && tuvoViajes && puedeCrearViajes;

  // Viajes ordenados por creado_el descendente (más recientes primero)
  const viajesActivos = viajes
    .filter((v) => v.estado !== "cancelado")
    .sort((a, b) => (b.creado_el ?? "").localeCompare(a.creado_el ?? ""));
  const viajesCancelados = viajes
    .filter((v) => v.estado === "cancelado")
    .sort((a, b) => (b.creado_el ?? "").localeCompare(a.creado_el ?? ""));

  // Detalles que ya fueron enviados al cliente (en viaje de entrega enviado/terminado).
  // Solo estos son elegibles para devolución/cambio.
  const detallesEnviados = (() => {
    const enviados = new Set<string>();
    for (const v of viajes) {
      if (v.tipo !== "entrega") continue;
      if (v.estado !== "enviado" && v.estado !== "terminado") continue;
      for (const l of v.lineas) {
        if (l.estado !== "oculto" && l.estado !== "devuelto") {
          enviados.add(l.id);
        }
      }
    }
    return detalles.filter((d) => enviados.has(d.id));
  })();

  // Estado final de los productos del pedido: lo que sigue en el pedido (activo)
  // más lo que está en devolución. Las líneas ocultas se omiten porque son el
  // espejo "original" de un producto devuelto por completo (ya aparece la línea
  // del viaje de regreso); el historial del viaje de ida se ve en los viajes.
  const lineasFinales = viajes
    .filter((v) => v.estado !== "cancelado")
    .flatMap((v) =>
      v.lineas.map((l) => ({
        ...l,
        viaje_codigo: v.codigo,
        viaje_tipo: v.tipo,
        viaje_estado: v.estado,
      }))
    )
    .filter((l) => l.estado !== "oculto");

  async function confirmar() {
    setConfirmando(true);
    setError(null);
    const { error } = await api(`/api/pedidos/${id}/confirmar`, { method: "POST" });
    if (error) setError(error);
    else await cargar();
    setConfirmando(false);
  }

  async function cambiarEstado(nuevoEstado: string) {
    const aviso =
      nuevoEstado === "cancelado"
        ? "¿Cancelar este pedido?"
        : "¿Volver a Solicitar? (revertir de Confirmado a Solicitado)";
    if (!window.confirm(aviso)) return;
    setCambiandoEstado(true);
    setError(null);
    let url: string;
    let body: any;
    if (nuevoEstado === "cancelado") {
      url = `/api/pedidos/${id}/cancelar`;
      body = {};
    } else {
      url = `/api/pedidos/${id}/estado`;
      body = JSON.stringify({ estado: nuevoEstado });
    }
    const { error } = await api(url, { method: "POST", body });
    if (error) setError(error);
    else await cargar();
    setCambiandoEstado(false);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/pedidos" className="text-sm text-blue-600 hover:underline">
              ← Pedidos
            </Link>
            <span className="text-slate-300">/</span>
            <h1 className="text-2xl font-bold text-slate-800">{pedido.codigo}</h1>
            <Badge color={ESTADO_BADGE[pedido.estado] ?? "slate"}>{ESTADO_LABEL[pedido.estado] ?? pedido.estado}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {pedido.clientes
              ? `${pedido.clientes.nombre} ${pedido.clientes.apellido ?? ""} · ${pedido.clientes.telefono}`
              : "Sin cliente"}
          </p>
        </div>
        {puedeConfirmar && (
          <div className="flex gap-2">
            <Button onClick={confirmar} disabled={confirmando}>
              {confirmando ? "CONFIRMANDO..." : "Confirmar pedido"}
            </Button>
          </div>
        )}
        {puedeCancelar && (
          <div className="flex gap-2">
            {puedeVolverSolicitado && (
              <Button variant="secondary" onClick={() => cambiarEstado("solicitado")} disabled={cambiandoEstado}>
                {cambiandoEstado ? "PROCESANDO..." : "Regresar a 'Solicitado'"}
              </Button>
            )}
            <Button variant="danger" onClick={() => cambiarEstado("cancelado")} disabled={cambiandoEstado}>
              {cambiandoEstado ? "PROCESANDO..." : "Cancelar pedido"}
            </Button>
          </div>
        )}
      </div>
      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="overflow-hidden rounded-xl border border-slate-300 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-blue-50 px-5 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
              <h2 className="flex-1 text-sm font-semibold text-slate-800">Productos</h2>
              {puedeEditar && (
                <Button size="sm" variant="secondary" onClick={() => setShowEditarProductos(true)}>
                  Editar productos
                </Button>
              )}
            </div>
            <div className="p-5">
              {puedeEditar ? (
                detalles.length === 0 ? (
                  <p className="text-sm text-slate-400">Sin productos.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-slate-300 text-sm">
                      <thead>
                        <tr className="border-b border-slate-300 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                          <th className="border-r border-slate-200 px-3 py-2 font-bold">IMEI</th>
                          <th className="border-r border-slate-200 px-3 py-2 font-bold">Producto</th>
                          <th className="border-r border-slate-200 px-3 py-2 font-bold">Talla</th>
                          <th className="border-r border-slate-200 px-3 py-2 text-right font-bold">Cantidad</th>
                          <th className="px-3 py-2 text-right font-bold">Costo total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {detalles.map((d) => (
                          <tr key={d.id}>
                            <td className="border-r border-slate-200 px-3 py-2 font-mono text-xs text-slate-500">{d.imei}</td>
                            <td className="border-r border-slate-200 px-3 py-2 font-medium text-slate-800">
                              {d.producto_nombre}
                              {d.es_extra_motorizado ? " · +motorizado" : ""}
                            </td>
                            <td className="border-r border-slate-200 px-3 py-2 text-slate-600">
                              {d.entalle
                                ? `${d.talla_stock_nombre ?? "—"} → ${d.talla_vendida_nombre ?? "Sin talla"}`
                                : d.talla_vendida_nombre ?? "Sin talla"}
                            </td>
                            <td className="border-r border-slate-200 px-3 py-2 text-right">
                              <span className="text-slate-600">{d.cantidad}</span>
                              <span className="ml-1 text-xs text-slate-400">x S/ {Number(d.precio_unitario).toFixed(2)}</span>
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-800">
                              S/ {Number(d.subtotal).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : lineasFinales.length === 0 ? (
                <p className="text-sm text-slate-400">Sin productos.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-300 text-sm">
                    <thead>
                      <tr className="border-b border-slate-300 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                        <th className="border-r border-slate-200 px-3 py-2 font-bold">IMEI</th>
                        <th className="border-r border-slate-200 px-3 py-2 font-bold">Producto</th>
                        <th className="border-r border-slate-200 px-3 py-2 font-bold">Talla</th>
                        <th className="border-r border-slate-200 px-3 py-2 text-right font-bold">Cantidad</th>
                        <th className="border-r border-slate-200 px-3 py-2 font-bold">Estado</th>
                        <th className="border-r border-slate-200 px-3 py-2 font-bold">Viaje</th>
                        <th className="px-3 py-2 text-right font-bold">Costo total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {lineasFinales.map((l) => (
                        <tr key={l.id}>
                          <td className="border-r border-slate-200 px-3 py-2 font-mono text-xs text-slate-500">{l.imei}</td>
                          <td className="border-r border-slate-200 px-3 py-2 font-medium text-slate-800">
                            {l.producto_nombre}
                            {l.es_extra_motorizado ? " · +motorizado" : ""}
                          </td>
                          <td className="border-r border-slate-200 px-3 py-2 text-slate-600">
                            {l.entalle
                              ? `${l.talla_stock_nombre ?? "—"} → ${l.talla_vendida_nombre ?? "Sin talla"}`
                              : l.talla_vendida_nombre ?? l.talla_stock_nombre ?? "Sin talla"}
                          </td>
                          <td className="border-r border-slate-200 px-3 py-2 text-right">
                            <span className="text-slate-600">{l.cantidad}</span>
                            <span className="ml-1 text-xs text-slate-400">x S/ {Number(l.precio_unitario).toFixed(2)}</span>
                          </td>
                          <td className="border-r border-slate-200 px-3 py-2">
                            {l.estado === "devuelto" ? (
                              <Badge color="green">Devuelto</Badge>
                            ) : l.estado === "pendiente_devolucion" ? (
                              <Badge color="red">Pendiente de devolución</Badge>
                            ) : l.viaje_estado === "alistado" ? (
                              <Badge color="blue">Alistado</Badge>
                            ) : l.viaje_estado === "enviado" ? (
                              <Badge color="amber">Enviado</Badge>
                            ) : (
                              <Badge color="slate">Por alistar</Badge>
                            )}
                          </td>
                          <td className="border-r border-slate-200 px-3 py-2 text-xs text-slate-500">
                            {l.viaje_codigo} · {l.viaje_tipo}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-800">
                            S/ {Number(l.subtotal).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-4 flex justify-between border-t border-slate-300 pt-3 text-sm">
                <span className="text-slate-500">
                  Total {!puedeEditar ? "(entregas − devoluciones)" : "(incluye envío)"}
                </span>
                <span className="font-bold text-slate-800">S/ {Number(pedido.monto_total).toFixed(2)}</span>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <section className="overflow-hidden rounded-xl border border-slate-300 bg-white">
              <div className="flex items-center gap-2 border-b border-slate-200 bg-emerald-50 px-5 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <h2 className="text-sm font-semibold text-slate-800">Pagos</h2>
              </div>
              <div className="p-5">
              {pagos.length === 0 ? (
                <p className="text-sm text-slate-400">Sin pagos registrados.</p>
              ) : (
                <div className="space-y-1">
                  {pagos.map((p) => (
                    <div key={p.id} className="flex items-center justify-between py-1 text-sm">
                      <span className="text-slate-600">
                        {new Date(p.fecha).toLocaleDateString("es-PE")} · {p.metodo_pago}
                        {p.tipo === "primer_pago" ? " (primer pago)" : ""}
                      </span>
                      <span className="font-medium text-emerald-700">S/ {Number(p.monto).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-600">Deuda pendiente</span>
                {deuda > 0 ? (
                  <span className="font-bold text-red-600">S/ {deuda.toFixed(2)}</span>
                ) : (
                  <span className="font-bold text-emerald-600">Pagado</span>
                )}
              </div>
              <Button className="mt-3" size="sm" variant="secondary" onClick={() => setShowPago(true)}>
                + Registrar pago
              </Button>
            </div>
          </section>

          <section
            className={`overflow-hidden rounded-xl border border-slate-300 bg-white ${
              gestionarViajes ? "md:col-span-2" : ""
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-purple-50 px-5 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-purple-500" />
              <h2 className="flex-1 text-sm font-semibold text-slate-800">Viajes</h2>
              {gestionarViajes && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => setShowNuevoViajeEntrega(true)}>
                    + Nuevo viaje de entrega
                  </Button>
                  <Button size="sm" onClick={() => setShowViajeRegreso(true)}>
                    + Viaje de regreso
                  </Button>
                </>
              )}
            </div>
            <div className="p-5">
              {viajes.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Sin viajes {["borrador", "solicitado"].includes(pedido.estado) ? "(confirma el pedido para crear el primer viaje)" : ""}.
                </p>
              ) : gestionarViajes ? (
                <div className="space-y-4">
                  {viajesActivos.map((v) => (
                    <ViajeCard
                      key={v.id}
                      viaje={v}
                      inconsistencias={inconsistencias.filter((i) => i.entidad_id === v.id)}
                      onEdit={(vj) => setEditarViaje(vj)}
                      onCancel={(vj) => setCancelarViajeId(vj.id)}
                    />
                  ))}
                  {viajesCancelados.length > 0 && (
                    <div className="mt-2 border-t border-slate-200 pt-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Cancelados</p>
                      {viajesCancelados.map((v) => (
                        <div
                          key={v.id}
                          className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-400 opacity-60"
                        >
                          <span className="line-through">{v.codigo}</span>
                          <span>{v.tipo}</span>
                          <Badge color="red">Cancelado</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap justify-end gap-4 rounded-lg bg-slate-50 px-4 py-3 text-sm">
                    <span className="text-slate-500">
                      Total entregas <span className="font-semibold text-emerald-700">S/ {viajesTotal(viajes).toFixed(2)}</span>
                    </span>
                    <span className="text-slate-500">
                      Devoluciones <span className="font-semibold text-red-600">− S/ {viajesDevoluciones(viajes).toFixed(2)}</span>
                    </span>
                    <span className="text-slate-500">
                      Total pedido <span className="font-bold text-slate-800">S/ {Number(pedido.monto_total).toFixed(2)}</span>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {[...viajesActivos, ...viajesCancelados].map((v) => {
                    const esCancelado = v.estado === "cancelado";
                    return (
                      <Link
                        key={v.id}
                        href={`/almacen/${v.id}`}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-slate-50 ${
                          esCancelado ? "border-slate-100 bg-slate-50 opacity-50 py-1" : "border-slate-200"
                        }`}
                      >
                        <div>
                          <p className={`text-sm ${esCancelado ? "line-through text-slate-400" : "font-medium"}`}>
                            {v.codigo} · {v.tipo}
                          </p>
                          {!esCancelado && (
                            <p className="text-xs text-slate-400">
                              {v.fecha ? new Date(v.fecha + "T00:00:00").toLocaleDateString("es-PE") : "Sin fecha"}
                            </p>
                          )}
                        </div>
                        <Badge color={ESTADO_BADGE[v.estado] ?? "slate"}>{v.estado}</Badge>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
          </div>
        </div>

        <section className="h-fit overflow-hidden rounded-xl border border-slate-300 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-amber-50 px-5 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <h2 className="flex-1 text-sm font-semibold text-slate-800">Detalles del pedido</h2>
            {puedeEditar && (
              <Button size="sm" variant="secondary" onClick={() => setShowEditarPedido(true)}>
                Editar
              </Button>
            )}
          </div>
          <div className="p-5">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Vendedora</dt><dd>{pedido.vendedora?.nombre ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Colaboró 1</dt><dd>{pedido.contribuyente?.nombre ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Colaboró 2</dt><dd>{pedido.contribuyente2?.nombre ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Agendadora</dt><dd>{pedido.agendadora?.nombre ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Entrega</dt><dd>{pedido.fecha_entrega ? new Date(pedido.fecha_entrega + "T00:00:00").toLocaleDateString("es-PE") : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Tipo</dt><dd className="capitalize">{pedido.tipo_pedido ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Método</dt><dd className="capitalize">{pedido.metodo_entrega ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Envío</dt><dd className="capitalize">{pedido.empresa_envio ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Canal</dt><dd className="capitalize">{pedido.canal_venta ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Pago</dt><dd className="capitalize">{pedido.metodo_pago ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Partes</dt><dd>{pedido.partes_a_pagar}</dd></div>
            </dl>
            {pedido.direccion_entrega && (
              <p className="mt-3 text-xs text-slate-500">Dirección: {pedido.direccion_entrega}</p>
            )}
            {pedido.observaciones && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {pedido.observaciones}
              </p>
            )}
          </div>
        </section>
      </div>

      {showPago && (
        <PagoModal
          pedidoId={id}
          deuda={deuda}
          onClose={() => setShowPago(false)}
          onDone={() => {
            setShowPago(false);
            cargar();
          }}
        />
      )}
      {showEditarPedido && (
        <EditarPedidoModal
          pedidoId={id}
          pedido={pedido}
          deuda={deuda}
          onClose={() => setShowEditarPedido(false)}
          onDone={() => {
            setShowEditarPedido(false);
            cargar();
          }}
        />
      )}
      {showEditarProductos && (
        <EditarProductosModal
          pedidoId={id}
          detalles={detalles}
          onClose={() => {
            setShowEditarProductos(false);
            cargar();
          }}
        />
      )}
      {showNuevoViajeEntrega && (
        <NuevoViajeEntregaModal
          pedidoId={id}
          pedido={pedido}
          onClose={() => setShowNuevoViajeEntrega(false)}
          onDone={() => {
            setShowNuevoViajeEntrega(false);
            cargar();
          }}
        />
      )}
      {showViajeRegreso && (
        <ViajeRegresoModal
          pedidoId={id}
          detalles={detallesEnviados}
          onClose={() => setShowViajeRegreso(false)}
          onDone={() => {
            setShowViajeRegreso(false);
            cargar();
          }}
        />
      )}
      {editarViaje && (
        <EditarViajeModal
          viaje={editarViaje}
          pedidoId={id}
          viajes={viajes}
          detallesEnviados={detallesEnviados}
          onClose={() => setEditarViaje(null)}
          onDone={() => {
            setEditarViaje(null);
            cargar();
          }}
        />
      )}
      {cancelarViajeId && (
        <CancelarViajeModal
          viajeId={cancelarViajeId}
          onClose={() => setCancelarViajeId(null)}
          onDone={() => {
            setCancelarViajeId(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function CancelarViajeModal({
  viajeId,
  onClose,
  onDone,
}: {
  viajeId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancelar() {
    setLoading(true);
    const { error: e } = await api(`/api/viajes/${viajeId}`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "cancelado" }),
    });
    setLoading(false);
    if (e) setError(e);
    else onDone();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Cancelar viaje"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Volver</Button>
          <Button variant="danger" onClick={cancelar} disabled={loading}>
            {loading ? "Cancelando..." : "Sí, cancelar viaje"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        Se cancelará el viaje. Si ya hay productos alistados, volverán al stock del almacén.
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}

function EditarViajeModal({
  viaje,
  pedidoId,
  viajes,
  detallesEnviados,
  onClose,
  onDone,
}: {
  viaje: Viaje;
  pedidoId: string;
  viajes: Viaje[];
  detallesEnviados: Detalle[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [fecha, setFecha] = useState(viaje.fecha ?? new Date().toISOString().slice(0, 10));
  const [direccion, setDireccion] = useState(viaje.direccion ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const esProgramado = viaje.estado === "programado";
  const esRecojo = viaje.tipo === "recojo";
  const puedeEditarProductos = esRecojo || viaje.tipo === "entrega";
  const [productos, setProductos] = useState<{ id: string; imei: string; nombre: string }[]>([]);
  const [tallasPorProducto, setTallasPorProducto] = useState<
    Record<string, { id: string; nombre: string; cantidad_ventas: number }[]>
  >({});
  const [productoId, setProductoId] = useState("");
  const [tallaStock, setTallaStock] = useState("");
  const [entalle, setEntalle] = useState(false);
  const [tallaVendida, setTallaVendida] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [precio, setPrecio] = useState("");
  const [genero, setGenero] = useState("dama");
  const [lineas, setLineas] = useState<LineaViajeNueva[]>([]);
  const [nuevoN, setNuevoN] = useState(0);
  const [vpuPorDetalle, setVpuPorDetalle] = useState<Record<string, number>>({});

  useEffect(() => {
    if (viaje.tipo === "entrega") {
      api<{ productos: { id: string; imei: string; nombre: string }[] }>("/api/productos").then(
        ({ data }) => setProductos(data?.productos ?? [])
      );
      // Fetch VPU counts per detail for this viaje
      api<{ items: { detalle_id: string; alistados: number }[] }>(`/api/viajes/${viaje.id}`).then(
        ({ data }) => {
          const map: Record<string, number> = {};
          for (const item of data?.items ?? []) {
            map[item.detalle_id] = item.alistados;
          }
          setVpuPorDetalle(map);
        }
      );
      setLineas(
        viaje.lineas.map((l, i) => ({
          key: `existente-${i}`,
          imei: l.imei,
          nombre: l.producto_nombre,
          talla_stock: l.talla_stock,
          talla_stock_nombre: l.talla_stock_nombre,
          talla_vendida: l.talla_vendida,
          talla_vendida_nombre: l.talla_vendida_nombre,
          producto_id: l.producto_id,
          cantidad: l.cantidad,
          precio: Number(l.precio_unitario ?? 0),
          entalle: l.entalle,
          genero: l.genero ?? "dama",
          es_extra_motorizado: l.es_extra_motorizado ?? false,
          vpu_count: l.vpu_count ?? 0,
          pendiente_retorno: l.pendiente_retorno ?? false,
          vpu_a_restar: 0,
          detalle_id: l.id,
        }))
      );
    } else if (viaje.tipo === "recojo") {
      setLineas(
        viaje.lineas.map((l) => ({
          key: `recojo-${l.devolucion_de ?? l.id}`,
          imei: l.imei,
          nombre: l.producto_nombre,
          talla_stock: l.talla_stock,
          talla_stock_nombre: l.talla_stock_nombre,
          talla_vendida: l.talla_vendida,
          talla_vendida_nombre: l.talla_vendida_nombre,
          producto_id: l.producto_id,
          cantidad: l.cantidad,
          precio: Number(l.precio_unitario ?? 0),
          entalle: l.entalle,
          genero: l.genero ?? "dama",
          es_extra_motorizado: l.es_extra_motorizado ?? false,
          vpu_count: 0,
          pendiente_retorno: false,
          vpu_a_restar: 0,
        }))
      );
    }
  }, [viaje.tipo, viaje.lineas, viaje.id]);

  function cargarTallas(pid: string) {
    api<{ tallas: { id: string; nombre: string; cantidad_ventas: number }[] }>(
      "/api/tallas?producto_id=" + pid
    ).then(({ data }) => {
      const ts = data?.tallas ?? [];
      setTallasPorProducto((prev) => ({ ...prev, [pid]: ts }));
    });
  }

  useEffect(() => {
    if (productoId) {
      setTallaStock("");
      setEntalle(false);
      setTallaVendida("");
      cargarTallas(productoId);
    }
  }, [productoId]);

  const dispLocal = (pid: string, tid: string) => {
    const t = (tallasPorProducto[pid] ?? []).find((x) => x.id === tid);
    const base = t?.cantidad_ventas ?? 0;
    const yaSumado = lineas
      .filter((l) => l.producto_id === pid && (l.talla_stock ?? l.talla_vendida) === tid)
      .reduce((a, l) => a + l.cantidad, 0);
    return base - yaSumado;
  };

  function agregar() {
    setError(null);
    if (!productoId) return;
    const p = productos.find((x) => x.id === productoId);
    const cant = Number(cantidad);
    if (!p || !cant || cant <= 0) {
      setError("Indica una cantidad válida");
      return;
    }
    const stockId = tallaStock || null;
    const vendidaId = entalle ? tallaVendida || tallaStock : tallaStock;
    if (stockId && dispLocal(productoId, stockId) < cant) {
      setError(`Stock insuficiente: solo hay ${dispLocal(productoId, stockId)} disponible en esa talla`);
      return;
    }
    const tallas = tallasPorProducto[productoId] ?? [];
    const stockSel = tallas.find((t) => t.id === stockId);
    const vendidaSel = tallas.find((t) => t.id === vendidaId);
    setNuevoN((n) => n + 1);
    setLineas((prev) => [
      ...prev,
      {
        key: `nuevo-${nuevoN}`,
        imei: p.imei,
        nombre: p.nombre,
        talla_stock: stockId,
        talla_stock_nombre: stockSel?.nombre ?? null,
        talla_vendida: vendidaId || null,
        talla_vendida_nombre: vendidaSel?.nombre ?? null,
        producto_id: p.id,
        cantidad: cant,
        precio: Number(precio || 0),
        entalle: Boolean(stockId && vendidaId && stockId !== vendidaId),
        genero,
        es_extra_motorizado: false,
        vpu_count: 0,
        pendiente_retorno: false,
        vpu_a_restar: 0,
      },
    ]);
    setProductoId("");
    setTallaStock("");
    setEntalle(false);
    setTallaVendida("");
    setCantidad("1");
    setPrecio("");
  }

  function quitar(key: string) {
    const linea = lineas.find((l) => l.key === key);
    if (linea && linea.pendiente_retorno) {
      const vpuCount = (linea.vpu_count || vpuPorDetalle[linea.detalle_id ?? ""]) ?? 0;
      setLineas((prev) =>
        prev.map((l) =>
          l.key === key ? { ...l, pendiente_retorno: false, cantidad: vpuCount || l.cantidad || 1, vpu_a_restar: 0 } : l
        )
      );
      return;
    }
    if (linea && !linea.pendiente_retorno) {
      const vpuCount = (linea.vpu_count || vpuPorDetalle[linea.detalle_id ?? ""]) ?? 0;
      if (vpuCount > 0) {
        setLineas((prev) =>
          prev.map((l) =>
            l.key === key ? { ...l, pendiente_retorno: true, cantidad: 0, vpu_count: vpuCount, vpu_a_restar: 0 } : l
          )
        );
        return;
      }
    }
    setLineas((prev) => prev.filter((l) => l.key !== key));
  }

  function manejarCambioCantidad(key: string, nuevaCant: number) {
    setLineas((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const vpuCount = (l.vpu_count || vpuPorDetalle[l.detalle_id ?? ""]) ?? 0;
        const capped = vpuCount > 0 ? Math.min(nuevaCant, vpuCount) : Math.max(0, nuevaCant);
        return { ...l, cantidad: capped, vpu_a_restar: vpuCount > 0 ? vpuCount - capped : 0, pendiente_retorno: false };
      })
    );
  }

  async function guardar() {
    setError(null);
    if (!fecha) {
      setError("Indica la fecha del viaje");
      return;
    }
    setLoading(true);
    const body: Record<string, any> = { fecha, direccion: direccion || null };

    if (esRecojo) {
      const seleccionados = lineas
        .filter((l) => l.key.startsWith("recojo-"))
        .map((l) => ({ detalle_id: l.key.replace("recojo-", ""), cantidad: l.cantidad, precio_devolucion: l.precio }));
      if (seleccionados.length === 0) {
        setShowCancelarDialog(true);
        setLoading(false);
        return;
      }
      body.recojo_lineas = seleccionados;
    } else if (viaje.tipo === "entrega") {
      const normales = lineas.filter((l) => !l.pendiente_retorno);
      const marcadas = lineas.filter((l) => l.pendiente_retorno && l.detalle_id);
      if (normales.length === 0 && marcadas.length === 0) {
        setError("Agrega al menos un producto al viaje");
        setLoading(false);
        return;
      }
      if (normales.length > 0) {
        body.lineas = normales.map((l) => ({
          detalle_id: l.detalle_id || undefined,
          producto_id: l.producto_id,
          talla_stock: l.talla_stock,
          talla_vendida: l.entalle ? l.talla_vendida : l.talla_stock,
          entalle: l.entalle,
          cantidad: l.cantidad,
          precio_unitario: l.precio,
          genero: l.genero,
          es_extra_motorizado: l.es_extra_motorizado,
        }));
      }
      if (marcadas.length > 0) {
        body.detalles_a_desvincular = marcadas.map((l) => l.detalle_id!);
      }
      const conResta = normales.filter((l) => (l.vpu_a_restar ?? 0) > 0 && l.detalle_id);
      if (conResta.length > 0) {
        body.vpus_a_restar = Object.fromEntries(
          conResta.map((l) => [l.detalle_id!, l.vpu_a_restar!])
        );
      }
    }

    const { error: e } = await api(`/api/viajes/${viaje.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (e) setError(e);
    else onDone();
  }

  const tallas = tallasPorProducto[productoId] ?? [];
  const [showCancelarDialog, setShowCancelarDialog] = useState(false);

  const detallesDisponiblesRecojo = useMemo(() => {
    if (!esRecojo) return [];
    // Construir pool desde viaje.lineas de viajes de entrega enviados/terminados
    const pool: ViajeLinea[] = [];
    for (const v of viajes) {
      if (v.tipo !== "entrega") continue;
      if (v.estado !== "enviado" && v.estado !== "terminado") continue;
      pool.push(...v.lineas);
    }
    const origIdsSeleccionados = new Set(
      lineas.filter((l) => l.key.startsWith("recojo-")).map((l) => l.key.replace("recojo-", ""))
    );
    return pool.filter((d) => !origIdsSeleccionados.has(d.id));
  }, [esRecojo, lineas, viajes]);

  function toggleRecojo(det: ViajeLinea) {
    const key = `recojo-${det.id}`;
    setLineas((prev) => {
      const exists = prev.some((l) => l.key === key);
      if (exists) return prev.filter((l) => l.key !== key);
      return [
        ...prev,
        {
          key,
          imei: det.imei,
          nombre: det.producto_nombre,
          talla_stock: det.talla_stock,
          talla_stock_nombre: det.talla_stock_nombre,
          talla_vendida: det.talla_vendida,
          talla_vendida_nombre: det.talla_vendida_nombre,
          producto_id: det.producto_id,
          cantidad: det.cantidad,
          precio: Number(det.precio_unitario ?? 0),
          entalle: det.entalle,
          genero: det.genero ?? "dama",
          es_extra_motorizado: det.es_extra_motorizado ?? false,
          vpu_count: 0,
          pendiente_retorno: false,
          vpu_a_restar: 0,
        },
      ];
    });
  }

  async function cancelarViaje() {
    setLoading(true);
    const { error: e } = await api(`/api/viajes/${viaje.id}`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "cancelado" }),
    });
    setLoading(false);
    if (e) setError(e);
    else onDone();
  }

  return (
    <>
    <Modal
      open
      onClose={onClose}
      title={`Editar viaje ${viaje.codigo}`}
      xwide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={loading}>
            {loading ? "Guardando..." : "Guardar cambios"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input label="Fecha del viaje" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <Input label="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        </div>

        {viaje.tipo === "entrega" && (
          <>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                Agregar producto
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                <Select label="Producto" value={productoId} onChange={(e) => setProductoId(e.target.value)} className="md:col-span-12">
                  <option value="">Selecciona...</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre} ({p.imei})</option>
                  ))}
                </Select>
                <Select label="Talla" value={tallaStock} onChange={(e) => { setTallaStock(e.target.value); setTallaVendida(e.target.value); }} className="md:col-span-3">
                  <option value="">Sin talla</option>
                  {tallas.filter((t) => dispLocal(productoId, t.id) > 0).length > 0 ? (
                    tallas
                      .filter((t) => dispLocal(productoId, t.id) > 0)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nombre} ({dispLocal(productoId, t.id)} disp.)
                        </option>
                      ))
                  ) : (
                    <option value="" disabled>Sin stock</option>
                  )}
                </Select>
                <div className="flex items-end gap-2 md:col-span-3">
                  <label className="flex items-center gap-1 text-xs text-slate-500">
                    <input type="checkbox" checked={entalle} onChange={(e) => setEntalle(e.target.checked)} />
                    Entalle
                  </label>
                  {entalle && (
                    <Select label="" value={tallaVendida} onChange={(e) => setTallaVendida(e.target.value)} className="w-full">
                      <option value="">Destino...</option>
                      {tallas.map((t) => (
                        <option key={t.id} value={t.id}>{t.nombre}</option>
                      ))}
                    </Select>
                  )}
                </div>
                <Input label="Cantidad" type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="md:col-span-2" />
                <Input label="Precio (S/)" type="number" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} className="md:col-span-2" />
                <Select label="Género" value={genero} onChange={(e) => setGenero(e.target.value)} className="md:col-span-2">
                  <option value="dama">Dama</option>
                  <option value="varon">Varón</option>
                  <option value="unisex">Unisex</option>
                </Select>
                <div className="flex items-end md:col-span-1">
                  <Button size="sm" onClick={agregar} className="w-full">+</Button>
                </div>
              </div>
            </div>

            {(() => {
              const normales = lineas.filter((l) => !l.pendiente_retorno);
              const marcadas = lineas.filter((l) => l.pendiente_retorno);
              return (
                <>
                  {normales.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-slate-400">
                        {esProgramado ? "Productos del viaje:" : "Productos actuales del viaje (solo lectura):"}
                      </p>
                      {normales.map((l) => {
                        const vpuCount = (l.vpu_count || vpuPorDetalle[l.detalle_id ?? ""]) ?? 0;
                        return (
                          <div key={l.key} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="font-medium">{l.nombre}</span>
                              <span className="ml-1 text-xs text-slate-400">({l.imei})</span>
                              <span className="ml-2 text-xs text-slate-500">
                                {l.entalle
                                  ? `${l.talla_stock_nombre ?? "—"} → ${l.talla_vendida_nombre ?? "—"}`
                                  : l.talla_stock_nombre ?? "Sin talla"}{" "}
                                · x
                              </span>
                              {vpuCount > 0 && viaje.estado === "alistado" ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={vpuCount}
                                  value={l.cantidad}
                                  onChange={(e) => manejarCambioCantidad(l.key, parseInt(e.target.value) || 0)}
                                  className="w-14 text-center text-xs border border-blue-200 rounded px-1 py-0.5"
                                />
                              ) : (
                                <span className="text-xs text-slate-500">{l.cantidad}</span>
                              )}
                              {vpuCount > 0 && (
                                <span className="ml-1 inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                                  {vpuCount} ali{l.vpu_count !== 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">S/ {(l.cantidad * l.precio).toFixed(2)}</span>
                              <button onClick={() => quitar(l.key)} className="text-red-400 hover:text-red-600">✕</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {marcadas.length > 0 && (
                    <div className="space-y-1 rounded-lg border-2 border-red-300 bg-red-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
                        Productos a devolver al stock
                      </p>
                      <p className="text-[11px] text-red-500">
                        Almacén deberá retirar estos productos y devolverlos al stock.
                      </p>
                      {marcadas.map((l) => {
                        const vpuCount = (l.vpu_count || vpuPorDetalle[l.detalle_id ?? ""]) ?? 0;
                        const exceso = vpuCount;
                        return (
                          <div key={l.key} className="flex items-center justify-between rounded-lg border border-red-300 bg-white px-3 py-2 text-sm">
                            <div>
                              <span className="font-medium">{l.nombre}</span>
                              <span className="ml-1 text-xs text-slate-400">({l.imei})</span>
                              <span className="ml-2 text-xs text-slate-500">
                                {l.entalle
                                  ? `${l.talla_stock_nombre ?? "—"} → ${l.talla_vendida_nombre ?? "—"}`
                                  : l.talla_stock_nombre ?? "Sin talla"}
                              </span>
                              <span className="ml-2 inline-block rounded bg-red-200 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                                Quitar {exceso}
                              </span>
                            </div>
                            <button
                              onClick={() => quitar(l.key)}
                              className="text-red-400 hover:text-red-600"
                              title="Restaurar a línea normal"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </>
        )}

        {esRecojo && (
          <>
            {lineas.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-500">Productos incluidos en el recojo:</p>
                {lineas.map((l) => (
                  <div
                    key={l.key}
                    className="group flex w-full items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm transition-colors hover:bg-green-100"
                  >
                    <div>
                      <span className="font-medium">{l.nombre}</span>
                      <span className="ml-1 text-xs text-slate-400">({l.imei})</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {l.talla_stock_nombre ?? "Sin talla"} · x{l.cantidad}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">S/ {(l.cantidad * l.precio).toFixed(2)}</span>
                      <button
                        onClick={() => quitar(l.key)}
                        className="rounded-full p-1.5 text-red-300 opacity-50 transition-all hover:bg-red-100 hover:text-red-600 hover:opacity-100"
                        title="Quitar del recojo"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {detallesDisponiblesRecojo.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-500">Productos disponibles para agregar al recojo:</p>
                {detallesDisponiblesRecojo.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => toggleRecojo(d)}
                    className="group flex w-full items-center justify-between rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-sm text-left hover:border-blue-300 hover:bg-blue-50"
                  >
                    <div>
                      <span className="font-medium">{d.producto_nombre}</span>
                      <span className="ml-1 text-xs text-slate-400">({d.imei})</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {d.talla_stock_nombre ?? "Sin talla"} · x{d.cantidad}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">S/ {(d.cantidad * d.precio_unitario).toFixed(2)}</span>
                      <span className="text-sm font-medium text-blue-400 transition-colors group-hover:text-blue-600">+ Agregar</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {lineas.length === 0 && detallesDisponiblesRecojo.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">No hay productos disponibles para devolver.</p>
            )}
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>

    {showCancelarDialog && (
      <Modal open onClose={() => setShowCancelarDialog(false)} title="Cancelar viaje">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Quitaste todos los productos del viaje. ¿Deseas cancelar el viaje de recojo?
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowCancelarDialog(false)}>
              Retroceder
            </Button>
            <Button variant="danger" onClick={cancelarViaje} disabled={loading}>
              {loading ? "Cancelando..." : "Cancelar viaje"}
            </Button>
          </div>
        </div>
      </Modal>
    )}
  </>
  );
}

function PagoModal({
  pedidoId,
  deuda,
  onClose,
  onDone,
}: {
  pedidoId: string;
  deuda: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [monto, setMonto] = useState(deuda.toFixed(2));
  const [metodoPago, setMetodoPago] = useState("yape");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function registrar() {
    setError(null);
    setLoading(true);
    const { error } = await api(`/api/pedidos/${pedidoId}/pagos`, {
      method: "POST",
      body: JSON.stringify({ monto: Number(monto), metodo_pago: metodoPago }),
    });
    setLoading(false);
    if (error) setError(error);
    else onDone();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Registrar pago"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={registrar} disabled={loading}>Guardar</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Monto (S/)" type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
        <Select label="Método de pago" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
          <option value="yape">Yape</option>
          <option value="bcp">BCP</option>
          <option value="interbank">Interbank</option>
          <option value="bbva">BBVA</option>
          <option value="scotiabank">Scotiabank</option>
          <option value="plin">Plin</option>
          <option value="banco_nacion">Banco de la Nación</option>
          <option value="tarjeta_link">Tarjeta (Link)</option>
          <option value="efectivo">Efectivo</option>
        </Select>
        <ErrorBanner message={error} />
      </div>
    </Modal>
  );
}

function viajesTotal(viajes: Viaje[]): number {
  return viajes.filter((v) => v.tipo === "entrega" && v.estado !== "cancelado").reduce((a, v) => a + Number(v.total ?? 0), 0);
}

function viajesDevoluciones(viajes: Viaje[]): number {
  return viajes.filter((v) => v.tipo === "recojo" && v.estado !== "cancelado").reduce((a, v) => a + Number(v.total ?? 0), 0);
}

function ViajeCard({
  viaje,
  inconsistencias,
  onEdit,
  onCancel,
}: {
  viaje: Viaje;
  inconsistencias?: any[];
  onEdit?: (viaje: Viaje) => void;
  onCancel?: (viaje: Viaje) => void;
}) {
  const esRegreso = viaje.tipo === "recojo";
  const tieneInconsistencia = (inconsistencias ?? []).length > 0;
  const esActivo = viaje.estado === "programado" || viaje.estado === "alistado";
  const esTerminado = viaje.estado === "enviado" || viaje.estado === "terminado";

  const borderClass = esRegreso
    ? esTerminado ? "border-red-200" : "border-red-400"
    : esTerminado ? "border-emerald-200" : "border-emerald-400";
  const headerBg = esRegreso
    ? esTerminado ? "bg-red-50" : "bg-red-100"
    : esTerminado ? "bg-emerald-50" : "bg-emerald-100";
  const headerBorder = esRegreso
    ? esTerminado ? "border-red-100" : "border-red-200"
    : esTerminado ? "border-emerald-100" : "border-emerald-200";

  return (
    <div className={`overflow-hidden rounded-xl border ${tieneInconsistencia ? "border-red-400 ring-2 ring-red-200" : borderClass} ${esTerminado ? "opacity-75" : ""}`}>
      <div className={`flex flex-wrap items-center gap-2 border-b ${headerBorder} ${headerBg} px-4 py-3`}>
        <Link href={`/almacen/${viaje.id}`} className="text-sm font-semibold text-blue-600 hover:underline">
          {viaje.codigo}
        </Link>
        <Badge color={esRegreso ? "red" : "green"}>{esRegreso ? "Regreso" : "Entrega"}</Badge>
        <Badge color={ESTADO_BADGE[viaje.estado] ?? "slate"}>
          {VIAJE_ESTADO_LABEL[viaje.estado] ?? viaje.estado}
        </Badge>
        {esRegreso && viaje.motivo_recojo && (
          <Badge color={viaje.motivo_recojo === "cambio" ? "purple" : "red"}>
            {viaje.motivo_recojo === "cambio" ? "Cambio" : "Devolución"}
          </Badge>
        )}
        <span className="ml-auto text-xs text-slate-400">
          {viaje.fecha ? new Date(viaje.fecha + "T00:00:00").toLocaleDateString("es-PE") : "Sin fecha"}
        </span>
        {esActivo && onEdit && (
          <Button size="sm" variant="secondary" onClick={() => onEdit(viaje)}>
            Editar
          </Button>
        )}
        {esActivo && onCancel && (
          <Button size="sm" variant="danger" onClick={() => onCancel(viaje)}>
            Cancelar
          </Button>
        )}
      </div>
      <div className="p-4">
        {tieneInconsistencia && (
          <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            <p className="font-semibold">⚠ Hay productos demás</p>
            {inconsistencias!.map((inc: any) => (
              <p key={inc.id}>{inc.descripcion}</p>
            ))}
          </div>
        )}
        {viaje.direccion && <p className="mb-2 text-xs text-slate-500">Dirección: {viaje.direccion}</p>}
        {esRegreso && (
          <div className="mb-2 flex flex-wrap gap-3 text-xs">
            <span className="text-slate-500">
              Programado:{" "}
              <strong className="text-slate-700">
                {viaje.fecha ? new Date(viaje.fecha + "T00:00:00").toLocaleDateString("es-PE") : "—"}
              </strong>
            </span>
            {viaje.fecha_devolucion && (
              <span className="text-emerald-600">
                Devuelto:{" "}
                <strong>
                  {new Date(viaje.fecha_devolucion).toLocaleDateString("es-PE")}
                </strong>
              </span>
            )}
          </div>
        )}
        <div className="space-y-1">
          {viaje.lineas.length === 0 ? (
            <p className="text-sm text-slate-400">Sin productos.</p>
          ) : (
            <>
              {viaje.lineas.filter((l) => !l.pendiente_retorno).map((l) => (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">
                      {l.producto_nombre}{" "}
                      <span className="text-xs font-normal text-slate-400">({l.imei})</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {l.entalle
                        ? `${l.talla_stock_nombre ?? "—"} → ${l.talla_vendida_nombre ?? "Sin talla"}`
                        : l.talla_vendida_nombre ?? l.talla_stock_nombre ?? "Sin talla"}{" "}
                      · x{l.cantidad}
                      {l.es_extra_motorizado ? " · +motorizado" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {l.estado === "oculto" || l.estado === "devuelto" ? (
                      <Badge color="green">Devuelto</Badge>
                    ) : l.devolucion ? (
                      <Badge color="red">Pendiente de devolución</Badge>
                    ) : null}
                    <span className="text-sm font-semibold text-slate-800">S/ {Number(l.subtotal).toFixed(2)}</span>
                  </div>
                </div>
              ))}
              {viaje.lineas.some((l) => l.pendiente_retorno) && (
                <div className="mt-2 rounded-lg border-2 border-red-200 bg-red-50 p-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-red-600">
                    Pendiente a devolver al stock
                  </p>
                  {viaje.lineas.filter((l) => l.pendiente_retorno).map((l) => (
                    <div
                      key={l.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-red-800">
                          {l.producto_nombre}{" "}
                          <span className="text-xs font-normal text-red-400">({l.imei})</span>
                        </p>
                        <p className="text-xs text-red-500">
                          {l.entalle
                            ? `${l.talla_stock_nombre ?? "—"} → ${l.talla_vendida_nombre ?? "Sin talla"}`
                            : l.talla_vendida_nombre ?? l.talla_stock_nombre ?? "Sin talla"}{" "}
                          · x{l.vpu_count ?? l.cantidad}
                          {" · "}
                          <span className="font-semibold">Almacén debe devolver {(l.vpu_count ?? l.cantidad)} producto(s)</span>
                        </p>
                      </div>
                      <Badge color="red">{(l.vpu_count ?? l.cantidad)} para devolver</Badge>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2 text-sm">
          <span className="text-xs text-slate-400">
            {esRegreso
              ? "Costo a devolver"
              : viaje.costo_envio > 0
                ? "Total (incluye envío)"
                : "Total"}
          </span>
          <span className="font-bold text-slate-800">
            {esRegreso ? "− " : ""}S/ {Number(viaje.total).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

type LineaViajeNueva = {
  key: string;
  imei: string;
  nombre: string;
  talla_stock: string | null;
  talla_stock_nombre: string | null;
  talla_vendida: string | null;
  talla_vendida_nombre: string | null;
  producto_id: string;
  cantidad: number;
  precio: number;
  entalle: boolean;
  genero: string;
  es_extra_motorizado: boolean;
  vpu_count: number;
  pendiente_retorno: boolean;
  vpu_a_restar: number;
  detalle_id?: string;
};

// Nuevo viaje de ENTREGA: agrega productos a un pedido ya entregado, con su
// propia fecha, dirección y costo de envío.
function NuevoViajeEntregaModal({
  pedidoId,
  pedido,
  onClose,
  onDone,
}: {
  pedidoId: string;
  pedido: Pedido;
  onClose: () => void;
  onDone: () => void;
}) {
  const [fecha, setFecha] = useState(
    pedido.fecha_entrega ?? new Date().toISOString().slice(0, 10)
  );
  const [direccion, setDireccion] = useState(pedido.direccion_entrega ?? "");
  const [costoEnvio, setCostoEnvio] = useState("");
  const [productos, setProductos] = useState<{ id: string; imei: string; nombre: string }[]>([]);
  const [tallasPorProducto, setTallasPorProducto] = useState<
    Record<string, { id: string; nombre: string; cantidad_ventas: number }[]>
  >({});
  const [productoId, setProductoId] = useState("");
  const [tallaStock, setTallaStock] = useState("");
  const [entalle, setEntalle] = useState(false);
  const [tallaVendida, setTallaVendida] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [precio, setPrecio] = useState("");
  const [genero, setGenero] = useState("dama");
  const [lineas, setLineas] = useState<LineaViajeNueva[]>([]);
  const [nuevoN, setNuevoN] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ productos: { id: string; imei: string; nombre: string }[] }>("/api/productos").then(
      ({ data }) => setProductos(data?.productos ?? [])
    );
  }, []);

  function cargarTallas(pid: string) {
    api<{ tallas: { id: string; nombre: string; cantidad_ventas: number }[] }>(
      "/api/tallas?producto_id=" + pid
    ).then(({ data }) => {
      const ts = data?.tallas ?? [];
      setTallasPorProducto((prev) => ({ ...prev, [pid]: ts }));
    });
  }

  useEffect(() => {
    if (productoId) {
      setTallaStock("");
      setEntalle(false);
      setTallaVendida("");
      cargarTallas(productoId);
    }
  }, [productoId]);

  const dispLocal = (pid: string, tid: string) => {
    const t = (tallasPorProducto[pid] ?? []).find((x) => x.id === tid);
    const base = t?.cantidad_ventas ?? 0;
    const yaSumado = lineas
      .filter((l) => l.producto_id === pid && (l.talla_stock ?? l.talla_vendida) === tid)
      .reduce((a, l) => a + l.cantidad, 0);
    return base - yaSumado;
  };

  function agregar() {
    setError(null);
    if (!productoId) return;
    const p = productos.find((x) => x.id === productoId);
    const cant = Number(cantidad);
    if (!p || !cant || cant <= 0) {
      setError("Indica una cantidad válida");
      return;
    }
    const stockId = tallaStock || null;
    const vendidaId = entalle ? tallaVendida || tallaStock : tallaStock;
    if (stockId && dispLocal(productoId, stockId) < cant) {
      setError(`Stock insuficiente: solo hay ${dispLocal(productoId, stockId)} disponible en esa talla`);
      return;
    }
    const tallas = tallasPorProducto[productoId] ?? [];
    const stockSel = tallas.find((t) => t.id === stockId);
    const vendidaSel = tallas.find((t) => t.id === vendidaId);
    setNuevoN((n) => n + 1);
    setLineas((prev) => [
      ...prev,
      {
        key: `nuevo-${nuevoN}`,
        imei: p.imei,
        nombre: p.nombre,
        talla_stock: stockId,
        talla_stock_nombre: stockSel?.nombre ?? null,
        talla_vendida: vendidaId || null,
        talla_vendida_nombre: vendidaSel?.nombre ?? null,
        producto_id: p.id,
        cantidad: cant,
        precio: Number(precio || 0),
        entalle: Boolean(stockId && vendidaId && stockId !== vendidaId),
        genero,
        es_extra_motorizado: false,
        vpu_count: 0,
        pendiente_retorno: false,
        vpu_a_restar: 0,
      },
    ]);
    setProductoId("");
    setTallaStock("");
    setEntalle(false);
    setTallaVendida("");
    setCantidad("1");
    setPrecio("");
  }

  function quitar(key: string) {
    setLineas((prev) => prev.filter((l) => l.key !== key));
  }

  async function guardar() {
    setError(null);
    if (lineas.length === 0) {
      setError("Agrega al menos un producto al viaje");
      return;
    }
    if (!fecha) {
      setError("Indica la fecha del viaje");
      return;
    }
    setLoading(true);
    const { error: e } = await api("/api/viajes", {
      method: "POST",
      body: JSON.stringify({
        pedido_id: pedidoId,
        tipo: "entrega",
        fecha,
        direccion: direccion || null,
        costo_envio: Number(costoEnvio || 0),
        lineas: lineas.map((l) => ({
          producto_id: l.producto_id,
          talla_stock: l.talla_stock,
          talla_vendida: l.entalle ? l.talla_vendida : l.talla_stock,
          entalle: l.entalle,
          cantidad: l.cantidad,
          precio_unitario: l.precio,
          genero: l.genero,
          es_extra_motorizado: l.es_extra_motorizado,
        })),
      }),
    });
    setLoading(false);
    if (e) setError(e);
    else onDone();
  }

  const tallas = tallasPorProducto[productoId] ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      title="Nuevo viaje de entrega"
      xwide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={loading}>
            {loading ? "Guardando..." : "Crear viaje"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input label="Fecha del viaje" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <div className="md:col-span-2">
            <Input label="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </div>
          <Input label="Costo de envío (S/)" type="number" step="0.01" value={costoEnvio} onChange={(e) => setCostoEnvio(e.target.value)} />
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
            Agregar producto
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <Select label="Producto" value={productoId} onChange={(e) => setProductoId(e.target.value)} className="md:col-span-12">
              <option value="">Selecciona...</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} ({p.imei})</option>
              ))}
            </Select>
            <Select label="Talla" value={tallaStock} onChange={(e) => { setTallaStock(e.target.value); setTallaVendida(e.target.value); }} className="md:col-span-3">
              <option value="">Sin talla</option>
              {tallas.filter((t) => dispLocal(productoId, t.id) > 0).length > 0 ? (
                tallas
                  .filter((t) => dispLocal(productoId, t.id) > 0)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre} ({dispLocal(productoId, t.id)} disp.)
                    </option>
                  ))
              ) : (
                <option value="" disabled>Sin stock</option>
              )}
            </Select>
            <div className="md:col-span-2">
              <label className="mb-1 flex h-5 cursor-pointer items-center gap-1.5 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={entalle}
                  onChange={(e) => {
                    setEntalle(e.target.checked);
                    if (e.target.checked && !tallaVendida) setTallaVendida(tallaStock);
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Entallar a
              </label>
              {entalle && (
                <Select value={tallaVendida} onChange={(e) => setTallaVendida(e.target.value)}>
                  <option value="">Sin talla</option>
                  {tallas.map((t) => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </Select>
              )}
            </div>
            <Input label="Cantidad" type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="md:col-span-2" />
            <Input label="Precio (S/)" type="number" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} className="md:col-span-3" />
            <Select label="Género" value={genero} onChange={(e) => setGenero(e.target.value)} className="md:col-span-2">
              <option value="dama">Dama</option>
              <option value="caballero">Caballero</option>
            </Select>
          </div>
          <Button onClick={agregar} disabled={!productoId} className="mt-3 w-full">
            <span className="text-2xl leading-none">+</span> Añadir este producto
          </Button>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Productos del viaje{lineas.length > 0 ? ` (${lineas.length})` : ""}
          </h3>
          {lineas.length === 0 && <p className="text-sm text-slate-400">Sin productos.</p>}
          <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
            {lineas.map((l) => (
              <div key={l.key} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-base font-semibold text-slate-800">
                    {l.nombre} <span className="text-sm font-normal text-slate-400">({l.imei})</span>
                  </p>
                  <Button size="sm" variant="danger" onClick={() => quitar(l.key)}>Quitar</Button>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {l.entalle
                    ? `${l.talla_stock_nombre ?? "—"} → ${l.talla_vendida_nombre ?? "Sin talla"}`
                    : l.talla_vendida_nombre ?? l.talla_stock_nombre ?? "Sin talla"}{" "}
                  · x{l.cantidad} · S/ {(l.cantidad * l.precio).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <ErrorBanner message={error} />
      </div>
    </Modal>
  );
}

type LineaRegreso = { detalle_id: string; cantidad: string; precio: string };

// Viaje de REGRESO (recojo): quita productos del pedido entregado. Se elige
// cuánto se devuelve y cuánto se descuenta por prenda (0 permitido).
function ViajeRegresoModal({
  pedidoId,
  detalles,
  onClose,
  onDone,
}: {
  pedidoId: string;
  detalles: Detalle[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [motivo, setMotivo] = useState("devolucion");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [lineas, setLineas] = useState<LineaRegreso[]>(() =>
    detalles.map((d) => ({
      detalle_id: d.id,
      cantidad: "0",
      precio: String(d.precio_unitario ?? 0),
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function actualizar(detalleId: string, patch: Partial<LineaRegreso>) {
    setLineas((prev) => prev.map((l) => (l.detalle_id === detalleId ? { ...l, ...patch } : l)));
  }

  async function guardar() {
    setError(null);
    const elegidas = lineas
      .filter((l) => Number(l.cantidad) > 0)
      .map((l) => ({ ...l, cantidad: Number(l.cantidad), precio: Number(l.precio) }));
    if (elegidas.length === 0) {
      setError("Indica al menos un producto y su cantidad a devolver");
      return;
    }
    for (const l of elegidas) {
      const d = detalles.find((x) => x.id === l.detalle_id)!;
      if (l.cantidad > Number(d.cantidad)) {
        setError(`Solo hay ${d.cantidad} de ${d.producto_nombre} para devolver`);
        return;
      }
      if (l.precio < 0) {
        setError("El costo a devolver no puede ser negativo");
        return;
      }
    }
    setLoading(true);
    const { error: e } = await api("/api/viajes", {
      method: "POST",
      body: JSON.stringify({
        pedido_id: pedidoId,
        tipo: "recojo",
        motivo,
        fecha,
        lineas: elegidas.map((l) => ({
          detalle_id: l.detalle_id,
          cantidad: l.cantidad,
          precio_devolucion: l.precio,
        })),
      }),
    });
    setLoading(false);
    if (e) setError(e);
    else onDone();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Viaje de regreso (recojo)"
      xwide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={loading}>
            {loading ? "Guardando..." : "Crear viaje de regreso"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            <option value="devolucion">Devolución</option>
            <option value="cambio">Cambio</option>
          </Select>
          <Input
            label="Fecha programada para la devolución"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Al crear el regreso, los productos salen del viaje de entrega y quedan pendientes de
          devolución en este viaje. La unidad devuelta vuelve al almacén con su talla actual.
        </p>
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Productos a devolver
          </h3>
          {detalles.length === 0 && <p className="text-sm text-slate-400">Sin productos devolubles.</p>}
          <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
            {detalles.map((d) => {
              const l = lineas.find((x) => x.detalle_id === d.id)!;
              return (
                <div key={d.id} className="p-4">
                  <p className="text-base font-semibold text-slate-800">
                    {d.producto_nombre}{" "}
                    <span className="text-sm font-normal text-slate-400">({d.imei})</span>
                  </p>
                  <p className="mb-3 mt-0.5 text-sm text-slate-500">
                    {d.entalle
                      ? `${d.talla_stock_nombre ?? "—"} → ${d.talla_vendida_nombre ?? "Sin talla"}`
                      : d.talla_vendida_nombre ?? "Sin talla"}{" "}
                    · entregado x{d.cantidad} · S/ {Number(d.precio_unitario).toFixed(2)} c/u
                  </p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                      label="Cantidad a devolver"
                      type="number"
                      min={0}
                      max={d.cantidad}
                      value={l.cantidad}
                      onChange={(e) => actualizar(d.id, { cantidad: e.target.value })}
                    />
                    <Input
                      label="Costo a devolver (S/) por prenda"
                      type="number"
                      step="0.01"
                      min={0}
                      value={l.precio}
                      onChange={(e) => actualizar(d.id, { precio: e.target.value })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <ErrorBanner message={error} />
      </div>
    </Modal>
  );
}

const METODOS_POR_TIPO: Record<string, string[]> = {
  envio: ["a_domicilio", "agencia"],
  visita: ["a_domicilio", "local_peri"],
};
const EMPRESA_POR_TIPO: Record<string, string[]> = {
  envio: ["olva", "shalom", "otros"],
  visita: ["motorizado"],
};
const METODO_LABEL: Record<string, string> = {
  a_domicilio: "A domicilio",
  agencia: "Agencia",
  local_peri: "Local PERI",
};
const EMPRESA_LABEL: Record<string, string> = {
  motorizado: "Motorizado",
  olva: "Olva",
  shalom: "Shalom",
  otros: "Otros",
};

function EditarPedidoModal({
  pedidoId,
  pedido,
  deuda,
  onClose,
  onDone,
}: {
  pedidoId: string;
  pedido: Pedido;
  deuda: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [fechaEntrega, setFechaEntrega] = useState(pedido.fecha_entrega ?? "");
  const [tipoPedido, setTipoPedido] = useState(pedido.tipo_pedido ?? "envio");
  const [metodoEntrega, setMetodoEntrega] = useState(pedido.metodo_entrega ?? "agencia");
  const [empresaEnvio, setEmpresaEnvio] = useState(pedido.empresa_envio ?? "olva");
  const [direccion, setDireccion] = useState(pedido.direccion_entrega ?? "");
  const [ciudad, setCiudad] = useState(pedido.ciudad ?? "");
  const [canalVenta, setCanalVenta] = useState(pedido.canal_venta ?? "whatsapp");
  const [costoEnvio, setCostoEnvio] = useState(String(pedido.costo_envio ?? 0));
  const [metodoPago, setMetodoPago] = useState(pedido.metodo_pago ?? "efectivo");
  const [partes, setPartes] = useState(String(pedido.partes_a_pagar ?? 1));
  const [observaciones, setObservaciones] = useState(pedido.observaciones ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmacion, setConfirmacion] = useState<string[] | null>(null);

  function cambiarTipoPedido(tipo: string) {
    setTipoPedido(tipo);
    setMetodoEntrega(tipo === "envio" ? "agencia" : "a_domicilio");
    setEmpresaEnvio(tipo === "envio" ? "olva" : "motorizado");
  }

  async function enviar() {
    setError(null);
    setLoading(true);
    const { error } = await api(`/api/pedidos/${pedidoId}`, {
      method: "PATCH",
      body: JSON.stringify({
        fecha_entrega: fechaEntrega || null,
        tipo_pedido: tipoPedido,
        metodo_entrega: metodoEntrega,
        empresa_envio: empresaEnvio,
        direccion_entrega: direccion || null,
        ciudad: ciudad || null,
        canal_venta: canalVenta,
        costo_envio: Number(costoEnvio || 0),
        metodo_pago: metodoPago,
        partes_a_pagar: Number(partes || 1),
        observaciones: observaciones || null,
      }),
    });
    setLoading(false);
    if (error) setError(error);
    else onDone();
  }

  function guardar() {
    const nuevoCosto = Number(costoEnvio || 0);
    const costoAnterior = Number(pedido.costo_envio ?? 0);
    const cambioCosto = nuevoCosto !== costoAnterior;
    const cambioPartes = Number(partes || 1) !== Number(pedido.partes_a_pagar ?? 1);

    const mensajes: string[] = [];
    if (cambioCosto) {
      const subtotalProductos = Number(pedido.monto_total ?? 0) - costoAnterior;
      const nuevoTotal = subtotalProductos + nuevoCosto;
      const pagada = deuda <= 0;
      if (nuevoCosto > costoAnterior) {
        if (pagada) {
          mensajes.push(
            "Aumentaste el costo de envío y la deuda ya estaba totalmente pagada; esto la volverá a activar."
          );
        } else {
          mensajes.push(
            `Esto aumenta el monto registrado que debe pagar el cliente en S/ ${(nuevoTotal - Number(pedido.monto_total ?? 0)).toFixed(2)}.`
          );
        }
      } else {
        if (pagada) {
          mensajes.push(
            "La deuda ya está pagada; reducir el costo de envío hace que el cliente nos haya pagado más de lo que debía."
          );
        } else {
          mensajes.push("Esto reduce el monto registrado que debe pagar el cliente.");
        }
      }
    }
    if (cambioPartes) {
      mensajes.push("Esto cambia las partes a pagar del pedido.");
    }

    if (mensajes.length > 0) {
      setConfirmacion(mensajes);
      return;
    }
    enviar();
  }

  return (
    <>
    <Modal
      open
      onClose={onClose}
      title="Editar pedido"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={loading}>{loading ? "Guardando..." : "Guardar"}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Input label="Fecha de entrega" type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
        <Select label="Tipo de pedido" value={tipoPedido} onChange={(e) => cambiarTipoPedido(e.target.value)}>
          <option value="envio">Envío</option>
          <option value="visita">Visita</option>
        </Select>
        <Select label="Método de entrega" value={metodoEntrega} onChange={(e) => setMetodoEntrega(e.target.value)}>
          {METODOS_POR_TIPO[tipoPedido].map((m) => (
            <option key={m} value={m}>{METODO_LABEL[m]}</option>
          ))}
        </Select>
        <Select label="Empresa de envío" value={empresaEnvio} onChange={(e) => setEmpresaEnvio(e.target.value)}>
          {EMPRESA_POR_TIPO[tipoPedido].map((e) => (
            <option key={e} value={e}>{EMPRESA_LABEL[e]}</option>
          ))}
        </Select>
        <Select label="Canal de venta" value={canalVenta} onChange={(e) => setCanalVenta(e.target.value)}>
          <option value="whatsapp">WhatsApp</option>
          <option value="facebook">Facebook</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="telefono">Teléfono</option>
          <option value="otro">Otro</option>
        </Select>
        <Input label="Costo de envío (S/)" type="number" step="0.01" value={costoEnvio} onChange={(e) => setCostoEnvio(e.target.value)} />
        <Select label="Método de pago" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
          <option value="yape">Yape</option>
          <option value="bcp">BCP</option>
          <option value="interbank">Interbank</option>
          <option value="bbva">BBVA</option>
          <option value="scotiabank">Scotiabank</option>
          <option value="plin">Plin</option>
          <option value="banco_nacion">Banco de la Nación</option>
          <option value="tarjeta_link">Tarjeta (Link)</option>
          <option value="efectivo">Efectivo</option>
        </Select>
        <Input label="Partes a pagar" type="number" min={1} value={partes} onChange={(e) => setPartes(e.target.value)} />
        <Input label="Dirección de entrega" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        <Input label="Ciudad" value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
        <div className="md:col-span-2">
          <Input label="Observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <ErrorBanner message={error} />
        </div>
      </div>
    </Modal>
    {confirmacion && (
      <Modal
        open
        onClose={() => setConfirmacion(null)}
        title="Confirmar cambios"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmacion(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                setConfirmacion(null);
                enviar();
              }}
            >
              Sí, guardar
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          {confirmacion.map((m, i) => (
            <p key={i} className="text-sm text-slate-700">{m}</p>
          ))}
          <p className="pt-1 text-sm font-medium text-slate-800">¿Estás seguro?</p>
        </div>
      </Modal>
    )}
    </>
  );
}

type LineaEditable = {
  id: string;
  imei: string;
  nombre: string;
  talla_stock: string | null;
  talla_stock_nombre: string | null;
  talla_vendida: string | null;
  talla_vendida_nombre: string | null;
  producto_id: string;
  cantidad: number;
  precio: number;
  entalle: boolean;
  esNueva?: boolean;
  eliminada?: boolean;
  originalCantidad: number;
  originalPrecio: number;
  originalTallaStock: string | null;
  originalTallaVendida: string | null;
};

function EditarProductosModal({
  pedidoId,
  detalles,
  onClose,
}: {
  pedidoId: string;
  detalles: Detalle[];
  onClose: () => void;
}) {
  const [productos, setProductos] = useState<{ id: string; imei: string; nombre: string }[]>([]);
  const [tallas, setTallas] = useState<{ id: string; nombre: string; cantidad_ventas: number }[]>([]);
  const [tallasPorProducto, setTallasPorProducto] = useState<
    Record<string, { id: string; nombre: string; cantidad_ventas: number }[]>
  >({});
  const [productoId, setProductoId] = useState("");
  const [tallaStock, setTallaStock] = useState("");
  const [entalle, setEntalle] = useState(false);
  const [tallaVendida, setTallaVendida] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [precio, setPrecio] = useState("");
  const [genero, setGenero] = useState("dama");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nuevoN, setNuevoN] = useState(0);
  const [lineas, setLineas] = useState<LineaEditable[]>(() =>
    detalles.map((d) => ({
      id: d.id,
      imei: d.imei,
      nombre: d.producto_nombre,
      talla_stock: d.talla_stock,
      talla_stock_nombre: d.talla_stock_nombre,
      talla_vendida: d.talla_vendida,
      talla_vendida_nombre: d.talla_vendida_nombre ?? d.talla,
      producto_id: d.producto_id,
      cantidad: d.cantidad,
      precio: d.precio_unitario,
      entalle: d.entalle,
      originalCantidad: d.cantidad,
      originalPrecio: d.precio_unitario,
      originalTallaStock: d.talla_stock,
      originalTallaVendida: d.talla_vendida,
    }))
  );

  function cargarTallas(pid: string) {
    api<{ tallas: { id: string; nombre: string; cantidad_ventas: number }[] }>(
      "/api/tallas?producto_id=" + pid
    ).then(({ data }) => {
      const ts = data?.tallas ?? [];
      setTallas(ts);
      setTallasPorProducto((prev) => ({ ...prev, [pid]: ts }));
    });
  }

  useEffect(() => {
    api<{ productos: { id: string; imei: string; nombre: string }[] }>("/api/productos").then(({ data }) =>
      setProductos(data?.productos ?? [])
    );
    const ids = [...new Set(detalles.map((d) => d.producto_id))];
    for (const pid of ids) cargarTallas(pid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (productoId) {
      setTallaStock("");
      setEntalle(false);
      setTallaVendida("");
      cargarTallas(productoId);
    }
  }, [productoId]);

  function actualizarLinea(id: string, patch: Partial<LineaEditable>) {
    setLineas((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  // Delta local por (producto_id|talla_stock): lo que este pedido sumaría/quitaría
  // del stock de ventas con los cambios pendientes. La talla que consume stock es
  // SIEMPRE la talla stock (la unidad física que se toma y modifica).
  function deltasLocal() {
    const deltas: Record<string, number> = {};
    for (const l of lineas) {
      const origen = l.talla_stock ?? l.talla_vendida;
      if (!origen) continue;
      const k = `${l.producto_id}|${origen}`;
      if (l.esNueva && l.eliminada) continue;
      if (!l.esNueva && l.eliminada) {
        deltas[k] = (deltas[k] ?? 0) + l.originalCantidad;
        continue;
      }
      if (l.esNueva) {
        deltas[k] = (deltas[k] ?? 0) - l.cantidad;
      } else {
        deltas[k] = (deltas[k] ?? 0) + (l.originalCantidad - l.cantidad);
      }
    }
    return deltas;
  }

  const deltas = deltasLocal();

  // Disponible local por (producto, talla): cantidad_ventas (ya excluye este
  // pedido) + deltas pendientes.
  const dispLocal = (pid: string, tid: string) => {
    const t = (tallasPorProducto[pid] ?? []).find((x) => x.id === tid);
    const base = t?.cantidad_ventas ?? 0;
    return base + (deltas[`${pid}|${tid}`] ?? 0);
  };

  function agregar() {
    setError(null);
    if (!productoId) return;
    const p = productos.find((x) => x.id === productoId);
    const cant = Number(cantidad);
    if (!p || !cant || cant <= 0) {
      setError("Indica una cantidad válida");
      return;
    }
    // "Talla" es la talla de stock (origen): consume stock. Si se marca "Entallar a",
    // la talla vendida (destino) se toma del select; si no, es la misma.
    const stockId = tallaStock || null;
    const vendidaId = entalle ? (tallaVendida || tallaStock) : tallaStock;
    if (stockId && dispLocal(productoId, stockId) < cant) {
      setError(`Stock insuficiente: solo hay ${dispLocal(productoId, stockId)} disponible en esa talla`);
      return;
    }
    const stockSel = tallas.find((t) => t.id === stockId);
    const vendidaSel = tallas.find((t) => t.id === vendidaId);
    setNuevoN((n) => n + 1);
    setLineas((prev) => [
      ...prev,
      {
        id: `nuevo-${nuevoN}`,
        imei: p.imei,
        nombre: p.nombre,
        talla_stock: stockId,
        talla_stock_nombre: stockSel?.nombre ?? null,
        talla_vendida: vendidaId || null,
        talla_vendida_nombre: vendidaSel?.nombre ?? null,
        producto_id: p.id,
        cantidad: cant,
        precio: Number(precio || 0),
        entalle: Boolean(stockId && vendidaId && stockId !== vendidaId),
        esNueva: true,
        originalCantidad: cant,
        originalPrecio: Number(precio || 0),
        originalTallaStock: stockId,
        originalTallaVendida: vendidaId || null,
      },
    ]);
    setProductoId("");
    setTallaStock("");
    setEntalle(false);
    setTallaVendida("");
    setCantidad("1");
    setPrecio("");
  }

  function quitar(l: LineaEditable) {
    if (!window.confirm("¿Quitar este producto del pedido?")) return;
    setError(null);
    if (l.esNueva) {
      setLineas((prev) => prev.filter((x) => x.id !== l.id));
      return;
    }
    actualizarLinea(l.id, { eliminada: true });
  }

  async function guardarTodo() {
    setError(null);
    setLoading(true);

    // Validación local: ningún (producto,talla) de los productos en edición debe quedar negativo.
    const productosEnEdicion = [...new Set(lineas.map((l) => l.producto_id))];
    const negativos: { talla: { nombre: string }; disp: number }[] = [];
    for (const pid of productosEnEdicion) {
      for (const t of tallasPorProducto[pid] ?? []) {
        const disp = dispLocal(pid, t.id);
        if (disp < 0) negativos.push({ talla: t, disp });
      }
    }
    if (negativos.length > 0) {
      setError(
        `Stock insuficiente en ${negativos[0].talla.nombre} (queda ${negativos[0].disp}). Revisa las cantidades.`
      );
      setLoading(false);
      return;
    }

    const eliminadas = lineas.filter((l) => l.eliminada);
    const modificadas = lineas.filter(
      (l) =>
        !l.eliminada &&
        !l.esNueva &&
        (l.cantidad !== l.originalCantidad ||
          l.precio !== l.originalPrecio ||
          l.talla_stock !== l.originalTallaStock ||
          l.talla_vendida !== l.originalTallaVendida)
    );
    const nuevas = lineas.filter((l) => l.esNueva && !l.eliminada);

    // Orden: primero liberar (DELETEs), luego editar, luego agregar.
    for (const l of eliminadas) {
      const { error: e } = await api(`/api/pedidos/${pedidoId}/detalles/${l.id}`, { method: "DELETE" });
      if (e) {
        setError(e);
        setLoading(false);
        return;
      }
    }

    for (const l of modificadas) {
      const { error: e } = await api(`/api/pedidos/${pedidoId}/detalles/${l.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          cantidad: Number(l.cantidad),
          precio_unitario: Number(l.precio),
          talla_stock: l.talla_stock,
          talla_vendida: l.entalle ? l.talla_vendida : l.talla_stock,
          entalle: l.entalle,
        }),
      });
      if (e) {
        setError(e);
        setLoading(false);
        return;
      }
    }

    for (const l of nuevas) {
      const { error: e } = await api(`/api/pedidos/${pedidoId}/detalles`, {
        method: "POST",
        body: JSON.stringify({
          producto_id: l.producto_id,
          talla_stock: l.talla_stock,
          talla_vendida: l.entalle ? l.talla_vendida : l.talla_stock,
          entalle: l.entalle,
          cantidad: l.cantidad,
          precio_unitario: l.precio,
          genero,
        }),
      });
      if (e) {
        setError(e);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar productos"
      xwide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardarTodo} disabled={loading}>
            {loading ? "Guardando..." : "Listo"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
            Agregar producto
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <Select label="Producto" value={productoId} onChange={(e) => setProductoId(e.target.value)} className="md:col-span-12">
              <option value="">Selecciona...</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} ({p.imei})</option>
              ))}
            </Select>
            <Select label="Talla" value={tallaStock} onChange={(e) => { setTallaStock(e.target.value); setTallaVendida(e.target.value); }} className="md:col-span-3">
              <option value="">Sin talla</option>
              {tallas.filter((t) => dispLocal(productoId, t.id) > 0).length > 0 ? (
                tallas
                  .filter((t) => dispLocal(productoId, t.id) > 0)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre} ({dispLocal(productoId, t.id)} disp.)
                    </option>
                  ))
              ) : (
                <option value="" disabled>Sin stock</option>
              )}
            </Select>
            <div className="md:col-span-2">
              <label className="mb-1 flex h-5 cursor-pointer items-center gap-1.5 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={entalle}
                  onChange={(e) => {
                    setEntalle(e.target.checked);
                    if (e.target.checked && !tallaVendida) setTallaVendida(tallaStock);
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Entallar a
              </label>
              {entalle && (
                <Select
                  value={tallaVendida}
                  onChange={(e) => setTallaVendida(e.target.value)}
                >
                  <option value="">Sin talla</option>
                  {tallas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <Input label="Cantidad" type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="md:col-span-2" />
            <Input label="Precio (S/)" type="number" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} className="md:col-span-3" />
            <Select label="Género" value={genero} onChange={(e) => setGenero(e.target.value)} className="md:col-span-2">
              <option value="dama">Dama</option>
              <option value="caballero">Caballero</option>
            </Select>
            </div>
            <Button
              onClick={agregar}
              disabled={!productoId}
              className="mt-3 w-full"
            >
              <span className="text-2xl leading-none">+</span>
              Añadir este producto
            </Button>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Productos del pedido{lineas.length > 0 ? ` (${lineas.length})` : ""}
          </h3>
          {lineas.length === 0 && <p className="text-sm text-slate-400">Sin productos.</p>}
          <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
            {lineas
              .filter((l) => !l.eliminada)
              .map((l) => (
                <div key={l.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-slate-800">
                        {l.nombre} <span className="text-sm font-normal text-slate-400">({l.imei})</span>
                      </p>
                    </div>
                    <Button size="sm" variant="danger" onClick={() => quitar(l)}>Quitar</Button>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-12">
                    <div className="md:col-span-3">
                      <label className="mb-1 block text-xs font-medium text-slate-600">Talla</label>
                      <select
                        value={l.talla_stock ?? ""}
                        onChange={(e) => {
                          const v = e.target.value || null;
                          const stockNombre =
                            (tallasPorProducto[l.producto_id] ?? []).find((t) => t.id === v)?.nombre ?? null;
                          const vendidaId = l.entalle ? l.talla_vendida : v;
                          const vendidaNombre = l.entalle
                            ? l.talla_vendida_nombre
                            : stockNombre;
                          actualizarLinea(l.id, {
                            talla_stock: v,
                            talla_stock_nombre: stockNombre,
                            talla_vendida: vendidaId,
                            talla_vendida_nombre: vendidaNombre,
                            entalle: Boolean(v && vendidaId && v !== vendidaId),
                          });
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        title="Talla en stock: la unidad que se toma (la que consume stock)"
                      >
                        <option value="">Sin talla</option>
                        {(tallasPorProducto[l.producto_id] ?? [])
                          .filter((t) => t.id === l.talla_stock || dispLocal(l.producto_id, t.id) > 0)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.nombre} ({dispLocal(l.producto_id, t.id)} disp.)
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="md:col-span-3">
                      <label className="mb-1 flex h-4 cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
                        <input
                          type="checkbox"
                          checked={l.entalle}
                          onChange={(e) => {
                            const on = e.target.checked;
                            const vendidaId = on ? l.talla_vendida || l.talla_stock : l.talla_stock;
                            const vendidaNombre = on
                              ? l.talla_vendida_nombre || l.talla_stock_nombre
                              : l.talla_stock_nombre;
                            actualizarLinea(l.id, {
                              entalle: on,
                              talla_vendida: vendidaId,
                              talla_vendida_nombre: vendidaNombre,
                            });
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        Entallar a
                      </label>
                      {l.entalle ? (
                        <select
                          value={l.talla_vendida ?? ""}
                          onChange={(e) => {
                            const v = e.target.value || null;
                            actualizarLinea(l.id, {
                              talla_vendida: v,
                              talla_vendida_nombre:
                                (tallasPorProducto[l.producto_id] ?? []).find((t) => t.id === v)?.nombre ?? null,
                              entalle: Boolean(l.talla_stock && v && l.talla_stock !== v),
                            });
                          }}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          title="Talla vendida (destino): lo que pidió el cliente, no limitada por stock"
                        >
                          <option value="">Sin talla</option>
                          {(tallasPorProducto[l.producto_id] ?? []).map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.nombre}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400">—</p>
                      )}
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-600">Cantidad</label>
                      <input
                        type="number"
                        min={1}
                        value={l.cantidad}
                        onChange={(e) => actualizarLinea(l.id, { cantidad: Number(e.target.value) })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-600">Precio unitario</label>
                      <input
                        type="number"
                        step="0.01"
                        value={l.precio}
                        onChange={(e) => actualizarLinea(l.id, { precio: Number(e.target.value) })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-600">Subtotal</label>
                      <p className="rounded-lg bg-slate-50 px-3 py-2 text-right text-sm font-semibold text-slate-800">
                        S/ {(l.cantidad * l.precio).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <ErrorBanner message={error} />
      </div>
    </Modal>
  );
}
