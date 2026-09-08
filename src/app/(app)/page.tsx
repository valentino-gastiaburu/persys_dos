"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  BarChart,
  Cell,
} from "recharts";

// ---------------- Tipos ----------------

type Stats = {
  pedidos_confirmados: number;
  pedidos_pendientes: number;
  viajes_en_curso: number;
  productos: number;
  clientes: number;
};

type Metricas = {
  desde: string;
  hasta: string;
  kpis: {
    ventas_monto: number;
    ventas_count: number;
    cantidad_vendida: number;
    pagos_monto: number;
    deuda_ventas: number;
    ticket_promedio: number;
    registrados: number;
    confirmados: number;
    cancelados: number;
    devueltos: number;
    sin_confirmar: number;
    conversion_pct: number;
  };
  series_ventas: { fecha: string; monto: number; cantidad: number }[];
  series_pagos: { fecha: string; monto: number }[];
  pedidos_por_hora: number[];
  productos: { producto_id: string; nombre: string; imei: string; cantidad: number; monto: number }[];
  ciudades: { ciudad: string; pedidos: number }[];
  vendedoras: {
    id: string;
    nombre: string;
    titular: number;
    colaboradora_1: number;
    colaboradora_2: number;
    participaciones: number;
    monto: number;
    ventas_confirmadas: number;
    ticket: number;
  }[];
  canales: { canal: string; pedidos: number; monto: number }[];
  metodos_pago: { metodo: string; pagos: number; monto: number }[];
};

type Preset = "hoy" | "7" | "30" | "mes" | "custom";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "7", label: "7 días" },
  { id: "30", label: "30 días" },
  { id: "mes", label: "Este mes" },
  { id: "custom", label: "Personalizado" },
];

const soles = (n: number) =>
  "S/ " + (Number.isFinite(n) ? n.toLocaleString("es-PE", { maximumFractionDigits: 0 }) : "0");

export default function HomePage() {
  const [rol, setRol] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api<{ user: { rol: string } }>("/api/auth/me").then(({ data }) => {
      setRol(data?.user?.rol ?? null);
    });
  }, []);

  const esAdmin = rol === "controller" || rol === "admin";

  useEffect(() => {
    if (esAdmin) return;
    (async () => {
      const [p, v, pro, c] = await Promise.all([
        api("/api/pedidos"),
        api("/api/viajes"),
        api("/api/productos"),
        api("/api/clientes"),
      ]);
      const pedidos = (p.data as any)?.pedidos ?? [];
      const productos = (pro.data as any)?.productos ?? [];
      const clientes = (c.data as any)?.clientes ?? [];
      const viajes = (v.data as any)?.viajes ?? [];
      setStats({
        pedidos_confirmados: pedidos.filter((x: any) => x.estado === "confirmado").length,
        pedidos_pendientes: pedidos.filter((x: any) => ["registrado", "recibido"].includes(x.estado)).length,
        viajes_en_curso: viajes.filter((x: any) => ["alistado", "enviado"].includes(x.estado)).length,
        productos: productos.length,
        clientes: clientes.length,
      });
    })();
  }, [esAdmin]);

  if (rol === null) return <Spinner />;

  if (!esAdmin) {
    if (!stats) return <Spinner />;
    return <HomeSimple stats={stats} />;
  }

  return <Dashboard />;
}

// ---------------- Home simple (vendedoras/almacén) ----------------

function HomeSimple({ stats }: { stats: Stats }) {
  const cards = [
    { label: "Pedidos confirmados", value: stats.pedidos_confirmados, href: "/pedidos" },
    { label: "Pedidos pendientes", value: stats.pedidos_pendientes, href: "/pedidos" },
    { label: "Viajes en curso", value: stats.viajes_en_curso, href: "/almacen" },
    { label: "Productos", value: stats.productos, href: "/productos" },
    { label: "Clientes", value: stats.clientes, href: "/clientes" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Panel</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <p className="text-3xl font-bold text-blue-600">{c.value}</p>
            <p className="mt-1 text-xs font-medium text-slate-500">{c.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------- Dashboard (admin/controller) ----------------

const COLORS = ["#2563eb", "#059669", "#f59e0b", "#7c3aed", "#e11d48", "#0891b2", "#ca8a04", "#4f46e5"];

function Dashboard() {
  const [preset, setPreset] = useState<Preset>("30");
  const [hoy, setHoy] = useState<string | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [fechas, setFechas] = useState<{ desde: string; hasta: string } | null>(null);
  const [data, setData] = useState<Metricas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ hoy: string }>("/api/hoy").then(({ data }) => {
      if (data?.hoy) {
        setHoy(data.hoy);
        setDesde(sumDias(data.hoy, -29));
        setHasta(data.hoy);
        setFechas({ desde: sumDias(data.hoy, -29), hasta: data.hoy });
      }
    });
  }, []);

  const aplicarPreset = useCallback(
    (p: Preset, hoyRef: string) => {
      setPreset(p);
      if (p === "hoy") {
        setDesde(hoyRef);
        setHasta(hoyRef);
        setFechas({ desde: hoyRef, hasta: hoyRef });
      } else if (p === "7") {
        setDesde(sumDias(hoyRef, -6));
        setHasta(hoyRef);
        setFechas({ desde: sumDias(hoyRef, -6), hasta: hoyRef });
      } else if (p === "30") {
        setDesde(sumDias(hoyRef, -29));
        setHasta(hoyRef);
        setFechas({ desde: sumDias(hoyRef, -29), hasta: hoyRef });
      } else if (p === "mes") {
        const mes = hoyRef.slice(0, 7) + "-01";
        setDesde(mes);
        setHasta(hoyRef);
        setFechas({ desde: mes, hasta: hoyRef });
      }
    },
    []
  );

  // Aplicar preset una vez que tengamos "hoy".
  useEffect(() => {
    if (hoy && fechas === null) aplicarPreset("30", hoy);
  }, [hoy, fechas, aplicarPreset]);

  const cargar = useCallback(async (d: string, h: string) => {
    setLoading(true);
    setError(null);
    const { data, error } = await api<Metricas>(`/api/metricas?desde=${d}&hasta=${h}`);
    if (error) setError(error);
    else if (data) setData(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (fechas) cargar(fechas.desde, fechas.hasta);
  }, [fechas, cargar]);

  const aplicarCustom = () => {
    if (!desde || !hasta || desde > hasta) {
      setError("Rango inválido: 'desde' debe ser igual o anterior a 'hasta'.");
      return;
    }
    setPreset("custom");
    setFechas({ desde, hasta });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Panel</h1>
          <p className="text-sm text-slate-400">
            {data ? `${data.desde} → ${data.hasta}` : "Cargando…"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => hoy && aplicarPreset(p.id, hoy)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  preset === p.id
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={desde}
              max={hasta || undefined}
              onChange={(e) => setDesde(e.target.value)}
              className="rounded-md border border-slate-200 px-2 py-1.5 text-xs"
            />
            <span className="text-xs text-slate-400">→</span>
            <input
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => setHasta(e.target.value)}
              className="rounded-md border border-slate-200 px-2 py-1.5 text-xs"
            />
            <button
              onClick={aplicarCustom}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Ver
            </button>
          </div>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
      {loading && <Spinner />}
      {!loading && data && (() => {
        const k = data.kpis;
        const maxProducto = Math.max(1, ...(data.productos.map((p) => p.cantidad) ?? []));
        const maxCiudad = Math.max(1, ...(data.ciudades.map((c) => c.pedidos) ?? []));
        const maxHora = Math.max(1, ...(data.pedidos_por_hora ?? []));
        const maxCanal = Math.max(1, ...(data.canales.map((c) => c.pedidos) ?? [1]));
        const maxMetodo = Math.max(1, ...(data.metodos_pago.map((m) => m.monto) ?? [1]));
        const desglose = [
          { label: "Registrados (pedidos)", value: k.registrados, color: "bg-slate-400" },
          { label: "→ Confirmados (ventas)", value: k.confirmados, color: "bg-blue-600" },
          { label: "→ Cancelados", value: k.cancelados, color: "bg-red-500" },
          { label: "→ Devueltos", value: k.devueltos, color: "bg-amber-500" },
          { label: "→ Sin confirmar", value: k.sin_confirmar, color: "bg-slate-200" },
        ];
        return (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Kpi label="Ventas" value={soles(k.ventas_monto)} sub={`${k.ventas_count} ventas`} accent />
            <Kpi label="Cantidad vendida" value={`${k.cantidad_vendida}`} sub="unidades" />
            <Kpi label="Pagos recibidos" value={soles(k.pagos_monto)} sub="en el rango" accent />
            <Kpi
              label="Deuda de ventas"
              value={soles(k.deuda_ventas)}
              sub="lo que falta cobrar"
              tone={k.deuda_ventas > 0 ? "red" : "green"}
            />
            <Kpi label="Ticket promedio" value={soles(k.ticket_promedio)} sub="por venta" />
            <Kpi label="Pedidos" value={`${k.registrados}`} sub={`${k.conversion_pct}% a venta`} />
            <Kpi label="Cancelados" value={`${k.cancelados}`} tone={k.cancelados > 0 ? "red" : "green"} />
          </div>

          {/* Ventas vs pagos + cantidad */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-slate-800">
              Ventas vs pagos (S/) y unidades vendidas por día
            </h2>
            <p className="mb-3 text-xs text-slate-400">
              Las ventas se cuentan cuando el pedido se confirma; los pagos, cuando se cobran (puede haber desfase).
            </p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.series_ventas.map((d, i) => ({ ...d, pagos: data.series_pagos[i]?.monto ?? 0 }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 10 }} tickFormatter={(f: string) => f.slice(5)} minTickGap={28} stroke="#94a3b8" />
                  <YAxis yAxisId="soles" stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={(n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)} />
                  <YAxis yAxisId="unid" orientation="right" stroke="#f59e0b" tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: any, name: any) => {
                      if (name === "cantidad") return [`${value} u.`, "Unidades"];
                      return [soles(Number(value)), name === "monto" ? "Ventas" : "Pagos"];
                    }}
                    labelFormatter={(l) => String(l)}
                  />
                  <Legend />
                  <Bar yAxisId="unid" dataKey="cantidad" name="Unidades" fill="#fbbf24" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="soles" type="monotone" dataKey="monto" name="Ventas S/" stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line yAxisId="soles" type="monotone" dataKey="pagos" name="Pagos S/" stroke="#059669" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Desglose de pedidos */}
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-1 text-sm font-semibold text-slate-800">Pedidos registrados: resultado final</h2>
              <p className="mb-3 text-xs text-slate-400">Todo lo que se registró en el rango y cómo terminó.</p>
              <div className="flex h-8 w-full overflow-hidden rounded-lg">
                {desglose.slice(1).map((d) => (
                  <div
                    key={d.label}
                    className={`${d.color} h-full ${d.value === 0 ? "" : ""}`}
                    style={{ width: `${k.registrados ? (d.value / k.registrados) * 100 : 0}%` }}
                    title={`${d.label}: ${d.value}`}
                  />
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {desglose.map((d) => (
                  <div key={d.label} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${d.color}`} />
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] text-slate-500">{d.label}</span>
                      <span className="text-sm font-bold text-slate-800">{d.value}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Pedidos por hora */}
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Pedidos registrados por hora</h2>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.pedidos_por_hora.map((n, h) => ({ hora: `${h}`, pedidos: n }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="hora" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis allowDecimals={false} stroke="#94a3b8" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: any) => [`${value} pedidos`, ""]} labelFormatter={(h) => `${h}:00`} />
                    <Bar dataKey="pedidos" fill="#7c3aed" radius={[3, 3, 0, 0]}>
                      {data.pedidos_por_hora.map((n, i) => (
                        <Cell key={i} fill={n === maxHora ? "#7c3aed" : "#c4b5fd"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Productos más vendidos */}
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Productos más vendidos</h2>
              {data.productos.length === 0 ? (
                <p className="text-sm text-slate-400">Sin ventas en el rango.</p>
              ) : (
                <ul className="space-y-2.5">
                  {data.productos.map((p, i) => (
                    <li key={p.producto_id} className="flex items-center gap-3">
                      <span className="w-5 text-right text-xs font-semibold text-slate-300">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium text-slate-700">
                            {p.nombre} {p.imei && <span className="font-mono text-xs text-slate-400">({p.imei})</span>}
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-slate-600">
                            {p.cantidad} u. · {soles(p.monto)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.max(4, (p.cantidad / maxProducto) * 100)}%`, background: COLORS[i % COLORS.length] }}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Ciudades */}
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Ciudades donde se compra más</h2>
              {data.ciudades.length === 0 ? (
                <p className="text-sm text-slate-400">Sin datos de ciudad en las ventas del rango.</p>
              ) : (
                <ul className="space-y-2.5">
                  {data.ciudades.map((c, i) => (
                    <li key={c.ciudad} className="flex items-center gap-3">
                      <span className="w-5 text-right text-xs font-semibold text-slate-300">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium text-slate-700">{c.ciudad}</span>
                          <span className="shrink-0 text-xs font-semibold text-slate-600">{c.pedidos} pedidos</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${Math.max(4, (c.pedidos / maxCiudad) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Vendedoras */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-slate-800">Rendimiento por vendedora</h2>
            <p className="mb-3 text-xs text-slate-400">
              Pedidos registrados en el rango por puesto (titular / colaboradora 1 / colaboradora 2) y ventas confirmadas con su ticket.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Vendedora</th>
                    <th className="px-3 py-2 text-center">Titular</th>
                    <th className="px-3 py-2 text-center">Colab. 1</th>
                    <th className="px-3 py-2 text-center">Colab. 2</th>
                    <th className="px-3 py-2 text-center">Participaciones</th>
                    <th className="px-3 py-2 text-right">Ventas confirmadas</th>
                    <th className="px-3 py-2 text-right">Monto ventas</th>
                    <th className="px-3 py-2 text-right">Ticket promedio</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vendedoras.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-sm text-slate-400">
                        Sin vendedoras activas.
                      </td>
                    </tr>
                  )}
                  {data.vendedoras.map((v, i) => (
                    <tr key={v.id} className={`border-b border-slate-100 last:border-0 ${i === 0 && v.participaciones > 0 ? "bg-blue-50/50" : ""}`}>
                      <td className="px-3 py-2 font-medium text-slate-800">{v.nombre}</td>
                      <td className="px-3 py-2 text-center text-slate-600">{v.titular}</td>
                      <td className="px-3 py-2 text-center text-slate-600">{v.colaboradora_1}</td>
                      <td className="px-3 py-2 text-center text-slate-600">{v.colaboradora_2}</td>
                      <td className="px-3 py-2 text-center font-semibold text-slate-800">{v.participaciones}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{v.ventas_confirmadas}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-800">{soles(v.monto)}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{v.ventas_confirmadas ? soles(v.ticket) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Canales */}
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Canal de venta</h2>
              <ul className="space-y-2.5">
                {data.canales.map((c) => (
                  <li key={c.canal} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-sm capitalize text-slate-600">{c.canal}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(4, (c.pedidos / maxCanal) * 100)}%` }} />
                    </div>
                    <span className="w-24 shrink-0 text-right text-xs font-semibold text-slate-600">
                      {c.pedidos} · {soles(c.monto)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Métodos de pago */}
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Métodos de pago (cobrados)</h2>
              <ul className="space-y-2.5">
                {data.metodos_pago.map((m) => (
                  <li key={m.metodo} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-sm capitalize text-slate-600">{m.metodo.replace(/_/g, " ")}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(4, (m.monto / maxMetodo) * 100)}%` }} />
                    </div>
                    <span className="w-24 shrink-0 text-right text-xs font-semibold text-slate-600">
                      {m.pagos} cobros · {soles(m.monto)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
        );
      })()}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  tone?: "red" | "green";
}) {
  const color = tone === "red" ? "text-red-600" : tone === "green" ? "text-emerald-600" : accent ? "text-blue-600" : "text-slate-800";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

function sumDias(ymd: string, dias: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}