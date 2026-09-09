"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { api, useSesion } from "@/lib/api";
import { Button, Input, Spinner, ErrorBanner } from "@/components/ui";
import { TIPO_TALLA_TIPOS, TIPO_TALLA_LABEL } from "@/lib/productos";

type Producto = {
  id: string;
  imei: string;
  nombre: string;
  tipo_talla: string;
  precio_referencial: number;
  foto_url: string | null;
  estado: string;
  stock: Record<string, Record<string, number>>;
  stock_ventas: Record<string, Record<string, number>>;
};

type Talla = { id: string; nombre: string; tipo: string };

const TABS = [
  { id: "lista", label: "Lista" },
  { id: "crear", label: "Crear producto nuevo" },
] as const;

const TIPOS_TABLA = ["A", "B", "C"] as const;
const OPCIONES_TALLA = ["A", "B", "C"] as const;

export default function ProductosPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("lista");

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-slate-800">Productos</h1>

      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "lista" && <ListaProductos />}
      {tab === "crear" && <CrearProducto onCreado={() => setTab("lista")} />}
    </div>
  );
}

function ListaProductos() {
  const { user: sesion } = useSesion();
  const esAdmin = sesion?.rol === "controller" || sesion?.rol === "admin";
  const [productos, setProductos] = useState<Producto[]>([]);
  const [tallas, setTallas] = useState<Talla[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tipoActivo, setTipoActivo] = useState<string>("A");
  const [vista, setVista] = useState<"almacen" | "ventas">("ventas");

  const cargar = useCallback(async () => {
    const [p, t] = await Promise.all([
      api<{ productos: Producto[] }>("/api/productos"),
      api<{ tallas: Talla[] }>("/api/tallas"),
    ]);
    if (p.error) setError((e) => e ?? p.error);
    else setProductos(p.data?.productos ?? []);
    if (t.error) setError((e) => e ?? t.error);
    else setTallas(t.data?.tallas ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const tallasPorTipo = useMemo(() => {
    const map: Record<string, Talla[]> = {};
    for (const t of tallas) {
      map[t.tipo] = map[t.tipo] ?? [];
      map[t.tipo].push(t);
    }
    return map;
  }, [tallas]);

  const q = search.trim().toLowerCase();
  const filtrados = useMemo(
    () =>
      productos.filter(
        (p) =>
          !q ||
          p.nombre.toLowerCase().includes(q) ||
          p.imei.toLowerCase().includes(q)
      ),
    [productos, q]
  );

  const enTipo = (tipo: string) =>
    filtrados.filter((p) => (TIPO_TALLA_TIPOS[p.tipo_talla] ?? []).includes(tipo));

  const sinTalla = filtrados.filter(
    (p) => (TIPO_TALLA_TIPOS[p.tipo_talla] ?? []).length === 0
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Input
          placeholder="Buscar por nombre o IMEI..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {(
            [
              { id: "almacen", label: "Stock almacén" },
              { id: "ventas", label: "Stock ventas" },
            ] as const
          ).map((v) => (
            <button
              key={v.id}
              onClick={() => setVista(v.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                vista === v.id
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : (
        <>
          {/* Móvil / pantallas chicas: pestañas de talla */}
          <div className="xl:hidden">
            <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
              {TIPOS_TABLA.map((tipo) => (
                <button
                  key={tipo}
                  onClick={() => setTipoActivo(tipo)}
                  className={`whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                    tipoActivo === tipo
                      ? "border-blue-600 text-blue-700"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Talla {tipo}
                  <span className="ml-1 text-xs text-slate-400">({enTipo(tipo).length})</span>
                </button>
              ))}
            </div>
            <TablaTipo
              tipo={tipoActivo}
              rows={enTipo(tipoActivo)}
              cols={tallasPorTipo[tipoActivo] ?? []}
              vista={vista}
              esAdmin={esAdmin}
            />
          </div>

          {/* Desktop: 3 tablas al lado */}
          <div className="hidden gap-4 xl:grid xl:grid-cols-3">
            {TIPOS_TABLA.map((tipo) => (
              <TablaTipo key={tipo} tipo={tipo} rows={enTipo(tipo)} cols={tallasPorTipo[tipo] ?? []} vista={vista} esAdmin={esAdmin} />
            ))}
          </div>

          {sinTalla.length > 0 && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <span className="font-semibold text-slate-700">Sin talla:</span>{" "}
              {sinTalla.map((p) => `${p.nombre} (${p.imei})`).join(", ")}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TablaTipo({
  tipo,
  rows,
  cols,
  vista,
  esAdmin,
}: {
  tipo: string;
  rows: Producto[];
  cols: Talla[];
  vista: "almacen" | "ventas";
  esAdmin: boolean;
}) {
  const [tallaSel, setTallaSel] = useState<string | null>(null);

  useEffect(() => {
    setTallaSel(null);
  }, [vista]);

  const stockDe = useCallback(
    (p: Producto, nombre: string) => {
      const fuente = vista === "ventas" ? p.stock_ventas : p.stock;
      return fuente?.[tipo]?.[nombre] ?? 0;
    },
    [tipo, vista]
  );

  const renderRows = useMemo(() => {
    if (!tallaSel) return rows;
    return [...rows]
      .filter((p) => stockDe(p, tallaSel) > 0)
      .sort((a, b) => stockDe(b, tallaSel) - stockDe(a, tallaSel));
  }, [rows, tallaSel, stockDe]);

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Talla {tipo}
          <span className="ml-1 font-normal normal-case text-slate-400">
            {vista === "ventas" ? "· stock ventas" : "· stock almacén"}
          </span>
        </span>
        <span className="text-xs text-slate-400">
          {tallaSel
            ? `Filtro talla ${tallaSel} · ${renderRows.length}`
            : rows.length}
        </span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-2 py-2">IMEI</th>
            {cols.map((c) => {
              const activo = tallaSel === c.nombre;
              return (
                <th key={c.id} className="px-1 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => setTallaSel(activo ? null : c.nombre)}
                    title={
                      activo
                        ? "Quitar filtro de talla"
                        : "Mostrar solo productos con stock en esta talla"
                    }
                    className={`rounded px-2 py-1 uppercase transition-colors ${
                      activo
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-500 hover:bg-slate-200 hover:text-blue-700"
                    }`}
                  >
                    {c.nombre}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {renderRows.length === 0 && (
            <tr>
              <td
                colSpan={cols.length + 1}
                className="px-4 py-10 text-center text-sm text-slate-400"
              >
                {tallaSel
                  ? `Sin stock en talla ${tallaSel}.`
                  : `Sin productos de talla ${tipo}.`}
              </td>
            </tr>
          )}
          {renderRows.map((p) => (
            <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-slate-500">
                {esAdmin ? (
                  <a
                    href={`/bitacora?tab=iet&producto=${p.id}`}
                    title="Ver historial por IMEI + talla"
                    className="text-slate-500 hover:text-blue-700 hover:underline"
                  >
                    {p.imei}
                  </a>
                ) : (
                  p.imei
                )}
              </td>
              {cols.map((c) => {
                const fuente = vista === "ventas" ? p.stock_ventas : p.stock;
                const n = fuente?.[tipo]?.[c.nombre] ?? 0;
                const estilo =
                  n > 0
                    ? vista === "ventas"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-emerald-50 text-emerald-700"
                    : n < 0
                      ? "bg-red-50 text-red-600"
                      : "bg-slate-100 text-slate-400";
                return (
                  <td
                    key={c.id}
                    className={`px-1 py-2 text-center ${
                      tallaSel === c.nombre ? "bg-blue-50/50" : ""
                    }`}
                  >
                    <span
                      className={`inline-flex h-6 w-7 items-center justify-center rounded text-xs font-semibold ${estilo}`}
                    >
                      {n}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CrearProducto({ onCreado }: { onCreado: () => void }) {
  const [imei, setImei] = useState("");
  const [nombre, setNombre] = useState("");
  const [seleccion, setSeleccion] = useState<Record<string, boolean>>({
    A: false,
    B: false,
    C: false,
  });
  const [precio, setPrecio] = useState("");
  const [fotoUrl, setFotoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creado, setCreado] = useState<string | null>(null);

  const tipoTalla = useMemo(
    () => OPCIONES_TALLA.filter((t) => seleccion[t]).join(""),
    [seleccion]
  );

  async function guardar() {
    setError(null);
    setCreado(null);
    if (!tipoTalla) {
      setError("Selecciona al menos un tipo de talla.");
      return;
    }
    setLoading(true);
    const { data, error } = await api<{ producto: Producto }>("/api/productos", {
      method: "POST",
      body: JSON.stringify({
        imei,
        nombre,
        tipo_talla: tipoTalla,
        precio_referencial: Number(precio || 0),
        foto_url: fotoUrl.trim() || null,
      }),
    });
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    const p = data?.producto;
    setCreado(
      p ? `${p.nombre} creado con 0 unidades en todas sus tallas.` : "Producto creado."
    );
    setImei("");
    setNombre("");
    setSeleccion({ A: false, B: false, C: false });
    setPrecio("");
    setFotoUrl("");
  }

  return (
    <div className="max-w-xl">
      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        <Input label="IMEI" value={imei} onChange={(e) => setImei(e.target.value)} required />

        <div>
          <span className="mb-1 block font-medium text-slate-700">Tipo de talla</span>
          <div className="flex flex-wrap gap-2">
            {OPCIONES_TALLA.map((tipo) => (
              <button
                key={tipo}
                type="button"
                onClick={() => setSeleccion((s) => ({ ...s, [tipo]: !s[tipo] }))}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  seleccion[tipo]
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Talla {tipo}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Puedes elegir varias a la vez.
            {tipoTalla && (
              <span className="ml-1 font-semibold text-blue-600">
                → {TIPO_TALLA_LABEL[tipoTalla] ?? tipoTalla}
              </span>
            )}
          </p>
        </div>

        <Input
          label="Precio referencial (S/)"
          type="number"
          step="0.01"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
        />

        <Input
          label="URL de imagen (opcional)"
          value={fotoUrl}
          onChange={(e) => setFotoUrl(e.target.value)}
          placeholder="Pronto se importará desde el Drive"
        />

        <ErrorBanner message={error} />

        {creado && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            {creado}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <Button variant="secondary" onClick={onCreado}>
            Ver lista
          </Button>
          <Button onClick={guardar} disabled={loading}>
            {loading ? "Guardando..." : "Crear producto"}
          </Button>
        </div>
      </div>
    </div>
  );
}
