"use client";

import { useEffect, useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/lib/api";
import { Button, Input, Select, Spinner, ErrorBanner } from "@/components/ui";

type Fila = {
  id: string;
  codigo_qr: string;
  imei: string | null;
  producto_nombre: string | null;
  talla: string | null;
  tanda_codigo: string | null;
  fecha_creacion: string | null;
};

export default function ImprimirQrs() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fFecha, setFFecha] = useState("");
  const [fCodigo, setFCodigo] = useState("");
  const [fId, setFId] = useState("");
  const [fImei, setFImei] = useState("");
  const [fTalla, setFTalla] = useState("");

  const [imprimiendo, setImprimiendo] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await api<{ filas: Fila[] }>("/api/tandas");
    if (error) setError(error);
    else setFilas(data?.filas ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const tallasUnicas = [
    ...new Set(filas.map((f) => f.talla).filter((t): t is string => Boolean(t))),
  ].sort((a, b) => Number(a) - Number(b) || String(a).localeCompare(String(b)));

  const filtradas = filas.filter((f) => {
    if (fFecha) {
      const d = f.fecha_creacion ? new Date(f.fecha_creacion).toISOString().slice(0, 10) : "";
      if (d !== fFecha) return false;
    }
    if (fCodigo && !(f.tanda_codigo ?? "").toLowerCase().includes(fCodigo.toLowerCase())) return false;
    if (fId && !f.codigo_qr.toLowerCase().includes(fId.toLowerCase())) return false;
    if (fImei && !(f.imei ?? "").toLowerCase().includes(fImei.toLowerCase())) return false;
    if (fTalla && f.talla !== fTalla) return false;
    return true;
  });

  useEffect(() => {
    if (!imprimiendo) return;
    const timer = setTimeout(() => window.print(), 100);
    return () => clearTimeout(timer);
  }, [imprimiendo]);

  useEffect(() => {
    if (!imprimiendo) return;
    const onAfter = () => setImprimiendo(false);
    window.addEventListener("afterprint", onAfter);
    return () => window.removeEventListener("afterprint", onAfter);
  }, [imprimiendo]);

  const limpiar = () => {
    setFFecha("");
    setFCodigo("");
    setFId("");
    setFImei("");
    setFTalla("");
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Input
          label="Fecha creación"
          type="date"
          value={fFecha}
          onChange={(e) => setFFecha(e.target.value)}
          className="max-w-[160px]"
        />
        <Input
          label="Código tanda"
          placeholder="00001"
          value={fCodigo}
          onChange={(e) => setFCodigo(e.target.value)}
          className="max-w-[140px]"
        />
        <Input
          label="ID producto"
          placeholder="ID o QR"
          value={fId}
          onChange={(e) => setFId(e.target.value)}
          className="max-w-[160px]"
        />
        <Input
          label="IMEI"
          value={fImei}
          onChange={(e) => setFImei(e.target.value)}
          className="max-w-[160px]"
        />
        <Select label="Talla" value={fTalla} onChange={(e) => setFTalla(e.target.value)} className="w-28">
          <option value="">Todas</option>
          {tallasUnicas.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Button variant="secondary" onClick={limpiar}>
          Limpiar
        </Button>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {filtradas.length} producto(s) único(s) con QR
        </p>
        <Button onClick={() => setImprimiendo(true)} disabled={filtradas.length === 0}>
          Imprimir QRs
        </Button>
      </div>
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Fecha y hora creación</th>
                <th className="px-4 py-2">Código tanda</th>
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">IMEI</th>
                <th className="px-4 py-2">Talla</th>
                <th className="px-4 py-2">QR</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                    No hay productos únicos que coincidan.
                  </td>
                </tr>
              )}
              {filtradas.map((f) => (
                <tr key={f.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-600">
                    {f.fecha_creacion
                      ? new Date(f.fecha_creacion).toLocaleString("es-PE", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-2 font-mono text-blue-700">{f.tanda_codigo ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-slate-700">{f.codigo_qr}</td>
                  <td className="px-4 py-2 text-slate-700">{f.imei ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{f.talla ?? "—"}</td>
                  <td className="px-4 py-2">
                    <QRCodeSVG value={f.codigo_qr} size={36} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {imprimiendo && (
        <div id="print-sheet" className="fixed inset-0 z-[100] overflow-y-auto bg-white p-6">
          <div className="mb-4 flex items-center justify-between print:hidden">
            <p className="text-sm text-slate-500">
              Hoja de QRs — {filtradas.length} unidad(es). Configura tu impresora y pulsa Imprimir.
            </p>
            <Button variant="secondary" onClick={() => setImprimiendo(false)}>
              Cancelar
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {filtradas.map((f) => (
              <div
                key={f.id}
                className="flex flex-col items-center justify-center gap-1 break-inside-avoid rounded border border-dashed border-slate-300 p-2"
              >
                <p className="text-center text-xs font-bold text-slate-800">
                  {f.imei ?? "—"}-{f.talla ?? "—"}
                </p>
                <QRCodeSVG value={f.codigo_qr} size={120} />
                <p className="font-mono text-xs text-slate-700">{f.codigo_qr}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
