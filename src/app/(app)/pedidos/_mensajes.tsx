"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Spinner, ErrorBanner, Button } from "@/components/ui";

type MensajeRow = {
  id: string;
  codigo: string;
  mensaje: string;
  nombre: string;
  monto_total: number;
  observaciones: string;
};

type Visita = MensajeRow & { telefono: string; distrito: string; direccion: string; gps: string };
type Envio = MensajeRow & {
  dni: string;
  telefono: string;
  direccion: string;
  ciudad: string;
  gps: string;
};

type Mensajes = {
  fecha: string;
  visitas: Visita[];
  envios: Envio[];
};

export default function MensajesMotorizado() {
  const [data, setData] = useState<Mensajes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await api<Mensajes>("/api/pedidos/mensajes");
    if (error) setError(error);
    else setData(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const copiar = async (texto: string, key: string) => {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = texto;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiado(key);
    window.setTimeout(() => setCopiado((c) => (c === key ? null : c)), 2000);
  };

  const textoVisitas = "VISITAS\n\n" + (data?.visitas ?? []).map((v) => v.mensaje).join("\n\n");
  const textoEnvios = "ENVIOS\n\n" + (data?.envios ?? []).map((e) => e.mensaje).join("\n\n");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          Pedidos del día
          {data ? (
            <span className="font-mono font-semibold text-slate-700"> {data.fecha}</span>
          ) : (
            ""
          )}
          <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
            {data ? data.visitas.length + data.envios.length : "…"}
          </span>
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => copiar(textoVisitas, "todas-visitas")}>
            {copiado === "todas-visitas" ? "✓ Copiado" : "Copiar visitas"}
          </Button>
          <Button size="sm" onClick={() => copiar(textoEnvios, "todos-envios")}>
            {copiado === "todos-envios" ? "✓ Copiado" : "Copiar envíos"}
          </Button>
        </div>
      </div>

      <ErrorBanner message={error} />
      {loading && <Spinner />}

      {!loading && data && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* VISITAS */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 bg-blue-50 px-4 py-2.5">
              <h2 className="text-sm font-bold text-slate-800">VISITAS</h2>
              <span className="text-xs text-slate-400">{data.visitas.length} pedidos</span>
            </div>
            <div className="space-y-3 p-4">
              {data.visitas.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-400">Sin visitas para hoy.</p>
              )}
              {data.visitas.map((v) => (
                <div key={v.id} className="rounded-lg border border-slate-200 bg-slate-50">
                  <div className="flex items-center justify-between rounded-t-lg border-b border-slate-200 bg-white px-3 py-1.5">
                    <span className="font-mono text-xs font-semibold text-blue-700">{v.codigo}</span>
                    <button
                      onClick={() => copiar(v.mensaje, `visita-${v.id}`)}
                      className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      {copiado === `visita-${v.id}` ? "✓ Copiado" : "Copiar"}
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap px-3 py-2 font-sans text-xs leading-relaxed text-slate-700">
                    {v.mensaje}
                  </pre>
                </div>
              ))}
            </div>
          </section>

          {/* ENVIOS */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 bg-emerald-50 px-4 py-2.5">
              <h2 className="text-sm font-bold text-slate-800">ENVIOS</h2>
              <span className="text-xs text-slate-400">{data.envios.length} pedidos</span>
            </div>
            {data.envios.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Sin envíos para hoy.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Mensaje</th>
                      <th className="px-3 py-2">Nombre</th>
                      <th className="px-3 py-2">DNI</th>
                      <th className="px-3 py-2">Teléfono</th>
                      <th className="px-3 py-2">Dirección</th>
                      <th className="px-3 py-2">Ciudad</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.envios.map((e) => (
                      <tr key={e.id} className="border-b border-slate-100 align-top last:border-0">
                        <td className="min-w-[240px] px-3 py-2">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="font-mono text-[11px] font-semibold text-emerald-700">
                              {e.codigo}
                            </span>
                            <button
                              onClick={() => copiar(e.mensaje, `envio-${e.id}`)}
                              className="rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-700"
                            >
                              {copiado === `envio-${e.id}` ? "✓" : "Copiar"}
                            </button>
                          </div>
                          <pre className="whitespace-pre-wrap font-sans leading-relaxed text-slate-700">
                            {e.mensaje}
                          </pre>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-800">{e.nombre || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-600">{e.dni || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{e.telefono || "—"}</td>
                        <td className="min-w-[140px] px-3 py-2 text-slate-600">{e.direccion || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{e.ciudad || "—"}</td>
                        <td className="px-1 py-2">
                          {e.gps && (
                            <a
                              href={e.gps}
                              target="_blank"
                              rel="noreferrer"
                              title="Abrir mapa"
                              className="inline-flex text-blue-600 hover:text-blue-800"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-4 w-4"
                              >
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                <circle cx="12" cy="10" r="3" />
                              </svg>
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}