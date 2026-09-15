-- 24: Dropshipping + Proveedores + observaciones en viajes
-- Idempotente: verifica existencia antes de cada cambio.

-- ─── Tabla proveedores ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proveedores (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL UNIQUE,
  telefono   text,
  comentario text,
  creado_por uuid REFERENCES usuarios(id),
  creado_el  timestamptz NOT NULL DEFAULT now()
);

-- ─── Columnas nuevas en productos ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='productos' AND column_name='es_dropship'
  ) THEN
    ALTER TABLE productos ADD COLUMN es_dropship boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='productos' AND column_name='detalles'
  ) THEN
    ALTER TABLE productos ADD COLUMN detalles text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='productos' AND column_name='proveedor_id'
  ) THEN
    ALTER TABLE productos ADD COLUMN proveedor_id uuid REFERENCES proveedores(id);
  END IF;
END $$;

-- ─── Columna observaciones en viajes ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='viajes' AND column_name='observaciones'
  ) THEN
    ALTER TABLE viajes ADD COLUMN observaciones text;
  END IF;
END $$;

-- ─── Entidad 'proveedor' permitida en auditoria ───────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'auditoria_entidad_check'
      AND NOT pg_get_constraintdef(oid) LIKE '%proveedor%'
  ) THEN
    ALTER TABLE auditoria DROP CONSTRAINT auditoria_entidad_check;
    ALTER TABLE auditoria ADD CONSTRAINT auditoria_entidad_check CHECK (entidad in (
      'producto', 'producto_unico', 'pedido', 'viaje',
      'detalle_pedido', 'pago', 'proveedor'
    ));
  END IF;
END $$;
