"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Button, Input, Select, Modal, Badge, Spinner, ErrorBanner } from "@/components/ui";
import { TIPO_TALLA_LABEL } from "@/lib/productos";

type Producto = {
  id: string;
  imei: string;
  nombre: string;
  tipo_talla: string;
  precio_referencial: number;
  foto_url: string | null;
  estado: string;
  stock: { talla: string; cantidad: number; stock_almacen: number }[];
};

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showNuevo, setShowNuevo] = useState(false);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [stockModal, setStockModal] = useState<Producto | null>(null);
  const [eliminando, setEliminando] = useState<Producto | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await api<{ productos: Producto[] }>("/api/productos");
    if (error) setError(error);
    else setProductos(data?.productos ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filtrados = productos.filter(
    (p) =>
      !search ||
      p.nombre.toLowerCase().includes(search.toLowerCase()) ||
      p.imei.includes(search)
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Productos</h1>
        <Button onClick={() => setShowNuevo(true)}>Nuevo producto</Button>
      </div>

      <Input
        placeholder="Buscar por nombre o IMEI..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-sm"
      />
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {filtrados.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-slate-400">
              No hay productos {search ? "que coincidan con la búsqueda" : "registrados"}.
            </p>
          )}
          {filtrados.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">
                    {p.nombre}
                  </p>
                  <p className="truncate text-xs text-slate-400">IMEI {p.imei}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="secondary" onClick={() => setStockModal(p)}>
                    + Stock
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditando(p)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setEliminando(p)}>
                    Eliminar
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge color="purple">{TIPO_TALLA_LABEL[p.tipo_talla] ?? p.tipo_talla}</Badge>
                {p.precio_referencial > 0 && (
                  <span className="text-xs text-slate-500">
                    Ref. S/ {Number(p.precio_referencial).toFixed(2)}
                  </span>
                )}
              </div>

              {p.stock && p.stock.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {p.stock.map((s) => (
                    <span
                      key={s.talla}
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                        Number(s.stock_almacen) > 0
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {s.talla}: {Number(s.stock_almacen)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showNuevo && (
        <FormProducto
          onClose={() => setShowNuevo(false)}
          onDone={() => {
            setShowNuevo(false);
            cargar();
          }}
        />
      )}
      {editando && (
        <FormProducto
          producto={editando}
          onClose={() => setEditando(null)}
          onDone={() => {
            setEditando(null);
            cargar();
          }}
        />
      )}
      {stockModal && (
        <StockModal
          producto={stockModal}
          onDone={() => {
            setStockModal(null);
            cargar();
          }}
        />
      )}
      {eliminando && (
        <EliminarModal
          producto={eliminando}
          onClose={() => setEliminando(null)}
          onDone={() => {
            setEliminando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function FormProducto({
  producto,
  onClose,
  onDone,
}: {
  producto?: Producto | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [imei, setImei] = useState(producto?.imei ?? "");
  const [nombre, setNombre] = useState(producto?.nombre ?? "");
  const [tipoTalla, setTipoTalla] = useState(producto?.tipo_talla ?? "A");
  const [precio, setPrecio] = useState(String(producto?.precio_referencial ?? ""));
  const [dni, setDni] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function guardar() {
    setError(null);
    setLoading(true);
    const esEdicion = Boolean(producto);
    const { error } = await api(
      esEdicion ? `/api/productos/${producto!.id}` : "/api/productos",
      {
        method: esEdicion ? "PATCH" : "POST",
        body: JSON.stringify({
          imei,
          nombre,
          tipo_talla: tipoTalla,
          precio_referencial: Number(precio || 0),
          dniConfirmacion: dni || undefined,
        }),
      }
    );
    setLoading(false);
    if (error) setError(error);
    else onDone();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={producto ? "Editar producto" : "Nuevo producto"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={loading}>
            {loading ? "Guardando..." : "Guardar"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        <Input label="IMEI" value={imei} onChange={(e) => setImei(e.target.value)} required />
        <Select label="Tipo de talla" value={tipoTalla} onChange={(e) => setTipoTalla(e.target.value)}>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="AC">A + C</option>
          <option value="BC">B + C</option>
          <option value="sin_talla">Sin talla</option>
        </Select>
        <Input
          label="Precio referencial (S/)"
          type="number"
          step="0.01"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
        />
        {producto && (
          <Input
            label="Tu DNI (para confirmar cambios)"
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            maxLength={8}
            placeholder="Obligatorio solo si cambias el IMEI"
          />
        )}
        <ErrorBanner message={error} />
      </div>
    </Modal>
  );
}

function StockModal({
  producto,
  onDone,
}: {
  producto: Producto;
  onDone: () => void;
}) {
  const [tallas, setTallas] = useState<{ id: string; nombre: string }[]>([]);
  const [tallaId, setTallaId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await api<{ tallas: { id: string; nombre: string }[] }>(
        "/api/tallas?producto_id=" + producto.id
      );
      const lista = data?.tallas ?? [];
      setTallas(lista);
      if (lista.length) setTallaId(lista[0].id);
    })();
  }, [producto.id]);

  async function agregar() {
    setError(null);
    setResultado(null);
    setLoading(true);
    const { data, error } = await api(`/api/productos/${producto.id}/stock`, {
      method: "POST",
      body: JSON.stringify({ talla_id: tallaId, cantidad: Number(cantidad) }),
    });
    setLoading(false);
    if (error) setError(error);
    else {
      setResultado(`${(data as { creados: number }).creados} unidad(es) registrada(s) con QR.`);
      setCantidad("1");
    }
  }

  return (
    <Modal
      open
      onClose={onDone}
      title={`Agregar stock — ${producto.nombre}`}
      footer={
        <>
          <Button variant="secondary" onClick={onDone}>
            Cerrar
          </Button>
          <Button onClick={agregar} disabled={loading || !tallaId}>
            {loading ? "Registrando..." : "Registrar stock"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Select label="Talla" value={tallaId} onChange={(e) => setTallaId(e.target.value)}>
          <option value="">Selecciona...</option>
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
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
        />
        {resultado && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            {resultado}
          </div>
        )}
        <ErrorBanner message={error} />
      </div>
    </Modal>
  );
}

function EliminarModal({
  producto,
  onClose,
  onDone,
}: {
  producto: Producto;
  onClose: () => void;
  onDone: () => void;
}) {
  const [dni, setDni] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function eliminar() {
    setError(null);
    setLoading(true);
    const { error } = await api(`/api/productos/${producto.id}`, {
      method: "DELETE",
      body: JSON.stringify({ dniConfirmacion: dni }),
    });
    setLoading(false);
    if (error) setError(error);
    else onDone();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Eliminar producto"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={eliminar} disabled={loading || !dni}>
            {loading ? "Eliminando..." : "Eliminar definitivamente"}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        Vas a eliminar <strong>{producto.nombre}</strong> (IMEI {producto.imei}). Esta acción no se
        puede deshacer.
      </p>
      <Input
        label="Escribe tu DNI para confirmar"
        value={dni}
        onChange={(e) => setDni(e.target.value)}
        maxLength={8}
        required
      />
      <ErrorBanner message={error} />
    </Modal>
  );
}
