import { getSupabase } from "./supabase";
import type { SessionUser } from "./auth";

// Bitácora unificada: una fila por cambio registrado.
// Entidad = la "tabla" sobre la que ocurrió el cambio; valida contra el check
// de la tabla auditoria en la BD.

export type EntidadAuditoria =
  | "producto"
  | "producto_unico"
  | "pedido"
  | "viaje"
  | "detalle_pedido"
  | "pago";

export type RegistrarAuditoriaParams = {
  user: SessionUser;
  entidad: EntidadAuditoria;
  entidad_id: string;
  entidad_ref?: string | null;
  sub_entidad?: string | null;
  sub_entidad_id?: string | null;
  sub_entidad_ref?: string | null;
  accion: string;
  campo?: string | null;
  valor_anterior?: unknown;
  valor_nuevo?: unknown;
  nota?: string | null;
};

// Serializa valores a jsonb. Un string plano "Hola" necesita comillas JSON
// para que PostgREST lo caste a jsonb; JSON.stringify cubre escalares,
// objetos, arrays y fechas (ISO).
function enc(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  return JSON.stringify(v);
}

export async function registrarAuditoria(params: RegistrarAuditoriaParams) {
  const supabase = getSupabase();
  const { error } = await supabase.from("auditoria").insert({
    persona_id: params.user.id,
    rol: params.user.rol,
    entidad: params.entidad,
    entidad_id: params.entidad_id,
    entidad_ref: params.entidad_ref ?? null,
    sub_entidad: params.sub_entidad ?? null,
    sub_entidad_id: params.sub_entidad_id ?? null,
    sub_entidad_ref: params.sub_entidad_ref ?? null,
    accion: params.accion,
    campo: params.campo ?? null,
    valor_anterior: enc(params.valor_anterior),
    valor_nuevo: enc(params.valor_nuevo),
    nota: params.nota ?? null,
  });
  // Si el insert falla (p.ej. tabla aún no migrada) no rompe la mutación.
  if (error) {
    console.error("auditoria: error al registrar", params.accion, error.message);
  }
}

// Shortcut para un diff simple: una fila por campo con valor anterior y nuevo.
export async function registrarCambios(
  params: {
    user: SessionUser;
    entidad: EntidadAuditoria;
    entidad_id: string;
    entidad_ref?: string | null;
    accion: string;
    cambios: { campo: string; anterior: unknown; nuevo: unknown }[];
    nota?: string | null;
  }
) {
  for (const c of params.cambios) {
    if (c.anterior === c.nuevo) continue;
    await registrarAuditoria({
      user: params.user,
      entidad: params.entidad,
      entidad_id: params.entidad_id,
      entidad_ref: params.entidad_ref,
      accion: params.accion,
      campo: c.campo,
      valor_anterior: c.anterior,
      valor_nuevo: c.nuevo,
      nota: params.nota,
    });
  }
}