"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Input, Select, Spinner, ErrorBanner, Badge } from "@/components/ui";

type Registro = {
  id: string;
  fecha: string;
  persona_id: string | null;
  rol: string | null;
  entidad: string;
  entidad_id: string;
  entidad_ref: string | null;
  sub_entidad: string | null;
  sub_entidad_id: string | null;
  sub_entidad_ref: string | null;
  accion: string;
  campo: string | null;
  valor_anterior: unknown;
  valor_nuevo: unknown;
  nota: string | null;
  usuarios: { id: string; dni: string; nombre: string; rol: string } | null;
};

const ETIQUETA_ACCION: Record<string, string> = {
  crear: "Creó",
  editar: "Editó",
  eliminar: "Eliminó",
  cancelar: "Canceló",
  confirmar: "Confirmó",
  cambiar_estado: "Cambió estado",
  cobrar: "Cobró",
  revisar: "Revisó",
  desrevisar: "Desmarcó revisión",
  alistar: "Alistó",
  desalistar: "Desalistó",
  entallar: "Entalló",
  devolver: "Devolvió",
  devolver_stock: "Devolvió a stock",
  ingresar_stock: "Ingresó stock",
};

const ETIQUETA_ENTIDAD: Record<string, string> = {
  producto: "Producto",
  producto_unico: "Producto único",
  pedido: "Pedido",
  viaje: "Viaje",
  detalle_pedido: "Detalle de pedido",
  pago: "Pago",
};

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function TabGeneral() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entidad, setEntidad] = useState("");
  const [accion, setAccion] = useState("");
  const [q, setQ] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [page, setPage] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [entidades, setEntidades] = useState<string[]>([]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (entidad) params.set("entidad", entidad);
    if (accion) params.set("accion", accion);
    if (q) params.set("q", q);
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    params.set("page", String(page));
    const { data, error } = await api<{
      registros: Registro[];
      entidades: string[];
      total: number;
      total_paginas: number;
    }>(`/api/auditoria?${params}`);
    if (error) setError(error);
    else {
      setRegistros(data?.registros ?? []);
      setEntidades(data?.entidades ?? []);
      setTotal(data?.total ?? 0);
      setTotalPaginas(data?.total_paginas ?? 1);
    }
    setLoading(false);
  }, [entidad, accion, q, desde, hasta, page]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <>
      <ErrorBanner message={error} />

      <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-2 lg:grid-cols-6">
        <Select value={entidad} onChange={(e) => { setEntidad(e.target.value); setPage(1); }}>
          <option value="">Todas las tablas</option>
          {entidades.map((e) => (
            <option key={e} value={e}>{ETIQUETA_ENTIDAD[e] ?? e}</option>
          ))}
        </Select>
        <Select value={accion} onChange={(e) => { setAccion(e.target.value); setPage(1); }}>
          <option value="">Toda acción</option>
          {Object.entries(ETIQUETA_ACCION).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <Input label="Buscar" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Código, nota, QR..." />
        <Input label="Desde" type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPage(1); }} />
        <Input label="Hasta" type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPage(1); }} />
        <div className="flex items-end">
          <Button onClick={() => setPage(1)} disabled={loading}>Filtrar</Button>
        </div>
      </div>

      <p className="mb-3 text-xs text-slate-400">{total} registro(s)</p>

      {loading ? (
        <Spinner label="Cargando bitácora..." />
      ) : registros.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">Sin movimientos que mostrar.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Responsable</th>
                <th className="px-4 py-2">Tabla</th>
                <th className="px-4 py-2">Acción</th>
                <th className="px-4 py-2">Detalle</th>
                <th className="px-4 py-2">Antes</th>
                <th className="px-4 py-2">Después</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {registros.map((r) => (
                <tr key={r.id} className="align-top hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">
                    {new Date(r.fecha).toLocaleString("es-PE", { timeZone: "America/Lima" })}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <p className="font-medium text-slate-800">{r.usuarios?.nombre ?? "—"}</p>
                    <p className="text-xs capitalize text-slate-400">{r.usuarios?.rol ?? r.rol ?? ""}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <Badge color="blue">{ETIQUETA_ENTIDAD[r.entidad] ?? r.entidad}</Badge>
                    {r.sub_entidad && (
                      <Badge color="slate">{ETIQUETA_ENTIDAD[r.sub_entidad] ?? r.sub_entidad}</Badge>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <p className="font-medium text-slate-700">{ETIQUETA_ACCION[r.accion] ?? r.accion}</p>
                    {r.campo && <p className="text-xs text-slate-400">campo: {r.campo}</p>}
                  </td>
                  <td className="min-w-[120px] px-4 py-2 text-xs text-slate-600">
                    {r.entidad_ref && <p>#{r.entidad_ref}</p>}
                    {r.sub_entidad_ref && <p className="text-slate-400">{r.sub_entidad_ref}</p>}
                    {r.nota && <p className="mt-1 text-slate-500">{r.nota}</p>}
                  </td>
                  <td className="max-w-[180px] px-4 py-2 text-xs text-slate-500">{fmt(r.valor_anterior)}</td>
                  <td className="max-w-[180px] px-4 py-2 text-xs text-slate-700">{fmt(r.valor_nuevo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPaginas > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Anterior
          </Button>
          <span className="text-xs text-slate-500">Página {page} de {totalPaginas}</span>
          <Button variant="secondary" size="sm" disabled={page >= totalPaginas} onClick={() => setPage(page + 1)}>
            Siguiente →
          </Button>
        </div>
      )}
    </>
  );
}