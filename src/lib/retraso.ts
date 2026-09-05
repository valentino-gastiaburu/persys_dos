// Utilidades para el estado visual "Retrasado" de viajes y pedidos.
//
// IMPORTANTE: todo esto es lógica de PRESENTACIÓN. No se guarda ningún dato en
// la BD (no hay tablas/columnas/funciones nuevas). El estado real de viajes y
// pedidos (programado/alistado/confirmado...) vive en Supabase intacto; aquí
// solo se deriva un flag visual.
//
// Fuente de hora: NO se usa la hora del PC (puede estar mal configurada). Se
// lee el header HTTP `Date` (siempre GMT/UTC) de un host masivo y estable, y se
// convierte a hora de Lima (UTC-5 fijo, Perú no usa horario de verano).
//
// Cadena de fuentes (proveedores/redes independientes, si una cae se usa la
// siguiente):
//   1) api.github.com        (GitHub)
//   2) www.cloudflare.com    (Cloudflare)  -> respaldo
//   3) example.com           (IANA)        -> respaldo 2
//   4) new Date() del server (último recurso, solo si TODAS fallan)

const LIMA_OFFSET_MIN = -300; // UTC-5

// Hosts que devuelven el header `Date` en GMT. Ordenados por confiabilidad.
const DATE_HOSTS: string[] = [
  "https://api.github.com",
  "https://www.cloudflare.com",
  "https://example.com",
];

// Se leen N hosts (uno solo basta) pero se probea en orden hasta obtener un
// header `Date` con formato HTTP válido.
const REQUEST_TIMEOUT_MS = 5000;

let cache: { fechaLima: string; expira: number } | null = null;
const TTL_MS = 30_000; // evita golpear las APIs en cada request

function httpDateToLima(dateHeader: string | null): string | null {
  if (!dateHeader) return null;
  const ms = Date.parse(dateHeader);
  if (Number.isNaN(ms)) return null;
  // La hora http es GMT/UTC. Para Lima restamos 5h.
  const lima = new Date(ms + LIMA_OFFSET_MIN * 60_000);
  // toISOString devuelve en UTC: al ya restarle 5h, el día resultante es el de
  // Lima (0:00 UTC equivale a 19:00 del día anterior en Lima, etc.).
  return lima.toISOString().slice(0, 10);
}

async function fechaDesdeHosts(): Promise<string | null> {
  for (const url of DATE_HOSTS) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: "follow",
      });
      const fecha = httpDateToLima(res.headers.get("date"));
      if (fecha) return fecha;
    } catch {
      // host caído/inaccesible, se intenta el siguiente
    }
  }
  return null;
}

// Devuelve la fecha de hoy (YYYY-MM-DD) en hora de Lima, con caché corto.
export async function obtenerFechaHoyLima(): Promise<string> {
  const ahora = Date.now();
  if (cache && cache.expira > ahora) return cache.fechaLima;

  const deRed = await fechaDesdeHosts();
  const fecha = deRed ?? new Date(ahora - LIMA_OFFSET_MIN * 60_000).toISOString().slice(0, 10);

  cache = { fechaLima: fecha, expira: ahora + TTL_MS };
  return fecha;
}

// Un viaje está retrasado cuando aún NO se envió (programado/alistado) y su
// fecha programada ya pasó (fecha < hoy). Enviado/terminado/cancelado nunca
// están retrasados. Tampoco un recojo que ya se completó.
export function esRetrasado(estado: string | null | undefined, fecha: string | null | undefined, hoy: string): boolean {
  if (!estado || !fecha) return false;
  if (estado !== "programado" && estado !== "alistado") return false;
  return fecha < hoy;
}

// Texto del badge del pedido según qué viaje esté retrasado.
// Prioriza la entrega si ambos tipos están retrasados.
export function etiquetaRetrasoPedido(entrega: boolean, recojo: boolean): string | null {
  if (entrega) return "Entrega retrasada";
  if (recojo) return "Recojo retrasado";
  return null;
}
