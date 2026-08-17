-- 09_fechas_devolucion.sql — Fechas de devolución en viajes de regreso.
-- `viajes.fecha` = fecha programada para el recojo/devolución (ya existe).
-- `viajes.fecha_devolucion` = fecha efectiva en la que almacén terminó el
-- recojo (escaneó el QR y la prenda volvió al stock).
-- Aditivo/idempotente para la BD existente.

alter table viajes
  add column if not exists fecha_devolucion timestamptz;