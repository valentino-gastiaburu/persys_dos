-- 18: Cambiar pedidos.regalo de boolean a text (para cargar la descripción del regalo)
-- Idempotente:
--  - Si regalo aún es boolean, lo convierte a text (true -> '', false -> null).
--  - Si ya es text, limpiar cualquier default booleano/roto que haya quedado
--    de una ejecución parcial (ej. default 'false' en una columna text).

DO $$
BEGIN
  -- Caso A: todavía es boolean -> convertir.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pedidos'
      AND column_name = 'regalo'
      AND data_type = 'boolean'
  ) THEN
    ALTER TABLE pedidos ALTER COLUMN regalo DROP NOT NULL;
    ALTER TABLE pedidos ALTER COLUMN regalo
      TYPE text USING (CASE WHEN regalo = true THEN '' ELSE null END);
  END IF;

  -- Caso B: ya es text -> asegurar que NO tenga un default heredado de boolean
  -- (un default 'false' en text es inválido y rompería los INSERT nuevos).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pedidos'
      AND column_name = 'regalo'
      AND data_type = 'text'
      AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE pedidos ALTER COLUMN regalo DROP DEFAULT;
  END IF;
END $$;
