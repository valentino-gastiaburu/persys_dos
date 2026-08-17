-- 10_inconsistencias.sql -- Tabla central de inconsistencias del sistema.
-- Tipos posibles: pedido_cancelado_stock, pedido_fecha_entrega,
-- viaje_devolucion_passada, pago_fecha_passada, detalle_devolucion_horfana.

create table inconsistencias (
  id uuid default uuid_generate_v4() primary key,
  tipo text not null check (
    tipo in (
      'pedido_cancelado_stock',
      'pedido_fecha_entrega',
      'viaje_devolucion_passada',
      'pago_fecha_passada',
      'detalle_devolucion_horfana'
    )
  ),
  entidad_id uuid not null,
  descripcion text not null,
  fecha_detectada timestamptz default now(),
  resuelto boolean default false,
  usuario_id uuid,
  metadata jsonb default '{}'
);

create index idx_inconsistencias_tipo_resuelto on inconsistencias(tipo, resuelto);
create index idx_inconsistencias_entidad on inconsistencias(entidad_id);