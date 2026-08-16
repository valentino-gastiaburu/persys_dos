-- 07_talla_stock_vendida.sql — renombra las columnas de talla de detalles_pedido
-- para reflejar la semántica de entalle del negocio:
--   talla_inicial -> talla_stock   (origen: la talla que hay en almacén, la que se toma)
--   talla_id       -> talla_vendida (destino: la talla que pidió el cliente; se le entalla)
-- Por lo general ambas son iguales; solo difieren cuando hay entalle.
-- La talla que consume stock es SIEMPRE talla_stock.

-- 1) Backfill: las líneas existentes sin entalle tenían talla_inicial = null;
--    ahora ambas columnas deben quedar llenas (o ambas null en productos sin_talla).
update detalles_pedido
set talla_inicial = talla_id
where talla_inicial is null and talla_id is not null;

-- 2) Renombrar constraints (los nombres de constraints NO se renombran solos).
alter table detalles_pedido rename constraint detalles_pedido_talla_inicial_fkey to detalles_pedido_talla_stock_fkey;
alter table detalles_pedido rename constraint detalles_pedido_talla_id_fkey to detalles_pedido_talla_vendida_fkey;

-- 3) Renombrar columnas.
alter table detalles_pedido rename column talla_inicial to talla_stock;
alter table detalles_pedido rename column talla_id to talla_vendida;

-- 4) Invariante: ambas tallas se llenan juntas (o ninguna, para sin_talla).
alter table detalles_pedido
  add constraint detalles_pedido_tallas_ambas_o_ninguna
  check ((talla_stock is null) = (talla_vendida is null));
