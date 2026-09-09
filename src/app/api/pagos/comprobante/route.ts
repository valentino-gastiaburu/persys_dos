import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { subirComprobante } from "@/lib/drive";

// POST /api/pagos/comprobante
//   body: multipart/form-data con "archivo" (imagen o PDF, máx 5 MB).
// Sube el archivo a Google Drive y devuelve el link visible para cualquiera.
// El link se guarda luego en pagos.comprobante al registrar el pago.
export async function POST(request: NextRequest) {
  const { error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;

  const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "El body debe ser multipart/form-data" }, { status: 400 });
  }

  const archivo = form.get("archivo");
  if (!(archivo instanceof File)) {
    return Response.json({ error: "Falta el archivo (campo 'archivo')" }, { status: 400 });
  }
  if (archivo.size === 0) {
    return Response.json({ error: "El archivo está vacío" }, { status: 400 });
  }
  if (archivo.size > MAX_SIZE) {
    return Response.json({ error: "El archivo supera los 5 MB" }, { status: 400 });
  }

  const mime = archivo.type || "application/octet-stream";
  const permitido = mime.startsWith("image/") || mime === "application/pdf";
  if (!permitido) {
    return Response.json(
      { error: "Solo se permiten imágenes o PDF" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const ext = mime === "application/pdf" ? ".pdf" : extDeImagen(mime);
  const nombre = `comprobante-${Date.now()}-${sanitizarNombre(archivo.name, ext)}`;

  try {
    const resultado = await subirComprobante(buffer, nombre, mime);
    return Response.json({
      ok: true,
      comprobante: resultado.link,
      drive_id: resultado.id,
      nombre: resultado.webViewLink ? resultado.webViewLink.split("/d/")[1]?.split("/")[0] : null,
    });
  } catch {
    return Response.json(
      {
        error:
          "No se pudo subir el comprobante a Google Drive. Verifica que GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN estén configurados, que el flujo de autorización (/api/pagos/comprobante/auth) esté hecho y que la carpeta DRIVE_COMPROBANTES_FOLDER_ID esté compartida con la cuenta autorizada (permiso Editor).",
      },
      { status: 500 }
    );
  }
}

// DELETE /api/pagos/comprobante?drive_id=...
// Borra de Drive un comprobante subido pero cuyo pago no llegó a registrarse
// (ej. el POST del pago fue rechazado): evita archivos huérfanos en la carpeta.
export async function DELETE(request: NextRequest) {
  const { error } = await requireRoles(["vendedora", "agendadora", "controller", "admin"]);
  if (error) return error;

  const driveId = request.nextUrl.searchParams.get("drive_id");
  if (!driveId) {
    return Response.json({ error: "Falta drive_id" }, { status: 400 });
  }

  try {
    const { getDrive } = await import("@/lib/drive");
    await getDrive().files.delete({ fileId: driveId });
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "No se pudo borrar el comprobante de Drive" },
      { status: 500 }
    );
  }
}

function extDeImagen(mime: string): string {
  const m = mime.split("/")[1]?.toLowerCase();
  if (m === "jpeg") return ".jpg";
  if (m === "png" || m === "webp" || m === "gif" || m === "bmp" || m === "heic") return "." + m;
  return ".jpg";
}

function sanitizarNombre(nombre: string, fallbackExt: string): string {
  const limpio = nombre.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  if (!limpio) return `archivo${fallbackExt}`;
  return limpio;
}