"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { api } from "@/lib/api";
import { Button, Input, Spinner, ErrorBanner } from "@/components/ui";
import { Html5Qrcode } from "html5-qrcode";

const STORAGE_KEY = "persys:conteo";
const HEX8 = /^[0-9a-f]{8}$/;

type Unidad = {
  id: string;
  codigo_qr: string;
  estado: string;
  imei: string;
  nombre: string;
  talla: string;
  pedido: string | null;
  viaje: string | null;
};

type Resultado = "ok" | "fuera";

type Escaneo = {
  key: string;
  codigo: string;
  res: Resultado;
  estado?: string;
  imei?: string;
  nombre?: string;
  talla?: string;
  pedido?: string;
  viaje?: string;
  when: number;
};

type Guardado = {
  v: number;
  iniciadoEl: number;
  escaneados: Escaneo[];
};

const ESTADO_LABEL: Record<string, string> = {
  en_almacen: "en almacén",
  almacen_espera: "almacén en espera",
  en_viaje: "en viaje (con cliente)",
  entregado: "entregado",
  devuelto: "devuelto",
  eliminado: "eliminado",
};

function genKey() {
  return `esc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function rebuild(list: Escaneo[], mapU: Map<string, Unidad>): Escaneo[] {
  const vistos = new Set<string>();
  const out: Escaneo[] = [];
  for (const s of list) {
    const u = mapU.get(s.codigo);
    if (!u) continue;
    let res: Resultado;
    if (u.estado !== "en_almacen") {
      res = "fuera";
    } else if (vistos.has(s.codigo)) {
      continue;
    } else {
      vistos.add(s.codigo);
      res = "ok";
    }
    out.push({
      ...s,
      res,
      estado: u.estado,
      imei: u.imei,
      nombre: u.nombre,
      talla: u.talla,
      pedido: u.pedido ?? undefined,
      viaje: u.viaje ?? undefined,
    });
  }
  return out;
}

export default function ConteoAlmacen() {
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [escaneados, setEscaneados] = useState<Escaneo[]>([]);
  const [iniciadoEl, setIniciadoEl] = useState<number | null>(null);
  const [inputQr, setInputQr] = useState("");
  const [scannerActivo, setScannerActivo] = useState(false);
  const [camMsg, setCamMsg] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [detectado, setDetectado] = useState(false);
  const [pendiente, setPendiente] = useState(false);
  const [flash, setFlash] = useState<{ tipo: "ok" | "err" | "warn"; texto: string } | null>(null);
  const [ultimo, setUltimo] = useState<{ tipo: "ok" | "err" | "warn"; texto: string } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const escaneadosRef = useRef<Escaneo[]>([]);
  const lastScanRef = useRef<{ codigo: string; ts: number }>({ codigo: "", ts: 0 });
  const frameErrRef = useRef(0);
  const lastStatusSyncRef = useRef(0);
  const pendingScanRef = useRef<{ codigo: string; timeout: number } | null>(null);
  const solvedScanRef = useRef<{ codigo: string; ts: number }>({ codigo: "", ts: 0 });
  const lastDecodeRef = useRef<{ codigo: string; ts: number }>({ codigo: "", ts: 0 });
  const scannerDivId = "inventario-scanner";

  useEffect(() => {
    escaneadosRef.current = escaneados;
  }, [escaneados]);

  const unidadesByQr = useMemo(() => {
    const m = new Map<string, Unidad>();
    for (const u of unidades) m.set(u.codigo_qr, u);
    return m;
  }, [unidades]);

  const escaneadosOk = useMemo(() => {
    const s = new Set<string>();
    for (const e of escaneados) if (e.res === "ok") s.add(e.codigo);
    return s;
  }, [escaneados]);

  const pendientes = useMemo(() => {
    return unidades
      .filter((u) => u.estado === "en_almacen" && !escaneadosOk.has(u.codigo_qr))
      .sort(
        (a, b) =>
          a.imei.localeCompare(b.imei) ||
          a.talla.localeCompare(b.talla, undefined, { numeric: true }) ||
          a.codigo_qr.localeCompare(b.codigo_qr)
      );
  }, [unidades, escaneadosOk]);

  const rojas = useMemo(() => escaneados.filter((e) => e.res === "fuera"), [escaneados]);
  const verdes = useMemo(
    () =>
      escaneados
        .filter((e) => e.res === "ok")
        .sort((a, b) => (a.imei ?? "").localeCompare(b.imei ?? "") || (a.codigo ?? "").localeCompare(b.codigo ?? "")),
    [escaneados]
  );

  const restaurar = useCallback((mapU: Map<string, Unidad>) => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Guardado;
      if (!parsed || parsed.v !== 2 || !Array.isArray(parsed.escaneados)) return;
      setEscaneados(rebuild(parsed.escaneados, mapU));
      setIniciadoEl(parsed.iniciadoEl ?? Date.now());
    } catch {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await api<{ productos_unicos: unknown[] }>("/api/productos-unicos");
      if (cancelado) return;
      setLoading(false);
      if (error || !data) {
        setError(error ?? "No se pudieron cargar los productos.");
        return;
      }
      const us: Unidad[] = (data.productos_unicos ?? []).map((r) => {
        const raw = r as {
          id: string;
          codigo_qr: string;
          estado: string;
          viaje: string | null;
          pedido: string | null;
          productos: { imei: string; nombre: string } | null;
          tallas: { nombre: string } | null;
        };
        return {
          id: raw.id,
          codigo_qr: raw.codigo_qr,
          estado: raw.estado,
          imei: raw.productos?.imei ?? "—",
          nombre: raw.productos?.nombre ?? "—",
          talla: raw.tallas?.nombre ?? "—",
          pedido: raw.pedido ?? null,
          viaje: raw.viaje ?? null,
        };
      });
      setUnidades(us);
      const mapU = new Map<string, Unidad>();
      for (const u of us) mapU.set(u.codigo_qr, u);
      restaurar(mapU);
    })();
    return () => {
      cancelado = true;
    };
  }, [restaurar]);

  useEffect(() => {
    if (!escaneados.length && !iniciadoEl) return;
    try {
      const data: Guardado = { v: 2, iniciadoEl: iniciadoEl ?? Date.now(), escaneados };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
  }, [escaneados, iniciadoEl]);

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
    setScanStatus(null);
    setDetectado(false);
    setPendiente(false);
  }

  async function iniciarScanner() {
    setCamMsg(null);
    setScanStatus("Iniciando cámara...");
    setDetectado(false);
    setPendiente(false);
    frameErrRef.current = 0;
    lastStatusSyncRef.current = 0;
    solvedScanRef.current = { codigo: "", ts: 0 };
    lastDecodeRef.current = { codigo: "", ts: 0 };
    if (pendingScanRef.current?.timeout) clearTimeout(pendingScanRef.current.timeout);
    pendingScanRef.current = null;
    setScannerActivo(true);
    setTimeout(() => {
      try {
        const scanner = new Html5Qrcode(scannerDivId, { verbose: false });
        scannerRef.current = scanner;
        scanner
          .start(
            { facingMode: "environment" },
            { fps: 12, qrbox: { width: 250, height: 250 }, disableFlip: false, aspectRatio: 1.0 },
            (decodedText) => {
              const codigo = decodedText.trim().toLowerCase();
              lastDecodeRef.current = { codigo, ts: Date.now() };
              if (
                !pendingScanRef.current &&
                solvedScanRef.current.codigo === codigo &&
                Date.now() - solvedScanRef.current.ts < 2500
              ) {
                setDetectado(true);
                return;
              }
              if (!pendingScanRef.current || pendingScanRef.current.codigo !== codigo) {
                if (pendingScanRef.current?.timeout) {
                  clearTimeout(pendingScanRef.current.timeout);
                }
                pendingScanRef.current = {
                  codigo,
                  timeout: window.setTimeout(() => {
                    if (pendingScanRef.current?.codigo === codigo) {
                      pendingScanRef.current = null;
                    }
                    solvedScanRef.current = { codigo, ts: Date.now() };
                    setPendiente(false);
                    procesar(codigo);
                  }, 900),
                };
                setPendiente(true);
                setScanStatus("Sostén el QR y confirmo...");
              }
              setDetectado(true);
            },
            () => {
              const now = Date.now();
              const gapOk =
                lastDecodeRef.current.codigo === pendingScanRef.current?.codigo &&
                now - lastDecodeRef.current.ts < 700;

              if (pendingScanRef.current && !gapOk && !solvedScanRef.current.codigo) {
                clearTimeout(pendingScanRef.current.timeout);
                pendingScanRef.current = null;
                setPendiente(false);
                setDetectado(false);
              } else if (!pendingScanRef.current) {
                const solucionadoReciente =
                  solvedScanRef.current.codigo && now - solvedScanRef.current.ts < 2500;
                if (!solucionadoReciente) {
                  setDetectado(false);
                }
              }

              frameErrRef.current += 1;
              if (now - lastStatusSyncRef.current > 800) {
                lastStatusSyncRef.current = now;
                setScanStatus(
                  pendingScanRef.current
                    ? "Sostén el QR, confirmo..."
                    : `Escaneando... (intento ${frameErrRef.current}). Acercá el código, centrado y quieto.`
                );
              }
            }
          )
          .then(() => setScanStatus("Cámara activa. Apunta un QR y mantenelo fijo."))
          .catch((err: unknown) => {
            setScannerActivo(false);
            setScanStatus(null);
            setDetectado(false);
            setCamMsg(
              "No se pudo abrir la cámara. " +
                (err instanceof DOMException && err.name === "NotAllowedError"
                  ? "Permiso de cámara denegado: habilitalo en el navegador y reintentá."
                  : err instanceof DOMException && err.name === "NotFoundError"
                    ? "No se encontró ninguna cámara en este equipo."
                    : "Verifica los permisos.")
            );
          });
      } catch {
        setScannerActivo(false);
        setScanStatus(null);
        setDetectado(false);
        setCamMsg("No se pudo abrir la cámara.");
      }
    }, 200);
  }

  const procesar = useCallback(
    (rawCodigo: string) => {
      const codigo = rawCodigo.trim().toLowerCase();
      if (!codigo) return;

      const now = Date.now();
      if (lastScanRef.current.codigo === codigo && now - lastScanRef.current.ts < 2500) {
        return;
      }
      lastScanRef.current = { codigo, ts: now };

      const mostrarFlash = (tipo: "ok" | "err" | "warn", texto: string) => {
        setFlash({ tipo, texto });
        setUltimo({ tipo, texto });
        setTimeout(() => setFlash(null), 1800);
      };

      if (!HEX8.test(codigo)) {
        mostrarFlash("err", "QR no reconocido (código inválido).");
        return;
      }

      const u = unidadesByQr.get(codigo);
      const agregar = (e: Escaneo) => setEscaneados((prev) => [e, ...prev]);

      if (!u) {
        mostrarFlash("err", `Código no existe en el sistema: ${codigo}`);
        return;
      }

      if (u.estado !== "en_almacen") {
        agregar({
          key: genKey(),
          codigo,
          res: "fuera",
          estado: u.estado,
          imei: u.imei,
          nombre: u.nombre,
          talla: u.talla,
          pedido: u.pedido ?? undefined,
          viaje: u.viaje ?? undefined,
          when: now,
        });
        mostrarFlash("warn", `No debería estar en stock: ${u.imei} (${u.talla}) — ${ESTADO_LABEL[u.estado] ?? u.estado}`);
        return;
      }

      const ya = escaneadosRef.current.some((e) => e.codigo === codigo);
      if (ya) {
        mostrarFlash("warn", `Ya escaneado (no se agrega): ${codigo} — ${u.imei} (${u.talla})`);
        return;
      }

      agregar({
        key: genKey(),
        codigo,
        res: "ok",
        estado: u.estado,
        imei: u.imei,
        nombre: u.nombre,
        talla: u.talla,
        when: now,
      });
      mostrarFlash("ok", `OK: ${u.imei} (${u.talla})`);
    },
    [unidadesByQr]
  );

  function quitar(k: string) {
    setEscaneados((prev) => prev.filter((e) => e.key !== k));
  }

  function nuevoConteo() {
    detenerScanner();
    setEscaneados([]);
    setIniciadoEl(null);
    setFlash(null);
    setInputQr("");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  function terminarConteo() {
    detenerScanner();
    setFlash({ tipo: "ok", texto: "Conteo terminado. Los rojos no deberían estar en stock; la izquierda muestra lo que falta." });
    setTimeout(() => setFlash(null), 4000);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Conteo de almacén</h2>
          <p className="text-xs text-slate-500">
            A la izquierda el stock que debería haber; a la derecha lo que escaneas. Lo que no
            debería estar en stock se marca en rojo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {scannerActivo ? (
            <Button variant="secondary" size="sm" onClick={detenerScanner}>
              Apagar cámara
            </Button>
          ) : (
            <Button size="sm" onClick={iniciarScanner}>
              Activar cámara
            </Button>
          )}
          <Button variant="success" size="sm" onClick={terminarConteo}>
            Terminar
          </Button>
          <Button variant="danger" size="sm" onClick={nuevoConteo}>
            Nuevo conteo
          </Button>
        </div>
      </div>

      <ErrorBanner message={error} />

      {flash && (
        <div
          className={`rounded-lg border px-4 py-2 text-sm font-medium ${
            flash.tipo === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : flash.tipo === "warn"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {flash.texto}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const c = inputQr.trim().toLowerCase();
            if (c) {
              procesar(c);
              setInputQr("");
            }
          }}
        >
          <Input
            placeholder="ID del QR (8 dígitos)"
            value={inputQr}
            onChange={(e) => {
              const v = e.target.value;
              setInputQr(v);
              const c = v.trim().toLowerCase();
              if (HEX8.test(c)) {
                procesar(c);
                setInputQr("");
              }
            }}
            className="w-44"
          />
          <Button type="submit" variant="secondary" size="sm">
            Agregar
          </Button>
        </form>
        <span className="text-xs text-slate-400">
          Escaneadas {escaneados.length} · Fuera de lugar {rojas.length} · Faltan en stock{" "}
          {pendientes.length}
        </span>
      </div>

      {loading ? (
        <Spinner label="Cargando stock..." />
      ) : (
        <>
          {scannerActivo && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
              onClick={detenerScanner}
            >
              <div
                className="w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
              >
                <div
                  className={`relative max-w-md overflow-hidden rounded-lg border-2 bg-slate-900 transition-colors ${
                    detectado ? "border-emerald-500" : "border-red-500"
                  }`}
                >
                  <div id={scannerDivId} />
                  <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                    <div className="absolute left-1/2 top-1/2 aspect-square w-[54%] -translate-x-1/2 -translate-y-1/2">
                      <span
                        className={`absolute left-0 top-0 h-7 w-7 rounded-tl-lg border-l-4 border-t-4 ${
                          detectado ? "border-emerald-400" : "border-red-400"
                        }`}
                      />
                      <span
                        className={`absolute right-0 top-0 h-7 w-7 rounded-tr-lg border-r-4 border-t-4 ${
                          detectado ? "border-emerald-400" : "border-red-400"
                        }`}
                      />
                      <span
                        className={`absolute bottom-0 left-0 h-7 w-7 rounded-bl-lg border-b-4 border-l-4 ${
                          detectado ? "border-emerald-400" : "border-red-400"
                        }`}
                      />
                      <span
                        className={`absolute bottom-0 right-0 h-7 w-7 rounded-br-lg border-b-4 border-r-4 ${
                          detectado ? "border-emerald-400" : "border-red-400"
                        }`}
                      />
                      <div
                        className="absolute left-2 right-2 h-1 rounded-full bg-amber-400/90"
                        style={{
                          animation: "conteo-scan-line 2.4s ease-in-out infinite",
                          boxShadow: "0 0 10px rgba(251,191,36,0.9)",
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-600">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{
                        width: pendiente ? "100%" : "0%",
                        transition: pendiente ? "width 0.9s linear" : "none",
                      }}
                    />
                  </div>
                </div>
                {ultimo && (
                  <div
                    className={`mt-2 rounded-lg border px-3 py-2 text-center text-sm font-medium ${
                      ultimo.tipo === "ok"
                        ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300"
                        : ultimo.tipo === "warn"
                          ? "border-amber-400/40 bg-amber-500/20 text-amber-300"
                          : "border-red-400/40 bg-red-500/20 text-red-300"
                    }`}
                  >
                    {ultimo.texto}
                  </div>
                )}
                <p
                  className={`mt-2 text-center text-xs font-medium ${
                    detectado ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {pendiente
                    ? "Sostené el QR hasta llenar la barra..."
                    : detectado
                      ? "QR procesado. Pasá el siguiente."
                      : scanStatus ?? "Apunta un QR al cuadro."}
                </p>
                <div className="mt-3 flex justify-center">
                  <button
                    onClick={detenerScanner}
                    className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600"
                  >
                    Cerrar cámara
                  </button>
                </div>
              </div>
            </div>
          )}
          <style>{`@keyframes conteo-scan-line { 0% { top: 6%; } 50% { top: 92%; } 100% { top: 6%; } }`}</style>
          {camMsg && !scannerActivo && <p className="text-xs text-amber-600">{camMsg}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Stock que debería estar
                </span>
                <span className="text-xs text-slate-400">{pendientes.length} revisar</span>
              </div>
              {pendientes.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-slate-400">
                  No queda nada pendiente en stock o la lista está vacía.
                </p>
              ) : (
                <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
                  {pendientes.map((u) => (
                    <li key={u.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1.5 text-sm">
                      <span className="font-mono text-xs text-slate-400">{u.codigo_qr}</span>
                      <span className="font-mono font-medium text-slate-700">{u.imei}</span>
                      <span className="text-slate-500">{u.talla}</span>
                      <span className="hidden truncate text-xs text-slate-400 sm:inline">
                        {u.nombre}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Lo que vas escaneando
                </span>
                <span className="text-xs text-slate-400">{escaneados.length} escaneados</span>
              </div>

              {escaneados.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-slate-400">
                  Aún no escaneas nada.
                </p>
              ) : (
                <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
                  {rojas.map((e) => (
                    <li key={e.key} className="border-l-4 border-red-500 bg-red-50/60 px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-semibold text-red-700">
                          No debería estar: {ESTADO_LABEL[e.estado ?? ""] ?? e.estado}
                        </span>
                        {e.viaje && (
                          <span className="text-xs text-red-500">
                            Viaje {e.viaje}
                            {e.pedido && <> · P {e.pedido}</>}
                          </span>
                        )}
                        <button
                          onClick={() => quitar(e.key)}
                          className="ml-auto text-xs text-slate-400 hover:text-red-700"
                          title="Quitar"
                        >
                          quitar
                        </button>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-red-600">
                        <span className="font-mono">{e.codigo}</span>
                        <span className="font-mono font-medium">{e.imei ?? ""}</span>
                        <span>{e.talla ?? ""}</span>
                        <span className="hidden text-red-400 sm:inline">{e.nombre ?? ""}</span>
                      </div>
                    </li>
                  ))}
                  {verdes.map((e) => (
                    <li key={e.key} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1.5 text-sm">
                      <span className="text-emerald-600">✓</span>
                      <span className="font-mono text-xs text-slate-400">{e.codigo}</span>
                      <span className="font-mono font-medium text-slate-700">{e.imei}</span>
                      <span className="text-slate-500">{e.talla}</span>
                      <span className="hidden truncate text-xs text-slate-400 sm:inline">
                        {e.nombre}
                      </span>
                      <button
                        onClick={() => quitar(e.key)}
                        className="ml-auto text-xs text-slate-400 hover:text-red-600"
                        title="Quitar"
                      >
                        quitar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}