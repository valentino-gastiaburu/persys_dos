"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button, Input, Select, Modal, ErrorBanner } from "@/components/ui";

type Producto = { id: string; imei: string; nombre: string };
type Talla = { id: string; nombre: string };
type Cliente = {
  id: string;
  nombre: string;
  apellido: string | null;
  telefono: string;
  direccion: string | null;
};

type Linea = {
  producto_id: string;
  talla_id: string | null;
  cantidad: number;
  precio_unitario: number;
  genero: string;
  entalle: boolean;
  es_extra_motorizado: boolean;
  imei: string;
  nombre: string;
};

export default function NuevoPedidoPage() {
  const router = useRouter();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [tallas, setTallas] = useState<Talla[]>([]);
  const [qCliente, setQCliente] = useState("");
  const [buscarCliente, setBuscarCliente] = useState("");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [showNuevoCliente, setShowNuevoCliente] = useState(false);

  const [fechaEntrega, setFechaEntrega] = useState("");
  const [tipoPedido, setTipoPedido] = useState("envio");
  const [metodoEntrega, setMetodoEntrega] = useState("a_domicilio");
  const [empresaEnvio, setEmpresaEnvio] = useState("motorizado");
  const [direccion, setDireccion] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [ubicacionMaps, setUbicacionMaps] = useState("");
  const [canalVenta, setCanalVenta] = useState("whatsapp");
  const [costoEnvio, setCostoEnvio] = useState("0");
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [partes, setPartes] = useState("1");
  const [montoPrimerPago, setMontoPrimerPago] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const [lineas, setLineas] = useState<Linea[]>([]);
  const [selProducto, setSelProducto] = useState("");
  const [selTalla, setSelTalla] = useState("");
  const [selCantidad, setSelCantidad] = useState("1");
  const [selPrecio, setSelPrecio] = useState("");
  const [selGenero, setSelGenero] = useState("dama");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ productos: Producto[] }>("/api/productos").then(({ data }) =>
      setProductos(data?.productos ?? [])
    );
  }, []);

  useEffect(() => {
    if (buscarCliente) {
      api<{ clientes: Cliente[] }>("/api/clientes?q=" + encodeURIComponent(buscarCliente)).then(
        ({ data }) => setClientes(data?.clientes ?? [])
      );
    }
  }, [buscarCliente]);

  useEffect(() => {
    if (selProducto) {
      setSelTalla("");
      api<{ tallas: Talla[] }>("/api/tallas?producto_id=" + selProducto).then(({ data }) =>
        setTallas(data?.tallas ?? [])
      );
    } else {
      setTallas([]);
    }
  }, [selProducto]);

  const montoLineas = lineas.reduce((acc, l) => acc + l.cantidad * l.precio_unitario, 0);
  const total = montoLineas + Number(costoEnvio || 0);

  function agregarLinea() {
    if (!selProducto) return;
    const p = productos.find((x) => x.id === selProducto);
    const cant = Number(selCantidad);
    const precio = Number(selPrecio);
    if (!p || !cant || cant <= 0) return;
    setLineas((prev) => [
      ...prev,
      {
        producto_id: p.id,
        talla_id: selTalla || null,
        cantidad: cant,
        precio_unitario: precio,
        genero: selGenero,
        entalle: false,
        es_extra_motorizado: false,
        imei: p.imei,
        nombre: p.nombre,
      },
    ]);
    setSelProducto("");
    setSelTalla("");
    setSelCantidad("1");
    setSelPrecio("");
  }

  async function guardar(confirmar: boolean) {
    setError(null);
    if (!cliente) return setError("Selecciona un cliente");
    if (!fechaEntrega) return setError("Indica la fecha de entrega");
    if (lineas.length === 0) return setError("Agrega al menos un producto");
    setLoading(true);

    const { data: creado, error: err1 } = await api<{ pedido: any }>("/api/pedidos", {
      method: "POST",
      body: JSON.stringify({
        cliente_id: cliente.id,
        fecha_entrega: fechaEntrega,
        tipo_pedido: tipoPedido,
        metodo_entrega: metodoEntrega,
        empresa_envio: empresaEnvio,
        direccion_entrega: direccion || null,
        ciudad: ciudad || null,
        ubicacion_maps: ubicacionMaps || null,
        canal_venta: canalVenta,
        costo_envio: Number(costoEnvio || 0),
        metodo_pago: metodoPago,
        partes_a_pagar: Number(partes || 1),
        monto_primer_pago: montoPrimerPago ? Number(montoPrimerPago) : null,
        observaciones: observaciones || null,
        regalo: false,
      }),
    });
    if (err1 || !creado?.pedido) {
      setError(err1 ?? "No se pudo crear el pedido");
      setLoading(false);
      return;
    }
    const pedidoId = creado.pedido.id;

    for (const l of lineas) {
      const { error: errDet } = await api(`/api/pedidos/${pedidoId}/detalles`, {
        method: "POST",
        body: JSON.stringify({
          producto_id: l.producto_id,
          talla_id: l.talla_id,
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
          genero: l.genero,
          entalle: l.entalle,
          es_extra_motorizado: l.es_extra_motorizado,
        }),
      });
      if (errDet) {
        setError(`Producto ${l.nombre}: ${errDet}`);
        setLoading(false);
        return;
      }
    }

    if (confirmar) {
      const { error: errConf } = await api(`/api/pedidos/${pedidoId}/confirmar`, {
        method: "POST",
      });
      if (errConf) {
        setError(errConf);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    router.push(`/pedidos/${pedidoId}`);
    router.refresh();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Nuevo pedido</h1>
      <ErrorBanner message={error} />

      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Cliente</h2>
          {cliente ? (
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <div>
                <p className="text-sm font-medium">
                  {cliente.nombre} {cliente.apellido ?? ""}
                </p>
                <p className="text-xs text-slate-500">{cliente.telefono}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setCliente(null)}>
                Cambiar
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Buscar por teléfono o nombre..."
                  value={qCliente}
                  onChange={(e) => setQCliente(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setBuscarCliente(qCliente)}
                />
                <Button variant="secondary" onClick={() => setBuscarCliente(qCliente)}>
                  Buscar
                </Button>
                <Button onClick={() => setShowNuevoCliente(true)}>Nuevo cliente</Button>
              </div>
              {clientes.length > 0 && (
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {clientes.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCliente(c)}
                      className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {c.nombre} {c.apellido ?? ""}
                        </p>
                        <p className="text-xs text-slate-500">{c.telefono}</p>
                      </div>
                      <span className="text-xs text-blue-600">Seleccionar</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Entrega y pago</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Input
              label="Fecha de entrega"
              type="date"
              value={fechaEntrega}
              onChange={(e) => setFechaEntrega(e.target.value)}
              required
            />
            <Select label="Tipo de pedido" value={tipoPedido} onChange={(e) => setTipoPedido(e.target.value)}>
              <option value="envio">Envío</option>
              <option value="visita">Visita</option>
            </Select>
            <Select label="Método de entrega" value={metodoEntrega} onChange={(e) => setMetodoEntrega(e.target.value)}>
              <option value="a_domicilio">A domicilio</option>
              <option value="agencia">Agencia</option>
              <option value="local_peri">Local PERI</option>
            </Select>
            <Select label="Empresa de envío" value={empresaEnvio} onChange={(e) => setEmpresaEnvio(e.target.value)}>
              <option value="motorizado">Motorizado</option>
              <option value="olva">Olva</option>
              <option value="shalom">Shalom</option>
              <option value="otros">Otros</option>
            </Select>
            <Select label="Canal de venta" value={canalVenta} onChange={(e) => setCanalVenta(e.target.value)}>
              <option value="whatsapp">WhatsApp</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="telefono">Teléfono</option>
              <option value="otro">Otro</option>
            </Select>
            <Input
              label="Costo de envío (S/)"
              type="number"
              step="0.01"
              value={costoEnvio}
              onChange={(e) => setCostoEnvio(e.target.value)}
            />
            <Input
              label="Dirección de entrega"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
            />
            <Input label="Ciudad" value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
            <Input
              label="Link ubicación (Maps)"
              value={ubicacionMaps}
              onChange={(e) => setUbicacionMaps(e.target.value)}
            />
            <Select label="Método de pago" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
              <option value="yape">Yape</option>
              <option value="bcp">BCP</option>
              <option value="interbank">Interbank</option>
              <option value="bbva">BBVA</option>
              <option value="scotiabank">Scotiabank</option>
              <option value="plin">Plin</option>
              <option value="banco_nacion">Banco de la Nación</option>
              <option value="tarjeta_link">Tarjeta (Link)</option>
              <option value="efectivo">Efectivo</option>
            </Select>
            <Input
              label="Partes a pagar"
              type="number"
              min={1}
              value={partes}
              onChange={(e) => setPartes(e.target.value)}
            />
            <Input
              label="Primer pago (S/)"
              type="number"
              step="0.01"
              value={montoPrimerPago}
              onChange={(e) => setMontoPrimerPago(e.target.value)}
            />
            <div className="md:col-span-3">
              <Input
                label="Observaciones"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Productos</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <Select
              label="Producto"
              value={selProducto}
              onChange={(e) => setSelProducto(e.target.value)}
              className="md:col-span-2"
            >
              <option value="">Selecciona...</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.imei})
                </option>
              ))}
            </Select>
            <Select label="Talla" value={selTalla} onChange={(e) => setSelTalla(e.target.value)}>
              <option value="">Sin talla</option>
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
              value={selCantidad}
              onChange={(e) => setSelCantidad(e.target.value)}
            />
            <Input
              label="Precio unitario (S/)"
              type="number"
              step="0.01"
              value={selPrecio}
              onChange={(e) => setSelPrecio(e.target.value)}
            />
            <Select label="Género" value={selGenero} onChange={(e) => setSelGenero(e.target.value)}>
              <option value="dama">Dama</option>
              <option value="caballero">Caballero</option>
            </Select>
          </div>
          <div className="mt-3">
            <Button variant="secondary" onClick={agregarLinea} disabled={!selProducto}>
              + Agregar producto
            </Button>
          </div>

          {lineas.length > 0 && (
            <div className="mt-4 space-y-2">
              {lineas.map((l, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">
                      {l.nombre} <span className="text-xs text-slate-400">({l.imei})</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {l.cantidad} x S/ {l.precio_unitario.toFixed(2)} = S/ {(l.cantidad * l.precio_unitario).toFixed(2)}
                    </p>
                  </div>
                  <button onClick={() => setLineas((prev) => prev.filter((_, j) => j !== i))} className="text-red-500">
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">
                Subtotal productos: <strong>S/ {montoLineas.toFixed(2)}</strong>
              </p>
              <p className="text-sm text-slate-500">
                Envío: <strong>S/ {Number(costoEnvio || 0).toFixed(2)}</strong>
              </p>
              <p className="text-lg font-bold text-slate-800">Total: S/ {total.toFixed(2)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={loading} onClick={() => guardar(false)}>
                Guardar borrador
              </Button>
              <Button disabled={loading} onClick={() => guardar(true)}>
                {loading ? "Procesando..." : "Confirmar pedido"}
              </Button>
            </div>
          </div>
        </section>
      </div>

      {showNuevoCliente && (
        <NuevoClienteModal
          onClose={() => setShowNuevoCliente(false)}
          onCreated={(c) => {
            setShowNuevoCliente(false);
            setCliente(c);
          }}
        />
      )}
    </div>
  );
}

function NuevoClienteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: Cliente) => void;
}) {
  const [telefono, setTelefono] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [dni, setDni] = useState("");
  const [direccion, setDireccion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function crear() {
    setError(null);
    setLoading(true);
    const { data, error } = await api<{ cliente: Cliente }>("/api/clientes", {
      method: "POST",
      body: JSON.stringify({ telefono, nombre, apellido: apellido || null, dni: dni || null, direccion: direccion || null }),
    });
    setLoading(false);
    if (error || !data?.cliente) setError(error ?? "No se pudo crear el cliente");
    else onCreated(data.cliente);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nuevo cliente"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={crear} disabled={loading || !telefono || !nombre}>
            {loading ? "Guardando..." : "Crear cliente"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Teléfono *" value={telefono} onChange={(e) => setTelefono(e.target.value)} required />
        <Input label="Nombre *" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        <Input label="Apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} />
        <Input label="DNI" maxLength={8} value={dni} onChange={(e) => setDni(e.target.value)} />
        <Input label="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        <ErrorBanner message={error} />
      </div>
    </Modal>
  );
}
