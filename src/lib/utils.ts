const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";

export function randomCode(length = 8): string {
  let code = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

// Código QR tipo ID del sistema viejo: 8 hex minúsculas (p. ej. f22beca3).
export function randomHexCode(length = 8): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex.slice(0, length);
}

export function formatSoles(n: number | string | null | undefined): string {
  const num = Number(n ?? 0);
  return "S/ " + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Convierte un link de Google Drive a una URL de imagen embebible.
// Acepta: https://drive.google.com/file/d/FILEID/view?usp=sharing
//         https://drive.google.com/open?id=FILEID
//         https://drive.google.com/uc?id=FILEID&export=view
export function driveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const idMatch =
    trimmed.match(/\/file\/d\/([^/?]+)/) ||
    trimmed.match(/[?&]id=([^&]+)/) ||
    trimmed.match(/drive\.google\.com\/(?:d|open)\/([^/?]+)/);
  const id = idMatch?.[1];
  if (!id) return trimmed;
  return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
}

export function numeroOperacionValido(numero: string | null | undefined) {
  return typeof numero === "string" && numero.trim().length > 0;
}
