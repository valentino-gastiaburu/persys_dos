# Persys — Scripts SQL

Copia y pega el contenido de cada archivo en el **SQL Editor** de Supabase.

## Regla de trabajo

- **Nunca se modifican los archivos existentes.** Si hace falta un cambio, se crea un
  archivo **nuevo** con el siguiente número (`04_`, `05_`, ...). Las queries viejas
  quedan tal cual.
- **BD vacía (primera vez o recreación total):** se corre `01_reset.sql` y luego
  `02_schema.sql`, seguidos de todas las migraciones en orden (`03_`, `04_`, ...).
- **BD ya existente:** solo se corre la migración nueva que aplique. No se toca nada más.

## Archivos

1. `01_reset.sql` → elimina TODO del esquema actual. Solo para recrear desde una BD vacía.
2. `02_schema.sql` → schema completo + seeds (tallas, config, admin) + RLS + triggers. Solo para BD vacía.
3. `03_tandas.sql` → tabla `tandas` (lotes de productos únicos) + columna `productos_unicos.tanda_id`.
   Es aditiva e idempotente.
