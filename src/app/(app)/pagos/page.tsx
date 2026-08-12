"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button, Input, Modal, Select, Spinner, ErrorBanner } from "@/components/ui";

type PedidoRow = {
  id: string;
  codigo: string;
  estado: string;
  cliente_nombre: string | null;
  monto_total: number;
  deuda: number;
};

export default function PagosPage() {
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soloDeuda, setSoloDeuda] = useState(true);
  const [pagar, setPagar] = useState<PedidoRow | null>(null);

  const cargar = useCallback(async () => {
    const params = new URLSearchParams();
    if (soloDeuda) params.set("pendientes", "1");
    const { data, error } = await api<{ pedidos: PedidoRow[] }>(`/api/pedidos?${params}`);
    if (error) setError(error);
    else setPedidos((data?.pedidos ?? []).filter((p) => soloDeuda || p.deuda > 0));
    setLoading(false);
  }, [soloDeuda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Pagos</h1>
      <div className="mb-4">
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={soloDeuda}
            onChange={(e) => setSoloDeuda(e.target.checked)}
            className="rounded"
          />
          Solo pedidos con deuda
        </label>
      </div>
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {pedidos.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-slate-400">No hay pedidos por cobrar.</p>
          )}
          {pedidos.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="min-w-0">
                <Link href={`/pedidos/${p.id}`} className="font-semibold text-blue-700 hover:underline">
                  {p.codigo}
                </Link>
                <p className="truncate text-sm text-slate-600">{p.cliente_nombre ?? "Sin cliente"}</p>
                <p className="text-xs text-slate-500">
                  Total S/ {Number(p.monto_total ?? 0).toFixed(2)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-red-600">S/ {Number(p.deuda).toFixed(2)}</p>
                {p.deuda > 0 && (
                  <Button size="sm" className="mt-1" onClick={() => setPagar(p)}>
                    Cobrar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {pagar && (
        <PagarModal
          pedido={pagar}
          onClose={() => setPagar(null)}
          onDone={() => {
            setPagar(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function PagarModal({
  pedido,
  onClose,
  onDone,
}: {
  pedido: PedidoRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [monto, setMonto] = useState(String(Number(pedido.deuda).toFixed(2)));
  const [metodoPago, setMetodoPago] = useState("yape");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function registrar() {
    setError(null);
    setLoading(true);
    const { error } = await api(`/api/pedidos/${pedido.id}/pagos`, {
      method: "POST",
      body: JSON.stringify({ monto: Number(monto), metodo_pago: metodoPago }),
    });
    setLoading(false);
    if (error) setError(error);
    else onDone();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Cobrar ${pedido.codigo}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={registrar} disabled={loading}>Registrar pago</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Deuda: <strong>S/ {Number(pedido.deuda).toFixed(2)}</strong>
        </p>
        <Input label="Monto (S/)" type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
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
        <ErrorBanner message={error} />
      </div>
    </Modal>
  );
}
