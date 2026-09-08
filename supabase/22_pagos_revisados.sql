-- 22_pagos_revisados.sql -- Check de revisión de cobros para la jefa.
-- La jefa (admin/controller) marca un cobro como "revisado" para confirmar
-- que realmente se dio y poder ver cuáles le faltan verificar.

alter table pagos add column if not exists revisado    boolean not null default false;
alter table pagos add column if not exists revisado_por uuid references usuarios(id);
alter table pagos add column if not exists revisado_el  timestamptz;

create index if not exists idx_pagos_revisado on pagos(pedido_id, revisado);