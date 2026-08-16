-- 08_viajes_extras.sql — Pedido = colección de viajes con sus productos.
-- Cada viaje lleva su propio total (y costo de envío informativo para extras);
-- las devoluciones se registran como líneas de un viaje tipo recojo con estado
-- 'pendiente_devolucion' que pasa a 'devuelto' cuando el viaje termina.
-- Aditivo/idempotente para la BD existente (02_schema.sql ya usa estos campos).

-- 1) Nuevos estados de detalle para devoluciones
alter type detalle_estado add value if not exists 'pendiente_devolucion';
alter type detalle_estado add value if not exists 'devuelto';

-- 2) Viajes: total propio, costo de envío (informativo en extras) y dirección
alter table viajes
  add column if not exists costo_envio numeric(10,2) not null default 0,
  add column if not exists total       numeric(10,2) not null default 0,
  add column if not exists direccion   text;

-- 3) Detalles: trazabilidad devolución (línea de un viaje de regreso → línea original)
alter table detalles_pedido
  add column if not exists devolucion_de uuid references detalles_pedido(id);

-- Backfill: el viaje de entrega original ya tiene un total implícito
-- (suma de subtotales + costo de envío del pedido, que vive en `pedidos.costo_envio`
-- para los viajes creados antes de esta migración). Solo se toca el primer viaje.
update viajes v
set costo_envio = coalesce(p.costo_envio, 0),
    total = coalesce(
              (select sum(d.subtotal)
               from detalles_pedido d
               where d.viaje_id = v.id and d.estado = 'activo'),
              0
            ) + coalesce(p.costo_envio, 0)
from pedidos p
where v.pedido_id = p.id
  and v.tipo = 'entrega'
  and v.total = 0
  and v.id = (
        select v2.id
        from viajes v2
        where v2.pedido_id = p.id and v2.tipo = 'entrega'
        order by v2.creado_el
        limit 1
      );
