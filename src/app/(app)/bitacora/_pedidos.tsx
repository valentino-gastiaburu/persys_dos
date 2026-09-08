"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Input, Spinner, ErrorBanner, Badge } from "@/components/ui";

type PedidoL = {
  id: string;
  codigo: string | null;
  estado: string;
  monto_total: number | null;
  clientes: { nombre: string; apellido: string } | null;
};

type EstadoEv = {
  id: string;
  estado_anterior: string | null;
  estado_nuevo: string;
  motivo: string | null;
  fecha: string;
  persona: string | null;
};

type AuditoriaEv = {
  id: string;
  fecha: string;
  entidad: string;
  entidad_ref: string | null;
  sub_entidad: string | null;
  sub_entidad_ref: string | null;
  accion: string;
  campo: string | null;
  valor_anterior: unknown;
  valor_nuevo: unknown;
  nota: string | null;
  persona: string | null;
};

type Movimiento = {
  id: string;
  tipo: string;
  cantidad: number;
  fecha: string;
  nota: string | null;
  imei: string | null;
  talla: string | null;
  persona: string | null;
};

const ESTADO_COLOR: Record<string, string> = {
  borrador: "slate",
  solicitado: "blue",
  confirmado: "purple",
  alistado: "amber",
  enviado: "blue",
  entregado: "green",
  cerrado: "slate",
  cancelado: "red",
  devuelto: "slate",
  esperando_devolucion: "amber",
  esperando_cambio: "amber",
};

const ACCION_LABEL: Record<string, string> = {
  crear: "Creó",
  editar: "Editó",
  eliminar: "Eliminó",
  cancelar: "Canceló",
  confirmar: "Confirmó",
  cambiar_estado: "Cambió estado",
  alistar: "Alistó",
  desalistar: "Desalistó",
  entallar: "Entalló",
  devolver: "Devolvió",
  devolver_stock: "Devolvió a stock",
  cobrar: "Cobró",
  revisar: "Revisó",
};

function fmtFecha(f: string | null) {
  if (!f) return "—";
  return new Date(f).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function fmtValor(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function TabPedidos({ initial }: { initial: URLSearchParams | null }) {
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<PedidoL[]>([]);
  const [buscado, setBuscado] = useState(false);
  const [loadingBusqueda, setLoadingBusqueda] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [det, setDet] = useState<{
    pedido: Record<string, any>;
    estados: EstadoEv[];
    viajes: { id: string; codigo: string; tipo: string; estado: string; fecha: string | null }[];
    auditoria: AuditoriaEv[];
    movimientos: Movimiento[];
    resumen: Record<string, number>;
  } | null>(null);
  const [loadingDet, setLoadingDet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buscar = async (query?: string) => {
    const term = (query ?? q).trim();
    if (!term) return;
    setBuscado(true);
    setLoadingBusqueda(true);
    setError(null);
    const { data, error } = await api<{ pedidos: PedidoL[] }>(
      `/api/pedidos?q=${encodeURIComponent(term)}`
    );
    if (error) setError(error);
    else setMatches(data?.pedidos ?? []);
    setLoadingBusqueda(false);
  };

  const cargarDetalle = async (id: string) => {
    setLoadingDet(true);
    setError(null);
    const { data, error } = await api<{
      pedido: Record<string, any>;
      estados: EstadoEv[];
      viajes: { id: string; codigo: string; tipo: string; estado: string; fecha: string | null }[];
      auditoria: AuditoriaEv[];
      movimientos: Movimiento[];
      resumen: Record<string, number>;
    }>(`/api/historial/pedidos/${id}`);
    if (error) setError(error);
    else setDet(data ?? null);
    setLoadingDet(false);
  };

  useEffect(() => {
    const idInit = initial?.get("id");
    if (idInit) {
      setSelectedId(idInit);
      void cargarDetalle(idInit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Input
          label="Buscar pedido por código"
          placeholder="Ej: 1045"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void buscar();
          }}
          className="max-w-xs"
        />
        <Button size="sm" disabled={loadingBusqueda} onClick={() => void buscar()}>
          Buscar
        </Button>
      </div>

      <ErrorBanner message={error} />

      {buscado && matches.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100">
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    setSelectedId(p.id);
                    void cargarDetalle(p.id);
                  }}
                  className={`flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    selectedId === p.id ? "bg-blue-50" : ""
                  }`}
                >
                  <span className="font-mono font-bold text-slate-700">#{p.codigo}</span>
                  <Badge color={ESTADO_COLOR[p.estado] ?? "slate"}>{p.estado}</Badge>
                  <span className="text-slate-500">
                    {p.clientes?.nombre ?? ""} {p.clientes?.apellido ?? ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loadingDet ? (
        <Spinner label="Cargando historial..." />
      ) : det ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-bold text-slate-800">#{det.pedido.codigo}</span>
              <Badge color={ESTADO_COLOR[det.pedido.estado] ?? "slate"}>{det.pedido.estado}</Badge>
              {det.pedido.cliente && (
                <span className="text-sm text-slate-500">
                  {det.pedido.cliente.nombre}
                  {det.pedido.cliente.telefono && ` · ${det.pedido.cliente.telefono}`}
                </span>
              )}
              <span className="ml-auto text-sm text-slate-600">
                S/ {Number(det.pedido.monto_total).toFixed(2)}
              </span>
            </div>
            {Object.keys(det.resumen).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                {Object.entries(det.resumen).map(([k, v]) => (
                  <span key={k}>
                    <strong className="capitalize">{k}</strong>: {v}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
              <h3 className="text-sm font-semibold text-slate-700">Estados del pedido</h3>
            </div>
            <ol className="divide-y divide-slate-100">
              {det.estados.map((e) => (
                <li key={e.id} className="p-3 text-sm">
                  <span className="font-medium text-slate-600">{e.estado_anterior ?? "—"}</span>
                  <span className="mx-2 text-slate-400">→</span>
                  <span className="font-semibold text-slate-800">{e.estado_nuevo}</span>
                  <span className="ml-3 text-xs text-slate-400">{fmtFecha(e.fecha)}</span>
                  {e.persona && <span className="ml-2 text-xs text-slate-500">— {e.persona}</span>}
                  {e.motivo && <p className="mt-1 text-xs text-slate-400">{e.motivo}</p>}
                </li>
              ))}
            </ol>
          </div>

          {det.viajes.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
                <h3 className="text-sm font-semibold text-slate-700">Viajes del pedido</h3>
              </div>
              <ul className="divide-y divide-slate-100">
                {det.viajes.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                    <Badge color={v.tipo === "recojo" ? "purple" : "blue"}>
                      {v.tipo === "recojo" ? "Recojo" : "Entrega"}
                    </Badge>
                    <span className="font-mono font-medium text-slate-700">{v.codigo}</span>
                    <Badge color={ESTADO_COLOR[v.estado] ?? "slate"}>{v.estado}</Badge>
                    <span className="text-xs text-slate-400">{v.fecha ? fmtFecha(v.fecha) : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
              <h3 className="text-sm font-semibold text-slate-700">Movimientos de stock</h3>
            </div>
            {det.movimientos.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                Sin movimientos de stock registrados para este pedido.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Fecha</th>
                      <th className="px-4 py-2">Tipo</th>
                      <th className="px-4 py-2">Cantidad</th>
                      <th className="px-4 py-2">IMEI</th>
                      <th className="px-4 py-2">Talla</th>
                      <th className="px-4 py-2">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {det.movimientos.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">
                          {fmtFecha(m.fecha)}
                        </td>
                        <td className="px-4 py-2">
                          <Badge color={m.tipo === "entrada" ? "green" : m.tipo === "salida" ? "red" : "amber"}>
                            {m.tipo}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 font-medium text-slate-700">{m.cantidad}</td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-600">{m.imei ?? "—"}</td>
                        <td className="px-4 py-2 text-slate-600">{m.talla ?? "—"}</td>
                        <td className="px-4 py-2 text-xs text-slate-400">
                          {m.nota}
                          {m.persona && <span className="ml-2">— {m.persona}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
              <h3 className="text-sm font-semibold text-slate-700">Ediciones y eventos</h3>
            </div>
            {det.auditoria.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">Sin eventos registrados.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {det.auditoria.map((a) => (
                  <li key={a.id} className="p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-400">{fmtFecha(a.fecha)}</span>
                      <span className="font-medium text-slate-700">
                        {ACCION_LABEL[a.accion] ?? a.accion}
                      </span>
                      {a.campo && <span className="text-xs text-slate-400">campo: {a.campo}</span>}
                      {a.persona && <span className="text-xs text-slate-500">— {a.persona}</span>}
                    </div>
                    {(a.entidad_ref || a.sub_entidad_ref) && (
                      <p className="mt-0.5 text-xs text-slate-400">
                        #{a.entidad_ref}
                        {a.sub_entidad && <span> · {a.sub_entidad}: {a.sub_entidad_ref}</span>}
                      </p>
                    )}
                    {a.nota && <p className="mt-0.5 text-xs text-slate-500">{a.nota}</p>}
                    {(a.valor_anterior !== null || a.valor_nuevo !== null) && (
                      <p className="mt-1 flex flex-wrap gap-1 text-xs">
                        {a.valor_anterior !== null && a.valor_anterior !== "" && (
                          <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-600">
                            {fmtValor(a.valor_anterior)}
                          </span>
                        )}
                        {a.valor_nuevo !== null && a.valor_nuevo !== "" && (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                            {fmtValor(a.valor_nuevo)}
                          </span>
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        !loadingBusqueda && (
          <p className="py-8 text-center text-sm text-slate-400">
            Busca un pedido por su código para ver estados, viajes y movimientos de stock.
          </p>
        )
      )}
    </div>
  );
}