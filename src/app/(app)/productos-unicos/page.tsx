"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Input, Select, Badge, Spinner, ErrorBanner } from "@/components/ui";
import TandaForm from "@/components/TandaForm";
import ImprimirQrs from "@/components/ImprimirQrs";
import ConteoAlmacen from "@/components/ConteoAlmacen";

const EN_ALMACEN = "En almacén";
const FUERA_ALMACEN = "Fuera de almacén";

function estadoAgrupado(estado: string): string {
  return estado === "en_almacen" ? EN_ALMACEN : FUERA_ALMACEN;
}

type ProductoUnico = {
  id: string;
  codigo_qr: string;
  estado: string;
  productos: { imei: string; nombre: string } | null;
  tallas: { nombre: string } | null;
};

const TABS = [
  { id: "lista", label: "Lista" },
  { id: "conteo", label: "Conteo" },
  { id: "stock", label: "Añadir stock" },
  { id: "qrs", label: "Imprimir QRs" },
] as const;

export default function ProductosUnicosPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("lista");

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-slate-800">Productos Únicos</h1>

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

      {tab === "lista" && <ListaProductosUnicos />}
      {tab === "conteo" && <ConteoAlmacen />}
      {tab === "stock" && <TandaForm />}
      {tab === "qrs" && <ImprimirQrs />}
    </div>
  );
}

function ListaProductosUnicos() {
  const [items, setItems] = useState<ProductoUnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("");

  const cargar = useCallback(async () => {
    const { data, error } = await api<{ productos_unicos: ProductoUnico[] }>(
      "/api/productos-unicos"
    );
    if (error) setError(error);
    else setItems(data?.productos_unicos ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filtrados = items.filter((u) => {
    if (estado && estadoAgrupado(u.estado) !== estado) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.codigo_qr.toLowerCase().includes(q) ||
      (u.productos?.imei ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por ID o IMEI..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={estado} onChange={(e) => setEstado(e.target.value)} className="max-w-[200px]">
          <option value="">Todos los estados</option>
          <option value={EN_ALMACEN}>{EN_ALMACEN}</option>
          <option value={FUERA_ALMACEN}>{FUERA_ALMACEN}</option>
        </Select>
        <button
          className="text-sm text-blue-600 hover:underline"
          onClick={() => {
            setSearch("");
            setEstado("");
          }}
        >
          Limpiar
        </button>
      </div>
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">IMEI</th>
                <th className="px-4 py-2">Producto</th>
                <th className="px-4 py-2">Talla</th>
                <th className="px-4 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                    No hay productos únicos que coincidan.
                  </td>
                </tr>
              )}
              {filtrados.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono font-semibold text-blue-700">{u.codigo_qr}</td>
                  <td className="px-4 py-2 text-slate-700">{u.productos?.imei ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-800">{u.productos?.nombre ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{u.tallas?.nombre ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Badge color={u.estado === "en_almacen" ? "green" : "red"}>
                      {estadoAgrupado(u.estado)}
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
