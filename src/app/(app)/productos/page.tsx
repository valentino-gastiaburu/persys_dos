"use client";

import { useEffect, useState, useCallback, useMemo, useRef, useImperativeHandle, forwardRef } from "react";
import { api, useSesion } from "@/lib/api";
import { Button, Input, Spinner, ErrorBanner, Select, Textarea, Modal, Badge, EmptyState } from "@/components/ui";
import { TIPO_TALLA_TIPOS, TIPO_TALLA_LABEL, codigoProducto } from "@/lib/productos";
import { driveImageUrl } from "@/lib/utils";

type Producto = {
  id: string;
  imei: string;
  nombre: string;
  tipo_talla: string;
  precio_referencial: number;
  foto_url: string | null;
  estado: string;
  es_dropship: boolean;
  detalles: string | null;
  proveedor_id: string | null;
  proveedor: { id: string; nombre: string; telefono: string | null; comentario: string | null } | null;
  stock: Record<string, Record<string, number>>;
  stock_ventas: Record<string, Record<string, number>>;
};

type Proveedor = {
  id: string;
  nombre: string;
  telefono: string | null;
  comentario: string | null;
  n_productos?: number;
};

type Talla = { id: string; nombre: string; tipo: string };

const TABS = [
  { id: "lista", label: "Lista" },
  { id: "crear", label: "Crear producto nuevo" },
  { id: "editar", label: "Editar" },
  { id: "proveedores", label: "Proveedores" },
] as const;

const TIPOS_TABLA = ["A", "B", "C"] as const;
const OPCIONES_TALLA = ["A", "B", "C"] as const;

export default function ProductosPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("lista");
  const [editarProductoId, setEditarProductoId] = useState<string | null>(null);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-slate-800">Productos</h1>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              if (t.id !== "editar") setEditarProductoId(null);
            }}
            className={`whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "lista" && (
        <ListaProductos onEditar={(id) => { setEditarProductoId(id); setTab("editar"); }} />
      )}
      {tab === "crear" && <CrearProducto onCreado={() => setTab("lista")} />}
      {tab === "editar" && <EditarProductos productoSel={editarProductoId} />}
      {tab === "proveedores" && <ProveedoresTab />}
    </div>
  );
}

// ─── Helpers de proveedores ────────────────────────────────────

function useListaProveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await api<{ proveedores: Proveedor[] }>("/api/proveedores");
    if (res.error) setError(res.error);
    else setProveedores(res.data?.proveedores ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { proveedores, loading, error, recargar: cargar };
}

function FormProveedor({
  inicial,
  onGuardado,
  onCancel,
}: {
  inicial?: Proveedor | null;
  onGuardado: (p: Proveedor) => void;
  onCancel?: () => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [telefono, setTelefono] = useState(inicial?.telefono ?? "");
  const [comentario, setComentario] = useState(inicial?.comentario ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const esEdicion = Boolean(inicial?.id);

  async function guardar() {
    setError(null);
    if (!nombre.trim()) {
      setError("El nombre del proveedor es obligatorio.");
      return;
    }
    setLoading(true);
    const { data, error } = await api<{ proveedor: Proveedor }>(
      esEdicion ? `/api/proveedores/${inicial!.id}` : "/api/proveedores",
      {
        method: esEdicion ? "PATCH" : "POST",
        body: JSON.stringify({
          nombre,
          telefono: telefono.trim() || null,
          comentario: comentario.trim() || null,
        }),
      }
    );
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    if (data?.proveedor) onGuardado({ ...data.proveedor, n_productos: inicial?.n_productos ?? 0 });
  }

  return (
    <div className="space-y-4">
      <Input label="Nombre *" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      <Input label="Teléfono (opcional)" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Ej: 999 888 777" />
      <Textarea label="Comentario (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} placeholder="Notas, observaciones, plazos..." />
      <ErrorBanner message={error} />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button onClick={guardar} disabled={loading} variant={esEdicion ? "secondary" : "primary"}>
          {loading ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear proveedor"}
        </Button>
      </div>
    </div>
  );
}

// ─── Subida de foto a Drive ────────────────────────────────────

// Genera un uuid v4 en el cliente para el producto nuevo (oculto, inmutable).
function crearUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${h()}${h()}-${h()}-4${h().slice(1)}-${"89ab".charAt(Math.floor(Math.random() * 4))}${h().slice(1)}-${h()}${h()}${h()}`;
}

type FotoUploadHandle = {
  // Guarda en Drive el archivo pendiente (si lo hay) y devuelve la URL final.
  // Sin archivo pendiente devuelve { ok: true, url: valor actual }. Si la subida
  // falla o falta el IMEI, devuelve { ok: false, url: null } (sin lanzar).
  subirAhora: () => Promise<{ ok: boolean; url: string | null }>;
};

const FotoUpload = forwardRef<FotoUploadHandle, {
  valor: string | null;
  onChange: (url: string | null) => void;
  imei: string;
  codigo?: string;
  label?: string;
}>(function FotoUpload({ valor, onChange, imei, codigo, label = "Foto" }, ref) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filePendiente = useRef<File | null>(null);
  const [previewLocal, setPreviewLocal] = useState<string | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      subirAhora: async () => {
        const file = filePendiente.current;
        if (!file) return { ok: true, url: valor };
        setError(null);
        if (!imei.trim()) {
          setError("Escribe primero el IMEI del producto para poder subir la foto.");
          return { ok: false, url: null };
        }
        setSubiendo(true);
        const form = new FormData();
        form.append("archivo", file);
        form.append("imei", imei.trim());
        if (codigo) form.append("codigo", codigo);
        const res = await api<{ foto_url: string }>("/api/productos/foto", {
          method: "POST",
          body: form,
        });
        setSubiendo(false);
        if (res.error) {
          setError(res.error);
          return { ok: false, url: null };
        }
        filePendiente.current = null;
        if (previewLocal) URL.revokeObjectURL(previewLocal);
        setPreviewLocal(null);
        if (res.data?.foto_url) {
          onChange(res.data.foto_url);
          return { ok: true, url: res.data.foto_url };
        }
        return { ok: true, url: valor };
      },
    }),
    [valor, onChange, imei, codigo, previewLocal]
  );

  function elegir(f: File) {
    setError(null);
    if (previewLocal) URL.revokeObjectURL(previewLocal);
    filePendiente.current = f;
    setPreviewLocal(URL.createObjectURL(f));
  }

  function quitar() {
    if (filePendiente.current) {
      filePendiente.current = null;
      if (previewLocal) URL.revokeObjectURL(previewLocal);
      setPreviewLocal(null);
      return;
    }
    onChange(null);
  }

  const mostrar = previewLocal ?? (valor ? driveImageUrl(valor) ?? valor : null);

  return (
    <div>
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <div className="flex items-start gap-3">
        <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
          {subiendo
            ? "Subiendo..."
            : previewLocal
              ? "Foto elegida"
              : valor
                ? "Cambiar foto"
                : "Subir foto"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={subiendo}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) elegir(f);
              e.target.value = "";
            }}
          />
        </label>
        {mostrar && (
          <Button variant="ghost" size="sm" onClick={quitar}>
            Quitar foto
          </Button>
        )}
      </div>
      {mostrar && (
        <div className="mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mostrar}
            alt="Foto del producto"
            className="h-40 w-32 rounded-lg border border-slate-200 object-cover"
          />
        </div>
      )}
      {previewLocal && !subiendo && (
        <p className="mt-1 text-xs text-slate-500">
          La foto se subirá a Google Drive al guardar el producto.
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
});

// ─── Lista ─────────────────────────────────────────────────────

function ListaProductos({ onEditar }: { onEditar: (id: string) => void }) {
  const { user: sesion } = useSesion();
  const esAdmin = sesion?.rol === "controller" || sesion?.rol === "admin";
  const [productos, setProductos] = useState<Producto[]>([]);
  const [tallas, setTallas] = useState<Talla[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tipoActivo, setTipoActivo] = useState<string>("A");
  const [vista, setVista] = useState<"almacen" | "ventas">("ventas");
  const [modo, setModo] = useState<"stock" | "dropship">("stock");

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

  const conStock = useMemo(() => filtrados.filter((p) => !p.es_dropship), [filtrados]);
  const dropship = useMemo(() => filtrados.filter((p) => p.es_dropship), [filtrados]);

  const enTipo = (tipo: string) =>
    conStock.filter((p) => (TIPO_TALLA_TIPOS[p.tipo_talla] ?? []).includes(tipo));

  const sinTalla = conStock.filter(
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
        <div className="flex flex-wrap items-center gap-2">
          {modo === "stock" && (
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
          )}
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {(
              [
                { id: "stock", label: "Con stock" },
                { id: "dropship", label: "Dropshipping" },
              ] as const
            ).map((v) => (
              <button
                key={v.id}
                onClick={() => setModo(v.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  modo === v.id
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : modo === "dropship" ? (
        <VistaDropship productos={dropship} onEditar={onEditar} />
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

function VistaDropship({ productos, onEditar }: { productos: Producto[]; onEditar: (id: string) => void }) {
  if (productos.length === 0) {
    return (
      <EmptyState
        title="No hay productos dropshipping"
        subtitle="Créalos en la pestaña 'Crear producto nuevo' marcando 'Producto externo'"
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {productos.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onEditar(p.id)}
          className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition-colors hover:border-blue-400 hover:shadow"
        >
          <div className="flex h-44 items-center justify-center bg-slate-100">
            {p.foto_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={driveImageUrl(p.foto_url) ?? p.foto_url} alt={p.nombre} className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-slate-400">Sin foto</span>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-1 p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold leading-snug text-slate-800">{p.nombre}</span>
              <Badge color="blue">Dropship</Badge>
            </div>
            <span className="font-mono text-xs text-slate-500">{p.imei}</span>
            {p.detalles && <p className="mt-1 text-sm text-slate-600">{p.detalles}</p>}
            <div className="mt-auto pt-2">
              {p.proveedor ? (
                <Badge color="purple">{p.proveedor.nombre}</Badge>
              ) : (
                <span className="text-xs text-slate-400">Sin proveedor</span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Tabla de stock (sin cambios funcionales) ─────────────────

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

// ─── Crear ─────────────────────────────────────────────────────

function CrearProducto({ onCreado }: { onCreado: () => void }) {
  const [esDropship, setEsDropship] = useState(false);
  const [imei, setImei] = useState("");
  const [nombre, setNombre] = useState("");
  const [seleccion, setSeleccion] = useState<Record<string, boolean>>({
    A: false,
    B: false,
    C: false,
  });
  const [precio, setPrecio] = useState("");
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [detalles, setDetalles] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creado, setCreado] = useState<string | null>(null);

  // id oculto generado al abrir el form: define el código de la foto y el id
  // final del producto creado (no cambia jamás; el IMEI sí es editable). Se
  // regenera tras cada creación para permitir crear varios seguidos.
  const [idNuevo, setIdNuevo] = useState(() => crearUuid());
  const codigo = useMemo(() => codigoProducto(idNuevo), [idNuevo]);

  const { proveedores, recargar } = useListaProveedores();
  const [modalNuevoProveedor, setModalNuevoProveedor] = useState(false);
  const fotoRef = useRef<FotoUploadHandle>(null);

  const tipoTalla = useMemo(
    () => OPCIONES_TALLA.filter((t) => seleccion[t]).join(""),
    [seleccion]
  );

  async function guardar() {
    setError(null);
    setCreado(null);
    if (!esDropship && !tipoTalla) {
      setError("Selecciona al menos un tipo de talla.");
      return;
    }
    setLoading(true);
    const resFoto = await fotoRef.current?.subirAhora();
    if (!resFoto?.ok) {
      setLoading(false);
      return;
    }
    const urlFoto = resFoto.url;
    const { data, error } = await api<{ producto: Producto }>("/api/productos", {
      method: "POST",
      body: JSON.stringify({
        id: idNuevo,
        imei,
        nombre,
        tipo_talla: esDropship ? "sin_talla" : tipoTalla,
        precio_referencial: Number(precio || 0),
        foto_url: urlFoto?.trim() || null,
        es_dropship: esDropship,
        detalles: esDropship ? detalles.trim() || null : null,
        proveedor_id: esDropship && proveedorId ? proveedorId : null,
      }),
    });
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    const p = data?.producto;
    setCreado(
      p
        ? `${p.nombre} creado${esDropship ? " como producto dropshipping" : " con 0 unidades en todas sus tallas"}.`
        : "Producto creado."
    );
    setImei("");
    setNombre("");
    setSeleccion({ A: false, B: false, C: false });
    setPrecio("");
    setFotoUrl("");
    setDetalles("");
    setProveedorId("");
    setIdNuevo(crearUuid());
  }

  return (
    <div className="max-w-xl">
      <div className="mb-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEsDropship(false)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              !esDropship
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Producto con stock
          </button>
          <button
            type="button"
            onClick={() => setEsDropship(true)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              esDropship
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Producto externo (dropshipping)
          </button>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        {esDropship && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
            Sin stock físico: se compra al proveedor al momento de la venta. El comentario de
            talla/color va en el viaje al agendar.
          </div>
        )}
        <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        <Input label="IMEI" value={imei} onChange={(e) => setImei(e.target.value)} required />

        {!esDropship && (
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
        )}

        <Input
          label="Precio referencial (S/)"
          type="number"
          step="0.01"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
        />

<FotoUpload ref={fotoRef} valor={fotoUrl || null} onChange={setFotoUrl} imei={imei} codigo={codigo} />

        {esDropship && (
          <>
            <div>
              <Textarea
                label="Detalles (colores / tallas disponibles)"
                value={detalles}
                onChange={(e) => setDetalles(e.target.value)}
                rows={3}
                placeholder="Ej: Color rosa, tallas S/M/L"
              />
            </div>
            <div className="flex items-end gap-2">
              <Select
                label="Proveedor (opcional)"
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                className="flex-1"
              >
                <option value="">Sin proveedor</option>
                {proveedores.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.nombre}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" size="sm" onClick={() => setModalNuevoProveedor(true)}>
                + Nuevo
              </Button>
            </div>
          </>
        )}

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

      <Modal open={modalNuevoProveedor} onClose={() => setModalNuevoProveedor(false)} title="Nuevo proveedor">
        <FormProveedor
          onGuardado={(p) => {
            setModalNuevoProveedor(false);
            recargar();
            setProveedorId(p.id);
          }}
          onCancel={() => setModalNuevoProveedor(false)}
        />
      </Modal>
    </div>
  );
}

// ─── Editar ────────────────────────────────────────────────────

function EditarProductos({ productoSel }: { productoSel: string | null }) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState<string | null>(productoSel);
  const { proveedores, recargar } = useListaProveedores();
  const [modalNuevoProveedor, setModalNuevoProveedor] = useState(false);

  const cargar = useCallback(async () => {
    const res = await api<{ productos: Producto[] }>("/api/productos");
    if (res.error) setError(res.error);
    else setProductos(res.data?.productos ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (productoSel) setSel(productoSel);
  }, [productoSel]);

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

  const actual = productos.find((p) => p.id === sel) ?? null;

  if (loading) return <Spinner />;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {error && (
        <div className="lg:col-span-2">
          <ErrorBanner message={error} />
        </div>
      )}
      <div>
        <Input
          placeholder="Buscar por nombre o IMEI..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="mt-3 flex max-h-[70vh] flex-col gap-1 overflow-y-auto pr-1">
          {filtrados.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSel(p.id)}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                sel === p.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              {p.foto_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={driveImageUrl(p.foto_url) ?? p.foto_url} alt={p.nombre} className="h-9 w-9 shrink-0 rounded object-cover" />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">
                  —
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800">{p.nombre}</span>
                <span className="block truncate font-mono text-xs text-slate-400">
                  {p.imei}
                  {p.es_dropship && <span className="ml-1 text-cyan-600">· dropship</span>}
                </span>
              </span>
            </button>
          ))}
          {filtrados.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">Sin resultados.</p>
          )}
        </div>
      </div>

      <div>
        {actual ? (
          <FormEditarProducto
            key={actual.id}
            producto={actual}
            proveedores={proveedores}
            onActualizado={cargar}
            onNuevoProveedor={() => setModalNuevoProveedor(true)}
          />
        ) : (
          <EmptyState title="Selecciona un producto" subtitle="Usa la lista de la izquierda" />
        )}
      </div>

      <Modal open={modalNuevoProveedor} onClose={() => setModalNuevoProveedor(false)} title="Nuevo proveedor">
        <FormProveedor
          onGuardado={() => {
            setModalNuevoProveedor(false);
            recargar();
          }}
          onCancel={() => setModalNuevoProveedor(false)}
        />
      </Modal>
    </div>
  );
}

function FormEditarProducto({
  producto,
  proveedores,
  onActualizado,
  onNuevoProveedor,
}: {
  producto: Producto;
  proveedores: Proveedor[];
  onActualizado: () => void;
  onNuevoProveedor: () => void;
}) {
  const [nombre, setNombre] = useState(producto.nombre);
  const [imei, setImei] = useState(producto.imei);
  const [precio, setPrecio] = useState(String(producto.precio_referencial ?? 0));
  const [fotoUrl, setFotoUrl] = useState<string | null>(producto.foto_url ?? null);
  const [detalles, setDetalles] = useState(producto.detalles ?? "");
  const [proveedorId, setProveedorId] = useState(producto.proveedor_id ?? "");
  const [seleccion, setSeleccion] = useState<Record<string, boolean>>(() => {
    const tipos = TIPO_TALLA_TIPOS[producto.tipo_talla] ?? [];
    return {
      A: tipos.includes("A"),
      B: tipos.includes("B"),
      C: tipos.includes("C"),
    };
  });
  const [dni, setDni] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [modalEliminar, setModalEliminar] = useState(false);
  const [dniEliminar, setDniEliminar] = useState("");
  const [eliminando, setEliminando] = useState(false);
  const fotoRef = useRef<FotoUploadHandle>(null);

  useEffect(() => {
    setNombre(producto.nombre);
    setImei(producto.imei);
    setPrecio(String(producto.precio_referencial ?? 0));
    setFotoUrl(producto.foto_url ?? null);
    setDetalles(producto.detalles ?? "");
    setProveedorId(producto.proveedor_id ?? "");
    setDni("");
    setOk(false);
    setError(null);
  }, [producto]);

  const tipoTallaNuevo = useMemo(
    () => OPCIONES_TALLA.filter((t) => seleccion[t]).join(""),
    [seleccion]
  );

  const imeiCambio = imei.trim() !== producto.imei;

  async function guardar() {
    setError(null);
    setOk(false);
    if (!nombre.trim()) {
      setError("El nombre no puede quedar vacío.");
      return;
    }
    if (imeiCambio && !dni.trim()) {
      setError("Escribe tu DNI para confirmar el cambio de IMEI.");
      return;
    }
    setLoading(true);
    const resFoto = await fotoRef.current?.subirAhora();
    if (!resFoto?.ok) {
      setLoading(false);
      return;
    }
    const fotoFinal = resFoto?.url ?? fotoUrl;
    const { error } = await api(`/api/productos/${producto.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...(nombre.trim() !== producto.nombre ? { nombre: nombre.trim() } : {}),
        ...(imeiCambio ? { imei: imei.trim(), dniConfirmacion: dni.trim() } : {}),
        ...(Number(precio || 0) !== Number(producto.precio_referencial ?? 0)
          ? { precio_referencial: Number(precio || 0) }
          : {}),
        ...((fotoFinal?.trim() || null) !== (producto.foto_url ?? null) ? { foto_url: fotoFinal?.trim() || null } : {}),
        ...(producto.es_dropship
          ? {
              ...((detalles.trim() || null) !== (producto.detalles ?? null)
                ? { detalles: detalles.trim() || null }
                : {}),
              ...((proveedorId || null) !== producto.proveedor_id ? { proveedor_id: proveedorId || null } : {}),
            }
          : {}),
        ...(!producto.es_dropship && tipoTallaNuevo && tipoTallaNuevo !== producto.tipo_talla
          ? { tipo_talla: tipoTallaNuevo }
          : {}),
      }),
    });
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    setOk(true);
    setDni("");
    onActualizado();
  }

  async function eliminar() {
    setError(null);
    if (!dniEliminar.trim()) {
      setError("Escribe tu DNI para confirmar la eliminación.");
      return;
    }
    setEliminando(true);
    const res = await api(`/api/productos/${producto.id}`, {
      method: "DELETE",
      body: JSON.stringify({ dniConfirmacion: dniEliminar.trim() }),
    });
    setEliminando(false);
    if (res.error) {
      setModalEliminar(false);
      setError(res.error);
      return;
    }
    setModalEliminar(false);
    onActualizado();
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">{producto.nombre}</h2>
        {producto.es_dropship ? (
          <Badge color="cyan">Dropshipping</Badge>
        ) : (
          <Badge color="green">Con stock</Badge>
        )}
      </div>

      <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      <div className="flex items-end gap-2">
        <Input
          label="IMEI"
          value={imei}
          onChange={(e) => {
            setImei(e.target.value);
            setOk(false);
          }}
          required
          className="flex-1"
        />
        {imeiCambio && (
          <Input
            label="DNI de confirmación"
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            placeholder="Escribe tu DNI"
            className="flex-1"
          />
        )}
      </div>

      {!producto.es_dropship && (
        <div>
          <span className="mb-1 block font-medium text-slate-700">Tipo de talla (solo agregar)</span>
          <div className="flex flex-wrap gap-2">
            {OPCIONES_TALLA.map((tipo) => {
              const activo = seleccion[tipo];
              return (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => {
                    if (!activo) {
                      setSeleccion((s) => ({ ...s, [tipo]: true }));
                      setOk(false);
                    }
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    activo
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-300 bg-white text-slate-400"
                  }`}
                >
                  Talla {tipo}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Input
        label="Precio referencial (S/)"
        type="number"
        step="0.01"
        value={precio}
        onChange={(e) => setPrecio(e.target.value)}
      />

      <FotoUpload ref={fotoRef} valor={fotoUrl || null} onChange={setFotoUrl} imei={imei} codigo={codigoProducto(producto.id)} />

      {producto.es_dropship && (
        <>
          <Textarea
            label="Detalles (colores / tallas disponibles)"
            value={detalles}
            onChange={(e) => setDetalles(e.target.value)}
            rows={3}
          />
          <div className="flex items-end gap-2">
            <Select
              label="Proveedor"
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              className="flex-1"
            >
              <option value="">Sin proveedor</option>
              {proveedores.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.nombre}
                </option>
              ))}
            </Select>
            <Button variant="secondary" size="sm" onClick={onNuevoProveedor}>
              + Nuevo
            </Button>
          </div>
        </>
      )}

      <ErrorBanner message={error} />

      {ok && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          Cambios guardados.
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
        <Button variant="danger" size="sm" onClick={() => setModalEliminar(true)}>
          Eliminar producto
        </Button>
        <Button onClick={guardar} disabled={loading}>
          {loading ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>

      <Modal open={modalEliminar} onClose={() => setModalEliminar(false)} title="Eliminar producto">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Se eliminará <span className="font-semibold">{producto.nombre}</span> ({producto.imei}).
            Escribe tu DNI para confirmar.
          </p>
          <Input label="DNI" value={dniEliminar} onChange={(e) => setDniEliminar(e.target.value)} />
          <ErrorBanner message={error} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalEliminar(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={eliminar} disabled={eliminando}>
              {eliminando ? "Eliminando..." : "Eliminar"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Proveedores ───────────────────────────────────────────────

function ProveedoresTab() {
  const { proveedores, loading, error, recargar } = useListaProveedores();
  const [modal, setModal] = useState<{ open: boolean; editar: Proveedor | null }>({ open: false, editar: null });
  const [confirmarEliminar, setConfirmarEliminar] = useState<Proveedor | null>(null);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);

  if (loading) return <Spinner />;

  async function eliminar() {
    if (!confirmarEliminar) return;
    setErrorEliminar(null);
    setBorrando(true);
    const res = await api(`/api/proveedores/${confirmarEliminar.id}`, { method: "DELETE" });
    setBorrando(false);
    if (res.error) {
      setErrorEliminar(res.error);
      return;
    }
    setConfirmarEliminar(null);
    recargar();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {proveedores.length} proveedor{proveedores.length === 1 ? "" : "es"}
        </p>
        <Button onClick={() => setModal({ open: true, editar: null })}>+ Nuevo proveedor</Button>
      </div>
      <ErrorBanner message={error} />

      {proveedores.length === 0 ? (
        <EmptyState title="No hay proveedores" subtitle="Crea el primero para registrar productos dropshipping" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Teléfono</th>
                <th className="px-4 py-2">Comentario</th>
                <th className="px-4 py-2">Productos</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {proveedores.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-medium text-slate-800">{p.nombre}</td>
                  <td className="px-4 py-2 text-slate-500">{p.telefono ?? "—"}</td>
                  <td className="max-w-xs truncate px-4 py-2 text-slate-500">{p.comentario ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-500">{p.n_productos ?? 0}</td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setModal({ open: true, editar: p })}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => { setErrorEliminar(null); setConfirmarEliminar(p); }}>
                      Eliminar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modal.open}
        onClose={() => setModal({ open: false, editar: null })}
        title={modal.editar ? "Editar proveedor" : "Nuevo proveedor"}
      >
        <FormProveedor
          inicial={modal.editar}
          onGuardado={() => {
            setModal({ open: false, editar: null });
            recargar();
          }}
          onCancel={() => setModal({ open: false, editar: null })}
        />
      </Modal>

      <Modal
        open={Boolean(confirmarEliminar)}
        onClose={() => setConfirmarEliminar(null)}
        title="Eliminar proveedor"
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Se eliminará el proveedor <span className="font-semibold">{confirmarEliminar?.nombre}</span>.
            No se puede eliminar si tiene productos vinculados.
          </p>
          <ErrorBanner message={errorEliminar} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmarEliminar(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={eliminar} disabled={borrando}>
              {borrando ? "Eliminando..." : "Eliminar"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}