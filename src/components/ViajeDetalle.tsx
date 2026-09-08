"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button, Badge, Spinner, ErrorBanner } from "@/components/ui";
import { Html5Qrcode } from "html5-qrcode";

const ESTADO_BADGE: Record<string, string> = {
  programado: "slate",
  alistado: "purple",
  enviado: "greenLight",
  terminado: "greenStrong",
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
  estado: string;
  productos_unicos: {
    id?: string;
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
  retrasado?: boolean;
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
  detalle_id: string;
  producto_unico_id: string;
  talla_id: string | null;
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

  // Escaneo local (pendientes de guardar)
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  // VPU IDs marcados para eliminar
  const [eliminados, setEliminados] = useState<string[]>([]);
  // Slot que se está escaneando actualmente
  const [slotScanning, setSlotScanning] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Scanner de cámara
  const [scannerActivo, setScannerActivo] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const procesandoRetornoRef = useRef(false);
  const scannerDivId = "qr-scanner";

  // Búsqueda manual por texto
  const [busquedaActiva, setBusquedaActiva] = useState(false);
  const [busquedaSlot, setBusquedaSlot] = useState<string | null>(null);
  const [busquedaTexto, setBusquedaTexto] = useState("");
  const [busquedaData, setBusquedaData] = useState<StockDisponible[]>([]);
  const [buscandoStock, setBuscandoStock] = useState(false);
  const [retornandoQr, setRetornandoQr] = useState<string | null>(null);

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

  // Detener scanner helper
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
    setSlotScanning(null);
  }

  // Escanear un QR para un detalle específico
  async function procesarEscaneo(codigoQr: string) {
    if (!slotScanning) return;
    setMsg(null);

    // Verificar duplicado local
    if (pendientes.some((p) => p.codigo_qr === codigoQr)) {
      setMsg({ tipo: "err", texto: "Ese producto ya está en la lista" });
      detenerScanner();
      return;
    }
    // Verificar duplicado con ya alistados en BD
    if (alistados.some((a) => a.productos_unicos?.codigo_qr === codigoQr)) {
      setMsg({ tipo: "err", texto: "Ese producto ya fue alistado" });
      detenerScanner();
      return;
    }

    // Validar contra stock disponible
    const { data, error } = await api<{ disponibles: StockDisponible[] }>(
      `/api/viajes/${id}/stock?detalle_id=${slotScanning}&q=${encodeURIComponent(codigoQr)}`
    );
    if (error) {
      setMsg({ tipo: "err", texto: error });
      detenerScanner();
      return;
    }

    const encontrado = (data?.disponibles ?? []).find((s) => s.codigo_qr === codigoQr);
    if (!encontrado) {
      setMsg({ tipo: "err", texto: `El producto ${codigoQr} no coincide con este detalle (producto/talla incorrecta o sin stock)` });
      detenerScanner();
      return;
    }

    // Agregar a pendientes
    setPendientes((prev) => [
      ...prev,
      {
        key: `pend-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        codigo_qr: encontrado.codigo_qr,
        imei: encontrado.imei,
        detalle_id: slotScanning,
        producto_unico_id: encontrado.id,
        talla_id: encontrado.talla_id,
      },
    ]);
    setMsg({ tipo: "ok", texto: `Agregado: ${encontrado.imei} (${encontrado.codigo_qr})` });
    detenerScanner();
  }

  // Iniciar scanner para un slot específico
  function iniciarScannerParaSlot(detalleId: string) {
    setSlotScanning(detalleId);
    setMsg(null);
    setScannerActivo(true);

    // Esperar al siguiente render para que el div exista
    setTimeout(() => {
      try {
        const scanner = new Html5Qrcode(scannerDivId);
        scannerRef.current = scanner;
        scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            procesarEscaneo(decodedText);
          },
          () => {}
        ).catch(() => {
          setScannerActivo(false);
          setSlotScanning(null);
          setMsg({ tipo: "err", texto: "No se pudo abrir la cámara. Verifica los permisos." });
        });
      } catch {
        setScannerActivo(false);
        setSlotScanning(null);
        setMsg({ tipo: "err", texto: "No se pudo abrir la cámara." });
      }
    }, 100);
  }

  // Quitar un pendiente local
  function quitarPendiente(key: string) {
    setPendientes((prev) => prev.filter((p) => p.key !== key));
  }

  // Abrir overlay de búsqueda manual — carga todo el stock de una vez
  async function abrirBusqueda(detalleId: string) {
    setBusquedaSlot(detalleId);
    setBusquedaTexto("");
    setBusquedaData([]);
    setBusquedaActiva(true);
    setBuscandoStock(true);
    setMsg(null);
    const { data, error } = await api<{ disponibles: StockDisponible[] }>(
      `/api/viajes/${id}/stock?detalle_id=${detalleId}`
    );
    setBuscandoStock(false);
    if (error) {
      setMsg({ tipo: "err", texto: error });
      setBusquedaActiva(false);
      return;
    }
    setBusquedaData(data?.disponibles ?? []);
  }

  // Seleccionar un producto de la búsqueda manual
  function seleccionarDeBusqueda(s: StockDisponible) {
    if (!busquedaSlot) return;
    if (pendientes.some((p) => p.codigo_qr === s.codigo_qr)) {
      setMsg({ tipo: "err", texto: "Ese producto ya está en la lista" });
      return;
    }
    if (alistados.some((a) => a.productos_unicos?.codigo_qr === s.codigo_qr)) {
      setMsg({ tipo: "err", texto: "Ese producto ya fue alistado" });
      return;
    }
    setPendientes((prev) => [
      ...prev,
      {
        key: `pend-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        codigo_qr: s.codigo_qr,
        imei: s.imei,
        detalle_id: busquedaSlot,
        producto_unico_id: s.id,
        talla_id: s.talla_id,
      },
    ]);
    setMsg({ tipo: "ok", texto: `Agregado: ${s.imei} (${s.codigo_qr})` });
    setBusquedaActiva(false);
  }

  // Quitar un VPU guardado (marcar para eliminación + ocultar del slot)
  function marcarEliminado(vpuId: string) {
    setEliminados((prev) => [...prev, vpuId]);
    // Quitar del estado local para que desaparezca del slot de inmediato
    setAlistados((prev) => prev.filter((a) => a.id !== vpuId));
  }

  // Guardar todos los cambios (agregados + eliminados)
  async function guardarCambios() {
    if (pendientes.length === 0 && eliminados.length === 0) {
      setMsg({ tipo: "err", texto: "No hay cambios para guardar" });
      return;
    }
    setGuardando(true);
    setMsg(null);

    let guardados = 0;
    let errores = 0;

    // Guardar nuevos escaneos
    if (pendientes.length > 0) {
      const { data, error } = await api<{
        guardados?: { codigo_qr: string }[];
        errores?: { codigo_qr: string; error: string }[];
      }>(`/api/viajes/${id}/alistar/batch`, {
        method: "POST",
        body: JSON.stringify({
          lineas: pendientes.map((p) => ({
            codigo_qr: p.codigo_qr,
            detalle_id: p.detalle_id,
          })),
        }),
      });
      if (error) {
        setMsg({ tipo: "err", texto: error });
        setGuardando(false);
        return;
      }
      guardados = (data?.guardados ?? []).length;
      errores = (data?.errores ?? []).length;
    }

    // Eliminar VPU marcados
    if (eliminados.length > 0) {
      const { error } = await api(`/api/viajes/${id}/alistar`, {
        method: "DELETE",
        body: JSON.stringify({ vpu_ids: eliminados }),
      });
      if (error) {
        setMsg({ tipo: "err", texto: `Guardado parcial. Error al quitar: ${error}` });
        setGuardando(false);
        return;
      }
    }

    const partes: string[] = [];
    if (guardados > 0) partes.push(`${guardados} guardados`);
    if (errores > 0) partes.push(`${errores} con error`);
    if (eliminados.length > 0) partes.push(`${eliminados.length} quitados`);

    setMsg({
      tipo: errores > 0 ? "err" : "ok",
      texto: partes.join(", ") || "Cambios guardados",
    });

    setPendientes([]);
    setEliminados([]);
    setGuardando(false);
    cargar();
  }

  async function cambiarEstado(nuevo: string) {
    setMsg(null);
    const { error: err } = await api(`/api/viajes/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ estado: nuevo }),
    });
    if (err) setMsg({ tipo: "err", texto: err });
    else {
      setMsg({ tipo: "ok", texto: `Viaje marcado como ${nuevo}` });
      cargar();
    }
  }

  if (loading) return <Spinner />;
  if (!viaje) return <ErrorBanner message={error ?? "Viaje no encontrado"} />;

  const totalUnidades = items.reduce((a, i) => a + i.cantidad, 0);
  const totalAlistadas = items.reduce((a, i) => a + i.alistados, 0) + pendientes.length;
  const incompleto = items.some(
    (i) => i.alistados + pendientes.filter((p) => p.detalle_id === i.detalle_id).length < i.cantidad
  );
  const activo = viaje.estado === "programado" || viaje.estado === "alistado";

  // ─── FLUJO RECOJO ────────────────────────────────────────────────────────
  if (viaje.tipo === "recojo") {
    const pendientes = alistados.filter((a) => a.estado === "pendiente");
    const devueltos = alistados.filter((a) => a.estado === "devuelto");
    const totalEsperados = alistados.length;
    const totalDevueltos = devueltos.length;
    const todosDevueltos = totalEsperados > 0 && totalDevueltos === totalEsperados;
    const recojoActivo = viaje.estado === "programado" || viaje.estado === "alistado";

    async function escanearRetorno(codigoQr: string) {
      setMsg(null);
      const { data, error } = await api<{
        ok: boolean;
        producto_devuelto?: { id: string; codigo_qr: string };
        pendientes_restantes: number;
        completado: boolean;
        error?: string;
      }>(`/api/viajes/${id}/retorno`, {
        method: "POST",
        body: JSON.stringify({ codigo_qr: codigoQr }),
      });
      if (error) {
        setMsg({ tipo: "err", texto: error });
        return;
      }
      setMsg({
        tipo: "ok",
        texto: `Producto devuelto al almacén · Quedan ${data?.pendientes_restantes ?? 0} pendiente(s)`,
      });
      cargar();
    }

    function iniciarScannerRetorno() {
      setScannerActivo(true);
      setMsg(null);

      // Esperar al siguiente render para que el div exista en el DOM
      setTimeout(() => {
        try {
          const scanner = new Html5Qrcode(scannerDivId);
          scannerRef.current = scanner;
          scanner
            .start(
              { facingMode: "environment" },
              { fps: 10, qrbox: { width: 250, height: 250 } },
              (decodedText) => {
                if (!procesandoRetornoRef.current) {
                  procesandoRetornoRef.current = true;
                  escanearRetorno(decodedText).finally(() => {
                    procesandoRetornoRef.current = false;
                  });
                }
                detenerScanner();
              },
              () => {}
            )
            .catch(() => {
              setScannerActivo(false);
              setMsg({ tipo: "err", texto: "No se pudo abrir la cámara. Verifica los permisos del navegador o usa el botón 'Recoger' de cada producto para registrarlo manualmente." });
            });
        } catch {
          setScannerActivo(false);
          setMsg({ tipo: "err", texto: "No se pudo abrir la cámara. Verifica los permisos del navegador o usa el botón 'Recoger' de cada producto para registrarlo manualmente." });
        }
      }, 100);
    }

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
              <Badge color={viaje.retrasado ? "red" : ESTADO_BADGE[viaje.estado] ?? "slate"}>
                {viaje.retrasado
                  ? viaje.tipo === "recojo"
                    ? "Recojo retrasado"
                    : "Entrega retrasada"
                  : viaje.estado}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Recojo · Pedido {pedidoCodigo ?? "—"} · {clienteNombre ?? "Sin cliente"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-600">
              Devueltos:{" "}
              <strong className={todosDevueltos ? "text-emerald-600" : "text-amber-600"}>
                {totalDevueltos}/{totalEsperados}
              </strong>
            </p>
          </div>
        </div>

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

        {/* Botón escanear */}
        {recojoActivo && !todosDevueltos && (
          <div className="mb-4 flex flex-wrap gap-2">
            {!scannerActivo ? (
              <Button onClick={iniciarScannerRetorno}>📷 Escanear producto</Button>
            ) : (
              <Button variant="danger" onClick={detenerScanner}>
                Detener cámara
              </Button>
            )}
          </div>
        )}

        {scannerActivo && (
          <div className="mb-4">
            <div id={scannerDivId} className="overflow-hidden rounded-lg bg-black" />
          </div>
        )}

        {/* Lista de productos esperados */}
        <section className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-700">
              Productos a recoger ({totalDevueltos}/{totalEsperados})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2">IMEI</th>
                  <th className="px-4 py-2">TALLA</th>
                  <th className="px-4 py-2">ESTADO</th>
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2 text-right">ACCIÓN</th>
                </tr>
              </thead>
              <tbody>
                {alistados.map((a) => {
                  const esDevuelto = a.estado === "devuelto";
                  const qr = a.productos_unicos?.codigo_qr ?? "";
                  return (
                    <tr
                      key={a.id}
                      className={`border-b border-slate-100 last:border-0 ${
                        esDevuelto ? "bg-emerald-50" : "bg-white"
                      }`}
                    >
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">
                        {a.productos_unicos?.productos?.imei ?? "—"}
                      </td>
                      <td className="px-4 py-2 font-medium text-slate-800">
                        {a.productos_unicos?.tallas?.nombre ?? "—"}
                      </td>
                      <td className="px-4 py-2">
                        {esDevuelto ? (
                          <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            devuelto
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                            pendiente
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">{qr}</td>
                      <td className="px-4 py-2 text-right">
                        {!esDevuelto && recojoActivo ? (
                          <Button
                            size="sm"
                            variant="success"
                            disabled={procesandoRetornoRef.current}
                            onClick={() => {
                              if (procesandoRetornoRef.current) return;
                              procesandoRetornoRef.current = true;
                              escanearRetorno(qr).finally(() => {
                                procesandoRetornoRef.current = false;
                              });
                            }}
                          >
                            Recoger
                          </Button>
                        ) : (
                          <span className="text-xs text-emerald-600">✓ devuelto</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {alistados.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-center text-sm text-slate-400">
                      No hay productos registrados para este recojo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Estado del recojo */}
        <div className="flex flex-wrap gap-2">
          {todosDevueltos ? (
            <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Devolución completa
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Pendiente de recoger {totalEsperados - totalDevueltos} producto(s)
            </span>
          )}
        </div>
      </div>
    );
  }
  // ─── FIN FLUJO RECOJO ──────────────────────────────────────────────────

  // ─── FLUJO ENTREGA ──────────────────────────────────────────────────────

  // Para viajes cancelados: VPUs pendientes de retorno al stock (los que
  // cuentan en "Pendientes a regresar"): no devueltos y no pendientes.
  const esCancelado = viaje.estado === "cancelado";
  const esHistorial = ["enviado", "terminado", "cancelado"].includes(viaje.estado);
  const pendientesRetorno = esCancelado
    ? alistados.filter((a) => a.estado !== "devuelto" && a.estado !== "pendiente")
    : [];

  // Devolver un VPU concreto al stock (se pasa su codigo_qr al endpoint)
  async function devolverAlStock(a: Alistado) {
    const qr = a.productos_unicos?.codigo_qr;
    if (!qr) return;
    if (!window.confirm(`¿Devolver ${a.productos_unicos?.productos?.imei ?? qr} al stock?`)) return;
    setRetornandoQr(qr);
    setMsg(null);
    const { data, error } = await api<{
      ok: boolean;
      pendientes_restantes: number;
      error?: string;
    }>(`/api/viajes/${id}/retorno-stock`, {
      method: "POST",
      body: JSON.stringify({ codigo_qr: qr }),
    });
    setRetornandoQr(null);
    if (error) {
      setMsg({ tipo: "err", texto: error });
      return;
    }
    setMsg({
      tipo: "ok",
      texto: `Producto devuelto al stock. Quedan ${data?.pendientes_restantes ?? 0} pendiente(s).`,
    });
    cargar();
  }

  // Agrupar unidades alistadas por detalle
  const unidadesPorDetalle = new Map<string, { bd: Alistado[]; local: Pendiente[] }>();
  for (const item of items) {
    unidadesPorDetalle.set(item.detalle_id, { bd: [], local: [] });
  }
  for (const a of alistados) {
    const d = unidadesPorDetalle.get(a.detalle_pedido_id ?? "");
    if (d) d.bd.push(a);
  }
  for (const p of pendientes) {
    const d = unidadesPorDetalle.get(p.detalle_id);
    if (d) d.local.push(p);
  }

  return (
    <div className={esHistorial ? "rounded-xl border border-slate-300 bg-slate-200/70 p-4" : ""}>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/almacen" className="text-sm text-blue-600 hover:underline">
              ← Almacén
            </Link>
            <span className="text-slate-300">/</span>
            <h1 className="text-2xl font-bold text-slate-800">{viaje.codigo}</h1>
            <Badge color={viaje.retrasado ? "red" : ESTADO_BADGE[viaje.estado] ?? "slate"}>
              {viaje.retrasado
                ? viaje.tipo === "recojo"
                  ? "Recojo retrasado"
                  : "Entrega retrasada"
                : viaje.estado}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {viaje.tipo === "recojo" ? "Recojo" : "Entrega"} · Pedido {pedidoCodigo ?? "—"} ·{" "}
            {clienteNombre ?? "Sin cliente"}
          </p>
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

      {/* Scanner overlay */}
      {scannerActivo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="relative mx-4 w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">
                Escaneando para: {items.find((i) => i.detalle_id === slotScanning)?.nombre ?? "—"}
              </span>
              <button
                onClick={detenerScanner}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
              >
                ✕
              </button>
            </div>
            <div id={scannerDivId} className="overflow-hidden rounded-lg bg-black" />
          </div>
        </div>
      )}

      {/* Búsqueda manual overlay */}
      {busquedaActiva && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="relative mx-4 flex max-h-[80vh] w-full max-w-sm flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">
                Buscar producto · {items.find((i) => i.detalle_id === busquedaSlot)?.nombre ?? "—"}
              </span>
              <button
                onClick={() => setBusquedaActiva(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="px-4 pt-3">
              <input
                autoFocus
                placeholder="Filtra por código QR, IMEI o nombre..."
                value={busquedaTexto}
                onChange={(e) => setBusquedaTexto(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {buscandoStock ? (
                <p className="py-4 text-center text-sm text-slate-400">Cargando productos...</p>
              ) : (() => {
                const filtro = busquedaTexto.toLowerCase();
                const filtrados = filtro
                  ? busquedaData.filter(
                      (s) =>
                        s.codigo_qr.toLowerCase().includes(filtro) ||
                        s.imei.toLowerCase().includes(filtro) ||
                        s.nombre.toLowerCase().includes(filtro)
                    )
                  : busquedaData;
                if (filtrados.length === 0) {
                  return (
                    <p className="py-4 text-center text-sm text-slate-400">
                      {busquedaData.length === 0 ? "No hay productos disponibles" : "Sin resultados para esa búsqueda"}
                    </p>
                  );
                }
                return (
                  <ul className="space-y-1">
                    {filtrados.map((s) => {
                      const yaEnLista =
                        pendientes.some((p) => p.codigo_qr === s.codigo_qr) ||
                        alistados.some((a) => a.productos_unicos?.codigo_qr === s.codigo_qr);
                      return (
                        <li key={s.id}>
                          <button
                            disabled={yaEnLista}
                            onClick={() => seleccionarDeBusqueda(s)}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                              yaEnLista
                                ? "cursor-not-allowed bg-slate-50 opacity-50"
                                : "hover:bg-blue-50"
                            }`}
                          >
                            <div>
                              <span className="font-mono text-xs text-slate-500">{s.codigo_qr}</span>
                              <span className="ml-2 text-slate-700">{s.imei}</span>
                            </div>
                            <span className="text-xs text-slate-400">{s.nombre}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {/* Viaje cancelado con productos pendientes de devolver al stock */}
      {esCancelado && (
        <section className="mb-4 overflow-hidden rounded-xl border border-amber-300 bg-amber-50">
          <div className="border-b border-amber-200 bg-amber-100/60 px-5 py-3">
            <h2 className="text-sm font-semibold text-amber-800">
              Pendientes a regresar al stock ({pendientesRetorno.length})
            </h2>
          </div>
          {pendientesRetorno.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-500">
              No hay productos pendientes de retorno en este viaje.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-amber-200 bg-amber-100/40 text-left text-xs font-semibold uppercase tracking-wide text-amber-700">
                    <th className="px-4 py-2">IMEI</th>
                    <th className="px-4 py-2">TALLA</th>
                    <th className="px-4 py-2">CODIGO QR</th>
                    <th className="px-4 py-2">ESTADO</th>
                    <th className="px-4 py-2 text-right">ACCIÓN</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientesRetorno.map((a) => {
                    const qr = a.productos_unicos?.codigo_qr ?? "";
                    return (
                      <tr key={a.id} className="border-b border-amber-100 last:border-0 bg-white">
                        <td className="px-4 py-2 font-mono text-xs text-slate-500">
                          {a.productos_unicos?.productos?.imei ?? "—"}
                        </td>
                        <td className="px-4 py-2 font-medium text-slate-800">
                          {a.productos_unicos?.tallas?.nombre ?? "—"}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-500">{qr}</td>
                        <td className="px-4 py-2">
                          <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                            {a.estado}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            size="sm"
                            variant="success"
                            disabled={retornandoQr === qr}
                            onClick={() => devolverAlStock(a)}
                          >
                            {retornandoQr === qr ? "Devolviendo..." : "Devolver"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="mb-4 overflow-hidden rounded-xl border border-slate-300 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-700">
            Productos a alistar
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-slate-300 bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="border-r border-slate-200 px-3 py-2">IMEI</th>
                <th className="border-r border-slate-200 px-3 py-2">TALLA</th>
                <th className="border-r border-slate-200 px-3 py-2">CANTIDAD</th>
                <th className="border-r border-slate-200 px-3 py-2">ENTALLAR A:</th>
                <th className="border-r border-slate-200 px-3 py-2">ID PRODUCTO ÚNICO</th>
                <th className="px-3 py-2">ESTADO</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const grupos = unidadesPorDetalle.get(item.detalle_id);
                const bdUnits = grupos?.bd ?? [];
                const localUnits = grupos?.local ?? [];
                const totalListas = bdUnits.length + localUnits.length;
                const slots: Array<{ tipo: "bd"; data: Alistado } | { tipo: "local"; data: Pendiente } | { tipo: "vacio" }> = [];
                for (const u of bdUnits) slots.push({ tipo: "bd", data: u });
                for (const u of localUnits) slots.push({ tipo: "local", data: u });
                while (slots.length < item.cantidad) slots.push({ tipo: "vacio" });
                const slotsVisibles = slots.slice(0, item.cantidad);
                const slotsExceso = slots.slice(item.cantidad);
                const exceso = slotsExceso.length;
                const completo = totalListas >= item.cantidad && exceso === 0;
                const rowSpan = slotsVisibles.length + slotsExceso.length;

                return [...slotsVisibles, ...slotsExceso].map((slot, idx) => {
                  const isFirst = idx === 0;
                  const esExceso = idx >= item.cantidad;
                  const bgColor = item.estado === "oculto"
                    ? "bg-slate-50 opacity-60"
                    : esExceso
                      ? "bg-red-50"
                      : completo
                        ? "bg-emerald-50"
                        : slot.tipo === "bd"
                          ? "bg-blue-50"
                          : slot.tipo === "local"
                            ? "bg-amber-50"
                            : "bg-white";

                  return (
                    <tr key={`${item.detalle_id}-${idx}`} className={`border-b border-slate-200 last:border-b-0 ${bgColor}`}>
                      {/* IMEI — solo primera fila con rowSpan */}
                      {isFirst && (
                        <td
                          rowSpan={rowSpan}
                          className="border-r border-b border-slate-200 px-3 py-2 font-mono text-xs text-slate-500 align-middle"
                        >
                          <span className={item.estado === "oculto" ? "line-through" : ""}>
                            {item.imei ?? "—"}
                          </span>
                          {item.estado === "oculto" && (
                            <span className="ml-1 inline-block rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                              devuelto
                            </span>
                          )}
                        </td>
                      )}
                      {/* TALLA — solo primera fila con rowSpan */}
                      {isFirst && (
                        <td
                          rowSpan={rowSpan}
                          className="border-r border-b border-slate-200 px-3 py-2 font-medium text-slate-800 align-middle"
                        >
                          {item.talla_stock_nombre ?? "Sin talla"}
                        </td>
                      )}
                      {/* CANTIDAD — solo primera fila con rowSpan */}
                      {isFirst && (
                        <td
                          rowSpan={rowSpan}
                          className="border-r border-b border-slate-200 px-3 py-2 align-middle"
                        >
                          <span className="font-semibold text-slate-800">{item.cantidad}/{item.cantidad}</span>
                          {exceso > 0 && (
                            <span className="ml-1 inline-block rounded bg-red-200 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                              +{exceso} exceso
                            </span>
                          )}
                        </td>
                      )}
                      {/* ENTALLAR A — solo primera fila con rowSpan */}
                      {isFirst && (
                        <td
                          rowSpan={rowSpan}
                          className="border-r border-b border-slate-200 px-3 py-2 align-middle"
                        >
                          {item.entalle ? (
                            <span className="font-medium text-purple-700">{item.talla_vendida_nombre ?? "—"}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      )}
                      {/* ID PRODUCTO ÚNICO — cada fila tiene su slot */}
                      <td className="border-r border-slate-200 px-3 py-2.5">
                        {slot.tipo === "bd" ? (
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-xs font-semibold ${esExceso ? "bg-red-200 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                              {slot.data.productos_unicos?.codigo_qr ?? "—"}
                            </span>
                            {esExceso && (
                              <span className="inline-block rounded bg-red-200 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                                Retirar
                              </span>
                            )}
                            {activo && (
                              <button
                                onClick={() => marcarEliminado(slot.data.id)}
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-red-300 bg-red-50 text-sm font-bold text-red-500 transition-colors hover:bg-red-500 hover:text-white"
                                title={esExceso ? "Retirar del viaje" : "Quitar"}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ) : slot.tipo === "local" ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 font-mono text-xs font-semibold text-amber-700">
                              {slot.data.codigo_qr}
                            </span>
                            <span className="text-[10px] text-amber-500">pendiente</span>
                            <button
                              onClick={() => quitarPendiente(slot.data.key)}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-red-300 bg-red-50 text-sm font-bold text-red-500 transition-colors hover:bg-red-500 hover:text-white"
                              title="Quitar"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => iniciarScannerParaSlot(item.detalle_id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-blue-300 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600 transition-colors hover:border-blue-400 hover:bg-blue-100"
                            >
                              📷 Escanear
                            </button>
                            <button
                              onClick={() => abrirBusqueda(item.detalle_id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-100"
                            >
                              ✏️ Escribir
                            </button>
                          </div>
                        )}
                      </td>
                      {/* ESTADO — solo primera fila con rowSpan */}
                      {isFirst && (
                        <td
                          rowSpan={rowSpan}
                          className="px-3 py-2 align-middle"
                        >
                          {exceso > 0 ? (
                            <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                              excedente
                            </span>
                          ) : completo ? (
                            <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                              completo
                            </span>
                          ) : (
                            <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              incompleto
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                });
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-sm text-slate-400">
                    Sin productos asignados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Resumen eliminados */}
      {eliminados.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          {eliminados.length} unidad(es) marcadas para quitar. Presiona "Guardar cambios" para aplicar.
        </div>
      )}

      {/* Acciones */}
      {activo && (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={guardarCambios}
            disabled={guardando || (pendientes.length === 0 && eliminados.length === 0)}
          >
            {guardando ? "Guardando..." : "Alistar"}
          </Button>
          {viaje.estado === "alistado" && !incompleto && pendientes.length === 0 && (
            <Button variant="success" onClick={() => cambiarEstado("enviado")}>
              Enviar
            </Button>
          )}
          {viaje.estado === "enviado" && (
            <Button variant="success" onClick={() => cambiarEstado("terminado")}>
              Marcar entregado
            </Button>
          )}
        </div>
      )}
    </div>
  );
}