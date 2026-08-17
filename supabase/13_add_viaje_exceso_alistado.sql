-- 13_add_viaje_exceso_alistado.sql -- Agregar tipo de inconsistencia para exceso de alistado.
-- Cuando un viaje tiene más unidades alistadas de las que pide el pedido.

alter table inconsistencias drop constraint if exists inconsistencias_tipo_check;
alter table inconsistencias add constraint inconsistencias_tipo_check check (
  tipo in (
    'pedido_cancelado_stock',
    'pedido_fecha_entrega',
    'viaje_devolucion_passada',
    'pago_fecha_passada',
    'detalle_devolucion_horfana',
    'viaje_exceso_alistado'
  )
);
