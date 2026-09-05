import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { obtenerFechaHoyLima } from "@/lib/retraso";

// GET /api/hoy
// Devuelve la "fecha de hoy" (YYYY-MM-DD) en hora de Lima, calculada en el
// servidor a partir de headers HTTP (respeta la regla: no usar la fecha del PC).
// Sirve para filtrar cargos "de hoy" sin depender del reloj del navegador.
export async function GET(request: NextRequest) {
  const { error } = await requireRoles([
    "vendedora",
    "agendadora",
    "almacen",
    "controller",
    "admin",
  ]);
  if (error) return error;

  const hoy = await obtenerFechaHoyLima();
  return Response.json({ hoy });
}
