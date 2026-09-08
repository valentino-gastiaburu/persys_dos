"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Input, Spinner, ErrorBanner, Badge } from "@/components/ui";

type ProductoL = {
  id: string;
  imei: string | null;
  nombre: string;
  tipo_talla: string;
};

type TallaResumen = {
  id: string;
  nombre: string;
  en_almacen: number;
  almacen_espera: number;
  en_viaje: number;
  entregado: number;
  devuelto: number;
  total: number;
};

type UnidadHist = {
  id: string;
  codigo_qr: string;
  estado: string;
  talla_id: string | null;
  talla: string;
  talla_original: string | null;
  es_entallada: boolean;
  fecha_ingreso: string | null;
  fecha_salida: string | null;
  ubicacion: { viaje_codigo: string; viaje_tipo: string; pedido_codigo: string } | null;
};

type MovHist = {
  id: string;
  tipo: string;
  cantidad: number;
  talla: string;
  fecha: string;
  nota: string | null;
  persona: string | null;
};

type EntalleHist = {
  id: string;
  codigo_qr: string | null;
  talla_anterior: string | null;
  talla_nueva: string | null;
  fecha: string;
  persona: string | null;
};

const ESTADO_LABEL: Record<string, string> = {
  en_almacen: "En almacén",
  almacen_espera: "Reservado",
  en_viaje: "En viaje",
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

function fmtFecha(f: string | null) {
  if (!f) return "—";
  return new Date(f).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function TabIET({ initial }: { initial: URLSearchParams | null }) {
  const [q, setQ] = useState("");
  const [productos, setProductos] = useState<ProductoL[] | null>(null);
  const [props, setProps] = useState<{ productoId: string; tallaId: string | null } | null>(null);
  const [tallaIdSel, setTallaIdSel] = useState<string | null>(null);
  const [det, setDet] = useState<{
    producto: { id: string; imei: string; nombre: string; tipo_talla: string };
    talla_id: string | null;
    tallas: TallaResumen[];
    unidades: UnidadHist[];
    movimientos: MovHist[];
    entalles: EntalleHist[];
    ediciones: { id: string; fecha: string; tipo_evento: string; nombre: string | null }[];
  } | null>(null);
  const [loadingLista, setLoadingLista] = useState(true);
  const [loadingDet, setLoadingDet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = async (productoId: string, tallaId: string | null) => {
    setLoadingDet(true);
    setError(null);
    setProps({ productoId, tallaId });
    const params = new URLSearchParams();
    if (tallaId) params.set("talla_id", tallaId);
    const { data, error } = await api<typeof det>(
      `/api/historial/productos/${productoId}${params.size ? `?${params}` : ""}`
    );
    if (error) setError(error);
    else setDet(data ?? null);
    setLoadingDet(false);
  };

  useEffect(() => {
    (async () => {
      const { data, error } = await api<{ productos: ProductoL[] }>("/api/productos");
      setLoadingLista(false);
      if (error || !data) {
        setError(error ?? "No se pudieron cargar los productos.");
        return;
      }
      const ps = (data.productos ?? []).map((p) => ({
        id: String(p.id),
        imei: p.imei ?? null,
        nombre: p.nombre,
        tipo_talla: p.tipo_talla,
      }));
      setProductos(ps);
      const prodInit = initial?.get("producto");
      if (prodInit && ps.some((p) => p.id === prodInit)) {
        const tallaInit = initial?.get("talla");
        void cargar(prodInit, tallaInit || null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtro = q.trim().toLowerCase();
  const matches = (productos ?? [])
    .filter(
      (p) =>
        !filtro ||
        (p.imei ?? "").toLowerCase().includes(filtro) ||
        p.nombre.toLowerCase().includes(filtro)
    )
    .slice(0, 30);

  return (
    <div className="space-y-4">
      <Input
        label="Buscar IMEI o nombre de producto"
        placeholder="Ej: 3586... o 'Blusa'"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-sm"
      />

      <ErrorBanner message={error} />

      {loadingLista ? (
        <Spinner label="Cargando productos..." />
      ) : (
        matches.length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white">
            <ul className="divide-y divide-slate-100">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => {
                      setTallaIdSel(null);
                      void cargar(p.id, null);
                    }}
                    className={`flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                      props?.productoId === p.id ? "bg-blue-50" : ""
                    }`}
                  >
                    <span className="font-mono font-medium text-slate-700">{p.imei}</span>
                    <span className="text-slate-500">{p.nombre}</span>
                    <Badge color="slate">{p.tipo_talla}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {loadingDet ? (
        <Spinner label="Cargando historial..." />
      ) : det ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-bold text-slate-800">{det.producto.imei}</span>
              <span className="text-sm text-slate-500">{det.producto.nombre}</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setTallaIdSel(null);
                  if (props?.productoId) void cargar(props.productoId, null);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  !tallaIdSel
                    ? "bg-blue-600 text-white"
                    : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Todas
              </button>
              {det.tallas.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTallaIdSel(t.id);
                    if (props?.productoId) void cargar(props.productoId, t.id);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    tallaIdSel === t.id
                      ? "bg-blue-600 text-white"
                      : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {t.nombre}
                  <span className="ml-1 opacity-70">({t.total})</span>
                  {t.en_almacen !== t.total && (
                    <span className="ml-1 text-xs opacity-80">
                      · {t.en_almacen} almacén / {t.almacen_espera} reserva / {t.en_viaje} viaje /{" "}
                      {t.entregado} entregado
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
              <h3 className="text-sm font-semibold text-slate-700">Unidades</h3>
              <p className="text-xs text-slate-400">
                {det.unidades.length} unidad(es) · stock y dónde está cada una
              </p>
            </div>
            {det.unidades.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                Sin unidades para esta talla.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2">QR</th>
                      <th className="px-4 py-2">Estado</th>
                      <th className="px-4 py-2">Talla</th>
                      <th className="px-4 py-2">Ubicación</th>
                      <th className="px-4 py-2">Ingreso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {det.unidades.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2">
                          <span className="font-mono text-xs text-slate-500">{u.codigo_qr}</span>
                          {u.es_entallada && <Badge color="amber">📐</Badge>}
                        </td>
                        <td className="px-4 py-2">
                          <Badge color={ESTADO_COLOR[u.estado] ?? "slate"}>
                            {ESTADO_LABEL[u.estado] ?? u.estado}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-slate-600">
                          {u.talla}
                          {u.es_entallada && u.talla_original && (
                            <span className="ml-1 text-xs text-amber-600">
                              (era {u.talla_original})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-500">
                          {u.ubicacion ? (
                            <>
                              Viaje <strong>{u.ubicacion.viaje_codigo}</strong>
                              {u.ubicacion.viaje_tipo === "recojo" && " (recojo)"}
                              <span className="text-slate-400"> · P{u.ubicacion.pedido_codigo}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">
                          {fmtFecha(u.fecha_ingreso)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {det.entalles.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
                <h3 className="text-sm font-semibold text-slate-700">Entalles</h3>
              </div>
              <ul className="divide-y divide-slate-100">
                {det.entalles.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                    <span className="font-mono text-xs text-slate-400">{e.codigo_qr}</span>
                    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-700">
                      Talla {e.talla_anterior} → {e.talla_nueva}
                    </span>
                    <span className="text-xs text-slate-400">{fmtFecha(e.fecha)}</span>
                    {e.persona && <span className="text-xs text-slate-500">— {e.persona}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
              <h3 className="text-sm font-semibold text-slate-700">Movimientos de stock</h3>
            </div>
            {det.movimientos.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                Sin movimientos registrados. Los movimientos se acumulan hacia adelante.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Fecha</th>
                      <th className="px-4 py-2">Tipo</th>
                      <th className="px-4 py-2">Cantidad</th>
                      <th className="px-4 py-2">Talla</th>
                      <th className="px-4 py-2">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {det.movimientos.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">
                          {fmtFecha(m.fecha)}
                        </td>
                        <td className="px-4 py-2">
                          <Badge color={m.tipo === "entrada" ? "green" : m.tipo === "salida" ? "red" : "amber"}>
                            {m.tipo}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 font-medium text-slate-700">{m.cantidad}</td>
                        <td className="px-4 py-2 text-slate-600">{m.talla}</td>
                        <td className="px-4 py-2 text-xs text-slate-400">
                          {m.nota}
                          {m.persona && <span className="ml-2">— {m.persona}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {det.ediciones.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
                <h3 className="text-sm font-semibold text-slate-700">Ediciones del IMEI</h3>
              </div>
              <ul className="divide-y divide-slate-100">
                {det.ediciones.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                    <Badge color="slate">{e.tipo_evento}</Badge>
                    <span className="text-xs text-slate-400">{fmtFecha(e.fecha)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        !loadingLista && (
          <p className="py-8 text-center text-sm text-slate-400">
            Buscá un IMEI y seleccionalo para ver el stock por talla, unidades, kardex y entalles.
          </p>
        )
      )}
    </div>
  );
}