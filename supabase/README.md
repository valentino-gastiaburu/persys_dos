# Persys — Scripts SQL (orden de ejecución)

Copia y pega el contenido de cada archivo en el **SQL Editor** de Supabase, **siempre en este orden**:

1. `01_reset.sql` → elimina TODO del esquema actual (tablas, vistas, triggers, tipos enum).
2. `02_schema.sql` → crea el schema completo + seeds (tallas, config, admin) + RLS + triggers.

> El orden importa: `01_reset.sql` no debe correrse solo (deja la BD vacía), y
> `02_schema.sql` no debe correrse dos veces sin pasar antes por `01_reset.sql`.
