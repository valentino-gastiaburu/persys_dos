-- Equipo del pedido: segunda vendedora colaboradora y agendadora.
-- Vendedora principal: vendedora_1_id
-- Colaboradora 1:      vendedora_contribuyente_id
-- Colaboradora 2:      vendedora_contribuyente_2_id  (NUEVA)
-- Agendadora:          agendadora_id                 (NUEVA; por defecto quien crea el pedido)
alter table pedidos
  add column if not exists vendedora_contribuyente_2_id uuid references usuarios(id),
  add column if not exists agendadora_id               uuid references usuarios(id);
