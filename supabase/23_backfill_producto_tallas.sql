-- 23_backfill_producto_tallas.sql — Completa producto_tallas con TODAS las tallas
-- de la escala del producto (según su tipo_talla).
-- Motivo: la importación de stock viejo (20) solo creaba filas para las tallas que
-- tenían stock, dejando incompleto el catálogo de tallas del producto (por eso el
-- selector "Entallar a" mostraba una sola talla). Idempotente; no toca lo existente.

insert into producto_tallas (producto_id, talla_id)
select p.id, t.id
from productos p
join tallas t
  on (p.tipo_talla = 'A'   and t.tipo = 'A')
  or (p.tipo_talla = 'B'   and t.tipo = 'B')
  or (p.tipo_talla = 'C'   and t.tipo = 'C')
  or (p.tipo_talla = 'AB'  and t.tipo in ('A', 'B'))
  or (p.tipo_talla = 'AC'  and t.tipo in ('A', 'C'))
  or (p.tipo_talla = 'BC'  and t.tipo in ('B', 'C'))
  or (p.tipo_talla = 'ABC' and t.tipo in ('A', 'B', 'C'))
where p.estado <> 'eliminado'
  and p.tipo_talla is not null
on conflict (producto_id, talla_id) do nothing;