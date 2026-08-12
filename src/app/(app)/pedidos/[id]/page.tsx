"use client";

import { useEffect, useState, useCallback } from "react";
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

type Pedido = {
  id: string;
  codigo: string;
  estado: string;
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
  observaciones: string | null;
  monto_total: number;
  resumen_productos: string | null;
  regalo: boolean;
  clientes: { nombre: string; apellido: string | null; telefono: string; direccion: string | null } | null;
};

type Detalle = {
  id: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  talla: string | null;
  imei: string;
  producto_nombre: string;
  es_extra_motorizado: boolean;
};

type Pago = { id: string; monto: number; metodo_pago: string; tipo: string; fecha: string };
type Viaje = { id: string; codigo: string; tipo: string; estado: string; fecha: string | null };

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
  const [showPago, setShowPago] = useState(false);
  const [showDetalle, setShowDetalle] = useState(false);

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

  async function confirmar() {
    setError(null);
    const { error } = await api(`/api/pedidos/${id}/confirmar`, { method: "POST" });
    if (error) setError(error);
    else cargar();
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
            <Button variant="secondary" onClick={() => setShowDetalle(true)}>
              Agregar producto
            </Button>
            <Button onClick={confirmar}>Confirmar pedido</Button>
          </div>
        )}
      </div>
      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Productos</h2>
            <div className="space-y-2">
              {detalles.length === 0 && (
                <p className="text-sm text-slate-400">Sin productos.</p>
              )}
              {detalles.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">
                      {d.producto_nombre} <span className="text-xs text-slate-400">({d.imei})</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {d.talla ?? "Sin talla"} · {d.cantidad} x S/ {Number(d.precio_unitario).toFixed(2)}
                      {d.es_extra_motorizado ? " · +motorizado" : ""}
                    </p>
                  </div>
                  <p className="text-sm font-semibold">S/ {Number(d.subtotal).toFixed(2)}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between border-t border-slate-200 pt-3 text-sm">
              <span className="text-slate-500">Total (incluye envío)</span>
              <span className="font-bold text-slate-800">S/ {Number(pedido.monto_total).toFixed(2)}</span>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Pagos</h2>
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
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Viajes</h2>
            {viajes.length === 0 ? (
              <p className="text-sm text-slate-400">
                Sin viajes {pedido.estado === "borrador" ? "(confirma el pedido para crear el primer viaje)" : ""}.
              </p>
            ) : (
              <div className="space-y-1">
                {viajes.map((v) => (
                  <Link
                    key={v.id}
                    href={`/almacen/${v.id}`}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {v.codigo} · {v.tipo}
                      </p>
                      <p className="text-xs text-slate-400">
                        {v.fecha ? new Date(v.fecha + "T00:00:00").toLocaleDateString("es-PE") : "Sin fecha"}
                      </p>
                    </div>
                    <Badge color={ESTADO_BADGE[v.estado] ?? "slate"}>{v.estado}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="h-fit rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Detalles del pedido</h2>
          <dl className="space-y-2 text-sm">
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
      {showDetalle && (
        <AgregarDetalleModal
          pedidoId={id}
          onClose={() => setShowDetalle(false)}
          onDone={() => {
            setShowDetalle(false);
            cargar();
          }}
        />
      )}
    </div>
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

function AgregarDetalleModal({ pedidoId, onClose, onDone }: { pedidoId: string; onClose: () => void; onDone: () => void }) {
  const [productos, setProductos] = useState<{ id: string; imei: string; nombre: string }[]>([]);
  const [tallas, setTallas] = useState<{ id: string; nombre: string }[]>([]);
  const [productoId, setProductoId] = useState("");
  const [tallaId, setTallaId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [precio, setPrecio] = useState("");
  const [genero, setGenero] = useState("dama");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ productos: any[] }>("/api/productos").then(({ data }) => setProductos(data?.productos ?? []));
  }, []);

  useEffect(() => {
    if (productoId) {
      setTallaId("");
      api<{ tallas: { id: string; nombre: string }[] }>("/api/tallas?producto_id=" + productoId).then(
        ({ data }) => setTallas(data?.tallas ?? [])
      );
    }
  }, [productoId]);

  async function agregar() {
    setError(null);
    setLoading(true);
    const { error } = await api(`/api/pedidos/${pedidoId}/detalles`, {
      method: "POST",
      body: JSON.stringify({
        producto_id: productoId,
        talla_id: tallaId || null,
        cantidad: Number(cantidad),
        precio_unitario: Number(precio || 0),
        genero,
      }),
    });
    setLoading(false);
    if (error) setError(error);
    else onDone();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Agregar producto"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={agregar} disabled={loading || !productoId}>Agregar</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Select label="Producto" value={productoId} onChange={(e) => setProductoId(e.target.value)}>
          <option value="">Selecciona...</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre} ({p.imei})</option>
          ))}
        </Select>
        <Select label="Talla" value={tallaId} onChange={(e) => setTallaId(e.target.value)}>
          <option value="">Sin talla</option>
          {tallas.map((t) => (
            <option key={t.id} value={t.id}>{t.nombre}</option>
          ))}
        </Select>
        <Input label="Cantidad" type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        <Input label="Precio unitario (S/)" type="number" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} />
        <Select label="Género" value={genero} onChange={(e) => setGenero(e.target.value)}>
          <option value="dama">Dama</option>
          <option value="caballero">Caballero</option>
        </Select>
        <ErrorBanner message={error} />
      </div>
    </Modal>
  );
}
