-- Permitir cantidad = 0 en detalles_pedido para edición VPU-aware.
-- Cuando el usuario "elimina" una línea con VPU asignado, la línea queda
-- con cantidad = 0 y todos sus VPUs se vuelven "pendientes de devolver".
ALTER TABLE detalles_pedido DROP CONSTRAINT IF EXISTS detalles_pedido_cantidad_check;
ALTER TABLE detalles_pedido ADD CONSTRAINT detalles_pedido_cantidad_check CHECK (cantidad >= 0);
