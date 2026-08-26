# Persys_dos — Contexto del proyecto

> Bitácora resumida: decisiones del usuario, respuestas a preguntas y estado actual.
> Última actualización: 20/ago/2026.

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
18. **Fechas de devolución** (16/ago/2026): en los viajes de regreso hay dos fechas:
    - `viajes.fecha` = **fecha programada** para el recojo/devolución (se pide en el modal
      "Viaje de regreso").
    - `viajes.fecha_devolucion` = **fecha efectiva** en la que almacén terminó el recojo
      (escaneó el QR y la prenda volvió al stock). Se registra automáticamente al marcar el
      viaje de regreso como `terminado`. Migración **`supabase/09_fechas_devolucion.sql`**.
19. **Módulo Almacén/Viajes rediseñado** (16/ago/2026):
    - La lista de viajes **resalta los de hoy** (fondo azul + badge "Hoy") y los ordena primero.
    - El detalle del viaje usa **tablas**:
      - **Productos a alistar:** columnas IMEI, TALLA (talla stock = original), CANTIDAD
        (progreso alistadas/total) y **ENTALLAR A:** (talla vendida destino, solo si hay entalle).
      - **Unidades alistadas:** columnas IMEI, TALLA (original), ENTALLAR A: (destino si se
        entalló) e ID PRODUCTO ÚNICO (QR), con badge "pendiente" para las no guardadas aún.
    - **Alistado local (sin tocar BD):** al seleccionar un producto, las unidades se agregan a
      una lista local `pendientes` (vía buscador con autocompletado o escaneo por cámara).
      Nada se guarda en BD hasta presionar **"Marcar como alistado"**, que envía todas en
      **un solo request** (`POST /api/viajes/[id]/alistar/batch`). Si quedan unidades sin
      completar, solo guarda; si TODAS las unidades del viaje están alistadas, además pasa el
      viaje a `alistado` automáticamente (opción B aprobada por el usuario).
    - **Buscador con autocompletado:** al hacer click en el buscador se despliegan las
      unidades disponibles del producto seleccionado; al escribir filtra en vivo por código QR
      o IMEI (`GET /api/viajes/[id]/stock?detalle_id=&q=`). Botón **"📷 Escanear con cámara"**
      (librería `html5-qrcode`) agrega la unidad escaneada a la lista local.
    - Nuevo endpoint **`POST /api/viajes/[id]/alistar/batch`**: guarda múltiples unidades de
      una vez, valida cada una (producto/talla/estado/duplicados) y responde cuáles se
      guardaron y cuáles fallaron.

20. **Editar pedido: bloqueado tras crear viaje** (20/ago/2026): una vez que un pedido tiene
    al menos un viaje asociado (entrega o recojo), `puedeEditar = false` siempre. El usuario
    solo puede **gestionar viajes** (crear viaje extra o viaje de regreso) desde el botón
    "Gestionar viajes". La tabla de detalles del pedido se oculta; se muestra una tarjeta por
    viaje con sus productos.

21. **Cancelar viaje de entrega: sin auto-restore de stock** (20/ago/2026): al cancelar un viaje
    de entrega, los productos **NO se restauran automáticamente** a `en_almacen`. Quedan donde
    estén (`almacen_espera` si estaban alistados, `en_viaje` si estaban enviados, etc.) hasta
    que personal de almacén los devuelva manualmente via la sección **"Pendientes a regresar
    al stock"**. Solo se desvinculan los detalles del viaje (se ponen `viaje_id = null`). Si
    es un viaje de recojo, los detalles originales se restauran (cantidades y estado) y los
    detalles del recojo se eliminan.

22. **Retorno de stock manual (retorno-stock)** (20/ago/2026): nuevo endpoint
    `POST /api/viajes/[id]/retorno-stock` que permite devolver productos al almacén desde
    **cualquier viaje** que tenga unidades pendientes (cancelados o recojos activos). Acepta
    escaneo QR (`codigo_qr`) o búsqueda manual (`producto_id + talla_id`). Marca la VPU como
    `devuelto`, restaura el `productos_unico` a `en_almacen`, crea kardex entrada + historial.
    Roles: `almacen`, `controller`, `admin`.

23. **Sección "Pendientes a regresar al stock"** (20/ago/2026): en Almacén/Viajes, tabla amber
    que muestra viajes con `pendientes_retorno > 0` (VPU alistado/enviado sin devolver). Solo
    muestra viajes **cancelados** o de **recojo activo** (no viajes de entrega activos). Incluye
    un **panel inline** con escaneo HTML5Qrcode y búsqueda manual que llama a
    `POST /retorno-stock`. Al completar, la tabla se actualiza en tiempo real.

24. **API GET /api/viajes retorna `pendientes_retorno`** (20/ago/2026): cada viaje en la lista
    incluye `pendientes_retorno` (count de VPU no-devueltos, filtrado por viaje cancelado o
    recojo activo). Almacén usa este dato para mostrar la sección amber.

25. **toggleRecojo usa `det.genero`** (20/ago/2026): al marcar/desmarcar recojo en el detalle
    del viaje, se usa el género del detalle (`det.genero`) en vez de hardcodear `"dama"`.

26. **Historial al cancelar** (20/ago/2026): al cancelar un viaje se llama
    `registrarHistorialPedido` si el estado del pedido cambió, y se registra en
    `historial_producto_unicos` (evento "cancelado") para cada VPU del viaje.

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
8. `supabase/09_fechas_devolucion.sql` → agrega `viajes.fecha_devolucion` (fecha efectiva
   de devolución, cuando el recojo termina). Aditiva/idempotente.
9. `supabase/10_inconsistencias.sql` → tabla `inconsistencias` para registrar problemas del
   sistema (pedido cancelado con stock, fechas inválidas, etc.). Tipos: `pedido_cancelado_stock`,
   `pedido_fecha_entrega`, `viaje_devolucion_passada`, `pago_fecha_passada`,
   `detalle_devolucion_horfana`.
10. `supabase/11_trigger_inconsistencias_cancelacion.sql` → trigger `on_pedido_cancelado_stock`:
    cuando un pedido se cancela y tiene unidades alistadas en viajes, crea una inconsistencia
    tipo `pedido_cancelado_stock`.
11. `supabase/12_add_viaje_cancelado.sql` → agrega `'cancelado'` al enum `viaje_estado`.
12. `supabase/13_add_viaje_exceso_alistado.sql` → agrega `'viaje_exceso_alistado'` al check
    constraint de `inconsistencias.tipo`.
13. `supabase/14_drop_rls_inconsistencias.sql` → desactiva RLS en `inconsistencias` (anon
    necesita INSERT/UPDATE sin restricciones).
14. `supabase/15_viaje_recojo_pendiente.sql` → agrega `'pendiente'` al enum
    `viaje_producto_estado` (pre-asignación de productos para recojo).

**Estado de migraciones en Supabase:** 03–15 + 07 ya corrieron. Para una BD nueva:
**01 → 02 → 03 → 04 → 05 → 08 → 09 → 10 → 11 → 12 → 13 → 14 → 15** (07 no hace falta,
porque `02_schema.sql` ya trae `talla_stock`/`talla_vendida`). Para la BD existente: todas
ya corrieron (aditivas/idempotentes; no tocan datos).

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

## Reglas de negocio importantes

- **Cancelar viaje de entrega NO restaura stock**: los productos quedan donde estén hasta que
  almacén los devuelva manualmente via la sección "Pendientes a regresar al stock"
  (`POST /api/viajes/[id]/retorno-stock`). Esto evita restauraciones automáticas incorrectas.
- **Stock ventas** (`getStockVentasPorTalla`): = `getConteoPorTalla()` (solo `en_almacen`) −
  `getComprometidasPorTalla()` (detalles activos de pedidos activos − VPU ya alistados). Evita
  doble descuento: una vez alistado, el producto físico salió de almacén y ya no compite por
  stock de ventas.
- **`sincronizarTotalesPedido`** solo suma viajes de entrega (`.eq("tipo", "entrega")`) excluyendo
  cancelados. Los viajes de recojo se restan al calcular `calcularTotalPedido`.
- **`recalcularEstadoViaje`**: si hay exceso de alistado (más VPU que unidades pedidas), crea
  inconsistencia tipo `viaje_exceso_alistado`. Si todas las líneas están cubiertas y el viaje
  está `programado`, lo pasa a `alistado` automáticamente.
- **`productos_unicos` estados relevantes**: `en_almacen` (stock disponible), `almacen_espera`
  (alistado pero no enviado), `en_viaje` (enviado), `entregado`, `eliminado`.
- **`viaje_producto_unicos`**: `pendiente` → `alistado` (al escanear) → `enviado` (al enviar) →
  `devuelto` (al terminar recojo o via retorno-stock). Los VPU pendientes en viajes cancelados
  o recojos activos aparecen en la sección "Pendientes a regresar al stock".
- **Edición de viaje alistado (VPU-aware)** (22/ago/2026):
  - Reducir cantidad con VPU asignado → exceso se pinta rojo, pasa a "Pendientes de devolver".
  - Eliminar (✕) con VPU → cantidad = 0, todos los VPUs quedan como pendientes de devolver.
  - Sin duplicados: no dos detalles con mismo `producto_id + talla_stock + talla_vendida`.
  - Si se normaliza (cantidad = vpu_count), sale del estado rojo.
  - Pedido muestra "Pendiente de retiro de productos" y **bloquea** cualquier cambio de estado.
  - `vpus_a_restar` y `detalles_a_desvincular` handlers eliminados del PATCH /api/viajes/[id].
  - Handler alistado re-vincula huérfanos, actualiza cantidades (incluyendo 0), inserta nuevos, elimina sin VPU.
  - `detalles_a_desvincular` handler se mantiene para backward compat pero el frontend ya no lo envía.
- **`tienePendientesRetiro(pedidoId)`** en `src/lib/pedidos.ts`: retorna número de VPUs excedentes
  (vpu_count > cantidad) en viajes activos. Se usa para bloquear estados del pedido.
- **Bloqueo de estado del pedido**: `/api/pedidos/[id]/estado` y `/confirmar` verifican
  `tienePendientesRetiro` antes de procesar. Badge rojo visual en detalle del pedido.
- **Migración 16** (`supabase/16_cantidad_cero.sql`): `CHECK (cantidad >= 0)` — permite cantidad = 0.

## GitHub

- Repo: `https://github.com/valentino-gastiaburu/persys_dos` (remoto `origin`, rama `main`,
  primer commit `bdd4bd2` pusheado el 12/ago/2026).

## Pendientes / notas

- **`supabase/07_talla_stock_vendida.sql`** ya la corrió el usuario (16/ago/2026):
  `detalles_pedido` usa `talla_stock`/`talla_vendida` en Supabase. Verificado vía
  REST (`select=talla_stock,talla_vendida,entalle`).
- **`supabase/08_viajes_extras.sql`** ya la corrió el usuario (20/ago/2026):
  `viajes.total/costo_envio/direccion`, `detalles_pedido.devolucion_de` y los estados
  `pendiente_devolucion`/`devuelto` existen en la BD. Viajes extras y recojos funcionan.
- **`supabase/09_fechas_devolucion.sql`** ya la corrió el usuario (16/ago/2026):
  `viajes.fecha_devolucion` existe en la BD y la fecha efectiva de devolución se registra
  al terminar un recojo.
- La ruta `detalles/route.ts` devuelve el mensaje de Postgres en errores (útil para debug;
  se puede quitar si prefiere mensajes genéricos).
- Evaluar bucket de Supabase Storage para `productos.foto_url` (no implementado).
- **⚠️ Caché de Turbopack**: Si cambiaste código en `src/lib/` y el cambio no se refleja
  en runtime, **reiniciar `next dev`**. Turbopack a veces no recarga módulos importados
  por API routes durante hot-reload. Causó debugging innecesario el 16/ago/2026.

## Wipe de BD (procedimiento de testing)

Se hizo wipe completo 3 veces (20–22/ago/2026) para testing limpio. Procedimiento vía REST:
1. `DELETE FROM viaje_producto_unicos WHERE id = neq.0000...` (curl)
2. `UPDATE productos_unicos SET estado = 'en_almacen' WHERE estado = neq.en_almacen` (curl)
3. `DELETE FROM historial_producto_unicos` (curl)
4. `DELETE FROM historial_pedidos` (curl)
5. `DELETE FROM pagos` (curl)
6. `DELETE FROM detalles_pedido` (curl)
7. `DELETE FROM viajes` (curl)
8. `DELETE FROM pedidos` (curl)

**NOTA:** El wipe NO toca las migraciones (03, 04, 05, 07, 08, 09). Solo limpia datos.
**NOTA:** El orden importa por FK constraints: historial → pagos → detalles → viajes → pedidos.

## Aprendizajes de la sesión 22/ago/2026

### Consistencia de estado viaje ↔ VPUs
- **Regla:** Un viaje `alistado` SIN VPUs activos es inconsistente → revertir a `programado`.
  Implementado en PATCH `/api/viajes/[id]` al final del handler `alistado`: si count VPUs
  no-devueltos = 0 → update estado a `programado` + `syncEstadoPedidoPorViajes`.
- **Optimización:** Si el viaje es `alistado` pero tiene 0 VPUs activos, el PATCH lo trata
  como `programado` (reemplazo total: delete all + insert). Esto evita la lógica de
  reconciliación compleja del handler `alistado` que causaba duplicación de detalles.

### Detalles zombie (cantidad=0 sin VPU)
- El handler `alistado` actualizaba detalles a `cantidad=0` pero NUNCA los eliminaba si su
  key seguía en el array `lineas`. **Fix:** después de procesar lineas, eliminar detalles
  con `cantidad=0` y sin VPUs activos (no devueltos).
- El GET `/api/pedidos/[id]` ahora filtra detalles `cantidad=0` + `vpu_count=0` para que
  no se muestren en el frontend.

### vpu_count en TODAS las líneas (no solo huérfanas)
- Antes, `GET /api/pedidos/[id]` solo asignaba `vpu_count` a detalles huérfanos (los
  desvinculados del viaje pero con VPU asignado). Las líneas normales tenían `vpu_count
  = undefined → 0`, haciendo imposible detectar exceso en el ViajeCard.
- **Fix:** query `allVpus` (excluye devueltos) construye `vpuCountMap` y se adjunta a cada
  línea de `lineasPorViaje`. Ahora el ViajeCard muestra el badge rojo "Pendiente a devolver
  a stock" y las filas resaltadas sin abrir el modal.

### Botones +/- en vez de input numérico
- Los inputs numéricos eran problemáticos: no funcionaban bien en móvil, no tenían límites
  claros, y permitían valores absurdos (ej. 10000).
- **Solución:** botones `−` y `+` con display del valor entre ellos.
  - `−`: deshabilitado cuando `cantidad <= minCant` (0 para alistado, 1 para programado)
  - `+`: deshabilitado cuando `stockLibres <= 0`
  - Valor mostrado como texto fijo (no input editable)

### Lógica de stock en edición de cantidades
- `cantidad_ventas` (del API `/api/tallas`) YA tiene las unidades de ESTE viaje restadas
  (son "comprometidas"). Entonces:
  - `libres = cantidad_ventas - otras_líneas_en_este_modal`
  - `maxPermitido = cantidad_actual + libres` (NO solo `libres`)
- **Bug común:** usar solo `libres` como máximo → si viaje tiene 2 y hay 2 libres,
  max sería 2 y no se podría subir a 4. El fix es sumar `l.cantidad + libres`.
- El mismo cálculo se replica en `manejarCambioCantidad` (handler) y en el JSX del botón
  `+` (para decidir si se habilita o deshabilita).
