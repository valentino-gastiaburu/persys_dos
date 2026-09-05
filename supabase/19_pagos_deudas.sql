-- 19: Deudas / cobros programados en la tabla pagos.
-- Modelo: cada fila de pagos es un "cobro" con estado (pendiente -> pagado).
--   - pendiente: promesa de cobro futuro con fecha_pactada (sin monto todavia).
--   - pagado   : dinero recibido (se completan monto, metodo_pago, fecha_pagada,
--                comprobante).
-- "Deuda pendiente" = cobros pendientes (y tambien monto_total - suma pagados).
-- Idempotente: crea el enum si falta, agrega columnas si faltan, quita not null
-- y backfillea los cobros existentes como pagados.

-- 1. Enum de estado del cobro.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pago_estado') THEN
    CREATE TYPE pago_estado AS ENUM ('pendiente', 'pagado');
  END IF;
END $$;

-- 2. Columnas nuevas en pagos.
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS estado        pago_estado NOT NULL DEFAULT 'pendiente';
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS fecha_pactada date;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS fecha_pagada  date;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS comprobante   text;

-- 3. Ya no son obligatorios: se completan recien al cobrar (pendiente no tiene monto).
ALTER TABLE pagos ALTER COLUMN monto       DROP NOT NULL;
ALTER TABLE pagos ALTER COLUMN metodo_pago DROP NOT NULL;

-- 4. Backfill: los cobros que ya registrados (todos eran dinero recibido) -> pagados.
--    El check (monto > 0) en montos ya pagados se mantiene; null > 0 = null y pasa.
UPDATE pagos
SET estado       = 'pagado',
    fecha_pagada = COALESCE(fecha_pagada, fecha::date)
WHERE estado = 'pendiente'
  AND monto IS NOT NULL;

-- 5. Comprobante capturado en el form "¿Pagó? Sí" al crear; se traslada al
--    cobro pagado cuando se confirma el pedido.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS comprobante text;

-- 6. Indice para listar cobros de un pedido por estado.
CREATE INDEX IF NOT EXISTS idx_pagos_pedido_estado ON pagos(pedido_id, estado);
