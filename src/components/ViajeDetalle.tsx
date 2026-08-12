"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button, Input, Badge, Spinner, ErrorBanner } from "@/components/ui";

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
  cantidad: number;
  alistados: number;
  falta: number;
  completo: boolean;
  entalle: boolean;
};

type Alistado = {
  id: string;
  detalle_pedido_id: string | null;
  productos_unicos: { codigo_qr: string; productos: { imei: string } | null };
};

type Viaje = {
  id: string;
  codigo: string;
  tipo: string;
  estado: string;
  fecha: string | null;
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
  const [qr, setQr] = useState("");
  const [msg, setMsg] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null);

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

  async function alistar() {
    if (!qr.trim()) return;
    setMsg(null);
    const { data, error } = await api(`/api/viajes/${id}/alistar`, {
      method: "POST",
      body: JSON.stringify({ codigo_qr: qr }),
    });
    if (error) {
      setMsg({ tipo: "err", texto: error });
    } else {
      const entallado = (data as any)?.entallado;
      setMsg({
        tipo: "ok",
        texto: `Producto alistado${entallado ? " (entallado)" : ""}`,
      });
      setQr("");
    }
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

  if (loading) return <Spinner />;
  if (!viaje) return <ErrorBanner message={error ?? "Viaje no encontrado"} />;

  const totalUnidades = items.reduce((a, i) => a + i.cantidad, 0);
  const totalAlistadas = items.reduce((a, i) => a + i.alistados, 0);
  const incompleto = items.some((i) => !i.completo);
  const activo = viaje.estado === "programado" || viaje.estado === "alistado";

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

      {activo && (
        <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Escaneo de QR</h2>
          <div className="flex gap-2">
            <Input
              placeholder="Escanea o pega el código QR"
              value={qr}
              onChange={(e) => setQr(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && alistar()}
              className="max-w-sm"
              autoFocus
            />
            <Button onClick={alistar} disabled={!qr.trim()}>
              Alistar
            </Button>
          </div>
        </section>
      )}

      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Productos a alistar</h2>
        <div className="space-y-2">
          {items.map((i) => (
            <div key={i.detalle_id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <div>
                <p className="text-sm font-medium">
                  {i.nombre} <span className="text-xs text-slate-400">({i.imei})</span>
                </p>
                <p className="text-xs text-slate-500">
                  {i.talla ?? "Sin talla"} · {i.cantidad} unidades{i.entalle ? " · entalle" : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">
                  {i.alistados}/{i.cantidad}
                </p>
                <Badge color={i.completo ? "green" : "amber"}>{i.completo ? "completo" : `falta ${i.falta}`}</Badge>
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="text-sm text-slate-400">Sin productos asignados.</p>}
        </div>
      </section>

      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Unidades alistadas ({alistados.length})</h2>
        <div className="space-y-1">
          {alistados.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-1 text-sm">
              <span className="font-mono text-xs text-slate-500">
                {a.productos_unicos?.codigo_qr ?? "—"}
              </span>
              <span className="text-slate-600">{a.productos_unicos?.productos?.imei ?? "—"}</span>
            </div>
          ))}
          {alistados.length === 0 && <p className="text-sm text-slate-400">Aún no se alista nada.</p>}
        </div>
      </section>

      {activo && (
        <div className="flex flex-wrap gap-2">
          {viaje.estado === "programado" && (
            <Button disabled={incompleto} onClick={() => cambiarEstado("alistado")}>
              {incompleto ? "Faltan unidades por alistar" : "Marcar como alistado"}
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
