-- 21_auditoria.sql -- Bitácora unificada de movimientos del sistema.
-- Una fila = un cambio registrado (cambio de estado, edición de campo,
-- inclusión/asignación, pago, etc.) con responsable, hora y antes/después.
-- Se escribe desde la API (helper src/lib/auditoria.ts); no hay backfill.

create table auditoria (
  id            uuid primary key default gen_random_uuid(),
  fecha         timestamptz not null default now(),
  persona_id    uuid references usuarios(id),
  rol           text,
  entidad       text not null check (entidad in (
                  'producto', 'producto_unico', 'pedido', 'viaje',
                  'detalle_pedido', 'pago'
                )),
  entidad_id    uuid not null,
  entidad_ref   text,
  sub_entidad   text,
  sub_entidad_id uuid,
  sub_entidad_ref text,
  accion        text not null,
  campo         text,
  valor_anterior jsonb,
  valor_nuevo   jsonb,
  nota          text
);

create index idx_auditoria_fecha on auditoria(fecha desc);
create index idx_auditoria_entidad on auditoria(entidad, entidad_id);
create index idx_auditoria_persona on auditoria(persona_id);

-- RLS: acceso completo desde las API routes (mismo patrón que el resto).
alter table auditoria enable row level security;
drop policy if exists "app_full_access" on auditoria;
create policy "app_full_access" on auditoria
  for all to anon, authenticated using (true) with check (true);