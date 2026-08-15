"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Button, Input, Select, ErrorBanner } from "@/components/ui";

type Producto = { id: string; imei: string; nombre: string; tipo_talla: string };
type Talla = { id: string; nombre: string };
type Item = { key: string; producto_id: string; talla_id: string; cantidad: string };
type TandaResumen = {
  id: string;
  codigo: string;
  fecha_creacion: string;
  unidades: number;
};

let itemKey = 0;
const nuevoItem = (): Item => ({
  key: `item-${++itemKey}`,
  producto_id: "",
  talla_id: "",
  cantidad: "1",
});

export default function TandaForm() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [tallasPorProducto, setTallasPorProducto] = useState<Record<string, Talla[]>>({});
  const [items, setItems] = useState<Item[]>([]);
  const [empezada, setEmpezada] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ codigo: string; creados: number } | null>(null);
  const [tandas, setTandas] = useState<TandaResumen[]>([]);

  useEffect(() => {
    (async () => {
      const [p, t] = await Promise.all([
        api<{ productos: Producto[] }>("/api/productos"),
        api<{ tandas: TandaResumen[] }>("/api/tandas"),
      ]);
      setProductos(p.data?.productos ?? []);
      setTandas(t.data?.tandas ?? []);
    })();
  }, []);

  const recargarTandas = useCallback(async () => {
    const { data } = await api<{ tandas: TandaResumen[] }>("/api/tandas");
    if (data) setTandas(data.tandas ?? []);
  }, []);

  const nuevaTanda = () => {
    setItems([nuevoItem()]);
    setEmpezada(true);
    setResultado(null);
    setError(null);
  };

  const cargarTallas = useCallback(async (productoId: string) => {
    if (tallasPorProducto[productoId]) return;
    const { data } = await api<{ tallas: Talla[] }>("/api/tallas?producto_id=" + productoId);
    if (data) setTallasPorProducto((prev) => ({ ...prev, [productoId]: data.tallas ?? [] }));
  }, [tallasPorProducto]);

  const cambiarProducto = (key: string, productoId: string) => {
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, producto_id: productoId, talla_id: "" } : it))
    );
    if (productoId) cargarTallas(productoId);
  };

  const cambiarTalla = (key: string, tallaId: string) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, talla_id: tallaId } : it)));
  };

  const cambiarCantidad = (key: string, cantidad: string) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, cantidad } : it)));
  };

  const quitarItem = (key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
  };

  const completo = items.every(
    (it) =>
      it.producto_id &&
      it.talla_id &&
      Number.isInteger(Number(it.cantidad)) &&
      Number(it.cantidad) > 0
  );

  const totalUnidades = items.reduce((acc, it) => {
    const n = Number(it.cantidad);
    return acc + (Number.isInteger(n) && n > 0 ? n : 0);
  }, 0);

  async function confirmar() {
    setError(null);
    setCreando(true);
    const payload = items.map((it) => ({
      producto_id: it.producto_id,
      talla_id: it.talla_id,
      cantidad: Number(it.cantidad),
    }));
    const { data, error } = await api<{ tanda: { codigo: string }; creados: number }>(
      "/api/tandas",
      {
        method: "POST",
        body: JSON.stringify({ items: payload }),
      }
    );
    setCreando(false);
    if (error) setError(error);
    else if (data) {
      setResultado({ codigo: data.tanda.codigo, creados: data.creados });
      recargarTandas();
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Crea una tanda de productos únicos: elige producto, talla y cantidad por fila.
        </p>
        <Button onClick={nuevaTanda}>Nueva tanda de productos</Button>
      </div>
      <ErrorBanner message={error} />

      {!empezada ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white py-12 text-center">
          <p className="text-sm font-medium text-slate-600">Aún no hay una tanda en preparación.</p>
          <p className="mt-1 text-xs text-slate-400">
            Pulsa &quot;Nueva tanda de productos&quot; para empezar.
          </p>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          {items.map((it, idx) => {
            const tallas = it.producto_id ? tallasPorProducto[it.producto_id] ?? [] : [];
            return (
              <div key={it.key} className="flex flex-wrap items-end gap-2">
                <Select
                  label={`Producto ${idx + 1}`}
                  value={it.producto_id}
                  onChange={(e) => cambiarProducto(it.key, e.target.value)}
                  className="min-w-[240px] flex-1"
                >
                  <option value="">Selecciona un producto...</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.imei})
                    </option>
                  ))}
                </Select>
                <Select
                  label="Talla"
                  value={it.talla_id}
                  onChange={(e) => cambiarTalla(it.key, e.target.value)}
                  className="w-28"
                >
                  <option value="">Talla</option>
                  {tallas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Cantidad"
                  type="number"
                  min={1}
                  value={it.cantidad}
                  onChange={(e) => cambiarCantidad(it.key, e.target.value)}
                  className="w-28"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => quitarItem(it.key)}
                  disabled={items.length === 1}
                >
                  Quitar
                </Button>
              </div>
            );
          })}

          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setItems((p) => [...p, nuevoItem()])}>
                + Agregar producto
              </Button>
              <span className="self-center text-xs text-slate-500">
                {items.length} fila(s) · {totalUnidades} unidad(es)
              </span>
            </div>
            <Button variant="success" onClick={confirmar} disabled={!completo || creando}>
              {creando ? "Creando..." : "Confirmar tanda"}
            </Button>
          </div>

          {resultado && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Tanda <strong>{resultado.codigo}</strong> creada con <strong>{resultado.creados}</strong>{" "}
              producto(s) único(s). Los QRs quedaron registrados en la pestaña &quot;Imprimir QRs&quot;.
            </div>
          )}
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Tandas creadas</h2>
        {tandas.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no hay tandas registradas.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {tandas.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <div>
                  <p className="font-mono text-sm font-semibold text-blue-700">{t.codigo}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(t.fecha_creacion).toLocaleString("es-PE", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-800">{t.unidades}</p>
                  <p className="text-xs text-slate-400">unidades</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
