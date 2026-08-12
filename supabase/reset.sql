-- ============================================================
-- Persys — Reset: elimina TODO lo del esquema actual
-- Ejecuta esto ANTES de volver a correr db/schema.sql
-- ============================================================

-- Vistas
drop view if exists v_pedidos_pendientes_pago cascade;
drop view if exists v_productosx_talla cascade;
drop view if exists v_stock_comercial cascade;
drop view if exists v_stock_reservado cascade;
drop view if exists v_stock_almacen cascade;

-- Triggers y función
drop trigger if exists trg_productos_updated on productos;
drop trigger if exists trg_productos_unicos_updated on productos_unicos;
drop trigger if exists trg_pedidos_updated on pedidos;
drop trigger if exists trg_viajes_updated on viajes;
drop function if exists set_actualizado_el() cascade;

-- Tablas (orden inverso de dependencias)
drop table if exists historial_pedidos cascade;
drop table if exists historial_productos cascade;
drop table if exists historial_producto_unicos cascade;
drop table if exists pagos cascade;
drop table if exists viaje_producto_unicos cascade;
drop table if exists detalles_pedido cascade;
drop table if exists viajes cascade;
drop table if exists pedidos cascade;
drop table if exists movimientos_stock cascade;
drop table if exists motorizados cascade;
drop table if exists productos_unicos cascade;
drop table if exists producto_tallas cascade;
drop table if exists clientes cascade;
drop table if exists productos cascade;
drop table if exists tallas cascade;
drop table if exists usuarios cascade;
drop table if exists configuraciones cascade;

-- Tipos enum
drop type if exists usuario_rol cascade;
drop type if exists usuario_estado cascade;
drop type if exists producto_estado cascade;
drop type if exists tipo_talla cascade;
drop type if exists talla_tipo cascade;
drop type if exists genero_prenda cascade;
drop type if exists producto_unico_estado cascade;
drop type if exists movimiento_tipo cascade;
drop type if exists referencia_tipo cascade;
drop type if exists pedido_estado cascade;
drop type if exists tipo_pedido cascade;
drop type if exists metodo_entrega cascade;
drop type if exists empresa_envio cascade;
drop type if exists canal_venta cascade;
drop type if exists metodo_pago cascade;
drop type if exists pago_tipo cascade;
drop type if exists viaje_tipo cascade;
drop type if exists viaje_motivo_recojo cascade;
drop type if exists viaje_estado cascade;
drop type if exists viaje_producto_estado cascade;
drop type if exists producto_unico_evento cascade;
drop type if exists producto_evento_tipo cascade;
drop type if exists detalle_estado cascade;
