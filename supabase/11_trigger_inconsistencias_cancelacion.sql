-- 11_trigger_inconsistencias_cancelacion.sql --
-- Trigger que detecta y registra inconsistencia cuando un pedido
-- se cancela y todavía tiene unidades alistadas en viajes.
--
-- Para que funcione, primero ejecutar la migración 10 (tabla inconsistencias).

create or replace function trigger_pedido_cancelado_stock()
returns trigger as $$
begin
  if new.estado = 'cancelado' then
    -- Buscar unidades alistadas (viaje_producto_unicos) en viajes asociados a este pedido
    insert into inconsistencias (tipo, entidad_id, descripcion, metadata)
    select 'pedido_cancelado_stock',
           v.id,
           'Pedido cancelado pero ' || count(*) || ' unidades siguen alistadas en viajes asociados',
           jsonb_build_object('pedido_id', new.id, 'unidades_alistadas', count(*))
    from viajes v
    join viaje_producto_unicos vpu on vpu.viaje_id = v.id
    where v.pedido_id = new.id
    group by v.id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_pedido_cancelado_stock
after update on pedidos
for each row
when (old.estado != 'cancelado' and new.estado = 'cancelado')
execute function trigger_pedido_cancelado_stock();