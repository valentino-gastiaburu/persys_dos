-- 15_viaje_recojo_pendiente.sql
-- Agrega 'pendiente' al enum viaje_producto_estado para el flujo de recojo.
-- Estado 'pendiente': producto único pre-asignado al viaje de recojo, esperando
-- ser escaneado/devuelto. Cuando se escanea, pasa directamente a 'devuelto'.

ALTER TYPE viaje_producto_estado ADD VALUE IF NOT EXISTS 'pendiente' BEFORE 'alistado';
