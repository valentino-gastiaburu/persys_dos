-- 12_add_viaje_cancelado.sql -- Agregar valor 'cancelado' al enum viaje_estado.
-- La tabla viajes lo usa cuando un pedido se cancela y sus viajes aún no terminaron.

alter type viaje_estado add value if not exists 'cancelado';
