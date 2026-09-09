-- ============================================================
-- Persys — Sistema de ventas, inventario y distribución
-- Esquema inicial (Supabase / PostgreSQL)
-- Normalizado a partir de la arquitectura AppSheet existente.
-- ============================================================

-- ---------- Tipos enumerados ----------
create type usuario_rol as enum ('vendedora', 'agendadora', 'almacen', 'controller', 'admin');
create type usuario_estado as enum ('activo', 'inactivo');
create type producto_estado as enum ('activo', 'inactivo', 'eliminado');
create type tipo_talla as enum ('A', 'B', 'C', 'AC', 'BC', 'sin_talla');
create type talla_tipo as enum ('A', 'B', 'C');
create type genero_prenda as enum ('dama', 'caballero');
create type producto_unico_estado as enum ('en_almacen', 'almacen_espera', 'en_viaje', 'entregado', 'devuelto', 'eliminado');
create type movimiento_tipo as enum ('entrada', 'salida', 'ajuste');
create type referencia_tipo as enum ('pedido', 'viaje', 'ajuste');
create type pedido_estado as enum (
  'borrador', 'solicitado', 'confirmado', 'alistado', 'enviado', 'entregado',
  'cerrado', 'cancelado', 'devuelto', 'esperando_devolucion', 'esperando_cambio'
);
create type tipo_pedido as enum ('envio', 'visita');
create type metodo_entrega as enum ('a_domicilio', 'agencia', 'local_peri');
create type empresa_envio as enum ('motorizado', 'olva', 'shalom', 'otros');
create type canal_venta as enum ('whatsapp', 'facebook', 'instagram', 'tiktok', 'telefono', 'otro');
create type metodo_pago as enum ('yape', 'bcp', 'interbank', 'bbva', 'scotiabank', 'plin', 'banco_nacion', 'tarjeta_link', 'efectivo');
create type pago_tipo as enum ('primer_pago', 'parcial', 'total');
create type viaje_tipo as enum ('entrega', 'recojo');
create type viaje_motivo_recojo as enum ('devolucion', 'cambio');
create type viaje_estado as enum ('programado', 'alistado', 'enviado', 'terminado');
create type viaje_producto_estado as enum ('alistado', 'enviado', 'devuelto');
create type producto_unico_evento as enum ('ingreso', 'alistado', 'enviado', 'entregado', 'devuelto', 'entallado', 'ajuste');
create type producto_evento_tipo as enum ('creacion', 'edicion', 'eliminacion');
create type detalle_estado as enum ('activo', 'oculto');

-- ---------- Usuarios (personal) ----------
-- Origen AppSheet: DniUSUARIO, Nombre, Apellido, Email, Telefono, FechaNacimiento,
-- FechaContratacion, Descripcion, Password, EstadoUser, Perfil
-- El admin (la dueña) crea y deshabilita cuentas directamente; no se usa
-- Supabase Auth. El password no es secreto para el admin.
create table usuarios (
  id                 uuid primary key default gen_random_uuid(),
  dni                text not null unique,
  nombre             text not null,
  apellido           text,
  email              text,
  telefono           text,
  password           text not null,
  fecha_nacimiento   date,
  fecha_contratacion date,
  descripcion        text,
  rol                usuario_rol not null default 'vendedora',
  estado             usuario_estado not null default 'activo',
  creado_el          timestamptz not null default now()
);

-- ---------- Tallas (maestro) ----------
create table tallas (
  id       uuid primary key default gen_random_uuid(),
  tipo     talla_tipo not null,
  nombre   text not null,
  orden    int not null default 0,
  unique (tipo, nombre)
);

-- ---------- Productos (modelos, por IMEI) ----------
create table productos (
  id                 uuid primary key default gen_random_uuid(),
  imei               text not null unique,
  nombre             text not null,
  precio_referencial numeric(10,2) not null default 0,
  tipo_talla         tipo_talla not null,
  foto_url           text,
  estado             producto_estado not null default 'activo',
  creado_por         uuid references usuarios(id),
  actualizado_por    uuid references usuarios(id),
  creado_el          timestamptz not null default now(),
  actualizado_el     timestamptz not null default now()
);

-- ---------- Producto_Talla (tallas que aplican a un producto) ----------
create table producto_tallas (
  id           uuid primary key default gen_random_uuid(),
  producto_id  uuid not null references productos(id) on delete cascade,
  talla_id     uuid not null references tallas(id),
  unique (producto_id, talla_id)
);

-- ---------- Clientes ----------
-- Origen AppSheet: Telefono (PK), Nombre, Apellido, DniCliente, Email, Region,
-- Distrito, Direccion, FechaNacimiento, Genero, Observaciones, Fecha de registro
create table clientes (
  id               uuid primary key default gen_random_uuid(),
  telefono         text not null unique,
  nombre           text not null,
  apellido         text,
  dni              text,
  email            text,
  region           text,
  distrito         text,
  direccion        text,
  fecha_nacimiento date,
  genero           genero_prenda,
  observaciones    text,
  creado_por       uuid references usuarios(id),
  creado_el        timestamptz not null default now()
);

-- ---------- Productos_Unicos (cada prenda física, QR) ----------
-- Origen AppSheet: lID_producto, Descripcion, IMEI, TALLA, Esta_en_almacen,
-- Fecha/Hora creado. Lo relativo a viajes/pedidos se normaliza en
-- viaje_producto_unicos e historial_producto_unicos.
create table productos_unicos (
  id              uuid primary key default gen_random_uuid(),
  producto_id     uuid not null references productos(id),
  talla_id        uuid not null references tallas(id),
  talla_original  uuid references tallas(id),
  codigo_qr       text not null unique,
  estado          producto_unico_estado not null default 'en_almacen',
  fecha_ingreso   timestamptz not null default now(),
  fecha_salida    timestamptz,
  actualizado_el  timestamptz not null default now()
);

-- ---------- Motorizados ----------
create table motorizados (
  id       uuid primary key default gen_random_uuid(),
  nombre   text,
  empresa  text,
  telefono text
);

-- ---------- Movimientos de stock (kardex) ----------
create table movimientos_stock (
  id              uuid primary key default gen_random_uuid(),
  producto_id     uuid not null references productos(id),
  talla_id        uuid not null references tallas(id),
  tipo            movimiento_tipo not null,
  cantidad        int not null check (cantidad > 0),
  referencia_tipo referencia_tipo,
  referencia_id   uuid,
  persona_id      uuid references usuarios(id),
  fecha           timestamptz not null default now(),
  nota            text
);

-- ---------- Pedidos ----------
-- Origen AppSheet: IdPedido, IdEjecutivo, EjecutivoVendio, IdEjecutivoContribuyo,
-- IdCliente, FechaPedido, FechaEntrega, TipoPedido, MetodoEntrega, EmpresaEnvio,
-- DireccionEntrega, MetodoPago, Estado, CanalVenta, CostoEnvio, TotalPedido,
-- Deuda1..Validacion1, UbicacionMaps, Distrito_O_Ciudad, Observaciones, REGALO, Hora_Confirmado
-- Deuda1..Validacion1 pasan a la tabla Pagos. flag_creacion se sustituye por estado 'borrador'.
create table pedidos (
  id                          uuid primary key default gen_random_uuid(),
  codigo                      text not null unique,
  estado                      pedido_estado not null default 'borrador',
  creado_por                  uuid not null references usuarios(id),
  vendedora_1_id              uuid references usuarios(id),
  vendedora_contribuyente_id  uuid references usuarios(id),
  vendedora_contribuyente_2_id uuid references usuarios(id),
  agendadora_id               uuid references usuarios(id),
  cliente_id                  uuid references clientes(id),
  fecha_entrega               date,
  tipo_pedido                 tipo_pedido,
  metodo_entrega              metodo_entrega,
  empresa_envio               empresa_envio not null default 'motorizado',
  direccion_entrega           text,
  ciudad                      text,
  ubicacion_maps              text,
  canal_venta                 canal_venta not null default 'whatsapp',
  costo_envio                 numeric(10,2) not null default 0,
  metodo_pago                 metodo_pago,
  partes_a_pagar              int not null default 1 check (partes_a_pagar >= 1),
  monto_primer_pago           numeric(10,2),
  fecha_siguiente_pago        date,
  monto_total                 numeric(10,2) not null default 0,
  resumen_productos           text,
  observaciones               text,
  regalo                      boolean not null default false,
  confirmado_el               timestamptz,
  oculto                      boolean not null default false,
  creado_el                   timestamptz not null default now(),
  actualizado_el              timestamptz not null default now()
);

-- ---------- Viajes ----------
-- Un viaje = una entrega o un recojo de un pedido. Se crea uno automáticamente
-- al confirmar el pedido; los siguientes se agregan por cambios/devoluciones.
create table viajes (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique,
  pedido_id      uuid not null references pedidos(id),
  tipo           viaje_tipo not null,
  motivo_recojo  viaje_motivo_recojo,
  estado         viaje_estado not null default 'programado',
  fecha          date not null,
  motorizado_id  uuid references motorizados(id),
  creado_por     uuid references usuarios(id),
  creado_el      timestamptz not null default now(),
  actualizado_el timestamptz not null default now(),
  constraint chk_motivo_recojo check (
    (tipo = 'entrega' and motivo_recojo is null) or
    (tipo = 'recojo' and motivo_recojo is not null)
  )
);

-- ---------- Detalles de pedido ----------
-- Origen AppSheet: IdDetallePedido, IdPedido, IMEI, Talla, ENTALLE, Talla_Inicial,
-- Cantidad, PrecioUnitario, Subtotal, Descripcion, EXTRA_O_DEL_PEDIDO, Estado,
-- DamaOCaballero, Hora_Registrado, HoraEntallado, HoraEntregado, HoraVuelveStock,
-- Hora_Confirmado, ID_VIAJE
-- Descripcion se quita (join a productos). HoraEntallado/Entregado/VuelveStock
-- pasan a historial_producto_unicos. IMEI es FK a productos.id.
create table detalles_pedido (
  id                 uuid primary key default gen_random_uuid(),
  pedido_id          uuid not null references pedidos(id) on delete cascade,
  producto_id        uuid not null references productos(id),
  talla_stock        uuid references tallas(id),
  talla_vendida      uuid references tallas(id),
  entalle            boolean not null default false,
  cantidad           int not null default 1 check (cantidad >= 1),
  precio_unitario    numeric(10,2) not null default 0,
  subtotal           numeric(10,2) not null default 0,
  genero             genero_prenda not null default 'dama',
  es_extra_motorizado boolean not null default false,
  estado             detalle_estado not null default 'activo',
  viaje_id           uuid references viajes(id),
  anadido_por        uuid references usuarios(id),
  confirmado_el      timestamptz,
  creado_el          timestamptz not null default now(),
  -- talla_stock = la talla que hay en almacén (la que se toma y consume stock);
  -- talla_vendida = lo que pidió el cliente (destino). Por lo general son iguales;
  -- cuando hay entalle difieren. Ambas se llenan juntas (o ninguna, si es sin_talla).
  constraint detalles_pedido_tallas_ambas_o_ninguna check ((talla_stock is null) = (talla_vendida is null))
);

-- ---------- Viaje_Producto_Unico (alistado: escaneo de QRs) ----------
-- Origen AppSheet (en producto_unico): Hora_Asignado, PedidoAsignado,
-- DetalleDePedidoAsignado, FueExtraDeMotorizado, QR_VIAJE.
create table viaje_producto_unicos (
  id                uuid primary key default gen_random_uuid(),
  viaje_id          uuid not null references viajes(id) on delete cascade,
  producto_unico_id uuid not null references productos_unicos(id),
  detalle_pedido_id uuid references detalles_pedido(id),
  estado            viaje_producto_estado not null default 'alistado',
  alistado_por      uuid references usuarios(id),
  fecha_alistado    timestamptz,
  fecha_enviado     timestamptz,
  unique (viaje_id, producto_unico_id)
);

-- ---------- Pagos ----------
-- Origen AppSheet (en pedidos): Deuda1, Fecha1, Pago1, HoraPago1, NumOpera1, Validacion1
create table pagos (
  id               uuid primary key default gen_random_uuid(),
  pedido_id        uuid not null references pedidos(id) on delete cascade,
  monto            numeric(10,2) not null check (monto > 0),
  metodo_pago      metodo_pago not null,
  fecha            timestamptz not null default now(),
  persona_id       uuid references usuarios(id),
  tipo             pago_tipo not null default 'parcial',
  numero_operacion text,
  validacion       text
);

-- ---------- Historial de producto único ----------
-- Origen AppSheet (en producto_unico): Hora_Entallado, Talla_Original,
-- Hora_Devuelto, PedidoDevuelto, DetalleDePedidoDevuelto.
create table historial_producto_unicos (
  id                 uuid primary key default gen_random_uuid(),
  producto_unico_id  uuid not null references productos_unicos(id) on delete cascade,
  evento             producto_unico_evento not null,
  pedido_id          uuid references pedidos(id),
  viaje_id           uuid references viajes(id),
  detalle_pedido_id  uuid references detalles_pedido(id),
  talla_anterior     uuid references tallas(id),
  talla_nueva        uuid references tallas(id),
  fecha              timestamptz not null default now(),
  persona_id         uuid references usuarios(id),
  nota               text
);

-- ---------- Historial de producto (auditoría de IMEI) ----------
create table historial_productos (
  id                uuid primary key default gen_random_uuid(),
  producto_id       uuid not null references productos(id) on delete cascade,
  fecha             timestamptz not null default now(),
  persona_id        uuid references usuarios(id),
  tipo_evento       producto_evento_tipo not null,
  campos_editados   text[] not null default '{}',
  imei              text,
  nombre            text,
  tipo_talla        tipo_talla,
  foto_url          text,
  precio_referencial numeric(10,2)
);

-- ---------- Historial de pedido (cambios de estado) ----------
create table historial_pedidos (
  id              uuid primary key default gen_random_uuid(),
  pedido_id       uuid not null references pedidos(id) on delete cascade,
  estado_anterior pedido_estado,
  estado_nuevo    pedido_estado not null,
  fecha           timestamptz not null default now(),
  persona_id      uuid references usuarios(id),
  motivo          text
);

-- ---------- Configuraciones (admin) ----------
create table configuraciones (
  clave text primary key,
  valor text not null
);

-- ---------- Trigger para actualizar actualizado_el ----------
create or replace function set_actualizado_el()
returns trigger as $$
begin
  new.actualizado_el = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_productos_updated
  before update on productos
  for each row execute function set_actualizado_el();

create trigger trg_productos_unicos_updated
  before update on productos_unicos
  for each row execute function set_actualizado_el();

create trigger trg_pedidos_updated
  before update on pedidos
  for each row execute function set_actualizado_el();

create trigger trg_viajes_updated
  before update on viajes
  for each row execute function set_actualizado_el();

-- ---------- Índices ----------
create index idx_producto_tallas_producto on producto_tallas(producto_id);
create index idx_productos_unicos_producto_talla on productos_unicos(producto_id, talla_id);
create index idx_productos_unicos_estado on productos_unicos(estado);
create index idx_productos_unicos_qr on productos_unicos(codigo_qr);
create index idx_movimientos_stock_producto on movimientos_stock(producto_id, talla_id);
create index idx_movimientos_stock_ref on movimientos_stock(referencia_tipo, referencia_id);
create index idx_pedidos_estado on pedidos(estado);
create index idx_pedidos_fecha_entrega on pedidos(fecha_entrega);
create index idx_pedidos_cliente on pedidos(cliente_id);
create index idx_detalles_pedido_pedido on detalles_pedido(pedido_id);
create index idx_detalles_pedido_producto on detalles_pedido(producto_id);
create index idx_detalles_pedido_viaje on detalles_pedido(viaje_id);
create index idx_pagos_pedido on pagos(pedido_id);
create index idx_viajes_pedido on viajes(pedido_id);
create index idx_viajes_estado on viajes(estado);
create index idx_viajes_fecha on viajes(fecha);
create index idx_viaje_producto_unico_viaje on viaje_producto_unicos(viaje_id);
create index idx_viaje_producto_unico_detalle on viaje_producto_unicos(detalle_pedido_id);
create index idx_historial_producto_unico on historial_producto_unicos(producto_unico_id);
create index idx_historial_productos_prod on historial_productos(producto_id);
create index idx_historial_pedidos_pedido on historial_pedidos(pedido_id);

-- ---------- Vistas de stock ----------
create view v_stock_almacen as
select producto_id, talla_id, count(*)::int as stock_almacen
from productos_unicos
where estado = 'en_almacen'
group by producto_id, talla_id;

create view v_stock_reservado as
select d.producto_id, d.talla_stock, sum(d.cantidad)::int as stock_reservado
from detalles_pedido d
join pedidos p on p.id = d.pedido_id
where d.estado = 'activo'
  and p.estado in ('solicitado', 'confirmado')
group by d.producto_id, d.talla_stock;

create view v_stock_comercial as
select
  a.producto_id,
  a.talla_id,
  coalesce(a.stock_almacen, 0) as stock_almacen,
  coalesce(r.stock_reservado, 0) as stock_reservado,
  coalesce(a.stock_almacen, 0) - coalesce(r.stock_reservado, 0) as stock_comercial
from v_stock_almacen a
left join v_stock_reservado r
  on r.producto_id = a.producto_id and r.talla_id = a.talla_id;

-- Equivalente a la hoja AppSheet "ProductosxTalla"
-- (id_ImeiTalla, IMEI, Descripcion, Talla, Cantidad, Precio, Imagen)
create view v_productosx_talla as
select
  p.id as producto_id,
  pt.id as id_imei_talla,
  p.imei,
  p.nombre as descripcion,
  t.nombre as talla,
  coalesce(c.stock_comercial, 0) as cantidad,
  coalesce(c.stock_almacen, 0) as stock_almacen,
  p.precio_referencial as precio,
  p.foto_url as imagen
from producto_tallas pt
join productos p on p.id = pt.producto_id
join tallas t on t.id = pt.talla_id
left join v_stock_comercial c
  on c.producto_id = p.id and c.talla_id = t.id
where p.estado = 'activo';

-- Pedidos con deuda pendiente (Equivalente a Deuda1 de AppSheet)
create view v_pedidos_pendientes_pago as
select
  p.id as pedido_id,
  p.codigo,
  p.estado,
  p.cliente_id,
  p.monto_total,
  coalesce(sum(pg.monto), 0) as total_pagado,
  p.monto_total - coalesce(sum(pg.monto), 0) as deuda
from pedidos p
left join pagos pg on pg.pedido_id = p.id
where p.estado <> 'borrador'
group by p.id;

-- ---------- Seeds ----------
insert into tallas (tipo, nombre, orden) values
  ('A', 'XS', 1),
  ('A', 'S',  2),
  ('A', 'M',  3),
  ('A', 'L',  4),
  ('A', 'XL', 5),
  ('A', 'XXL', 6),
  ('B', '26', 1),
  ('B', '28', 2),
  ('B', '30', 3),
  ('B', '32', 4),
  ('B', '34', 5),
  ('B', '36', 6),
  ('C', '2', 1),
  ('C', '4', 2),
  ('C', '6', 3),
  ('C', '8', 4),
  ('C', '10', 5),
  ('C', '12', 6),
  ('C', '14', 7),
  ('C', '16', 8);

insert into configuraciones (clave, valor) values
  ('dias_para_cerrar_pedido', '30');

-- ---------- Admin inicial (CÁMBIALO después de entrar) ----------
-- Login: DNI 00000000 / admin123
-- Nota: la contraseña se guarda en texto plano (MVP).
insert into usuarios (dni, nombre, apellido, password, rol, estado)
values ('00000000', 'Admin', 'Persys', 'admin123', 'admin', 'activo');

-- ---------- Row Level Security ----------
-- El acceso se hace desde el servidor con la anon key (API routes de Next.js).
-- Para este MVP se otorga acceso completo; para producción conviene
-- restringir con políticas más finas.
do $$
declare
  t text;
begin
  foreach t in array array['usuarios','tallas','productos','producto_tallas','productos_unicos',
                          'clientes','pedidos','viajes','detalles_pedido','viaje_producto_unicos',
                          'pagos','movimientos_stock','historial_productos','historial_producto_unicos',
                          'historial_pedidos','configuraciones','motorizados']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "app_full_access" on %I;', t);
    execute format(
      'create policy "app_full_access" on %I for all to anon, authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;
