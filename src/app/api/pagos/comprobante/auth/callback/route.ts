import { NextRequest } from "next/server";

// GET /api/pagos/comprobante/auth/callback
// Google redirige acá con ?code=... tras el consentimiento. Intercambia el code
// por un refresh token y lo muestra en pantalla para que el dueño lo guarde en
// las variables de entorno (GOOGLE_DRIVE_REFRESH_TOKEN).
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return htmlRespuesta(
      "Error",
      `<p>No se recibió el código de Google. Volvé a <a href="/api/pagos/comprobante/auth">autorizar</a>.</p>`
    );
  }

  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/api/pagos/comprobante/auth/callback`;

  const { canjearCodigo } = await import("@/lib/drive");
  let refreshToken: string | null;
  let errorMsg: string | null = null;
  try {
    const r = await canjearCodigo(code, redirectUri);
    refreshToken = r.refresh_token;
    if (!refreshToken) {
      errorMsg =
        "Google no devolvió refresh token. Asegurate de autorizar estando logueado (no usar 'Volver a autorizar' sin cerrar sesión) y reintenta.";
    }
  } catch (e) {
    refreshToken = null;
    errorMsg = "No se pudo validar el código con Google: " + String(e);
  }

  if (errorMsg || !refreshToken) {
    return htmlRespuesta(
      "Error",
      `<p>${errorMsg ?? "Error desconocido"}</p><p><a href="/api/pagos/comprobante/auth">Reintentar autorización</a></p>`
    );
  }

  return htmlRespuesta(
    "¡Autorización lista!",
    `
    <p>Copia este <strong>refresh token</strong> y guardalo en las variables de entorno
    como <code>GOOGLE_DRIVE_REFRESH_TOKEN</code>:</p>
    <textarea readonly onclick="this.select()" style="width:100%;height:120px;font-family:monospace;font-size:12px">${refreshToken}</textarea>
    <p>Recordá que también se necesitan <code>GOOGLE_DRIVE_CLIENT_ID</code> y
    <code>GOOGLE_DRIVE_CLIENT_SECRET</code> (del OAuth Client "Aplicación web") y
    <code>DRIVE_COMPROBANTES_FOLDER_ID</code>.</p>
    `
  );
}

function htmlRespuesta(titulo: string, body: string): Response {
  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${titulo}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#1e293b">
    <h2>${titulo}</h2>${body}
    <p><a href="/pagos" style="color:#2563eb">← Volver a Pagos</a></p>
    </body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}