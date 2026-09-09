import { google } from "googleapis";
import { Readable } from "stream";
import type { Credentials } from "google-auth-library";

// Sube comprobantes de pago (imagen o PDF) a una carpeta de Google Drive.
// Una cuenta de servicio no puede subir a un Drive personal (Gmail): Google
// responde "Service Accounts do not have storage quota". Por eso usamos OAuth2
// con la cuenta del usuario que tiene acceso a la carpeta de la dueña:
// autorización UNA vez -> guardamos el refresh token -> la app sube sola.
//
// Env vars necesarias:
//   GOOGLE_DRIVE_CLIENT_ID       (OAuth Client -> Aplicación web)
//   GOOGLE_DRIVE_CLIENT_SECRET
//   GOOGLE_DRIVE_REFRESH_TOKEN   (se obtiene una vez con /api/pagos/comprobante/auth)
//   DRIVE_COMPROBANTES_FOLDER_ID (carpeta de Drive compartida con la cuenta usada)

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

let driveClient: ReturnType<typeof google.drive> | null = null;

export function getDrive() {
  if (driveClient) return driveClient;

  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Falta GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET / GOOGLE_DRIVE_REFRESH_TOKEN en el entorno."
    );
  }

  const auth = new google.auth.OAuth2({ clientId, clientSecret });
  auth.setCredentials({ refresh_token: refreshToken } as Credentials);

  driveClient = google.drive({ version: "v3", auth });
  return driveClient;
}

// URL para el flujo OAuth de una sola vez (la visita el usuario, autoriza y el
// callback le muestra el refresh token para guardarlo en el entorno).
export function generarUrlAutorizacion(redirectUri: string): string {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Falta GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET");
  }
  const oauth = new google.auth.OAuth2({ clientId, clientSecret, redirectUri });
  return oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [DRIVE_FILE_SCOPE],
  });
}

// Intercambia el code de autorización por tokens (devuelve el refresh token).
export async function canjearCodigo(
  code: string,
  redirectUri: string
): Promise<{ refresh_token: string | null }> {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Falta GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET");
  }
  const oauth = new google.auth.OAuth2({ clientId, clientSecret, redirectUri });
  const { tokens } = await oauth.getToken(code);
  return { refresh_token: tokens.refresh_token ?? null };
}

// Sube un archivo a la carpeta de comprobantes y devuelve el link visible para
// cualquiera (permiso "lector con el link"). Si el permiso falla, el archivo
// igual queda subido (solo quien tiene acceso al Drive lo verá).
export async function subirComprobante(
  buffer: Buffer,
  nombre: string,
  mime: string
): Promise<{ id: string; link: string; webViewLink: string | null }> {
  const carpetaId = process.env.DRIVE_COMPROBANTES_FOLDER_ID;
  if (!carpetaId) {
    throw new Error("Falta DRIVE_COMPROBANTES_FOLDER_ID en el entorno");
  }

  const drive = getDrive();
  const archivo = await drive.files.create({
    requestBody: {
      name: nombre,
      mimeType: mime,
      parents: [carpetaId],
    },
    media: { mimeType: mime, body: Readable.from([buffer]) },
    fields: "id, name, webViewLink",
  });

  const id = archivo.data.id;
  if (!id) throw new Error("Google Drive no devolvió el id del archivo");

  try {
    await drive.permissions.create({
      fileId: id,
      requestBody: { role: "reader", type: "anyone" },
    });
  } catch {
    // El archivo se subió igual; solo se ve desde la cuenta que tiene acceso al Drive.
  }

  return {
    id,
    link: `https://drive.google.com/uc?id=${id}&export=view`,
    webViewLink: archivo.data.webViewLink ?? null,
  };
}