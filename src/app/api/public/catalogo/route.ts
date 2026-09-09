import { NextRequest } from "next/server";
import { listarCatalogoPublico } from "@/lib/productos";

export const runtime = "nodejs";

// Backstop anti-scraping: límite en memoria por IP (por instancia).
// La protección principal es la API key (header x-api-key).
const WINDOW_MS = 60_000;
const MAX_PETICIONES = 30;
const hits = new Map<string, number[]>();

function excedeLimite(key: string): boolean {
  const now = Date.now();
  const recientes = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recientes.length >= MAX_PETICIONES) {
    hits.set(key, recientes);
    return true;
  }
  recientes.push(now);
  hits.set(key, recientes);
  return false;
}

// GET /api/public/catalogo — catálogo completo con stock (ventas y almacén).
// Autenticación: header x-api-key = CATALOGO_API_KEY.
// Filtro opcional: ?imei=<codigo> devuelve solo ese producto.
export async function GET(request: NextRequest) {
  const apiKey = process.env.CATALOGO_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "API no configurada: falta CATALOGO_API_KEY" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const provided = request.headers.get("x-api-key");
  if (provided !== apiKey) {
    return Response.json({ error: "Clave no válida" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  if (excedeLimite(`${ip}:${request.nextUrl.pathname}`)) {
    return Response.json({ error: "Demasiadas peticiones" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }

  const productos = await listarCatalogoPublico();
  const imei = request.nextUrl.searchParams.get("imei");
  const resultado = imei ? productos.filter((p) => p.imei === imei) : productos;

  return Response.json(
    {
      actualizado_en: new Date().toISOString(),
      total: resultado.length,
      productos: resultado,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
      },
    }
  );
}