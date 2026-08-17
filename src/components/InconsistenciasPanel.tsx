"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button, Badge } from "@/components/ui";

type TipoInconsistencia =
  | "pedido_cancelado_stock"
  | "pedido_fecha_entrega"
  | "viaje_devolucion_passada"
  | "pago_fecha_passada"
  | "detalle_devolucion_horfana";

type Inconsistencia = {
  id: string;
  tipo: TipoInconsistencia;
  entidad_id: string;
  descripcion: string;
  fecha_detectada: string;
  resuelto: boolean;
  usuario_id: string | null;
  metadata: any;
};

export default function InconsistenciasPanel() {
  const params = useParams<{ id?: string }>();
  const pedidoId = params?.id;

  const [tipos, setTipos] = useState<TipoInconsistencia[]>([
    "pedido_cancelado_stock",
    "pedido_fecha_entrega",
    "viaje_devolucion_passada",
    "pago_fecha_passada",
    "detalle_devolucion_horfana",
  ]);

  const [inconsistencias, setInconsistencias] = useState<Inconsistencia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<TipoInconsistencia | null>(null);

  useEffect(() => {
    cargarInconsistencias();
  }, []);

  const cargarInconsistencias = async () => {
    try {
      setCargando(true);
      let url = `/api/inconsistencias?limit=50`;
      if (filtroTipo) {
        url = `/api/inconsistencias?tipo=eq.${filtroTipo}&limit=50`;
      }
      if (pedidoId) {
        url = `/api/inconsistencias?entidad_id=eq.${pedidoId}&limit=50`;
      }
      const { data, error } = await api<{ inconsistencias: Inconsistencia[] }>(url);
      if (error) throw error;
      setInconsistencias(data?.inconsistencias ?? []);
    } catch (e: any) {
      setError(e.message ?? "Error al cargar inconsistencias");
    } finally {
      setCargando(false);
    }
  };

  const marcarResuelto = async (id: string) => {
    try {
      await api(`/api/inconsistencias/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ resuelto: true }),
      });
      cargarInconsistencias();
    } catch (e: any) {
      setError(e.message ?? "Error al marcar resuelto");
    }
  };

  if (cargando) return <div>Cargando inconsistencias...</div>;
  if (error) return <div className="text-red-500">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-slate-800">Inconsistencias</h2>
        {pedidoId && (
          <Badge color="amber">Pedido {pedidoId}</Badge>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        <Button
          variant="secondary"
          onClick={() => setFiltroTipo(null)}
          className={filtroTipo === null ? "bg-slate-500 text-white" : ""}
        >
          Todos
        </Button>
        {tipos.map((t) => (
          <Button
            key={t}
            variant="secondary"
            onClick={() => setFiltroTipo(t)}
            className={filtroTipo === t ? "bg-slate-500 text-white" : ""}
        >
          {t === "pedido_cancelado_stock"
            ? "Pedido cancelado stock"
            : t === "pedido_fecha_entrega"
              ? "Fecha entrega vencida"
              : t === "viaje_devolucion_passada"
                ? "Viaje devolución pasada"
                : t === "pago_fecha_passada"
                  ? "Pago fecha vencida"
                  : "Detalle devoluc. huérfana"}
        </Button>
        ))}
      </div>

      {inconsistencias.length === 0 ? (
        <p className="text-slate-400">No hay inconsistencias.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border-slate-300 text-sm">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Descripción</th>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Entidad ID</th>
                <th className="px-4 py-2">Resuelto</th>
                <th className="px-4 py-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {inconsistencias.map((i) => (
                <tr key={i.id} className="text-sm">
                  <td className="px-4 py-2">
                    {i.tipo === "pedido_cancelado_stock"
                      ? "Pedido cancelado stock"
                      : i.tipo === "pedido_fecha_entrega"
                        ? "Fecha entrega vencida"
                        : i.tipo === "viaje_devolucion_passada"
                          ? "Viaje devolución pasada"
                          : i.tipo === "pago_fecha_passada"
                            ? "Pago fecha vencida"
                            : "Detalle devoluc. huérfana"}
                  </td>
                  <td className="px-4 py-2 font-medium text-slate-800">{i.descripcion}</td>
                  <td className="px-4 py-2 text-slate-500">
                    {new Date(i.fecha_detectada).toLocaleDateString("es-PE")}
                  </td>
                  <td className="px-4 py-2 text-slate-500">{i.entidad_id}</td>
                  <td className="px-4 py-2">
                    <Badge color={i.resuelto ? "green" : "red"}>
                      {i.resuelto ? "Sí" : "No"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!i.resuelto && (
                      <Button size="sm" variant="secondary" onClick={() => marcarResuelto(i.id)}>
                        Marcar resuelto
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}