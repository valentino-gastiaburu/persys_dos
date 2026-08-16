# Persys_dos — Contexto del proyecto

> Bitácora resumida: decisiones del usuario, respuestas a preguntas y estado actual.
> Última actualización: 16/ago/2026.

## Qué es Persys_dos

Sistema de **ventas / inventario / distribución** (Next.js + Supabase) para una empresa de
**calzado y ropa**, con login por **DNI + contraseña** y flujo completo: productos con stock
por talla y QR, pedidos, pagos, viajes de almacén (entrega/recojo), clientes, usuarios y
configuración.

- App Next.js 16.3.0 (App Router, TypeScript, Tailwind v4)
- Backend: API routes en `src/app/api/**`
- BD: Supabase (Postgres) con enums/triggers/vistas definidos en `supabase/02_schema.sql`
- Auth: JWT (HS256, librería `jose`), cookie `persys_session`, helpers en `src/lib/auth.ts`

## Decisiones que tomó el usuario (respuestas a mis preguntas)

1. **`supabase/02_schema.sql` es el schema CORRECTO** — todo lo necesario para crear la BD vive en
   la carpeta `supabase/` (`01_reset.sql` + `02_schema.sql`). La antigua carpeta `db/` se eliminó.
2. **Roles**: `vendedora`, `agendadora`, `almacen`, `controller`, `admin`.
3. El negocio maneja **ropa** (tallas seed XS–XXL / 26–36 / 2–16), no calzado 35–48.
4. Corre los scripts SQL él mismo en el **SQL Editor** de Supabase (yo le doy el contenido).
5. Al probar la BD dijo "no está vacía": aclaramos que **solo hay datos semilla**
   (1 admin + 20 tallas + 1 config), sin datos de negocio; re-correr los scripts no pierde nada.
6. Preferencia de UI: las listas en **cuadrícula compacta** (más elementos por pantalla),
   no tarjetas anchas de ancho completo (aplicado a pedidos, pagos, productos, clientes, viajes).
7. Para herramientas de prueba prefirió **códigos aleatorios** en vez de basarse en la hora
   (chocaban entre corridas).
8. Sección **Productos** rediseñada (14/ago/2026): vista "Lista" con **3 tablas al lado
   (talla A / B / C)** donde las columnas son las tallas y la celda es el **conteo de
   productos_unicos** de ese producto en esa talla (todas las unidades que existen,
   excepto las `eliminado` — no solo las `en_almacen`). Y pestaña "Crear producto nuevo"
   con **tipo de talla multi-selección** (A/B/C simultáneos → combos AB/AC/BC/ABC). Un
   producto nuevo nace con **0 unidades** en todas sus tallas; el stock solo se llena
   registrando tandas en Productos Únicos → "Añadir stock".
9. Formulario **Nuevo pedido** (14/ago/2026): cliente con autocompletado en vivo y
   "Agregar nuevo número"; fecha de entrega pasada se marca en rojo (aviso, no bloquea);
   tipo de pedido controla método de entrega (envío→Agencia/A domicilio, visita→A
   domicilio/Local PERI) y empresa de envío (envío→Olva/Shalom/Otros, visita→Motorizado);
   producto se busca escribiendo; cantidad limitada al stock disponible por talla.
   Lista de pedidos en tabla (fecha entrega, código, cliente, n°, resumen, vendedora,
   total, deuda, estado).
10. `Input` de `components/ui.tsx` acepta `danger` (borde/focus rojo) para estados de error.
11. **Equipo del pedido** (15/ago/2026): al crear pedido se piden **Vendedora**, **Vendedora que
    colaboró 1** y **Vendedora que colaboró 2** (por defecto = quien crea el pedido; se puede
    cambiar a cualquier vendedora activa). La **Agendadora** no se muestra en el formulario de
    creación; queda guardada (por defecto = quien crea) y solo se ve en el **detalle del pedido**.
    Se agregaron columnas `vendedora_contribuyente_2_id` y `agendadora_id` (migración
    `supabase/05_pedidos_equipo.sql`) y endpoints `/api/auth/me` y `/api/vendedoras`.
12. **Stock ventas** (15/ago/2026): en Productos → Lista hay un toggle **"Stock almacén" /
    "Stock ventas"**. El stock ventas (comercial) = unidades por talla − las comprometidas
    en **pedidos realizados**. Reservan stock los estados activos (`solicitado`,
    `confirmado`, `alistado`, `enviado`, `entregado`, `cerrado`, `esperando_devolucion`,
    `esperando_cambio`); **NO reservan** `borrador`, `cancelado` ni `devuelto`.
    Se calcula en `getStockVentasPorTalla` (`src/lib/productos.ts`) y se entrega como
    `stock_ventas` en `GET /api/productos` y como `cantidad_ventas` en `GET /api/tallas`.
    En la vista ventas el número sale **azul** si hay disponible, **gris** si es 0 y
    **rojo** si es negativo (se vendió más de lo que hay).
    **Regla de negocio:** TODAS las validaciones de pedidos usan el stock de ventas, no el
    de almacén: el select de tallas del pedido (`nuevo` y el modal de editar) solo ofrece
    tallas con disponible > 0, y `POST/PATCH .../detalles` validan contra
    `getStockVentasPorTalla`.
    **Ojo:** la vista SQL `v_stock_comercial` (reserva solo solicitado/confirmado y parte de
    `en_almacen`) NO se usa; la regla única de stock ventas vive en JS
    (`getStockVentasPorTalla` en `src/lib/productos.ts`). No hay vista ni función SQL de stock
    (se descartó la migración `06_stock_ventas.sql` por decisión del usuario).
13. **Batch de pedido + validación de stock en el click** (16/ago/2026): al dar click en
    "Guardar Pedido" o "Terminar después" se manda **todo en un solo request**
    (`POST /api/pedidos`): datos del pedido + `lineas[]` + flag `confirmar`. El servidor
    **relee la BD en ese momento** (`validarStockLineas` en `lib/productos.ts`) y valida el
    lote completo por resta contra el stock de ventas: si alguna talla quedaría en
    **negativo**, no se crea nada y se responde `{ conflictos }` (producto/talla + pedidos
    que ya lo reservaron: código, estado, cliente, cantidad) → el cliente muestra un modal.
    Si pasa, se crea el pedido en **`borrador`** con todos sus detalles de una vez; si
    `confirmar=true` se confirma en la misma llamada (estado `confirmado` + viaje; lógica
    compartida `confirmarPedido` en `lib/pedidos.ts`) y, si la confirmación falla, se borra
    el pedido (todo-o-nada). **Decisión del usuario:** concurrencia solo en JS, sin función
    ni vista SQL (se acepta una ventana mínima de carrera de milisegundos). Por eso se
    descartó el RPC `agregar_detalle_pedido` (migración `06`) y el endpoint
    `POST /api/pedidos/validar` (su lógica se absorbió en el batch).
14. **Modal "Editar productos" en lote** (16/ago/2026): agregar/editar/quitar dentro del
    modal es **solo local** (nada toca la BD al instante). El disponible de cada talla se
    calcula en cliente: `cantidad_ventas + liberadas pendientes − agregadas pendientes`
    (`cantidad_ventas` ya excluye las líneas del propio pedido). Todo se aplica al presionar
    **"Listo"** (DELETEs → PATCHs → POSTs, en ese orden); si algo falla, el modal queda
    abierto con el error y no se cierra. También se valida localmente que ningún
    (producto,talla) quede negativo antes de aplicar.
15. **"Terminar después" → pedido `borrador`** (16/ago/2026): crea el pedido en **borrador**
    (no reserva stock, no exige cliente/fecha). "Guardar Pedido" → crea y confirma en un
    solo paso (exige cliente + fecha de entrega). Corrige la inconsistencia pre-existente:
    el POST insertaba `solicitado` siempre. La lista de pedidos ahora filtra por
    **Borrador** (badge gris) y el detalle de un borrador permite "Confirmar pedido".
16. **El entalle NO es un true/false** (16/ago/2026): es un **campo con otra talla**.
    - **`talla_stock`** = la talla que hay en almacén (origen): la unidad física que se
      toma y la que **consume stock**. Siempre se llena.
    - **`talla_vendida`** = lo que pidió el cliente (destino). Por lo general es igual a
      `talla_stock`; cuando hay entalle son distintas. **Siempre se llena** también: si el
      checkbox "Entallar a" no está marcado, se guarda automáticamente el mismo valor que
      `talla_stock`. No está limitada por el stock (cualquier talla puede convertirse en esta).
    - `entalle = (talla_stock != talla_vendida)`, derivado al insertar/actualizar.
    - Columnas renombradas en `detalles_pedido` por migración **`supabase/07_talla_stock_vendida.sql`**:
      `talla_inicial` → `talla_stock`, `talla_id` → `talla_vendida` (constraints renombrados a
      `detalles_pedido_talla_stock_fkey` / `detalles_pedido_talla_vendida_fkey`). Invariante:
      ambas se llenan juntas (o ninguna, para productos `sin_talla`). `02_schema.sql` ya usa los
      nombres nuevos (solo aplica 07 en la BD existente).
    - UI nuevo pedido y modal "Editar productos": **"Talla"** = talla stock (solo tallas con
      stock disponible) + checkbox **"Entallar a"** que habilita el select **"Talla a
      entallar"** (destino, todas las tallas del producto, default = la talla de stock).
    - Alistar: la unidad escaneada debe tener `talla_id == talla_stock`; luego se modifica a
      `talla_vendida` si difieren (`talla_original` guarda la previa, evento `entallado`).
    - Muestra: pedido y viaje muestran `talla_stock → talla_vendida` cuando hay entalle.
17. **El pedido es una colección de viajes** (16/ago/2026): cuando está **`entregado`** (o
    `esperando_*`/`cerrado`) la **única forma de modificarlo es con viajes**, no con "Editar
    productos". Creadores: vendedora, agendadora, controller, admin (API `POST /api/viajes`).
    - **Viaje de entrega extra** (agrega productos): fecha, dirección (default la del pedido) y
      costo de envío propios; valida stock como pedido nuevo. Prohibido en borrador/solicitado/
      cancelado/devuelto (el primer viaje lo crea "Confirmar pedido"). Su costo de envío **sí
      suma** al total.
    - **Viaje de regreso / recojo** (quita productos, motivo `devolucion`/`cambio`): solo en
      pedidos entregados. Al crearlo, cada línea original **reduce su cantidad** (si se devuelve
      toda la línea pasa a `oculto`) y nace una línea espejo `pendiente_devolucion` con
      `devolucion_de` → original. Devolución **parcial** soportada. Por prenda se edita el
      **costo a devolver** (default precio original, **0 permitido**). Al terminar el recojo las
      líneas pasan a `devuelto` y las unidades vuelven a almacén **con su talla actual** (no se
      restaura la talla original). El `costo_envio` del regreso es **informativo**, no se descuenta.
    - **Totales:** cada viaje tiene su propio `total` (Σ subtotales + costo_envio en entregas).
      `monto_total` del pedido = Σ entregas **−** Σ regresos (`calcularTotalPedido`).
    - **Estado del pedido:** rank mínimo entre viajes de entrega (`programado`→confirmado,
      `alistado`→alistado, `enviado`→enviado, todos terminados→entregado); recojo pendiente →
      `esperando_devolucion`/`esperando_cambio`. Un entregado con viaje extra vuelve a confirmado.
    - Migración **`supabase/08_viajes_extras.sql`** (a correr por el usuario): añade
      `viajes.costo_envio/total/direccion`, `detalles_pedido.devolucion_de` y los estados de
      detalle `pendiente_devolucion`/`devuelto`, con backfill del `total` del viaje original.

## Preguntas respondidas en el camino (resumen técnico)

- **¿Por qué `GET /api/auth/me` daba 401?** No era bug del app: (a) el cliente de prueba no
  guardaba la cookie `Secure` sobre `http://`, y (b) el server de `:3000` era un build viejo.
  Reconstruyendo y reiniciando funcionó. Flujo sesión verificado con cookie.
- **¿Por qué fallaba agregar detalle de pedido?** Error de PostgREST: `detalles_pedido` tiene
  **dos** FKs a `tallas` (`talla_stock` y `talla_vendida`) → embed ambiguo. Se arregló usando
  hint `tallas!detalles_pedido_talla_vendida_fkey(nombre)` en los selects.
- **¿Por qué faltaba la columna en la lista de pedidos?** `resumen_productos` no existía en
  `supabase/02_schema.sql` (la usaba el código). Se agregó la columna al schema y se re-corrió.
- **¿Por qué el PATCH del viaje fallaba en el smoke test?** El script enviaba POST (curl `-d`
  implica POST) a una ruta que solo implementa PATCH → 405 con cuerpo vacío. Artefacto del test.
- **Login con curl daba 500?** Artefacto de comillas de PowerShell al pasar `-d '...'`;
  usando body desde archivo (`-d @file`) funcionó. No era del app.

## Bugs corregidos (de esta fase)

1. `pedidos.resumen_productos` faltaba en `supabase/02_schema.sql` → se agregó (columna `text`).
2. Embed ambiguo `detalles_pedido → tallas` (doble FK) → hint `!detalles_pedido_talla_vendida_fkey`
   en: `lib/pedidos.ts`, `api/viajes/[id]/route.ts`, `api/viajes/[id]/alistar/route.ts`,
   `api/pedidos/[id]/confirmar/route.ts`, `api/pedidos/[id]/detalles/route.ts`,
   `api/pedidos/[id]/detalles/[detalleId]/route.ts`.
3. `GET /api/pedidos` daba 500 ("Error de base de datos"): PostgREST rechaza `.or(...)` con **una
   sola condición** (`failed to parse logic tree`). Se reemplazó por filtros encadenados
   (`.eq`/`.neq`/`.gt`). También `GET /api/tallas` y `GET /api/tandas` usaban `.order("tallas(orden)")`
   (sintaxis inválida en este PostgREST) → cambiadas a `.order(..., { foreignTable: ... })`.

## Scripts SQL (los corre el usuario en el SQL Editor)

1. `supabase/01_reset.sql` → borra todo (tablas, vistas, tipos) para poder recrear.
2. `supabase/02_schema.sql` → schema correcto + seeds (tallas, config, admin) + RLS + trigger.
3. `supabase/03_tandas.sql` → tabla `tandas` + `productos_unicos.tanda_id` (para "Añadir stock").
4. `supabase/04_tallas.sql` → agrega `AB` y `ABC` al enum `tipo_talla` (para multi-talla).
5. `supabase/05_pedidos_equipo.sql` → agrega `pedidos.vendedora_contribuyente_2_id` y
   `pedidos.agendadora_id` (para el equipo de vendedoras del pedido).
6. `supabase/07_talla_stock_vendida.sql` → renombra en `detalles_pedido`: `talla_inicial` →
   `talla_stock` y `talla_id` → `talla_vendida` (+ constraints y backfill). Para la **BD
   existente**; en una BD nueva ya vienen con ese nombre en `02_schema.sql`.
7. `supabase/08_viajes_extras.sql` → pedido = colección de viajes: agrega a `viajes`
   `costo_envio`/`total`/`direccion`, a `detalles_pedido` `devolucion_de`, y los estados
   `pendiente_devolucion`/`devuelto` al enum `detalle_estado` (+ backfill del total del
   viaje de entrega original). Aditiva/idempotente.

Para una BD nueva: **01 → 02 → 03 → 04 → 05 → 08** (07 no hace falta). Para la BD existente: basta
correr **03, 04, 05, 07 y 08** (aditivas/idempotentes; no tocan datos).
(La migración `06_stock_ventas.sql` se creó y luego **se eliminó**: la regla de stock ventas
es 100% JS, `getStockVentasPorTalla`, sin vista ni función SQL.)

## Smoke test E2E (validado OK contra la BD real)

Flujo completo probado vía API: login → crear producto → +stock 5 unidades (QRs) →
crear cliente → pedido borrador → agregar detalle → confirmar (crea viaje + resumen +
monto 189.80) → alistar 2 QRs → viaje alistado → enviado → terminado → pedido **entregado**
→ 2 pagos (50 + 139.80). Script: `C:\Users\valen\AppData\Local\Temp\opencode\smoke.ps1`.

## Credenciales / accesos

- URL app local: `http://localhost:3000`
- Admin de prueba: DNI `00000000` / `admin123` (seed en `supabase/02_schema.sql`; en texto plano, MVP).
- Supabase (proyecto `ysuaeknqyujpphpkrwpb`):
  - URL: `https://ysuaeknqyujpphpkrwpb.supabase.co`
  - ANON key (publishable): `sb_publishable_mi7JNq1TrCgZdHyg2VZXlA_i2B3qPMv`
- `.env.local`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `AUTH_SECRET=persys-super-secret-change-me`.
- Servidor de producción `next start` corriendo en `:3000` (logs en
  `C:\Users\valen\AppData\Local\Temp\opencode\persys-out.log` / `persys-err.log`).

## Enums clave (supabase/02_schema.sql)

- `pedido_estado`: borrador, solicitado, confirmado, alistado, enviado, entregado, cerrado,
  cancelado, devuelto, esperando_devolucion, esperando_cambio
- `tipo_pedido`: envio, visita · `metodo_entrega`: a_domicilio, agencia, local_peri
- `empresa_envio`: motorizado, olva, shalom, otros · `canal_venta`: whatsapp, facebook,
  instagram, tiktok, telefono, otro
- `metodo_pago`: yape, bcp, interbank, bbva, scotiabank, plin, banco_nacion, tarjeta_link, efectivo
- `viaje_tipo`: entrega, recojo · `viaje_estado`: programado, alistado, enviado, terminado
- `viaje_motivo_recojo`: devolucion, cambio
- `tipo_talla`: A, B, C, AB, AC, BC, ABC, sin_talla (A=XS..XXL, B=26..36, C=2..16)
- `detalle_estado`: activo, oculto, **pendiente_devolucion, devuelto** (añadidos por `08`)

## Flujo de estados del pedido

- **Nace como `borrador`** con "Terminar después" (POST /api/pedidos con `confirmar=false`,
  no reserva stock) o como **`solicitado`** con "Guardar Pedido" (`confirmar=true`: reserva
  stock y calcula resumen + total; **NO** crea viaje ni confirma).
- La confirmación es un paso aparte (botón "Confirmar pedido", `POST
  /api/pedidos/[id]/confirmar` → `confirmarPedido`): crea el viaje de entrega, calcula
  resumen/total si faltan y registra el primer pago.
- Transiciones **manuales** (tabla de pedidos y detalle, vía `POST /api/pedidos/[id]/estado`):
  - `solicitado` → `confirmado` (botón Confirmar, usa `/confirmar`), `cancelado`
  - `confirmado` → `solicitado` (Volver a Solicitar), `cancelado`
- Transición **automática** (`syncEstadoPedidoPorViajes` en `lib/pedidos.ts`): **rank mínimo
  entre viajes de entrega** — el pedido sigue al viaje MENOS avanzado (`programado`→`confirmado`,
  `alistado`→`alistado`, `enviado`→`enviado`, todos `terminado`→`entregado`). Con **recojo
  pendiente** → `esperando_devolucion`/`esperando_cambio` (manda por encima de todo). Sin viajes
  → `confirmado`. Así un pedido entregado que recibe un viaje de entrega extra vuelve a
  `confirmado` hasta que todos sus viajes avancen.

## GitHub

- Repo: `https://github.com/valentino-gastiaburu/persys_dos` (remoto `origin`, rama `main`,
  primer commit `bdd4bd2` pusheado el 12/ago/2026).

## Pendientes / notas

- Las migraciones `03_tandas`, `04_tallas`, `05_pedidos_equipo` **ya están corriendo en
  Supabase** (el usuario las corrió el 16/ago/2026). "Añadir stock", tallas AB/ABC y el
  equipo de vendedoras ya funcionan.
- **`supabase/07_talla_stock_vendida.sql`** ya la corrió el usuario (16/ago/2026):
  `detalles_pedido` usa `talla_stock`/`talla_vendida` en Supabase. Verificado vía
  REST (`select=talla_stock,talla_vendida,entalle`).
- El smoke test dejó **datos de prueba** en la BD (productos/clientes/pedidos con "SMOKE").
  Preguntar al usuario si limpiarlos.
- **`supabase/08_viajes_extras.sql` está pendiente de correr** por el usuario en el SQL Editor
  (implementación lista en código). Hasta que se corra, `viajes.total/costo_envio/direccion`,
  `detalles_pedido.devolucion_de` y los estados `pendiente_devolucion`/`devuelto` no existen
  en la BD y la feature de viajes extras no funciona.
- La ruta `detalles/route.ts` devuelve el mensaje de Postgres en errores (útil para debug;
  se puede quitar si prefiere mensajes genéricos).
- Evaluar bucket de Supabase Storage para `productos.foto_url` (no implementado).
