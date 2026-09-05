"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button, Input, Select, Modal, ErrorBanner } from "@/components/ui";

type Producto = { id: string; imei: string; nombre: string };
type Talla = { id: string; nombre: string; cantidad: number; cantidad_ventas: number };
type Cliente = {
  id: string;
  nombre: string;
  apellido: string | null;
  telefono: string;
  direccion: string | null;
};

type Linea = {
  producto_id: string;
  talla_stock: string | null;
  talla_stock_nombre: string | null;
  talla_vendida: string | null;
  talla_vendida_nombre: string | null;
  cantidad: number;
  precio_unitario: number;
  genero: string;
  entalle: boolean;
  es_extra_motorizado: boolean;
  imei: string;
  nombre: string;
};

type ConflictoStock = {
  producto_id: string;
  talla_id: string;
  producto_imei: string;
  producto_nombre: string;
  talla_nombre: string;
  cantidad: number;
  disponible: number;
  pedidos: {
    codigo: string | null;
    estado: string;
    cliente: string | null;
    cantidad: number;
  }[];
};

const METODOS_POR_TIPO: Record<string, string[]> = {
  envio: ["a_domicilio", "agencia"],
  visita: ["a_domicilio", "local_peri"],
};
const EMPRESA_POR_TIPO: Record<string, string[]> = {
  envio: ["olva", "shalom", "otros"],
  visita: ["motorizado"],
};
const METODO_LABEL: Record<string, string> = {
  a_domicilio: "A domicilio",
  agencia: "Agencia",
  local_peri: "Local PERI",
};
const EMPRESA_LABEL: Record<string, string> = {
  motorizado: "Motorizado",
  olva: "Olva",
  shalom: "Shalom",
  otros: "Otros",
};

export default function NuevoPedidoPage() {
  const router = useRouter();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [vendedoras, setVendedoras] = useState<{ id: string; nombre: string }[]>([]);
  const [miId, setMiId] = useState("");
  const [miNombre, setMiNombre] = useState("");
  const [vendedora1, setVendedora1] = useState("");
  const [vendedora2, setVendedora2] = useState("");
  const [vendedora3, setVendedora3] = useState("");
  const [productos, setProductos] = useState<Producto[]>([]);
  const [tallas, setTallas] = useState<Talla[]>([]);
  const [qCliente, setQCliente] = useState("");
  const [clienteAbierto, setClienteAbierto] = useState(false);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [showNuevoCliente, setShowNuevoCliente] = useState(false);

  const [fechaEntrega, setFechaEntrega] = useState("");
  const [tipoPedido, setTipoPedido] = useState("envio");
  const [metodoEntrega, setMetodoEntrega] = useState("agencia");
  const [empresaEnvio, setEmpresaEnvio] = useState("olva");
  const [direccion, setDireccion] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [ubicacionMaps, setUbicacionMaps] = useState("");
  const [canalVenta, setCanalVenta] = useState("whatsapp");
  const [costoEnvio, setCostoEnvio] = useState("0");
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [partes, setPartes] = useState("1");
  const [pagoInicial, setPagoInicial] = useState("no");
  const [montoPrimerPago, setMontoPrimerPago] = useState("");
  const [fechaPagoParte2, setFechaPagoParte2] = useState("");
  const [comprobante, setComprobante] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [regalo, setRegalo] = useState("");

  const [lineas, setLineas] = useState<Linea[]>([]);
  const [prodQ, setProdQ] = useState("");
  const [prodAbierto, setProdAbierto] = useState(false);
  const [selProducto, setSelProducto] = useState("");
  const [selTalla, setSelTalla] = useState("");
  const [selEntallar, setSelEntallar] = useState(false);
  const [selTallaVendida, setSelTallaVendida] = useState("");
  const [selCantidad, setSelCantidad] = useState("1");
  const [selPrecio, setSelPrecio] = useState("");
  const [selGenero, setSelGenero] = useState("dama");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [conflictos, setConflictos] = useState<ConflictoStock[] | null>(null);

  const recuadroRef = useRef<HTMLDivElement>(null);
  const [btnTam, setBtnTam] = useState<number | null>(null);

  useEffect(() => {
    const el = recuadroRef.current;
    if (!el) return;
    const medir = () => {
      setBtnTam(window.innerWidth >= 768 ? el.offsetHeight : null);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    window.addEventListener("resize", medir);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, []);

  useEffect(() => {
    api<{ productos: Producto[] }>("/api/productos").then(({ data }) =>
      setProductos(data?.productos ?? [])
    );
  }, []);

  useEffect(() => {
    api<{ user: { id: string; nombre: string } }>("/api/auth/me").then(({ data }) => {
      const u = data?.user;
      if (!u) return;
      setMiId(u.id);
      setMiNombre(u.nombre);
      setVendedora1(u.id);
      setVendedora2(u.id);
      setVendedora3(u.id);
    });
    api<{ vendedoras: { id: string; nombre: string }[] }>("/api/vendedoras").then(({ data }) => {
      setVendedoras(data?.vendedoras ?? []);
    });
  }, []);

  // Sugerencias de cliente mientras se escribe
  useEffect(() => {
    const q = qCliente.trim();
    if (!q) {
      setClientes([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await api<{ clientes: Cliente[] }>(
        "/api/clientes?q=" + encodeURIComponent(q)
      );
      setClientes(data?.clientes ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [qCliente]);

  useEffect(() => {
    if (selProducto) {
      setSelTalla("");
      setSelEntallar(false);
      setSelTallaVendida("");
      setSelCantidad("1");
      api<{ tallas: Talla[] }>("/api/tallas?producto_id=" + selProducto).then(({ data }) =>
        setTallas(data?.tallas ?? [])
      );
    } else {
      setTallas([]);
    }
  }, [selProducto]);

  const hoyISO = new Date().toISOString().slice(0, 10);
  const fechaPasada = fechaEntrega ? fechaEntrega < hoyISO : false;

  const tallaSel = tallas.find((t) => t.id === selTalla);

  // El campo "Talla" es la talla de STOCK (origen): la unidad física que se toma.
  // El entalle es opcional: la talla vendida (destino) se llena con la misma talla
  // si el checkbox no está marcado, y no está limitada por stock cuando lo está.
  const disponible = tallaSel?.cantidad_ventas ?? 0;
  const cantidadExcede = selTalla ? Number(selCantidad) > disponible : false;
  const tallasConStock = tallas.filter((t) => t.cantidad_ventas > 0);

  const filtradosProd = useMemo(() => {
    const q = prodQ.trim().toLowerCase();
    if (!q) return productos.slice(0, 20);
    return productos
      .filter((p) => p.nombre.toLowerCase().includes(q) || p.imei.toLowerCase().includes(q))
      .slice(0, 20);
  }, [prodQ, productos]);

  const opcionesVendedoras = useMemo(() => {
    const lista = [...vendedoras];
    if (miId && !lista.some((v) => v.id === miId)) {
      lista.unshift({ id: miId, nombre: miNombre || "Yo (creador del pedido)" });
    }
    return lista;
  }, [vendedoras, miId, miNombre]);

  const montoLineas = lineas.reduce((acc, l) => acc + l.cantidad * l.precio_unitario, 0);
  const total = montoLineas + Number(costoEnvio || 0);

  function cambiarTipoPedido(tipo: string) {
    setTipoPedido(tipo);
    setMetodoEntrega(tipo === "envio" ? "agencia" : "a_domicilio");
    setEmpresaEnvio(tipo === "envio" ? "olva" : "motorizado");
  }

  function elegirProducto(p: Producto) {
    setSelProducto(p.id);
    setProdQ(`${p.nombre} (${p.imei})`);
    setProdAbierto(false);
  }

  function agregarLinea() {
    setError(null);
    if (!selProducto) return;
    const p = productos.find((x) => x.id === selProducto);
    const cant = Number(selCantidad);
    const precio = Number(selPrecio);
    if (!p || !cant || cant <= 0) return;

    // "Talla" es la talla de stock (origen): es la que consume stock.
    // La talla vendida (destino) se llena sola con la misma si no hay entalle.
    const tallaStockId = selTalla || null;
    const tallaVendidaIdFinal = selEntallar ? (selTallaVendida || selTalla) : selTalla;

    if (tallaStockId) {
      const yaEnLineas = lineas
        .filter((l) => l.producto_id === p.id && l.talla_stock === tallaStockId)
        .reduce((acc, l) => acc + l.cantidad, 0);
      if (yaEnLineas + cant > disponible) {
        setError(
          `La cantidad supera el stock disponible (${disponible} unidad(es) en esa talla, ya tienes ${yaEnLineas} en la lista).`
        );
        return;
      }
    }

    // Si ya existe una línea con el mismo (producto, talla_stock, talla_vendida), mergear cantidades.
    const claveMerge = `${p.id}|${tallaStockId}|${tallaVendidaIdFinal}`;
    const idxExistente = lineas.findIndex(
      (l) => `${l.producto_id}|${l.talla_stock}|${l.talla_vendida}` === claveMerge
    );
    if (idxExistente >= 0) {
      setLineas((prev) =>
        prev.map((l, i) =>
          i === idxExistente
            ? { ...l, cantidad: l.cantidad + cant }
            : l
        )
      );
    } else {
      setLineas((prev) => [
        ...prev,
        {
          producto_id: p.id,
          talla_stock: tallaStockId,
          talla_stock_nombre: tallaSel?.nombre ?? null,
          talla_vendida: tallaVendidaIdFinal || null,
          talla_vendida_nombre: (tallas.find((t) => t.id === tallaVendidaIdFinal)?.nombre) ?? null,
          cantidad: cant,
          precio_unitario: precio,
          genero: selGenero,
          entalle: Boolean(tallaStockId && tallaVendidaIdFinal && tallaStockId !== tallaVendidaIdFinal),
          es_extra_motorizado: false,
          imei: p.imei,
          nombre: p.nombre,
        },
      ]);
    }
    setSelProducto("");
    setProdQ("");
    setSelTalla("");
    setSelEntallar(false);
    setSelTallaVendida("");
    setSelCantidad("1");
    setSelPrecio("");
  }

  async function guardar(confirmar: boolean) {
    setError(null);
    if (lineas.length === 0) return setError("Agrega al menos un producto");
    if (confirmar && !cliente) return setError("Selecciona un cliente");
    if (confirmar && !fechaEntrega) return setError("Indica la fecha de entrega");
    setLoading(true);

    // Batch único: el servidor relee el stock de ventas, valida todo el lote y
    // rechaza con { conflictos } si algo dejaría el stock en negativo.
    const { data, error: err } = await api<{
      pedido?: any;
      conflictos?: ConflictoStock[];
    }>("/api/pedidos", {
      method: "POST",
      body: JSON.stringify({
        confirmar,
        cliente_id: cliente?.id ?? null,
        vendedora_1_id: vendedora1 || miId,
        vendedora_contribuyente_id: vendedora2 || miId,
        vendedora_contribuyente_2_id: vendedora3 || miId,
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
        monto_primer_pago:
          Number(partes) === 1
            ? pagoInicial === "si"
              ? total
              : null
            : montoPrimerPago
              ? Number(montoPrimerPago)
              : null,
        fecha_siguiente_pago: Number(partes) > 1 ? fechaPagoParte2 || null : null,
        comprobante:
          Number(partes) === 1 && pagoInicial === "si" && comprobante.trim()
            ? comprobante.trim()
            : null,
        observaciones: observaciones || null,
        regalo: regalo || null,
        lineas: lineas.map((l) => ({
          producto_id: l.producto_id,
          talla_stock: l.talla_stock,
          talla_vendida: l.talla_vendida,
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
          genero: l.genero,
          entalle: l.entalle,
          es_extra_motorizado: l.es_extra_motorizado,
        })),
      }),
    });

    setLoading(false);
    if (err || !data?.pedido) {
      if (data?.conflictos && data.conflictos.length > 0) {
        setConflictos(data.conflictos);
        return;
      }
      return setError(err ?? "No se pudo crear el pedido");
    }

    router.push(`/pedidos/${data.pedido.id}`);
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
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCliente(null);
                  setQCliente("");
                }}
              >
                Cambiar
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Input
                placeholder="Escribe el número o nombre del cliente..."
                value={qCliente}
                onChange={(e) => {
                  setQCliente(e.target.value);
                  setClienteAbierto(true);
                }}
                onFocus={() => setClienteAbierto(true)}
                onBlur={() => setTimeout(() => setClienteAbierto(false), 150)}
              />
              {clienteAbierto && qCliente.trim() && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                  <div className="max-h-56 overflow-y-auto">
                    {clientes.length === 0 ? (
                      <button
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setClienteAbierto(false);
                          setShowNuevoCliente(true);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-blue-50"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg text-blue-600">
                          +
                        </span>
                        <span>
                          <span className="block text-sm font-medium text-blue-700">
                            Agregar nuevo número
                          </span>
                          <span className="block text-xs text-slate-500">{qCliente}</span>
                        </span>
                      </button>
                    ) : (
                      clientes.map((c) => (
                        <button
                          key={c.id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setCliente(c);
                            setQCliente("");
                            setClienteAbierto(false);
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50"
                        >
                          <div>
                            <p className="text-sm font-medium">
                              {c.nombre} {c.apellido ?? ""}
                            </p>
                            <p className="text-xs text-slate-500">{c.telefono}</p>
                          </div>
                          <span className="text-xs text-blue-600">Seleccionar</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Vendedoras</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Select label="Vendedora" value={vendedora1} onChange={(e) => setVendedora1(e.target.value)}>
              {opcionesVendedoras.map((v) => (
                <option key={v.id} value={v.id}>{v.nombre}</option>
              ))}
            </Select>
            <Select label="Vendedora que colaboró 1" value={vendedora2} onChange={(e) => setVendedora2(e.target.value)}>
              {opcionesVendedoras.map((v) => (
                <option key={v.id} value={v.id}>{v.nombre}</option>
              ))}
            </Select>
            <Select label="Vendedora que colaboró 2" value={vendedora3} onChange={(e) => setVendedora3(e.target.value)}>
              {opcionesVendedoras.map((v) => (
                <option key={v.id} value={v.id}>{v.nombre}</option>
              ))}
            </Select>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Entrega y pago</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <Input
                label="Fecha de entrega"
                type="date"
                value={fechaEntrega}
                onChange={(e) => setFechaEntrega(e.target.value)}
                danger={fechaPasada}
                required
              />
              {fechaPasada && (
                <p className="mt-1 text-xs font-medium text-red-600">
                  La fecha seleccionada ya pasó. Igual podrás crear el pedido.
                </p>
              )}
            </div>
            <Select label="Tipo de pedido" value={tipoPedido} onChange={(e) => cambiarTipoPedido(e.target.value)}>
              <option value="envio">Envío</option>
              <option value="visita">Visita</option>
            </Select>
            <Select
              label="Método de entrega"
              value={metodoEntrega}
              onChange={(e) => setMetodoEntrega(e.target.value)}
            >
              {METODOS_POR_TIPO[tipoPedido].map((m) => (
                <option key={m} value={m}>
                  {METODO_LABEL[m]}
                </option>
              ))}
            </Select>
            <Select
              label="Empresa de envío"
              value={empresaEnvio}
              onChange={(e) => setEmpresaEnvio(e.target.value)}
            >
              {EMPRESA_POR_TIPO[tipoPedido].map((e) => (
                <option key={e} value={e}>
                  {EMPRESA_LABEL[e]}
                </option>
              ))}
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
            {Number(partes) === 1 ? (
              <>
                <Select
                  label="¿Pagó?"
                  value={pagoInicial}
                  onChange={(e) => setPagoInicial(e.target.value)}
                >
                  <option value="no">No</option>
                  <option value="si">Sí</option>
                </Select>
                {pagoInicial === "si" && (
                  <Input
                    label="Comprobante de pago (link Drive)"
                    value={comprobante}
                    onChange={(e) => setComprobante(e.target.value)}
                    placeholder="Pega el link del comprobante (Drive)"
                  />
                )}
              </>
            ) : (
              <>
                <Input
                  label="Primer pago (S/)"
                  type="number"
                  step="0.01"
                  value={montoPrimerPago}
                  onChange={(e) => setMontoPrimerPago(e.target.value)}
                />
                <Input
                  label="Fecha de la parte 2"
                  type="date"
                  value={fechaPagoParte2}
                  onChange={(e) => setFechaPagoParte2(e.target.value)}
                />
              </>
            )}
            <div className="md:col-span-3">
              <Input
                label="Observaciones"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
              />
            </div>
            <div className="md:col-span-3">
              <Input
                label="Regalo (descripción)"
                value={regalo}
                onChange={(e) => setRegalo(e.target.value)}
                placeholder="Ej: parante de celular"
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Productos</h2>
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div ref={recuadroRef} className="flex-1 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="relative md:col-span-3">
              <span className="mb-1 block font-medium text-slate-700">Producto</span>
              <input
                value={prodQ}
                onChange={(e) => {
                  setProdQ(e.target.value);
                  setSelProducto("");
                  setSelTalla("");
                  setProdAbierto(true);
                }}
                onFocus={() => {
                  setProdAbierto(true);
                  if (selProducto) setProdQ("");
                }}
                onBlur={() => setTimeout(() => setProdAbierto(false), 150)}
                placeholder="Escribe para buscar (nombre o IMEI)..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              {prodAbierto && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                  <div className="max-h-56 overflow-y-auto">
                    {filtradosProd.length === 0 && (
                      <p className="px-3 py-2 text-sm text-slate-400">Sin resultados.</p>
                    )}
                    {filtradosProd.map((p) => (
                      <button
                        key={p.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          elegirProducto(p);
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50"
                      >
                        <div>
                          <p className="text-sm font-medium">{p.nombre}</p>
                          <p className="text-xs text-slate-500">{p.imei}</p>
                        </div>
                        <span className="text-xs text-blue-600">Elegir</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Select label="Talla" value={selTalla} onChange={(e) => { setSelTalla(e.target.value); setSelTallaVendida(e.target.value); setSelCantidad("1"); }} className="md:col-span-2">
                <option value="">Sin talla</option>
                {tallasConStock.length > 0 ? (
                  tallasConStock.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre} ({t.cantidad_ventas} disp.)
                    </option>
                  ))
                ) : (
                  <option value="" disabled>Sin stock</option>
                )}
            </Select>
            <div className="md:col-span-2">
              <label className="mb-1 flex h-5 cursor-pointer items-center gap-1.5 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={selEntallar}
                  onChange={(e) => {
                    setSelEntallar(e.target.checked);
                    if (e.target.checked && !selTallaVendida) setSelTallaVendida(selTalla);
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Entallar a
              </label>
              {selEntallar && (
                <Select
                  value={selTallaVendida}
                  onChange={(e) => setSelTallaVendida(e.target.value)}
                >
                  <option value="">Sin talla</option>
                  {tallas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <div className="md:col-span-1">
              <Input
                label="Cantidad"
                type="number"
                min={1}
                max={selTalla ? disponible : undefined}
                value={selCantidad}
                onChange={(e) => setSelCantidad(e.target.value)}
                danger={cantidadExcede}
              />
              {selTalla && (
                <p className={`mt-1 text-xs ${cantidadExcede ? "font-medium text-red-600" : "text-slate-400"}`}>
                  Disp: {disponible}
                </p>
              )}
            </div>
            <Input
              label="Precio (S/)"
              type="number"
              step="0.01"
              value={selPrecio}
              onChange={(e) => setSelPrecio(e.target.value)}
              className="md:col-span-2"
            />
            <Select label="Género" value={selGenero} onChange={(e) => setSelGenero(e.target.value)} className="md:col-span-2">
              <option value="dama">Dama</option>
              <option value="caballero">Caballero</option>
            </Select>
            </div>
            </div>
            <Button
              onClick={agregarLinea}
              disabled={!selProducto}
              className="flex w-full shrink-0 flex-col rounded-xl"
              style={btnTam ? { width: btnTam, height: btnTam } : undefined}
            >
              <span className="text-3xl leading-none">+</span>
              <span className="mt-1 text-center text-sm leading-tight">Añadir este producto</span>
            </Button>
          </div>

          {lineas.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Productos agregados ({lineas.length})
              </h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-semibold">IMEI</th>
                      <th className="px-3 py-2 font-semibold">TALLA</th>
                      <th className="px-3 py-2 font-semibold">ENTALLE</th>
                      <th className="px-3 py-2 text-right font-semibold">CANTIDAD</th>
                      <th className="px-3 py-2 text-right font-semibold">PRECIO UNITARIO</th>
                      <th className="px-3 py-2 text-right font-semibold">SUBTOTAL</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lineas.map((l, i) => (
                      <tr key={i} className="bg-white">
                        <td className="px-3 py-2">
                          <span className="block font-medium">{l.imei}</span>
                          <span className="block text-xs text-slate-400">{l.nombre}</span>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{l.talla_vendida_nombre ?? "Sin talla"}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {l.entalle ? l.talla_stock_nombre ?? "Sin talla" : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600">{l.cantidad}</td>
                        <td className="px-3 py-2 text-right text-slate-600">S/ {l.precio_unitario.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-medium text-slate-800">
                          S/ {(l.cantidad * l.precio_unitario).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => setLineas((prev) => prev.filter((_, j) => j !== i))}
                            className="text-xs font-medium text-red-500 hover:text-red-700"
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                Terminar después
              </Button>
              <Button disabled={loading} onClick={() => guardar(true)}>
                {loading ? "Procesando..." : "Guardar Pedido"}
              </Button>
            </div>
          </div>
        </section>
      </div>

      {showNuevoCliente && (
        <NuevoClienteModal
          telefonoInicial={qCliente}
          onClose={() => setShowNuevoCliente(false)}
          onCreated={(c) => {
            setShowNuevoCliente(false);
            setQCliente("");
            setCliente(c);
          }}
        />
      )}

      {conflictos && (
        <Modal
          open
          onClose={() => setConflictos(null)}
          title="Stock insuficiente"
          footer={
            <Button variant="secondary" onClick={() => setConflictos(null)}>
              Entendido
            </Button>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Estos productos ya no tienen stock de ventas disponible. Es posible que otra
              vendedora los haya reservado mientras creabas el pedido.
            </p>
            {conflictos.map((c) => (
              <div
                key={`${c.producto_id}|${c.talla_id}`}
                className="rounded-lg border border-red-200 bg-red-50 p-3"
              >
                <p className="text-sm font-semibold text-red-700">
                  {c.producto_nombre} ({c.producto_imei}) — Talla {c.talla_nombre || "Sin talla"}
                </p>
                <p className="mt-1 text-xs text-red-600">
                  Quieres {c.cantidad}, pero solo hay {c.disponible} disponible.
                </p>
                {c.pedidos.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-red-700">Ya reservado por:</p>
                    <ul className="mt-1 space-y-1 text-xs text-slate-600">
                      {c.pedidos.map((p, i) => (
                        <li key={i}>
                          {p.codigo} ({p.estado}) — {p.cliente ?? "Sin cliente"}: {p.cantidad} und.
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function NuevoClienteModal({
  telefonoInicial,
  onClose,
  onCreated,
}: {
  telefonoInicial?: string;
  onClose: () => void;
  onCreated: (c: Cliente) => void;
}) {
  const [telefono, setTelefono] = useState(telefonoInicial ?? "");
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
