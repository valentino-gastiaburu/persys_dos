"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Input, Spinner, ErrorBanner, Badge } from "@/components/ui";

type UnidadLista = {
  id: string;
  codigo_qr: string;
  estado: string;
  imei: string;
  nombre: string;
  talla: string;
  pedido: string | null;
  viaje: string | null;
};

type Evento = {
  id: string;
  evento: string;
  fecha: string;
  nota: string | null;
  persona: string | null;
  pedido_codigo: string | null;
  viaje_codigo: string | null;
  viaje_tipo: string | null;
  talla_anterior: string | null;
  talla_nueva: string | null;
};

const ESTADO_LABEL: Record<string, string> = {
  en_almacen: "En almacén",
  almacen_espera: "Reservado (almacén en espera)",
  en_viaje: "En viaje (con cliente)",
  entregado: "Entregado",
  devuelto: "Devuelto",
  eliminado: "Eliminado",
};

const ESTADO_COLOR: Record<string, string> = {
  en_almacen: "green",
  almacen_espera: "amber",
  en_viaje: "blue",
  entregado: "purple",
  devuelto: "slate",
  eliminado: "red",
};

const EVENTO_LABEL: Record<string, string> = {
  ingreso: "Ingreso",
  alistado: "Alistado",
  enviado: "Enviado",
  entregado: "Entregado",
  devuelto: "Devuelto",
  entallado: "Entallado",
  ajuste: "Ajuste",
};

function fmtFecha(f: string | null) {
  if (!f) return "—";
  return new Date(f).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function TabUnidades({ initial }: { initial: URLSearchParams | null }) {
  const [lista, setLista] = useState<UnidadLista[] | null>(null);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [det, setDet] = useState<{
    unidad: Record<string, any>;
    eventos: Evento[];
    reserva: Record<string, any> | null;
  } | null>(null);
  const [loadingLista, setLoadingLista] = useState(true);
  const [loadingDet, setLoadingDet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarDetalle = async (id: string) => {
    setLoadingDet(true);
    setError(null);
    const { data, error } = await api<{
      unidad: Record<string, any>;
      eventos: Evento[];
      reserva: Record<string, any> | null;
    }>(`/api/historial/unidades/${id}`);
    if (error) setError(error);
    else setDet(data ?? null);
    setLoadingDet(false);
  };

  useEffect(() => {
    (async () => {
      const { data, error } = await api<{ productos_unicos: unknown[] }>("/api/productos-unicos");
      setLoadingLista(false);
      if (error || !data) {
        setError(error ?? "No se pudieron cargar las unidades.");
        return;
      }
      const us = (data.productos_unicos ?? []).map((r) => {
        const raw = r as Record<string, any>;
        return {
          id: String(raw.id),
          codigo_qr: String(raw.codigo_qr),
          estado: String(raw.estado),
          imei: raw.productos?.imei ?? "—",
          nombre: raw.productos?.nombre ?? "—",
          talla: raw.tallas?.nombre ?? "—",
          pedido: raw.pedido ?? null,
          viaje: raw.viaje ?? null,
        } as UnidadLista;
      });
      setLista(us);
      const idInit = initial?.get("id");
      const qrInit = initial?.get("qr");
      if (idInit) {
        setSelectedId(idInit);
        void cargarDetalle(idInit);
      } else if (qrInit) {
        const match = us.find((u) => u.codigo_qr === qrInit.toLowerCase());
        if (match) {
          setSelectedId(match.id);
          void cargarDetalle(match.id);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtro = q.trim().toLowerCase();
  const matches = (lista ?? [])
    .filter((u) =>
      !filtro ||
      u.codigo_qr.includes(filtro) ||
      u.imei.toLowerCase().includes(filtro) ||
      u.nombre.toLowerCase().includes(filtro) ||
      u.talla.toLowerCase().includes(filtro)
    )
    .slice(0, 80);

  const unidad = det?.unidad;
  const reserva = det?.reserva;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Input
          label="Buscar QR, IMEI o nombre"
          placeholder="Ej: a1b2c3d4 o 3586..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={!selectedId}
          onClick={() => selectedId && cargarDetalle(selectedId)}
        >
          Recargar
        </Button>
      </div>

      <ErrorBanner message={error} />

      {loadingLista ? (
        <Spinner label="Cargando unidades..." />
      ) : (
        matches.length > 0 && (
          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white">
            <ul className="divide-y divide-slate-100">
              {matches.map((u) => (
                <li key={u.id}>
                  <button
                    onClick={() => {
                      setSelectedId(u.id);
                      void cargarDetalle(u.id);
                    }}
                    className={`flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                      selectedId === u.id ? "bg-blue-50" : ""
                    }`}
                  >
                    <span className="font-mono text-xs text-slate-400">{u.codigo_qr}</span>
                    <span className="font-mono font-medium text-slate-700">{u.imei}</span>
                    <span className="text-slate-500">{u.talla}</span>
                    <Badge color={ESTADO_COLOR[u.estado] ?? "slate"}>
                      {ESTADO_LABEL[u.estado] ?? u.estado}
                    </Badge>
                    {u.viaje && (
                      <span className="text-xs text-slate-400">
                        Viaje {u.viaje} {u.pedido && <>· P{u.pedido}</>}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {loadingDet ? (
        <Spinner label="Cargando historial..." />
      ) : unidad ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-bold text-slate-800">{unidad.codigo_qr}</span>
              <Badge color={ESTADO_COLOR[unidad.estado] ?? "slate"}>
                {ESTADO_LABEL[unidad.estado] ?? unidad.estado}
              </Badge>
              {unidad.es_entallada && <Badge color="amber">📐 Entallada</Badge>}
            </div>
            <p className="mt-1 font-mono text-lg text-slate-700">{unidad.productos?.imei}</p>
            <p className="text-sm text-slate-500">{unidad.productos?.nombre}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs uppercase text-slate-400">Talla actual</p>
                <p className="font-semibold text-slate-700">{unidad.talla ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-400">Talla original</p>
                <p className="font-semibold text-slate-700">{unidad.talla_original_nombre ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-400">Ingreso</p>
                <p className="font-semibold text-slate-700">{fmtFecha(unidad.fecha_ingreso)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-400">Salida</p>
                <p className="font-semibold text-slate-700">{fmtFecha(unidad.fecha_salida)}</p>
              </div>
            </div>
          </div>

          {reserva && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-800">
                {reserva.estado === "devuelto"
                  ? "Última asignación (ya devuelta):"
                  : reserva.estado === "enviado"
                    ? "Asignado y en camino:"
                    : "Reservado en viaje:"}{" "}
                <span className="font-bold">Viaje {reserva.viaje?.codigo}</span>
                {reserva.viaje?.pedidos?.codigo && (
                  <span> · Pedido {reserva.viaje.pedidos.codigo}</span>
                )}
              </p>
              <p className="text-xs text-amber-600">
                {reserva.viaje?.tipo === "recojo" ? "Recojo" : "Entrega"} · Estado del viaje:{" "}
                {reserva.viaje?.estado}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
              <h3 className="text-sm font-semibold text-slate-700">Historial</h3>
            </div>
            {det?.eventos.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                Sin eventos registrados para esta unidad.
              </p>
            ) : (
              <ol className="divide-y divide-slate-100">
                {det?.eventos.map((e) => (
                  <li key={e.id} className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-700">
                        {EVENTO_LABEL[e.evento] ?? e.evento}
                      </span>
                      <span className="text-xs text-slate-400">{fmtFecha(e.fecha)}</span>
                      {e.persona && <span className="text-xs text-slate-500">— {e.persona}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      {e.viaje_codigo && (
                        <span>
                          Viaje <strong>{e.viaje_codigo}</strong>
                          {e.viaje_tipo === "recojo" ? " (recojo)" : ""}
                        </span>
                      )}
                      {e.pedido_codigo && <span>Pedido <strong>{e.pedido_codigo}</strong></span>}
                      {e.evento === "entallado" && e.talla_anterior && e.talla_nueva && (
                        <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-700">
                          Talla {e.talla_anterior} → {e.talla_nueva}
                        </span>
                      )}
                    </div>
                    {e.nota && <p className="mt-1 text-xs text-slate-400">{e.nota}</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      ) : (
        !loadingLista && (
          <p className="py-8 text-center text-sm text-slate-400">
            Buscá una unidad y seleccionala para ver su historial.
          </p>
        )
      )}
    </div>
  );
}