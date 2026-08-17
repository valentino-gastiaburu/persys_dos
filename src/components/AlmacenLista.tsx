"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Input, Select, Badge, Spinner, ErrorBanner } from "@/components/ui";

const ESTADO_BADGE: Record<string, string> = {
  programado: "slate",
  alistado: "purple",
  enviado: "amber",
  terminado: "green",
  cancelado: "red",
};

const ESTADO_LABEL: Record<string, string> = {
  programado: "Programado",
  alistado: "Alistado",
  enviado: "Enviado",
  terminado: "Terminado",
  cancelado: "Cancelado",
};

const TIPO_BADGE: Record<string, string> = {
  entrega: "blue",
  recojo: "amber",
};

const TIPO_LABEL: Record<string, string> = {
  entrega: "Entrega",
  recojo: "Recojo",
};

type Viaje = {
  id: string;
  codigo: string;
  tipo: string;
  estado: string;
  fecha: string | null;
  fecha_devolucion: string | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  pedido_codigo: string | null;
  motivo_recojo: string | null;
  unidades_alistadas: number;
  actualizado_el: string | null;
};

function ViajeRow({
  v,
  esHoy,
  onClick,
}: {
  v: Viaje;
  esHoy: boolean;
  onClick: () => void;
}) {
  const esCancelado = v.estado === "cancelado";
  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50 ${
        esCancelado ? "bg-slate-50 opacity-60" : esHoy ? "bg-blue-50" : ""
      }`}
    >
      <td className={`px-4 py-2 font-semibold text-blue-700 ${esCancelado ? "text-slate-400 line-through" : ""}`}>
        {v.codigo}
        {esHoy && (
          <span className="ml-2 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
            Hoy
          </span>
        )}
        {esCancelado && (
          <span className="ml-2 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
            Cancelado
          </span>
        )}
      </td>
      <td className="px-4 py-2 font-medium text-slate-700">{v.pedido_codigo ?? "—"}</td>
      <td className="px-4 py-2 text-slate-600">
        {v.fecha ? new Date(v.fecha + "T00:00:00").toLocaleDateString("es-PE") : "—"}
      </td>
      <td className="px-4 py-2 text-slate-700">
        {v.cliente_nombre ?? "Sin cliente"}
        {v.cliente_telefono ? ` · ${v.cliente_telefono}` : ""}
      </td>
      <td className="px-4 py-2 text-center font-semibold text-slate-700">
        {v.unidades_alistadas}
      </td>
      <td className="px-4 py-2">
        <Badge color={TIPO_BADGE[v.tipo] ?? "slate"}>
          {TIPO_LABEL[v.tipo] ?? v.tipo}
        </Badge>
        {v.motivo_recojo && <span className="ml-1 text-xs text-amber-600">{v.motivo_recojo}</span>}
      </td>
      <td className="px-4 py-2">
        <Badge color={ESTADO_BADGE[v.estado] ?? "slate"}>
          {ESTADO_LABEL[v.estado] ?? v.estado}
        </Badge>
      </td>
    </tr>
  );
}

function TablaViajes({ viajes, titulo, router, hoy }: { viajes: Viaje[]; titulo: string; router: any; hoy: string }) {
  if (viajes.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{titulo}</h2>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">ID</th>
              <th className="px-4 py-2">Pedido</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2 text-center">Productos</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {viajes.map((v) => {
              const esHoy = v.fecha === hoy;
              return (
                <ViajeRow
                  key={v.id}
                  v={v}
                  esHoy={esHoy}
                  onClick={() => router.push(`/almacen/${v.id}`)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AlmacenLista() {
  const router = useRouter();
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fecha, setFecha] = useState("");
  const [estado, setEstado] = useState("");

  const hoy = new Date().toISOString().slice(0, 10);

  const cargar = useCallback(async () => {
    const params = new URLSearchParams();
    if (fecha) params.set("fecha", fecha);
    if (estado) params.set("estado", estado);
    const { data, error } = await api<{ viajes: Viaje[] }>(`/api/viajes?${params}`);
    if (error) setError(error);
    else setViajes(data?.viajes ?? []);
    setLoading(false);
  }, [fecha, estado]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Separar: hoy vs otros días (orden ya viene del API por actualizado_el desc)
  const viajesHoy = viajes.filter((v) => v.fecha === hoy && v.estado !== "cancelado");
  const viajesOtros = viajes.filter((v) => v.fecha !== hoy && v.estado !== "cancelado");
  const viajesCancelados = viajes.filter((v) => v.estado === "cancelado");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Almacén / Viajes</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="max-w-[160px]" />
        <Select value={estado} onChange={(e) => setEstado(e.target.value)} className="max-w-[180px]">
          <option value="">Todos</option>
          <option value="programado">Programado</option>
          <option value="alistado">Alistado</option>
          <option value="enviado">Enviado</option>
          <option value="terminado">Terminado</option>
          <option value="cancelado">Cancelado</option>
        </Select>
        <button
          className="text-sm text-blue-600 hover:underline"
          onClick={() => {
            setFecha("");
            setEstado("");
          }}
        >
          Limpiar
        </button>
      </div>
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : viajes.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">No hay viajes.</p>
      ) : (
        <>
          <TablaViajes viajes={viajesHoy} titulo="Viajes de hoy" router={router} hoy={hoy} />
          <TablaViajes viajes={viajesOtros} titulo="Otros viajes" router={router} hoy={hoy} />
          <TablaViajes viajes={viajesCancelados} titulo="Cancelados" router={router} hoy={hoy} />
        </>
      )}
    </div>
  );
}
