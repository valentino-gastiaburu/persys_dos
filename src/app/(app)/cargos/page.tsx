"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button, Input, Select, Badge, Spinner, ErrorBanner } from "@/components/ui";
import { CargoPedido, CargoConfig } from "@/lib/cargos";
import CargoDespacho from "@/components/CargoDespacho";
import CargoAgencia from "@/components/CargoAgencia";

export default function CargosPage() {
  const searchParams = useSearchParams();
  const aplicarHoy = searchParams.get("hoy") === "1";
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const [hoyPendiente, setHoyPendiente] = useState(aplicarHoy);
  const [cargos, setCargos] = useState<CargoPedido[]>([]);
  const [config, setConfig] = useState<CargoConfig>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [imprimiendo, setImprimiendo] = useState(false);

  const cargar = useCallback(async (d: string, h: string, codigo: string, t: string) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (d) params.set("desde", d);
    if (h) params.set("hasta", h);
    if (codigo) params.set("q", codigo);
    if (t) params.set("tipo", t);
    const { data, error } = await api<{
      cargos: CargoPedido[];
      config: CargoConfig;
    }>(`/api/cargos?${params}`);
    if (error) {
      setError(error);
      setCargos([]);
    } else {
      setCargos(data?.cargos ?? []);
      setConfig(data?.config ?? {});
      setSeleccionados(new Set((data?.cargos ?? []).map((c) => c.viaje_id)));
    }
    setLoading(false);
  }, []);

  // Cuando llegamos con ?hoy=1 (botón "Cargos de hoy" en Pedidos), resolver la
  // "fecha de hoy" en el servidor y usarla como rango desde=hasta=hoy ANTES de
  // cargar los cargos. Así el módulo abre ya filtrado por hoy.
  useEffect(() => {
    if (!aplicarHoy) return;
    let activo = true;
    (async () => {
      const { data, error } = await api<{ hoy: string }>("/api/hoy");
      if (activo && !error && data?.hoy) {
        setDesde(data.hoy);
        setHasta(data.hoy);
      } else if (activo) {
        // Si falla la fuente de hora, al menos salir del modo pendiente.
        setDesde("");
        setHasta("");
      }
      if (activo) setHoyPendiente(false);
    })();
    return () => {
      activo = false;
    };
  }, [aplicarHoy]);

  // Filtros se aplican automáticamente al cambiar (con pequeño debounce para el
  // campo de código y para no disparar en cada tecla).
  useEffect(() => {
    if (hoyPendiente) return;
    const timer = setTimeout(() => {
      cargar(desde, hasta, q, tipo);
    }, 250);
    return () => clearTimeout(timer);
  }, [desde, hasta, q, tipo, cargar, hoyPendiente]);

  const quitarFiltros = () => {
    setDesde("");
    setHasta("");
    setQ("");
    setTipo("");
  };

  const hayFiltros = desde !== "" || hasta !== "" || q !== "" || tipo !== "";

  const visibles = cargos.map((c) => ({
    ...c,
    seleccionado: seleccionados.has(c.viaje_id),
  }));

  const todosSelected = cargos.length > 0 && visibles.every((v) => v.seleccionado);

  function toggleAll() {
    setSeleccionados(
      todosSelected ? new Set() : new Set(cargos.map((c) => c.viaje_id))
    );
  }

  function toggle(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const seleccionadosList = visibles.filter((v) => v.seleccionado);

  useEffect(() => {
    if (!imprimiendo) return;
    const timer = setTimeout(() => window.print(), 100);
    return () => clearTimeout(timer);
  }, [imprimiendo]);

  useEffect(() => {
    if (!imprimiendo) return;
    const onAfter = () => setImprimiendo(false);
    window.addEventListener("afterprint", onAfter);
    return () => window.removeEventListener("afterprint", onAfter);
  }, [imprimiendo]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Cargos</h1>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Input
          label="Desde"
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          className="max-w-[160px]"
        />
        <Input
          label="Hasta"
          type="date"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          className="max-w-[160px]"
        />
        <Select label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-36">
          <option value="">Todos</option>
          <option value="envio">Envío</option>
          <option value="visita">Visita</option>
        </Select>
        <Input
          label="Código de viaje"
          placeholder="Ej: V..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-[180px]"
        />
        {hayFiltros && (
          <Button variant="secondary" onClick={quitarFiltros}>
            Quitar filtros
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setSeleccionados(new Set(cargos.map((c) => c.viaje_id)))}
            disabled={cargos.length === 0}
          >
            Seleccionar todos
          </Button>
          <Button
            variant="secondary"
            onClick={() => setSeleccionados(new Set())}
            disabled={cargos.length === 0}
          >
            Ninguno
          </Button>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {cargos.length} cargo(s) · {seleccionados.size} seleccionado(s)
        </p>
        <Button
          onClick={() => setImprimiendo(true)}
          disabled={seleccionadosList.length === 0}
        >
          Imprimir seleccionados
        </Button>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-2">
          {cargos.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
              No hay viajes de entrega que coincidan con los filtros.
            </div>
          )}
          {visibles.map((c) => (
            <label
              key={c.viaje_id}
              className="block cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-blue-300"
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={c.seleccionado}
                  onChange={() => toggle(c.viaje_id)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-4 w-4"
                />
                <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-mono font-semibold text-blue-700">{c.codigo_viaje}</span>
                  <span className="font-mono text-xs text-slate-400">pedido {c.codigo_pedido ?? "—"}</span>
                  <span className="text-sm text-slate-500">
                    {c.fecha_viaje ? c.fecha_viaje.slice(8, 10) + "/" + c.fecha_viaje.slice(5, 7) + "/" + c.fecha_viaje.slice(0, 4) : ""}
                  </span>
                  <Badge color={c.tipo_pedido === "visita" ? "amber" : "blue"}>
                    {c.tipo_pedido ?? "—"}
                  </Badge>
                  <span className="text-sm text-slate-600">
                    {c.cliente?.nombre ?? "Sin cliente"} · {c.cliente?.telefono ?? ""}
                  </span>
                  <span className="text-sm text-slate-500">
                    {c.ciudad ?? ""}
                    {c.empresa_envio ? ` · ${c.empresa_envio}` : ""}
                  </span>
                  <span className="text-sm font-medium text-slate-700">
                    S/ {Number(c.monto_total ?? 0).toFixed(2)}
                  </span>
                  <span className="text-sm text-slate-500">
                    {c.detalles.length} producto(s)
                  </span>
                </div>
              </div>
            </label>
          ))}
        </div>
      )}

      {imprimiendo && (
        <div id="print-sheet" className="fixed inset-0 z-[100] overflow-y-auto bg-white">
          <div className="mb-4 flex items-center justify-between p-6 print:hidden">
            <p className="text-sm text-slate-500">
              Hoja de cargos — {seleccionadosList.length} cargo(s). Configura tu impresora
              (A4, horizontal u vertical según prefieras) y pulsa Imprimir.
            </p>
            <Button variant="secondary" onClick={() => setImprimiendo(false)}>
              Cancelar
            </Button>
          </div>
          <div className="space-y-6 p-6 print:p-0 print:space-y-3">
            {seleccionadosList.map((c, i) => (
              <div key={c.viaje_id} className="break-inside-avoid">
                {i > 0 && <div className="mb-5 border-t border-dashed border-slate-300 print:hidden" />}
                <div className="space-y-1.5">
                  <CargoDespacho p={c} config={config} />
                  <CargoAgencia p={c} config={config} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
