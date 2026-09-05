import {
  CargoPedido,
  CargoConfig,
  EMPRESA_ENVIO_LABEL,
} from "@/lib/cargos";

function tallaStr(d: { talla_stock: string | null; talla_vendida: string | null; entalle: boolean }): string {
  if (d.entalle && d.talla_stock && d.talla_vendida) {
    return `${d.talla_stock}→${d.talla_vendida}`;
  }
  return d.talla_stock ?? d.talla_vendida ?? "";
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = iso.slice(0, 10).split("-");
  if (d.length !== 3) return iso;
  return `${d[2]}/${d[1]}/${d[0]}`;
}

export default function CargoAgencia({
  p,
  config,
}: {
  p: CargoPedido;
  config: CargoConfig;
}) {
  const esVisita = p.tipo_pedido === "visita";

  if (esVisita) {
    return (
      <div className="rounded-md border-2 border-slate-800 p-2 text-[10.5px] leading-snug text-slate-900">
        <div className="relative mb-1 flex items-center justify-between border-b border-slate-400 pb-1">
          <span className="absolute -top-1 left-0 text-[7.5px] font-medium uppercase text-slate-400">
            V{p.nro_viaje}
          </span>
          <span className="font-bold uppercase tracking-wide">Cargo de Agencia</span>
          <span className="font-bold uppercase text-slate-500">Visita</span>
        </div>

        {p.observaciones ? (
          <div className="mb-1 rounded border border-slate-400 px-1.5 py-0.5">
            <span className="font-bold uppercase">OBS:</span>{" "}
            <span className="font-medium">{p.observaciones}</span>
          </div>
        ) : null}

        <div className="flex gap-4">
          {/* Destinatario (cliente) */}
          <div className="min-w-[250px] flex-1 rounded border border-slate-400 px-1.5 py-1">
            <p className="font-bold uppercase">Destinatario</p>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
              <span className="text-slate-600">Nombre:</span>
              <span className="font-medium">{p.cliente?.nombre ?? "—"}</span>
              <span className="text-slate-600">Celular:</span>
              <span className="font-medium">{p.cliente?.telefono ?? "—"}</span>
              <span className="text-slate-600">Ciudad:</span>
              <span className="font-medium">{p.ciudad ?? "—"}</span>
              <span className="text-slate-600">Dirección:</span>
              <span className="font-medium">{p.direccion_entrega ?? "—"}</span>
            </div>
          </div>

          {/* Fecha Envio */}
          <div className="min-w-[150px] flex-1 rounded border border-slate-400 px-1.5 py-1">
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
              <span className="text-slate-600">Fecha Envio:</span>
              <span className="font-medium">{fmtFecha(p.fecha_viaje)}</span>
            </div>
          </div>
        </div>

        {/* Resumen de productos */}
        <div className="mt-2 rounded border border-slate-400 px-1.5 py-1">
          <p className="font-bold uppercase">Resumen de Productos</p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {p.detalles.map((d, i) => (
              <span key={i} className="font-mono font-medium">
                {d.imei} ({d.cantidad}/{tallaStr(d)}/{d.genero === "caballero" ? "C" : "D"})
              </span>
            ))}
          </div>
        </div>

        {/* Regalo */}
        {p.regalo ? (
          <div className="mt-1.5 rounded border border-slate-400 px-1.5 py-0.5">
            <span className="font-bold uppercase">Regalo:</span>{" "}
            <span className="font-medium">{p.regalo}</span>
          </div>
        ) : null}
      </div>
    );
  }

  // ENVIO: remitente (dueña) + destinatario (cliente)
  return (
    <div className="rounded-md border-2 border-slate-800 p-2 text-[10.5px] leading-snug text-slate-900">
      <div className="relative mb-1 border-b border-slate-400 pb-1 text-center">
        <span className="absolute -top-1 left-0 text-[7.5px] font-medium uppercase text-slate-400">
          V{p.nro_viaje}
        </span>
        <span className="font-bold uppercase tracking-wide">Cargo de Agencia</span>
      </div>

      <div className="flex gap-4">
        {/* Remitente (dueña) */}
        <div className="min-w-[170px] flex-1 rounded border border-slate-400 px-1.5 py-1">
          <p className="font-bold uppercase">Remitente</p>
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
            <span className="text-slate-600">Nombre:</span>
            <span className="font-medium">{config.cargo_duenia_nombre || "—"}</span>
            <span className="text-slate-600">DNI:</span>
            <span className="font-medium">{config.cargo_duenia_dni || "—"}</span>
            <span className="text-slate-600">Celular:</span>
            <span className="font-medium">{config.cargo_duenia_celular || "—"}</span>
            <span className="text-slate-600">Dirección:</span>
            <span className="font-medium">{config.cargo_duenia_direccion || "—"}</span>
          </div>
        </div>

        {/* Destinatario (cliente) */}
        <div className="min-w-[200px] flex-1 rounded border border-slate-400 px-1.5 py-1">
          <p className="font-bold uppercase">Destinatario</p>
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
            <span className="text-slate-600">Nombre:</span>
            <span className="font-medium">{p.cliente?.nombre ?? "—"}</span>
            <span className="text-slate-600">DNI:</span>
            <span className="font-medium">{p.cliente?.dni ?? "—"}</span>
            <span className="text-slate-600">Celular:</span>
            <span className="font-medium">{p.cliente?.telefono ?? "—"}</span>
            <span className="text-slate-600">Ciudad:</span>
            <span className="font-medium">{p.ciudad ?? "—"}</span>
            <span className="text-slate-600">Dirección:</span>
            <span className="font-medium">{p.direccion_entrega ?? "—"}</span>
            <span className="text-slate-600">Empresa:</span>
            <span className="font-medium">{EMPRESA_ENVIO_LABEL[p.empresa_envio ?? ""] ?? p.empresa_envio ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* Productos resumidos */}
      <div className="mt-2 rounded border border-slate-400 px-1.5 py-1">
        <p className="font-bold uppercase">Productos</p>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
          {p.detalles.map((d, i) => (
            <span key={i} className="font-mono font-medium">
              {d.imei} ({d.cantidad}/{tallaStr(d)}/{d.genero === "caballero" ? "C" : "D"})
            </span>
          ))}
        </div>
      </div>

      {/* Regalo */}
      {p.regalo ? (
        <div className="mt-1.5 rounded border border-slate-400 px-1.5 py-0.5">
          <span className="font-bold uppercase">Regalo:</span>{" "}
          <span className="font-medium">{p.regalo}</span>
        </div>
      ) : null}
    </div>
  );
}
