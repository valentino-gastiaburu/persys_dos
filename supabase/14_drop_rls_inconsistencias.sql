-- 14_drop_rls_inconsistencias.sql -- Desactivar RLS en inconsistencias.
-- getSupabase() (anon) necesita INSERT/UPDATE sin restricciones.

alter table inconsistencias disable row level security;
