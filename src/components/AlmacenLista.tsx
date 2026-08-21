"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Input, Select, Badge, Spinner, ErrorBanner, Button } from "@/components/ui";
import { Html5Qrcode } from "html5-qrcode";

const ESTADO_BADGE: Record<string, string> = {
  programado: "slate",
  alistado: "purple",
  enviado: "amber",
  terminado: "green",
  cancelado: "red",
};

const ESTADO_LABEL: Record<string, string> = {
  programado: "Programado",
  alistado: "Alistado",
  enviado: "Enviado",
  terminado: "Terminado",
  cancelado: "Cancelado",
};

const TIPO_BADGE: Record<string, string> = {
  entrega: "blue",
  recojo: "amber",
};

const TIPO_LABEL: Record<string, string> = {
  entrega: "Entrega",
  recojo: "Recojo",
};

type Viaje = {
  id: string;
  codigo: string;
  tipo: string;
  estado: string;
  fecha: string | null;
  fecha_devolucion: string | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  pedido_codigo: string | null;
  motivo_recojo: string | null;
  unidades_alistadas: number;
  pendientes_retorno: number;
  actualizado_el: string | null;
};

function ViajeRow({
  v,
  esHoy,
  onClick,
}: {
  v: Viaje;
  esHoy: boolean;
  onClick: () => void;
}) {
  const esCancelado = v.estado === "cancelado";
  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50 ${
        esCancelado ? "bg-slate-50 opacity-60" : esHoy ? "bg-blue-50" : ""
      }`}
    >
      <td className={`px-4 py-2 font-semibold text-blue-700 ${esCancelado ? "text-slate-400 line-through" : ""}`}>
        {v.codigo}
        {esHoy && (
          <span className="ml-2 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
            Hoy
          </span>
        )}
        {esCancelado && (
          <span className="ml-2 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
            Cancelado
          </span>
        )}
      </td>
      <td className="px-4 py-2 font-medium text-slate-700">{v.pedido_codigo ?? "—"}</td>
      <td className="px-4 py-2 text-slate-600">
        {v.fecha ? new Date(v.fecha + "T00:00:00").toLocaleDateString("es-PE") : "—"}
      </td>
      <td className="px-4 py-2 text-slate-700">
        {v.cliente_nombre ?? "Sin cliente"}
        {v.cliente_telefono ? ` · ${v.cliente_telefono}` : ""}
      </td>
      <td className="px-4 py-2 text-center font-semibold text-slate-700">
        {v.unidades_alistadas}
      </td>
      <td className="px-4 py-2">
        <Badge color={TIPO_BADGE[v.tipo] ?? "slate"}>
          {TIPO_LABEL[v.tipo] ?? v.tipo}
        </Badge>
        {v.motivo_recojo && <span className="ml-1 text-xs text-amber-600">{v.motivo_recojo}</span>}
      </td>
      <td className="px-4 py-2">
        <Badge color={ESTADO_BADGE[v.estado] ?? "slate"}>
          {ESTADO_LABEL[v.estado] ?? v.estado}
        </Badge>
      </td>
    </tr>
  );
}

function TablaViajes({ viajes, titulo, router, hoy }: { viajes: Viaje[]; titulo: string; router: any; hoy: string }) {
  if (viajes.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{titulo}</h2>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">ID</th>
              <th className="px-4 py-2">Pedido</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2 text-center">Productos</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {viajes.map((v) => {
              const esHoy = v.fecha === hoy;
              return (
                <ViajeRow
                  key={v.id}
                  v={v}
                  esHoy={esHoy}
                  onClick={() => router.push(`/almacen/${v.id}`)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type VpuPendiente = {
  id: string;
  producto_unico_id: string;
  detalle_pedido_id: string;
  estado: string;
  productos_unicos: {
    codigo_qr: string | null;
    producto_id: string;
    talla_id: string;
  } | null;
  detalles_pedido: {
    producto_id: string;
    cantidad: number;
  } | null;
};

function PanelRetornoStock({
  viaje,
  onCerrar,
  onCompletado,
}: {
  viaje: Viaje;
  onCerrar: () => void;
  onCompletado: () => void;
}) {
  const [vpuPendientes, setVpuPendientes] = useState<VpuPendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null);
  const [scannerActivo, setScannerActivo] = useState(false);
  const [busquedaManual, setBusquedaManual] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await api<{
      viaje: any;
      alistados: any[];
    }>(`/api/viajes/${viaje.id}`);
    if (!error && data) {
      const pendientes = (data.alistados ?? []).filter(
        (v: any) => v.estado !== "devuelto" && v.estado !== "pendiente"
      );
      setVpuPendientes(pendientes);
    }
    setLoading(false);
  }, [viaje.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const procesarRetorno = useCallback(
    async (codigoQr?: string) => {
      setMsg(null);
      const body: any = {};
      if (codigoQr) body.codigo_qr = codigoQr;

      const { data, error } = await api<{
        ok: boolean;
        producto_devuelto?: any;
        pendientes_restantes: number;
        completado: boolean;
        error?: string;
      }>(`/api/viajes/${viaje.id}/retorno-stock`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (error || !data?.ok) {
        setMsg({ tipo: "err", texto: data?.error || error || "Error al devolver" });
        return;
      }

      setMsg({
        tipo: "ok",
        texto: `Producto devuelto · Quedan ${data.pendientes_restantes} pendiente(s)`,
      });

      if (data.completado) onCompletado();
      cargar();
    },
    [viaje.id, cargar, onCompletado]
  );

  const iniciarScanner = useCallback(() => {
    setScannerActivo(true);
    setTimeout(() => {
      try {
        const scanner = new Html5Qrcode("qr-scanner-retorno-stock");
        scannerRef.current = scanner;
        scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            procesarRetorno(decodedText);
            scanner.stop().catch(() => {});
            setScannerActivo(false);
          },
          () => {}
        );
      } catch {
        setScannerActivo(false);
      }
    }, 100);
  }, [procesarRetorno]);

  const detenerScanner = useCallback(() => {
    scannerRef.current?.stop().catch(() => {});
    scannerRef.current = null;
    setScannerActivo(false);
  }, []);

  useEffect(() => {
    return () => {
      scannerRef.current?.stop().catch(() => {});
    };
  }, []);

  const buscarManual = useCallback(() => {
    if (!busquedaManual.trim()) return;
    procesarRetorno(busquedaManual.trim());
    setBusquedaManual("");
  }, [busquedaManual, procesarRetorno]);

  return (
    <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">
          Retorno de stock — {viaje.codigo}
        </h3>
        <button onClick={onCerrar} className="text-sm text-slate-500 hover:text-slate-700">
          Cerrar
        </button>
      </div>

      {msg && (
        <div
          className={`mb-3 rounded px-3 py-2 text-sm ${
            msg.tipo === "ok" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          }`}
        >
          {msg.texto}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : vpuPendientes.length === 0 ? (
        <p className="text-sm text-slate-500">Todos los productos fueron devueltos.</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-600">
            Pendientes: <strong>{vpuPendientes.length}</strong>
          </p>

          <div className="mb-3 flex flex-wrap gap-2">
            {!scannerActivo ? (
              <Button onClick={iniciarScanner} variant="primary">
                Escanear producto
              </Button>
            ) : (
              <Button onClick={detenerScanner} variant="secondary">
                Detener scanner
              </Button>
            )}
            <div className="flex gap-1">
              <input
                type="text"
                value={busquedaManual}
                onChange={(e) => setBusquedaManual(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && buscarManual()}
                placeholder="Escribir código QR..."
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <Button onClick={buscarManual} variant="secondary">
                Buscar
              </Button>
            </div>
          </div>

          {scannerActivo && (
            <div className="mb-3">
              <div id="qr-scanner-retorno-stock" className="w-full max-w-sm" />
            </div>
          )}

          <div className="overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-3 py-1.5">Código</th>
                  <th className="px-3 py-1.5">Estado</th>
                </tr>
              </thead>
              <tbody>
                {vpuPendientes.map((vpu) => (
                  <tr key={vpu.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-1.5 font-mono text-xs">
                      {vpu.productos_unicos?.codigo_qr ?? "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge color="amber">{vpu.estado}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function AlmacenLista() {
  const router = useRouter();
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fecha, setFecha] = useState("");
  const [estado, setEstado] = useState("");
  const [viajeRetornoSeleccionado, setViajeRetornoSeleccionado] = useState<Viaje | null>(null);

  const hoy = new Date().toISOString().slice(0, 10);

  const cargar = useCallback(async () => {
    const params = new URLSearchParams();
    if (fecha) params.set("fecha", fecha);
    if (estado) params.set("estado", estado);
    const { data, error } = await api<{ viajes: Viaje[] }>(`/api/viajes?${params}`);
    if (error) setError(error);
    else setViajes(data?.viajes ?? []);
    setLoading(false);
  }, [fecha, estado]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Separar: hoy vs otros días (orden ya viene del API por actualizado_el desc)
  const viajesHoy = viajes.filter((v) => v.fecha === hoy && v.estado !== "cancelado");
  const viajesOtros = viajes.filter((v) => v.fecha !== hoy && v.estado !== "cancelado");
  const viajesCancelados = viajes.filter((v) => v.estado === "cancelado");
  const viajesConRetorno = viajes.filter((v) => v.pendientes_retorno > 0);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Almacén / Viajes</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="max-w-[160px]" />
        <Select value={estado} onChange={(e) => setEstado(e.target.value)} className="max-w-[180px]">
          <option value="">Todos</option>
          <option value="programado">Programado</option>
          <option value="alistado">Alistado</option>
          <option value="enviado">Enviado</option>
          <option value="terminado">Terminado</option>
          <option value="cancelado">Cancelado</option>
        </Select>
        <button
          className="text-sm text-blue-600 hover:underline"
          onClick={() => {
            setFecha("");
            setEstado("");
          }}
        >
          Limpiar
        </button>
      </div>
      <ErrorBanner message={error} />

      {viajeRetornoSeleccionado && (
        <PanelRetornoStock
          viaje={viajeRetornoSeleccionado}
          onCerrar={() => setViajeRetornoSeleccionado(null)}
          onCompletado={() => {
            cargar();
            setViajeRetornoSeleccionado(null);
          }}
        />
      )}

      {loading ? (
        <Spinner />
      ) : viajes.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">No hay viajes.</p>
      ) : (
        <>
          <TablaViajes viajes={viajesHoy} titulo="Viajes de hoy" router={router} hoy={hoy} />
          <TablaViajes viajes={viajesOtros} titulo="Otros viajes" router={router} hoy={hoy} />
          <TablaViajes viajes={viajesCancelados} titulo="Cancelados" router={router} hoy={hoy} />

          {viajesConRetorno.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-600">
                Pendientes a regresar al stock
              </h2>
              <div className="overflow-x-auto rounded-lg border border-amber-200 bg-amber-50 shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-amber-200 bg-amber-100/50 text-left text-xs font-semibold uppercase tracking-wide text-amber-700">
                      <th className="px-4 py-2">ID</th>
                      <th className="px-4 py-2">Pedido</th>
                      <th className="px-4 py-2">Tipo</th>
                      <th className="px-4 py-2 text-center">Pendientes</th>
                      <th className="px-4 py-2">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viajesConRetorno.map((v) => (
                      <tr key={v.id} className="border-b border-amber-100 last:border-0 hover:bg-amber-100/30">
                        <td className="px-4 py-2 font-semibold text-blue-700">{v.codigo}</td>
                        <td className="px-4 py-2 text-slate-600">{v.pedido_codigo ?? "—"}</td>
                        <td className="px-4 py-2">
                          <Badge color={TIPO_BADGE[v.tipo] ?? "slate"}>
                            {TIPO_LABEL[v.tipo] ?? v.tipo}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className="font-bold text-amber-700">{v.pendientes_retorno}</span>
                        </td>
                        <td className="px-4 py-2">
                          <Button
                            variant="secondary"
                            onClick={() => setViajeRetornoSeleccionado(v)}
                          >
                            Devolver stock
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
