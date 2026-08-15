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
  vendedora_nombre: string | null;
};

export default function PedidosPage() {
  const router = useRouter();
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState("");
  const [q, setQ] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const cargar = useCallback(async () => {
    const params = new URLSearchParams();
    if (estado) params.set("estado", estado);
    if (busqueda) params.set("q", busqueda);
    const { data, error } = await api<{ pedidos: PedidoRow[] }>(`/api/pedidos?${params}`);
    if (error) setError(error);
    else setPedidos(data?.pedidos ?? []);
    setLoading(false);
  }, [estado, busqueda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Pedidos</h1>
        <Link href="/pedidos/nuevo">
          <Button>Nuevo pedido</Button>
        </Link>
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
                <th className="px-4 py-2">N°</th>
                <th className="px-4 py-2">Resumen</th>
                <th className="px-4 py-2">Vendedora</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Deuda</th>
                <th className="px-4 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">
                    No hay pedidos.
                  </td>
                </tr>
              )}
              {pedidos.map((p) => (
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
                    {p.cliente_nombre ?? "Sin cliente"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-slate-600">
                    {p.cliente_telefono ?? "—"}
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
                      <span className="font-medium text-red-600">
                        S/ {Number(p.deuda).toFixed(2)}
                      </span>
                    ) : (
                      <span className="font-medium text-emerald-600">Pagado</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <Badge color={ESTADO_BADGE[p.estado] ?? "slate"}>
                      {ESTADO_LABEL[p.estado] ?? p.estado}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
