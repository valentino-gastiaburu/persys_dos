"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button, Input, Badge, Spinner, ErrorBanner } from "@/components/ui";
import { Html5Qrcode } from "html5-qrcode";

const ESTADO_BADGE: Record<string, string> = {
  programado: "slate",
  alistado: "purple",
  enviado: "amber",
  terminado: "green",
};

type Item = {
  detalle_id: string;
  imei: string;
  nombre: string;
  talla: string | null;
  talla_stock: string | null;
  talla_stock_nombre: string | null;
  talla_vendida: string | null;
  talla_vendida_nombre: string | null;
  cantidad: number;
  alistados: number;
  falta: number;
  completo: boolean;
  entalle: boolean;
  estado: string;
  devuelto: boolean;
};

type Alistado = {
  id: string;
  detalle_pedido_id: string | null;
  productos_unicos: {
    codigo_qr: string;
    talla_id: string | null;
    talla_original: string | null;
    tallas: { nombre: string } | null;
    tallas_original: { nombre: string } | null;
    productos: { imei: string } | null;
  };
};

type Viaje = {
  id: string;
  codigo: string;
  tipo: string;
  estado: string;
  fecha: string | null;
  fecha_devolucion: string | null;
};

type StockDisponible = {
  id: string;
  codigo_qr: string;
  talla_id: string | null;
  estado: string;
  imei: string;
  nombre: string;
};

// Unidad alistada localmente (pendiente de guardar)
type Pendiente = {
  key: string;
  codigo_qr: string;
  imei: string;
  nombre: string;
  talla_id: string | null;
  detalle_id: string;
};

export default function ViajeDetalle() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [viaje, setViaje] = useState<Viaje | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [alistados, setAlistados] = useState<Alistado[]>([]);
  const [clienteNombre, setClienteNombre] = useState<string | null>(null);
  const [pedidoCodigo, setPedidoCodigo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null);

  // Producto seleccionado para alistar
  const [seleccionado, setSeleccionado] = useState<Item | null>(null);
  // Unidades alistadas localmente (pendientes de guardar)
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  // Buscador con autocompletado
  const [busqueda, setBusqueda] = useState("");
  const [sugerencias, setSugerencias] = useState<StockDisponible[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // Scanner de cámara
  const [scannerActivo, setScannerActivo] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivId = "qr-scanner";

  const cargar = useCallback(async () => {
    const { data, error } = await api<{
      viaje: Viaje;
      items: Item[];
      alistados: Alistado[];
      cliente?: { nombre: string };
      pedido_codigo: string | null;
    }>(`/api/viajes/${id}`);
    if (error) setError(error);
    else {
      setViaje(data?.viaje ?? null);
      setItems(data?.items ?? []);
      setAlistados(data?.alistados ?? []);
      setClienteNombre(data?.cliente?.nombre ?? null);
      setPedidoCodigo(data?.pedido_codigo ?? null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Limpiar scanner al desmontar
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        try {
          scannerRef.current.stop().catch(() => {});
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // Buscar sugerencias cuando cambia el texto o el producto seleccionado
  useEffect(() => {
    if (!seleccionado) {
      setSugerencias([]);
      return;
    }
    setBuscando(true);
    const timer = setTimeout(() => {
      api<{ disponibles: StockDisponible[] }>(
        `/api/viajes/${id}/stock?detalle_id=${seleccionado.detalle_id}&q=${encodeURIComponent(busqueda)}`
      ).then(({ data }) => {
        setSugerencias(data?.disponibles ?? []);
        setBuscando(false);
      });
    }, 200); // debounce para no saturar
    return () => clearTimeout(timer);
  }, [busqueda, seleccionado, id]);

  // Agregar una unidad a pendientes (local, sin tocar BD)
  function agregarPendiente(s: StockDisponible) {
    if (!seleccionado) return;
    // Evitar duplicados en pendientes
    if (pendientes.some((p) => p.codigo_qr === s.codigo_qr)) {
      setMsg({ tipo: "err", texto: "Esa unidad ya está en la lista de alistado" });
      return;
    }
    // Evitar duplicados con ya alistados
    if (alistados.some((a) => a.productos_unicos?.codigo_qr === s.codigo_qr)) {
      setMsg({ tipo: "err", texto: "Esa unidad ya fue alistada" });
      return;
    }
    setPendientes((prev) => [
      ...prev,
      {
        key: `pend-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        codigo_qr: s.codigo_qr,
        imei: s.imei,
        nombre: s.nombre,
        talla_id: s.talla_id,
        detalle_id: seleccionado.detalle_id,
      },
    ]);
    setBusqueda("");
    setSugerencias([]);
    setMsg(null);
  }

  // Quitar una unidad pendiente
  function quitarPendiente(key: string) {
    setPendientes((prev) => prev.filter((p) => p.key !== key));
  }

  // Guardar todas las pendientes en batch
  async function guardarAlistados() {
    if (pendientes.length === 0) {
      setMsg({ tipo: "err", texto: "No hay unidades pendientes por guardar" });
      return;
    }
    setGuardando(true);
    setMsg(null);
    const { data, error } = await api(`/api/viajes/${id}/alistar/batch`, {
      method: "POST",
      body: JSON.stringify({
        lineas: pendientes.map((p) => ({
          codigo_qr: p.codigo_qr,
          detalle_id: p.detalle_id,
        })),
      }),
    });
    setGuardando(false);
    if (error) {
      setMsg({ tipo: "err", texto: error });
      return;
    }
    const guardados = (data as any)?.guardados ?? [];
    const errores = (data as any)?.errores ?? [];
    const viajeAlistado = (data as any)?.viaje_alistado;

    if (errores.length > 0) {
      setMsg({
        tipo: "err",
        texto: `${guardados.length} guardados, ${errores.length} con error: ${errores[0].error}`,
      });
    } else {
      setMsg({
        tipo: "ok",
        texto: `${guardados.length} unidades alistadas${viajeAlistado ? " · Viaje marcado como alistado" : ""}`,
      });
    }
    setPendientes([]);
    setSeleccionado(null);
    setBusqueda("");
    cargar();
  }

  async function cambiarEstado(nuevo: string) {
    setMsg(null);
    const { error } = await api(`/api/viajes/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ estado: nuevo }),
    });
    if (error) setMsg({ tipo: "err", texto: error });
    else {
      setMsg({ tipo: "ok", texto: `Viaje marcado como ${nuevo}` });
      cargar();
    }
  }

  // Iniciar scanner de cámara
  async function iniciarScanner() {
    setScannerActivo(true);
    setMsg(null);
    try {
      const scanner = new Html5Qrcode(scannerDivId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // Al escanear, buscar la unidad en el stock disponible y agregarla
          setBusqueda(decodedText);
          const encontrada = sugerencias.find((s) => s.codigo_qr === decodedText);
          if (encontrada) {
            agregarPendiente(encontrada);
            detenerScanner();
          } else {
            api<{ disponibles: StockDisponible[] }>(
              `/api/viajes/${id}/stock?detalle_id=${seleccionado?.detalle_id}&q=${encodeURIComponent(decodedText)}`
            ).then(({ data }) => {
              const exacta = (data?.disponibles ?? []).find((s) => s.codigo_qr === decodedText);
              if (exacta) {
                agregarPendiente(exacta);
              } else {
                setMsg({ tipo: "err", texto: "No se encontró una unidad válida con ese QR" });
              }
              detenerScanner();
            });
          }
        },
        () => {
          // ignore frame errors
        }
      );
    } catch (e) {
      setScannerActivo(false);
      setMsg({ tipo: "err", texto: "No se pudo abrir la cámara. Verifica los permisos." });
    }
  }

  async function detenerScanner() {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // ignore
      }
      scannerRef.current = null;
    }
    setScannerActivo(false);
  }

  if (loading) return <Spinner />;
  if (!viaje) return <ErrorBanner message={error ?? "Viaje no encontrado"} />;

  const totalUnidades = items.reduce((a, i) => a + i.cantidad, 0);
  const totalAlistadas = items.reduce((a, i) => a + i.alistados, 0) + pendientes.length;
  const incompleto = items.some(
    (i) => i.alistados + pendientes.filter((p) => p.detalle_id === i.detalle_id).length < i.cantidad
  );
  const activo = viaje.estado === "programado" || viaje.estado === "alistado";

  // Unidades alistadas combinadas: las de BD + las pendientes
  const unidadesAlistadas = [
    ...alistados.map((a) => ({
      key: a.id,
      codigo_qr: a.productos_unicos?.codigo_qr ?? "—",
      imei: a.productos_unicos?.productos?.imei ?? "—",
      talla_nombre: a.productos_unicos?.tallas?.nombre ?? null,
      talla_original_nombre: a.productos_unicos?.tallas_original?.nombre ?? null,
      talla_id: a.productos_unicos?.talla_id ?? null,
      talla_original: a.productos_unicos?.talla_original ?? null,
      pendiente: false,
    })),
    ...pendientes.map((p) => ({
      key: p.key,
      codigo_qr: p.codigo_qr,
      imei: p.imei,
      talla_nombre: null,
      talla_original_nombre: null,
      talla_id: p.talla_id,
      talla_original: null,
      pendiente: true,
    })),
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/almacen" className="text-sm text-blue-600 hover:underline">
              ← Almacén
            </Link>
            <span className="text-slate-300">/</span>
            <h1 className="text-2xl font-bold text-slate-800">{viaje.codigo}</h1>
            <Badge color={ESTADO_BADGE[viaje.estado] ?? "slate"}>{viaje.estado}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {viaje.tipo === "recojo" ? "Recojo" : "Entrega"} · Pedido {pedidoCodigo ?? "—"} ·{" "}
            {clienteNombre ?? "Sin cliente"}
          </p>
          {viaje.tipo === "recojo" && (
            <p className="mt-1 text-xs text-slate-500">
              Programado:{" "}
              <strong className="text-slate-700">
                {viaje.fecha ? new Date(viaje.fecha + "T00:00:00").toLocaleDateString("es-PE") : "—"}
              </strong>
              {viaje.fecha_devolucion && (
                <>
                  {" "}· Devuelto:{" "}
                  <strong className="text-emerald-600">
                    {new Date(viaje.fecha_devolucion).toLocaleDateString("es-PE")}
                  </strong>
                </>
              )}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-600">
            Alistadas: <strong className={incompleto ? "text-amber-600" : "text-emerald-600"}>{totalAlistadas}/{totalUnidades}</strong>
          </p>
        </div>
      </div>
      <ErrorBanner message={error} />

      {msg && (
        <div
          className={`mb-4 rounded-lg border px-4 py-2 text-sm ${
            msg.tipo === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.texto}
        </div>
      )}

      {/* Tabla de productos a alistar */}
      <section className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-700">
            {viaje.tipo === "recojo" ? "Productos a recoger" : "Productos a alistar"}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">IMEI</th>
                <th className="px-4 py-2">TALLA</th>
                <th className="px-4 py-2">CANTIDAD</th>
                <th className="px-4 py-2">ENTALLAR A:</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const esSeleccionado = seleccionado?.detalle_id === i.detalle_id;
                const pendientesDetalle = pendientes.filter((p) => p.detalle_id === i.detalle_id).length;
                const alistadasDetalle = i.alistados + pendientesDetalle;
                const completo = alistadasDetalle >= i.cantidad;
                return (
                  <tr
                    key={i.detalle_id}
                    onClick={() => {
                      if (activo && !completo) {
                        setSeleccionado(esSeleccionado ? null : i);
                        setBusqueda("");
                        setSugerencias([]);
                      }
                    }}
                    className={`cursor-pointer border-b border-slate-100 transition-colors last:border-0 ${
                      esSeleccionado ? "bg-blue-50" : completo ? "bg-emerald-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{i.imei}</td>
                    <td className="px-4 py-2 font-medium text-slate-800">
                      {i.talla_stock_nombre ?? "Sin talla"}
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-semibold text-slate-800">{alistadasDetalle}/{i.cantidad}</span>
                      {completo && (
                        <span className="ml-2 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          completo
                        </span>
                      )}
                      {esSeleccionado && (
                        <span className="ml-2 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                          seleccionado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {i.entalle ? (
                        <span className="font-medium text-purple-700">{i.talla_vendida_nombre ?? "—"}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-center text-sm text-slate-400">
                    Sin productos asignados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Área de alistado del producto seleccionado */}
      {activo && seleccionado && (
        <section className="mb-4 rounded-xl border-2 border-blue-300 bg-blue-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-blue-800">
              Alistar: {seleccionado.nombre} ({seleccionado.imei}) · Talla{" "}
              {seleccionado.talla_stock_nombre ?? "Sin talla"}
              {seleccionado.entalle && (
                <span className="text-purple-700"> → Entallar a: {seleccionado.talla_vendida_nombre ?? "—"}</span>
              )}
            </h2>
            <Button size="sm" variant="secondary" onClick={() => setSeleccionado(null)}>
              Cancelar
            </Button>
          </div>

          <div className="flex flex-wrap items-start gap-2">
            <div className="relative max-w-sm flex-1">
              <input
                placeholder="Busca o escanea el código QR / IMEI"
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setMostrarSugerencias(true);
                }}
                onFocus={() => setMostrarSugerencias(true)}
                onBlur={() => setTimeout(() => setMostrarSugerencias(false), 200)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && sugerencias.length > 0) {
                    agregarPendiente(sugerencias[0]);
                  }
                }}
                autoFocus
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              {mostrarSugerencias && (
                <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {buscando ? (
                    <p className="px-3 py-2 text-sm text-slate-400">Buscando...</p>
                  ) : sugerencias.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-slate-400">Sin resultados</p>
                  ) : (
                    sugerencias.map((s) => (
                      <button
                        key={s.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          agregarPendiente(s);
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-blue-50"
                      >
                        <span className="font-mono text-xs text-slate-500">{s.codigo_qr}</span>
                        <span className="text-slate-700">{s.imei}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <Button onClick={() => agregarPendiente(sugerencias[0])} disabled={!sugerencias.length}>
              Alistar
            </Button>
            {!scannerActivo ? (
              <Button variant="secondary" onClick={iniciarScanner}>
                📷 Escanear con cámara
              </Button>
            ) : (
              <Button variant="danger" onClick={detenerScanner}>
                Detener cámara
              </Button>
            )}
          </div>

          {scannerActivo && (
            <div className="mt-3">
              <div id={scannerDivId} className="overflow-hidden rounded-lg bg-black" />
            </div>
          )}

          {/* Pendientes de este producto */}
          {pendientes.filter((p) => p.detalle_id === seleccionado.detalle_id).length > 0 && (
            <div className="mt-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                Pendientes de guardar ({pendientes.filter((p) => p.detalle_id === seleccionado.detalle_id).length})
              </h3>
              <div className="space-y-1">
                {pendientes
                  .filter((p) => p.detalle_id === seleccionado.detalle_id)
                  .map((p) => (
                    <div key={p.key} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-sm">
                      <span className="font-mono text-xs text-slate-500">{p.codigo_qr}</span>
                      <span className="text-slate-600">{p.imei}</span>
                      <Button size="sm" variant="danger" onClick={() => quitarPendiente(p.key)}>
                        Quitar
                      </Button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </section>
      )}

      {activo && !seleccionado && (
        <p className="mb-4 rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-500">
          Selecciona un producto de la tabla para alistarlo.
        </p>
      )}

      {/* Tabla de unidades alistadas */}
      <section className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-700">
            Unidades alistadas ({unidadesAlistadas.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">IMEI</th>
                <th className="px-4 py-2">TALLA</th>
                <th className="px-4 py-2">ENTALLAR A:</th>
                <th className="px-4 py-2">ID PRODUCTO ÚNICO</th>
              </tr>
            </thead>
            <tbody>
              {unidadesAlistadas.map((u) => (
                <tr key={u.key} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{u.imei}</td>
                  <td className="px-4 py-2 text-slate-700">
                    {u.talla_original_nombre ? u.talla_original_nombre : u.talla_nombre ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {u.talla_original_nombre && u.talla_nombre && u.talla_original_nombre !== u.talla_nombre ? (
                      <span className="font-medium text-purple-700">{u.talla_nombre}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-mono text-xs text-slate-500">{u.codigo_qr}</span>
                    {u.pendiente && (
                      <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        pendiente
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {unidadesAlistadas.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-center text-sm text-slate-400">
                    Aún no se alista nada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {activo && (
        <div className="flex flex-wrap gap-2">
          {viaje.estado === "programado" && (
            <Button onClick={guardarAlistados} disabled={guardando || pendientes.length === 0}>
              {guardando ? "Guardando..." : "Marcar como alistado"}
            </Button>
          )}
          {viaje.estado === "alistado" && (
            <Button onClick={() => cambiarEstado("enviado")}>Enviar viaje</Button>
          )}
          {viaje.estado === "enviado" && (
            <Button variant="success" onClick={() => cambiarEstado("terminado")}>
              {viaje.tipo === "recojo" ? "Registrar devolución" : "Marcar entregado"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}