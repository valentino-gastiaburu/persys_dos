"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button, Input, Select, Badge, Spinner, ErrorBanner } from "@/components/ui";

const ESTADO_BADGE: Record<string, string> = {
  borrador: "slate",
  solicitado: "amber",
  confirmado: "blue",
  alistado: "purple",
  enviado: "greenLight",
  entregado: "greenStrong",
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

const TRANSICIONES: Record<string, { atras: string[]; adelante: string[] }> = {
  solicitado: { atras: [], adelante: ["confirmado", "cancelado"] },
  confirmado: { atras: ["solicitado"], adelante: ["cancelado"] },
};

type PedidoRow = {
  id: string;
  codigo: string;
  estado: string;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  fecha_entrega: string | null;
  resumen_productos: string | null;
  monto_total: number;
  total_pagado: number;
  deuda: number;
  partes_a_pagar: number;
  vendedora_nombre: string | null;
  retraso: { entrega: boolean; recojo: boolean } | null;
};

export default function PedidosPage() {
  const router = useRouter();
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState("");
  const [q, setQ] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [limite, setLimite] = useState(20);
  const MAS_POR_VEZ = 20;

  const cargar = useCallback(async () => {
    const params = new URLSearchParams();
    // "retrasado" es un estado visual derivado, no existe en BD: se filtra en el
    // cliente (backend no puede filtrarlo). No se manda al API.
    if (estado && estado !== "retrasado") params.set("estado", estado);
    if (busqueda) params.set("q", busqueda);
    const { data, error } = await api<{ pedidos: PedidoRow[] }>(`/api/pedidos?${params}`);
    if (error) setError(error);
    else setPedidos(data?.pedidos ?? []);
    setLoading(false);
  }, [estado, busqueda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Al cambiar filtros, volver a mostrar solo el primer bloque.
  useEffect(() => {
    setLimite(MAS_POR_VEZ);
  }, [estado, busqueda]);

  async function confirmar(p: PedidoRow) {
    setError(null);
    const { error } = await api(`/api/pedidos/${p.id}/confirmar`, { method: "POST" });
    if (error) setError(error);
    else cargar();
  }

  async function cambiarEstado(p: PedidoRow, nuevoEstado: string) {
    const aviso =
      nuevoEstado === "cancelado"
        ? "¿Cancelar este pedido?"
        : "¿Volver a Solicitar? (revertir de Confirmado a Solicitado)";
    if (!window.confirm(aviso)) return;
    setError(null);
    const { error } = await api(`/api/pedidos/${p.id}/estado`, {
      method: "POST",
      body: JSON.stringify({ estado: nuevoEstado }),
    });
    if (error) setError(error);
    else cargar();
  }

  // "Retrasado" es un estado visual derivado: lo filtramos en el cliente.
  const visibles =
    estado === "retrasado"
      ? pedidos.filter((p) => p.retraso?.entrega || p.retraso?.recojo)
      : pedidos;

  // Paginación simple en el cliente: primer bloque + "Cargar 20 más".
  const mostrados = visibles.slice(0, limite);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Pedidos</h1>
        <div className="flex gap-2">
          <Link href="/cargos?hoy=1">
            <Button variant="secondary">Cargos de hoy</Button>
          </Link>
          <Link href="/pedidos/nuevo">
            <Button>Nuevo pedido</Button>
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          placeholder="Buscar por código o producto..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setBusqueda(q);
          }}
          className="max-w-xs"
        />
        <Select value={estado} onChange={(e) => setEstado(e.target.value)} className="max-w-[180px]">
          <option value="">Todos los estados</option>
          <option value="retrasado">Retrasado</option>
          <option value="borrador">Borrador</option>
          <option value="solicitado">Solicitado</option>
          <option value="confirmado">Confirmado</option>
          <option value="alistado">Alistado</option>
          <option value="enviado">Enviado</option>
          <option value="entregado">Entregado</option>
          <option value="esperando_devolucion">Esperando devolución</option>
          <option value="esperando_cambio">Esperando cambio</option>
          <option value="cancelado">Cancelado</option>
          <option value="devuelto">Devuelto</option>
        </Select>
        <Button variant="secondary" size="sm" onClick={() => { setQ(""); setBusqueda(""); setEstado(""); }}>
          Limpiar
        </Button>
      </div>
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Fecha entrega</th>
                <th className="px-4 py-2">Pedido</th>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Resumen</th>
                <th className="px-4 py-2">Vendedora</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Deuda</th>
                <th className="px-4 py-2 text-center">Partes</th>
                <th className="px-4 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {mostrados.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">
                    No hay pedidos.
                  </td>
                </tr>
              )}
              {mostrados.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/pedidos/${p.id}`)}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                    {p.fecha_entrega
                      ? new Date(p.fecha_entrega + "T00:00:00").toLocaleDateString("es-PE")
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 font-mono font-semibold text-blue-700">
                    {p.codigo}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-800">
                    {p.cliente_telefono ? (
                      <>
                        {p.cliente_telefono}
                        {p.cliente_nombre && (
                          <span className="ml-1 text-xs font-normal text-slate-400">
                            ({p.cliente_nombre})
                          </span>
                        )}
                      </>
                    ) : (
                      p.cliente_nombre ?? "Sin cliente"
                    )}
                  </td>
                  <td className="max-w-[240px] truncate px-4 py-2 text-slate-600">
                    {p.resumen_productos ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                    {p.vendedora_nombre ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-semibold text-slate-800">
                    S/ {Number(p.monto_total ?? 0).toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    {Number(p.deuda) > 0 ? (
                      Number(p.deuda) >= Number(p.monto_total) ? (
                        <span className="font-medium text-red-600">Todo</span>
                      ) : (
                        <span className="font-medium text-red-600">
                          S/ {Number(p.deuda).toFixed(2)}
                        </span>
                      )
                    ) : (
                      <span className="font-medium text-emerald-600">Pagado</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-center text-slate-600">
                    {p.partes_a_pagar ?? 1}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <EstadoCell p={p} onConfirmar={confirmar} onCambiarEstado={cambiarEstado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibles.length > limite && (
            <div className="border-t border-slate-200 p-3 text-center">
              <Button variant="secondary" size="sm" onClick={() => setLimite((l) => l + MAS_POR_VEZ)}>
                Cargar {MAS_POR_VEZ} más ({visibles.length - limite} restantes)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function opcionButton(
  destino: string,
  esCancelado: boolean,
  setAbierto: React.Dispatch<React.SetStateAction<boolean>>,
  p: PedidoRow,
  onConfirmar: (p: PedidoRow) => void,
  onCambiarEstado: (p: PedidoRow, nuevoEstado: string) => void
) {
  return (
    <button
      key={destino}
      onClick={(e) => {
        e.stopPropagation();
        setAbierto(false);
        if (destino === "confirmado") onConfirmar(p);
        else onCambiarEstado(p, destino);
      }}
      className={`flex w-full items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 ${
        esCancelado ? "text-red-600" : "text-blue-700"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          esCancelado ? "bg-red-500" : "bg-blue-500"
        }`}
      />
      {ESTADO_LABEL[destino] ?? destino}
    </button>
  );
}

function EstadoCell({
  p,
  onConfirmar,
  onCambiarEstado,
}: {
  p: PedidoRow;
  onConfirmar: (p: PedidoRow) => void;
  onCambiarEstado: (p: PedidoRow, nuevoEstado: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const trans = TRANSICIONES[p.estado] ?? { atras: [], adelante: [] };
  const clickeable = trans.atras.length + trans.adelante.length > 0;

  // "Retrasado" es un estado visual derivado que reemplaza el label real.
  const retrasoLabel = p.retraso?.entrega
    ? "Entrega retrasada"
    : p.retraso?.recojo
      ? "Recojo retrasado"
      : null;
  const estadoLabel = retrasoLabel ?? ESTADO_LABEL[p.estado] ?? p.estado;
  const estadoColor = retrasoLabel ? "red" : ESTADO_BADGE[p.estado] ?? "slate";

  if (!clickeable) {
    return (
      <Badge color={estadoColor}>
        {estadoLabel}
      </Badge>
    );
  }

  function abrir(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const right = window.innerWidth - r.right;
    let top = r.bottom + 4;
    if (top + 140 > window.innerHeight - 8) top = r.top - 144;
    setPos({ top: Math.max(8, top), right: Math.max(8, right) });
    setAbierto((v) => !v);
  }

  return (
    <>
      <button
        onClick={abrir}
        title="Cambiar estado"
        className="flex items-center gap-1 rounded-lg hover:bg-slate-100"
      >
        <Badge color={estadoColor}>
          {estadoLabel}
        </Badge>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3 text-slate-400"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {abierto && pos && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={(e) => {
              e.stopPropagation();
              setAbierto(false);
            }}
          />
          <div
            className="fixed z-40 flex items-stretch gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
            style={{ top: pos.top, right: pos.right }}
          >
            {trans.atras.length > 0 && (
              <div className="flex flex-col gap-1 rounded-lg bg-slate-50 p-1">
                {trans.atras.map((d) =>
                  opcionButton(d, d === "cancelado", setAbierto, p, onConfirmar, onCambiarEstado)
                )}
              </div>
            )}
            <div className="flex flex-col items-center justify-center gap-1 px-1 text-slate-400">
              {trans.atras.length > 0 && (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3"
                >
                  <path d="M19 12H5M11 18l-6-6 6-6" />
                </svg>
              )}
              {trans.adelante.length > 0 && (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3"
                >
                  <path d="M5 12h14M13 18l6-6-6-6" />
                </svg>
              )}
            </div>
            {trans.adelante.length > 0 && (
              <div className="flex flex-col gap-1 rounded-lg bg-slate-50 p-1">
                {trans.adelante.map((d) =>
                  opcionButton(d, d === "cancelado", setAbierto, p, onConfirmar, onCambiarEstado)
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
