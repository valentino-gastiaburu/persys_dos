import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { subirComprobante } from "@/lib/drive";

// POST /api/productos/foto
//   body: multipart/form-data con "archivo" (imagen, máx 5 MB), "imei" (texto)
//   y "codigo" (id corto del producto, opcional).
// Sube la foto a la MISMA carpeta de Drive que los comprobantes (la función
// subirComprobante usa DRIVE_COMPROBANTES_FOLDER_ID) con nombre
// "prod-{codigo}-{imei}" (o "producto-{IMEI}" si no viene codigo).
// Devuelve el link visible para cualquiera, listo para guardar en productos.foto_url.
export async function POST(request: NextRequest) {
  const { user, error } = await requireRoles(["vendedora", "agendadora", "almacen", "controller", "admin"]);
  if (error) return error;
  void user;

  const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "El body debe ser multipart/form-data" }, { status: 400 });
  }

  const archivo = form.get("archivo");
  const imei = String(form.get("imei") ?? "").trim();
  const codigo = String(form.get("codigo") ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

  if (!(archivo instanceof File)) {
    return Response.json({ error: "Falta el archivo (campo 'archivo')" }, { status: 400 });
  }
  if (!imei) {
    return Response.json({ error: "Falta el IMEI del producto (campo 'imei')" }, { status: 400 });
  }
  if (archivo.size === 0) {
    return Response.json({ error: "El archivo está vacío" }, { status: 400 });
  }
  if (archivo.size > MAX_SIZE) {
    return Response.json({ error: "El archivo supera los 5 MB" }, { status: 400 });
  }

  const mime = archivo.type || "application/octet-stream";
  if (!mime.startsWith("image/")) {
    return Response.json({ error: "Solo se permiten imágenes" }, { status: 400 });
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const ext = extDeImagen(mime);
  const nombre = codigo
    ? `prod-${codigo}-${sanitizarNombre(imei)}${ext}`
    : `producto-${sanitizarNombre(imei)}${ext}`;

  try {
    const resultado = await subirComprobante(buffer, nombre, mime);
    return Response.json({
      ok: true,
      foto_url: resultado.link,
      drive_id: resultado.id,
      nombre: resultado.webViewLink ? resultado.webViewLink.split("/d/")[1]?.split("/")[0] : null,
    });
  } catch {
    return Response.json(
      {
        error:
          "No se pudo subir la foto a Google Drive. Verifica que GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN estén configurados y que la carpeta DRIVE_COMPROBANTES_FOLDER_ID esté compartida con la cuenta autorizada (permiso Editor).",
      },
      { status: 500 }
    );
  }
}

// DELETE /api/productos/foto?drive_id=...
// Borra de Drive una foto subida por error (ej. cancelación del formulario).
export async function DELETE(request: NextRequest) {
  const { error } = await requireRoles(["vendedora", "agendadora", "almacen", "controller", "admin"]);
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
    return Response.json({ error: "No se pudo borrar la foto de Drive" }, { status: 500 });
  }
}

function extDeImagen(mime: string): string {
  const m = mime.split("/")[1]?.toLowerCase();
  if (m === "jpeg") return ".jpg";
  if (m === "png" || m === "webp" || m === "gif" || m === "bmp" || m === "heic") return "." + m;
  return ".jpg";
}

function sanitizarNombre(nombre: string): string {
  const limpio = nombre.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  return limpio || "sin-imei";
}