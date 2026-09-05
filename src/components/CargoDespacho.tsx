import {
  CargoPedido,
  CargoConfig,
  METODO_PAGO_LABEL,
  EMPRESA_ENVIO_LABEL,
} from "@/lib/cargos";

function fmtMonto(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return "S/ " + Number(n).toFixed(2);
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = iso.slice(0, 10).split("-");
  if (d.length !== 3) return iso;
  return `${d[2]}/${d[1]}/${d[0]}`;
}

function tallaStr(d: { talla_stock: string | null; talla_vendida: string | null; entalle: boolean }): string {
  if (d.entalle && d.talla_stock && d.talla_vendida) {
    return `${d.talla_stock}→${d.talla_vendida}`;
  }
  return d.talla_stock ?? d.talla_vendida ?? "";
}

export default function CargoDespacho({
  p,
  config,
}: {
  p: CargoPedido;
  config: CargoConfig;
}) {
  const esVisita = p.tipo_pedido === "visita";

  return (
    <div className="rounded-md border-2 border-slate-800 p-2 text-[10.5px] leading-snug text-slate-900">
      <div className="relative mb-1 flex items-center justify-between border-b border-slate-400 pb-1">
        <span className="absolute -top-1 left-0 text-[7.5px] font-medium uppercase text-slate-400">
          V{p.nro_viaje}
        </span>
        <span className="font-bold uppercase tracking-wide">Cargo de Despacho</span>
        <span className="font-bold uppercase text-red-700">Pago a Destino</span>
      </div>

      <div className="flex gap-4">
        {/* Columna 1: Interno + Cliente */}
        <div className="min-w-[150px] flex-1">
          <div className="mb-2 rounded border border-slate-400 px-1.5 py-1">
            <p className="font-bold uppercase">Interno</p>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
              {esVisita ? (
                <>
                  <span className="text-slate-600">Mediante:</span>
                  <span className="font-medium">MOTORIZADO</span>
                </>
              ) : (
                <>
                  <span className="text-slate-600">Tipo de Envío:</span>
                  <span className="font-medium">X Menor</span>
                </>
              )}
              <span className="text-slate-600">Cód. Envío:</span>
              <span className="font-mono font-semibold">{p.codigo_viaje}</span>
              <span className="text-slate-600">Código del pedido:</span>
              <span className="font-mono font-medium">{p.codigo_pedido ?? "—"}</span>
              <span className="text-slate-600">Ej. Comercial:</span>
              <span className="font-medium">{p.vendedora?.nombre ?? "—"}</span>
              <span className="text-slate-600">E. despacho:</span>
              <span className="font-medium">{config.cargo_encargado_despacho || "—"}</span>
            </div>
          </div>

          <div className="rounded border border-slate-400 px-1.5 py-1">
            <p className="font-bold uppercase">Cliente</p>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
              <span className="text-slate-600">Nombre:</span>
              <span className="font-medium">{p.cliente?.nombre ?? "—"}</span>
              <span className="text-slate-600">DNI:</span>
              <span className="font-medium">{p.cliente?.dni ?? "—"}</span>
              <span className="text-slate-600">Celular:</span>
              <span className="font-medium">{p.cliente?.telefono ?? "—"}</span>
            </div>
          </div>
        </div>

        {/* Columna 2: Información pedido */}
        <div className="min-w-[230px] flex-1">
          <div className="rounded border border-slate-400 px-1.5 py-1">
            <p className="font-bold uppercase">Información del Pedido</p>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
              <span className="text-slate-600">Fecha Envío:</span>
              <span className="font-medium">{fmtFecha(p.fecha_entrega)}</span>
              {!esVisita && (
                <>
                  <span className="text-slate-600">Fecha de pago:</span>
                  <span className="font-medium">{fmtFecha(p.fecha_pago)}</span>
                </>
              )}
              <span className="text-slate-600">Monto:</span>
              <span className="font-medium">{fmtMonto(p.monto_total)}</span>
              <span className="text-slate-600">Banco:</span>
              <span className="font-medium">{METODO_PAGO_LABEL[p.metodo_pago ?? ""] ?? p.metodo_pago ?? "—"}</span>
              {!esVisita && (
                <>
                  <span className="text-slate-600">Empresa:</span>
                  <span className="font-medium">{EMPRESA_ENVIO_LABEL[p.empresa_envio ?? ""] ?? p.empresa_envio ?? "—"}</span>
                </>
              )}
              <span className="text-slate-600">{esVisita ? "Distrito:" : "Ciudad:"}</span>
              <span className="font-medium">{p.ciudad ?? "—"}</span>
              <span className="text-slate-600">Dirección:</span>
              <span className="font-medium">{p.direccion_entrega ?? "—"}</span>
              {esVisita && (
                <>
                  <span className="text-slate-600">Regalo:</span>
                  <span className="font-medium">{p.regalo ?? "—"}</span>
                  <span className="text-slate-600">Observación:</span>
                  <span className="font-medium">{p.observaciones ?? "—"}</span>
                </>
              )}
            </div>
          </div>

          {/* Regalo (franja debajo de la información, solo ENVIO) */}
          {!esVisita && p.regalo ? (
            <div className="mt-2 rounded border border-slate-400 px-1.5 py-0.5">
              <span className="font-bold uppercase">Regalo:</span>{" "}
              <span className="font-medium">{p.regalo}</span>
            </div>
          ) : null}
        </div>

        {/* Columna 3: Productos del pedido */}
        <div className="min-w-[230px] flex-1">
          <div className="rounded border border-slate-400 px-1.5 py-1">
            <p className="font-bold uppercase">Productos del Pedido</p>
            <table className="w-full">
              <tbody>
                {p.detalles.map((d, i) => (
                  <tr key={i}>
                    <td className="pr-2 align-top font-mono font-semibold">{d.imei}</td>
                    <td className="pr-2 align-top whitespace-nowrap">
                      {d.cantidad} x {tallaStr(d)}
                      {d.genero === "caballero" ? "/C" : "/D"}
                      {esVisita && d.entalle ? ` [Entallar a: ${d.talla_vendida ?? ""}]` : ""}
                    </td>
                    <td className="text-right align-top text-slate-700">{d.producto_nombre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
