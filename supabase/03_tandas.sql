-- ============================================================
-- Persys — Migración: tandas de productos únicos (QRs)
-- Ejecuta esto SOLO si ya corriste 02_schema.sql antes.
-- Es idempotente: puede correrse varias veces sin problema.
-- No borra datos.
-- ============================================================

create sequence if not exists tandas_codigo_seq;

create table if not exists tandas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default to_char(nextval('tandas_codigo_seq'), 'FM00000'),
  fecha_creacion timestamptz not null default now(),
  creado_por uuid references usuarios(id)
);

alter table productos_unicos add column if not exists tanda_id uuid references tandas(id);

create index if not exists idx_productos_unicos_tanda on productos_unicos(tanda_id);

-- RLS para la nueva tabla (igual que las demás)
alter table tandas enable row level security;
drop policy if exists "app_full_access" on tandas;
create policy "app_full_access" on tandas for all to anon, authenticated using (true) with check (true);
