-- Función atómica para reemplazar detalles de un viaje.
-- DELETE + INSERT dentro de la misma transacción:
-- si cualquiera falla, nada se persiste.
-- Los duplicados dentro del JSONB se mergean (suman cantidades).

create or replace function replace_viaje_detalles(
  p_viaje_id uuid,
  p_pedido_id uuid,
  p_anadido_por uuid,
  p_detalles jsonb
)
returns void
language plpgsql
as $$
begin
  -- Eliminar detalles anteriores del viaje
  delete from detalles_pedido where viaje_id = p_viaje_id;

  -- Insertar los nuevos, mergando duplicados por (producto_id, talla_stock, talla_vendida)
  if p_detalles is not null and jsonb_array_length(p_detalles) > 0 then
    insert into detalles_pedido (
      pedido_id, viaje_id, producto_id, talla_stock, talla_vendida,
      entalle, cantidad, precio_unitario, subtotal, genero,
      es_extra_motorizado, anadido_por, confirmado_el
    )
    select
      p_pedido_id,
      p_viaje_id,
      (d->>'producto_id')::uuid,
      nullif(d->>'talla_stock', '')::uuid,
      nullif(d->>'talla_vendida', '')::uuid,
      (d->>'entalle')::boolean,
      sum((d->>'cantidad')::int),
      (d->>'precio_unitario')::numeric,
      sum((d->>'cantidad')::int) * (d->>'precio_unitario')::numeric,
      coalesce(d->>'genero', 'dama')::genero_prenda,
      (d->>'es_extra_motorizado')::boolean,
      p_anadido_por,
      now()
    from jsonb_array_elements(p_detalles) d
    group by d->>'producto_id', d->>'talla_stock', d->>'talla_vendida',
             d->>'entalle', d->>'precio_unitario',
             d->>'genero', d->>'es_extra_motorizado';
  end if;
end;
$$;
