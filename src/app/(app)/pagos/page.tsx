"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { driveImageUrl } from "@/lib/utils";
import { Button, Input, Modal, Select, Spinner, ErrorBanner } from "@/components/ui";

type PedidoRow = {
  id: string;
  codigo: string;
  estado: string;
  cliente_nombre: string | null;
  monto_total: number;
  deuda: number;
};

type Cobro = {
  id: string;
  estado: string;
  fecha_pactada: string | null;
  fecha_pagada: string | null;
  monto: number | null;
  metodo_pago: string | null;
  comprobante: string | null;
  revisado?: boolean;
};

type CobroGlobal = Cobro & {
  pedido_id?: string | null;
  pedido_codigo?: string | null;
  pedido_estado?: string | null;
  cliente_nombre?: string | null;
};

export default function PagosPage() {
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soloDeuda, setSoloDeuda] = useState(true);
  const [pagar, setPagar] = useState<PedidoRow | null>(null);
  const [rol, setRol] = useState<string | null>(null);
  const [porRevisar, setPorRevisar] = useState<CobroGlobal[]>([]);
  const [puedeRevisar, setPuedeRevisar] = useState(false);

  const cargar = useCallback(async () => {
    const params = new URLSearchParams();
    if (soloDeuda) params.set("pendientes", "1");
    const { data, error } = await api<{ pedidos: PedidoRow[] }>(`/api/pedidos?${params}`);
    if (error) setError(error);
    else setPedidos((data?.pedidos ?? []).filter((p) => soloDeuda || p.deuda > 0));
    setLoading(false);
  }, [soloDeuda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    api<{ user: { rol: string } }>("/api/auth/me").then(({ data }) => {
      setRol(data?.user?.rol ?? null);
    });
  }, []);

  const revisable = rol != null && ["admin", "controller"].includes(rol);

  const cargarRevisados = useCallback(async () => {
    const { data } = await api<{ cobros: CobroGlobal[]; puede_revisar: boolean }>(
      "/api/pagos?estado=pagado&solo_sin_revisar=1&limite=100"
    );
    setPorRevisar(data?.cobros ?? []);
    setPuedeRevisar(Boolean(data?.puede_revisar));
  }, []);

  useEffect(() => {
    if (revisable) cargarRevisados();
  }, [revisable, cargarRevisados]);

  async function toggleRevisar(cobro: CobroGlobal) {
    if (!cobro.pedido_id) return;
    await api(`/api/pedidos/${cobro.pedido_id}/pagos/${cobro.id}`, {
      method: "PATCH",
      body: JSON.stringify({ revisado: !cobro.revisado }),
    });
    cargarRevisados();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Pagos</h1>
      <div className="mb-4">
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={soloDeuda}
            onChange={(e) => setSoloDeuda(e.target.checked)}
            className="rounded"
          />
          Solo pedidos con deuda
        </label>
      </div>
      <ErrorBanner message={error} />

      {revisable && (
        <section className="mb-6 overflow-hidden rounded-xl border border-slate-300 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-amber-50 px-5 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <h2 className="flex-1 text-sm font-semibold text-slate-800">
              Cobros por revisar
              {porRevisar.length > 0 && (
                <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                  {porRevisar.length}
                </span>
              )}
            </h2>
            <span className="text-xs text-slate-400">{puedeRevisar ? "Marca el cobro para confirmar que se recibió" : ""}</span>
          </div>
          <div className="max-h-80 overflow-y-auto p-4">
            {porRevisar.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">Sin cobros pendientes de revisión.</p>
            ) : (
              <div className="space-y-1">
                {porRevisar.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(c.revisado)}
                      onChange={() => toggleRevisar(c)}
                      className="h-4 w-4 rounded"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800">
                        {c.cliente_nombre ?? "Sin cliente"}
                        {c.pedido_codigo && (
                          <Link href={`/pedidos/${c.pedido_id}`} className="ml-2 text-xs text-blue-600 hover:underline">
                            {c.pedido_codigo}
                          </Link>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {c.metodo_pago ?? "—"} · {c.fecha_pagada ?? c.fecha_pactada ?? ""}
                      </p>
                    </div>
                    {c.comprobante && (
                      <VerComprobante link={c.comprobante} />
                    )}
                    <span className="font-semibold text-emerald-700">S/ {Number(c.monto ?? 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {pedidos.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-slate-400">No hay pedidos por cobrar.</p>
          )}
          {pedidos.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="min-w-0">
                <Link href={`/pedidos/${p.id}`} className="font-semibold text-blue-700 hover:underline">
                  {p.codigo}
                </Link>
                <p className="truncate text-sm text-slate-600">{p.cliente_nombre ?? "Sin cliente"}</p>
                <p className="text-xs text-slate-500">
                  Total S/ {Number(p.monto_total ?? 0).toFixed(2)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-red-600">S/ {Number(p.deuda).toFixed(2)}</p>
                {p.deuda > 0 && (
                  <Button size="sm" className="mt-1" onClick={() => setPagar(p)}>
                    Cobrar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {pagar && (
        <PagarModal
          pedido={pagar}
          onClose={() => setPagar(null)}
          onDone={() => {
            setPagar(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function PagarModal({
  pedido,
  onClose,
  onDone,
}: {
  pedido: PedidoRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [cobros, setCobros] = useState<Cobro[]>([]);
  const [pendientes, setPendientes] = useState<Cobro[]>([]);
  const [monto, setMonto] = useState(String(Number(pedido.deuda).toFixed(2)));
  const [metodoPago, setMetodoPago] = useState("yape");
  const [cobroId, setCobroId] = useState("");
  const [fechaPago, setFechaPago] = useState("");
  const [comprobanteArchivo, setComprobanteArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [nuevaFechaCobro, setNuevaFechaCobro] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmarSinFecha, setConfirmarSinFecha] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await api<{ pagos: Cobro[] }>(`/api/pedidos/${pedido.id}/pagos`);
      const lista = data?.pagos ?? [];
      setCobros(lista);
      setPendientes(lista.filter((c) => c.estado === "pendiente"));
    })();
  }, [pedido.id]);

  const montoValor = Number(monto);
  const cubreTodo = !Number.isNaN(montoValor) && montoValor >= Number(pedido.deuda) - 0.001;
  const montoPorCobro =
    pendientes.length > 0 && Number(pedido.deuda) > 0
      ? Number(pedido.deuda) / pendientes.length
      : 0;

  async function registrar() {
    setError(null);
    setLoading(true);

    let linkComprobante: string | undefined;
    let comprobanteDriveId: string | undefined;
    if (comprobanteArchivo) {
      setSubiendo(true);
      const fd = new FormData();
      fd.append("archivo", comprobanteArchivo);
      const { data, error: subidaErr } = await api<{
        ok: boolean;
        comprobante?: string;
        drive_id?: string;
        error?: string;
      }>("/api/pagos/comprobante", { method: "POST", body: fd });
      if (subidaErr || !data?.ok || !data.comprobante) {
        setSubiendo(false);
        setError(subidaErr || "No se pudo subir el comprobante. Intenta de nuevo.");
        setLoading(false);
        return;
      }
      linkComprobante = data.comprobante;
      comprobanteDriveId = data.drive_id;
    }

    const body: Record<string, unknown> = {
      monto: Number(monto),
      metodo_pago: metodoPago,
      fecha_pagada: fechaPago || undefined,
      comprobante: linkComprobante,
    };
    if (cobroId) body.pago_id = cobroId;

    const { error: err } = await api(`/api/pedidos/${pedido.id}/pagos`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    setSubiendo(false);
    setLoading(false);
    if (err) {
      if (comprobanteDriveId) {
        void api(`/api/pagos/comprobante?drive_id=${comprobanteDriveId}`, { method: "DELETE" });
      }
      setError(err);
      return;
    }
    // Tras cobrar: si no cubre todo y no se puso fecha del siguiente cobro, avisar.
    if (!cubreTodo && !nuevaFechaCobro) {
      setConfirmarSinFecha(true);
      return;
    }
    if (!cubreTodo && nuevaFechaCobro) {
      await api(`/api/pedidos/${pedido.id}/pagos`, {
        method: "POST",
        body: JSON.stringify({ estado: "pendiente", fecha_pactada: nuevaFechaCobro }),
      });
    }
    onDone();
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`Cobrar ${pedido.codigo}`}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button onClick={registrar} disabled={loading || subiendo}>
              {subiendo ? "Subiendo comprobante..." : "Registrar pago"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Deuda: <strong>S/ {Number(pedido.deuda).toFixed(2)}</strong>
          </p>

          {pendientes.length > 0 && (
            <>
              <label className="text-xs font-semibold text-slate-500">Cobros programados (deudas)</label>
              <Select value={cobroId} onChange={(e) => setCobroId(e.target.value)}>
                <option value="">Pago sin vincular a un cobro previo</option>
                {pendientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    Deuda del {c.fecha_pactada ?? "—"} · S/ {montoPorCobro.toFixed(2)}
                  </option>
                ))}
              </Select>
            </>
          )}

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
          <Input label="Fecha de pago" type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Comprobante de pago (foto o PDF)
            </label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setComprobanteArchivo(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
            />
            {comprobanteArchivo && (
              <p className="mt-1 truncate text-xs text-slate-500">
                {comprobanteArchivo.name} ({(comprobanteArchivo.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          {!cubreTodo && (
            <Input
              label="Fecha del siguiente cobro (opcional)"
              type="date"
              value={nuevaFechaCobro}
              onChange={(e) => setNuevaFechaCobro(e.target.value)}
            />
          )}

          <ErrorBanner message={error} />
        </div>
      </Modal>

      {confirmarSinFecha && (
        <Modal
          open
          onClose={() => setConfirmarSinFecha(false)}
          title="Siguiente cobro sin fecha"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmarSinFecha(false)}>
                Volver
              </Button>
              <Button
                onClick={() => {
                  setConfirmarSinFecha(false);
                  onDone();
                }}
              >
                Continuar
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-700">
            Te estás yendo sin registrar la fecha del siguiente cobro. ¿Seguro que deseas continuar?
          </p>
        </Modal>
      )}
    </>
  );
}

function VerComprobante({ link }: { link: string }) {
  const [abierto, setAbierto] = useState(false);
  const img = driveImageUrl(link);
  const esImagen = img !== link;
  const idArchivo =
    link.match(/\/file\/d\/([^/?]+)/)?.[1] ||
    link.match(/[?&]id=([^&]+)/)?.[1] ||
    link.match(/drive\.google\.com\/(?:d|open)\/([^/?]+)/)?.[1] ||
    null;
  const previewUrl = idArchivo
    ? `https://drive.google.com/file/d/${idArchivo}/preview`
    : img ?? link;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Ver comprobante"
        className="group flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 hover:border-blue-300"
      >
        {esImagen && img ? (
          <img src={img} alt="Comprobante" className="h-full w-full object-cover group-hover:opacity-80" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 text-blue-600"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
        )}
      </button>

      {abierto && (
        <Modal
          open
          onClose={() => setAbierto(false)}
          title="Comprobante de pago"
          footer={
            <Button variant="secondary" onClick={() => setAbierto(false)}>Cerrar</Button>
          }
        >
          <div className="flex flex-col items-center">
            <iframe
              src={previewUrl}
              title="Comprobante"
              className="h-[65vh] w-full rounded-lg border border-slate-200"
            />
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="mt-3 text-xs text-blue-600 hover:underline"
            >
              Abrir en Google Drive ↗
            </a>
          </div>
        </Modal>
      )}
    </>
  );
}
