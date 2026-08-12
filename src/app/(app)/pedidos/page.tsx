"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
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
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {pedidos.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-slate-400">No hay pedidos.</p>
          )}
          {pedidos.map((p) => (
            <Link
              key={p.id}
              href={`/pedidos/${p.id}`}
              className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold text-slate-800">{p.codigo}</span>
                <Badge color={ESTADO_BADGE[p.estado] ?? "slate"}>
                  {ESTADO_LABEL[p.estado] ?? p.estado}
                </Badge>
              </div>
              <p className="truncate text-sm text-slate-600">
                {p.cliente_nombre ?? "Sin cliente"}
                {p.cliente_telefono ? ` · ${p.cliente_telefono}` : ""}
              </p>
              <p className="truncate text-xs text-slate-400">
                {p.resumen_productos ?? "Sin productos"}
              </p>
              <div className="mt-auto flex items-center justify-between pt-1">
                <p className="text-sm font-semibold text-slate-800">
                  S/ {Number(p.monto_total ?? 0).toFixed(2)}
                </p>
                {p.deuda > 0 ? (
                  <p className="text-xs font-medium text-red-600">
                    Deuda S/ {Number(p.deuda).toFixed(2)}
                  </p>
                ) : (
                  <p className="text-xs font-medium text-emerald-600">Pagado</p>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                {p.fecha_entrega ? new Date(p.fecha_entrega + "T00:00:00").toLocaleDateString("es-PE") : "Sin fecha"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
