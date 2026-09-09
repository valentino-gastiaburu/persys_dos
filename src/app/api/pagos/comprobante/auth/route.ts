import { NextRequest } from "next/server";
import { requerirConsentimientoConfig } from "../_config";

// GET /api/pagos/comprobante/auth
// Inicia el flujo OAuth de una sola vez: redirige a Google para que el usuario
// (la cuenta que tiene acceso a la carpeta de Drive) autorice la app.
// Roles controller/admin únicamente (es una acción de configuración).
export async function GET(request: NextRequest) {
  const auth = await requerirConsentimientoConfig();
  if (auth.error) return auth.error;

  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/api/pagos/comprobante/auth/callback`;

  const { generarUrlAutorizacion } = await import("@/lib/drive");
  let url: string;
  try {
    url = generarUrlAutorizacion(redirectUri);
  } catch (e) {
    return Response.json(
      { error: "Falta GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET en el entorno." },
      { status: 500 }
    );
  }
  return Response.redirect(url);
}