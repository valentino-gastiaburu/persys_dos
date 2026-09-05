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

27. **Distinción del exceso de VPUs en la tabla del pedido** (01/sep/2026): en "Productos del
    pedido", cuando una línea tiene exceso de VPUs (`vpu_count > cantidad`), se distingue el origen:
    - Si el exceso **ya está cubierto** por un recojo pendiente de devolver (mismo `producto_id`+talla
      en `lineasDevolver`) → badge **rojo** `"{N} por devolver"` (las unidades van a regresar por sí
      solas vía el viaje de regreso; **no es** una acción de almacén).
    - Si el exceso **no** está cubierto por devolución (exceso real de alistado en viaje aún editable)
      → se mantiene el badge ámbar `"Retirar {N} u. al stock"` (acción de corrección de almacén).
    - Cuando el recojo se completa y las unidades vuelven al stock, `vpu_count` deja de contarlas
      (backend excluye VPU `devuelto`) y el badge **desaparece**.
    - **Concepto clave**: un VPU = producto único ya **asignado a un viaje** (`viaje_producto_unicos`).
      El viaje de regreso **no** tiene VPUs hasta que se completa la devolución; los VPUs de las
      unidades en devolución siguen contando como parte del viaje de entrega (historial inmutable),
      pero deben **salir del pedido final** (este solo muestra el estado final correcto).

28. **Devolución completa = desaparece del pedido final** (01/sep/2026): cuando un recojo ya
    devolvió todos sus VPUs (0 VPU `pendiente`), la devolución es **historial**: la sección
    "Por devolver" y el badge "N por devolver" **desaparecen del pedido final**. Además, un
    producto único ya devuelto al stock (VPU `devuelto`, en la entrega o vía recojo) **no cuenta**
    como exceso del pedido aunque el VPU del viaje de ida quede en `enviado` (historial inmutable):
    `vpu_count` lo excluye vía el set `productosDevueltos`. Implementado en `api/pedidos/[id]/route.ts`
    (`vpu_pendientes`, `productosDevueltos`) y en `page.tsx` (`devolucionCompletadaIds`, filtro de
    `lineasDevolver` con `vpu_pendientes > 0`).
    - **Caso real reparado**: recojo `VPACY53G` (pedido QF7B9NF6) quedó en `programado` con la
      devolución ya completa (2/2 devueltos). Causa: se devolvió con una versión previa del código
      sin `finalizarRecojo`. Se reparó el dato (viaje → `terminado`, pedido → `confirmado`) y la
      defensa en profundidad evita reproducirlo: el estado final se deriva de los datos físicos,
      no solo del campo `viaje.estado`.

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

## PLAN PENDIENTE: Subida de imágenes a Google Drive (no implementado aún)

> **Estado:** plan aprobado por el usuario, documentado aquí. **Aún NO implementado.**
> Se retomará cuando el usuario lo pida. UX objetivo: `<input type="file">` con preview
> inmediato → al guardar se sube solo a Drive, se obtiene el link y se guarda en el campo.
> El usuario no pega links manualmente.

### Decisiones del usuario (01/sep/2026)
- **Cuenta destino:** cuenta personal de Google del usuario (**OAuth**, no service account).
- **Alcance:** fotos de **productos** y fotos de **comprobantes de pago**.
- **Config:** el usuario crea el proyecto de Google Cloud siguiendo mis pasos. Confirmado que
  **es necesario** crear el proyecto en Google Cloud (no basta con "tener acceso al Drive"):
  la app necesita proyecto + Drive API + credenciales OAuth para subir programáticamente.

### Contexto actual en el código
- **Existe** `foto_url` (text) en `productos` y una función `driveImageUrl()` en
  `src/lib/utils.ts` (convierte link de Drive de share → URL de imagen embebible
  `drive.google.com/thumbnail?id=...&sz=w1000`).
- **Existe** campo `URL de imagen (opcional)` en Crear producto
  (`src/app/(app)/productos/page.tsx` aprox. línea 366, placeholder "Pronto se importará
  desde el Drive") — es manual (pegar link), NO sube archivos.
- **No hay** Supabase Storage, ni subida de archivos, ni `googleapis`, ni config de Drive API.

### Configuración (la hace el usuario, guiado)
1. [console.cloud.google.com](https://console.cloud.google.com) → crear proyecto (ej. "persys").
2. Activar **Google Drive API** en "APIs & Services".
3. Crear **OAuth Consent Screen** (External → agregar tu cuenta como test user).
4. Crear **OAuth Client ID** tipo **Web application**, redirect URI
   `http://localhost:3000/api/auth/drive/callback`.
5. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` en `.env.local`.
6. **Login una sola vez** con tu Google para obtener `GOOGLE_REFRESH_TOKEN` (guardar en
   `.env.local`). Desde entonces la app sube sola sin pedir login.
7. **Nota:** aún pendiente decidir detalles de autenticación del token (OAuth refresh vs
   service account) — el usuario eligió OAuth con cuenta personal.

### Implementación técnica (al retomarlo)
- **Dep:** agregar `googleapis`.
- **Backend** (nuevas API routes en `src/app/api/`):
  - `api/auth/drive/callback/route.ts` — recibe la autorización OAuth inicial y genera el
    `refresh_token`.
  - `api/productos/upload/route.ts` y `api/pagos/upload/route.ts` — reciben
    `multipart/form-data`, suben a Drive con `googleapis`, devuelven el link.
  - Helper `src/lib/drive.ts`: `getDriveClient()`, `subirImagen(buffer, nombre, mime)` →
    `drive.files.create({ uploadType: multipart })` → `{ fileId, url }`
    (`https://drive.google.com/uc?id=FILEID`). Subir con `permission` `anyone/reader`
    para que el thumbnail renderice sin login del visor.
- **Frontend:**
  - Componente reutilizable `SubirImagen` en `src/components/` (preview local con
    `URL.createObjectURL`, estado "subiendo…", fetch multipart, guarda el link devuelto).
  - **Productos:** reemplazar el `Input` de URL por `SubirImagen`.
  - **Pagos:** botón para subir comprobante con link/inline del comprobante.
- **SQL:** script `supabase/18_pagos_imagen.sql` para agregar `pagos.foto_comprobante text`
  (el usuario lo corre en el SQL Editor).
- **Errores:** si la subida falla (red/token), mostrar error y conservar preview local.
- **Cuota:** las fotos consumen el espacio gratuito del Drive personal (15 GB gratis).
- **Seguridad:** claves solo en `.env.local` (ya ignorado por `.gitignore`).
- Posible necesidad de reiniciar dev server tras agregar la dependencia.

## Estado visual "Retrasado" (decisión #29 — 03/sep/2026)

`"Retrasado"` es un estado **visual derivado**, NUNCA persistido en la BD. No se crean
tablas/columnas/funciones/enums. El estado real de viajes (`programado`/`alistado`...) y del
pedido (`confirmado`/...) queda intacto.

- **Regla de retraso (por viaje):** un viaje está retrasado si `estado ∈ {programado, alistado}`
  y su `fecha` programada es **anterior** a hoy (hoy NO cuenta). Enviado/terminado/cancelado
  nunca están retrasados. Aplica tanto a entregas como a recojos.
- **Pedido retrasado:** si tiene ≥1 viaje retrasado, el badge reemplaza el estado real por
  `"Entrega retrasada"` (prioridad si hay entrega) o `"Recojo retrasado"`.
- **Fuente de hora (2 redundantes, proveedores/redes independientes):** NO se usa la hora del
  PC (mal configurada). Se lee el header HTTP `Date` (GMT/UTC) en cadena de hosts masivos:
  `api.github.com` → `www.cloudflare.com` → `example.com`; luego GMT − 5h = Lima (UTC-5 fijo,
  Perú sin DST). Fallback final `new Date()` del server solo si todos fallan. Caché TTL 30s.
  Helper único: `src/lib/retraso.ts` (`obtenerFechaHoyLima`, `esRetrasado`,
  `etiquetaRetrasoPedido`). Reusar ese helper, NO duplicar lógica.
- **El filtro "Retrasado"** en la lista de pedidos se hace **en el cliente** (el backend no
  puede filtrar un estado que no existe en BD): el backend agrega un campo derivado `retraso`
  por fila, y el front filtra en memoria cuando el Select vale `retrasado`.
- **Dónde se pinta:** lista de pedidos (badge + filtro), detalle de pedido (badge de pedido y
  de cada viaje), lista de almacén (`AlmacenLista`, badge + fila resaltada `bg-red-50`),
  detalle de viaje (`ViajeDetalle`, badge). Todos usan el `retrasado`/`retraso` que adjunta el
  backend en sus respectivos GETs.

## Módulo de Cargos (documentos impresos del viaje de entrega — 03/sep/2026)

**Unidad de impresión = viaje de ENTREGA** (`viajes.tipo='entrega'`, no el pedido). Los viajes de
**recojo NO** tienen cargo, y los viajes **cancelados** se excluyen siempre (lista y `nro_viaje`).

Cada viaje de entrega imprime **dos documentos A4** (Cargo de Despacho + Cargo de Agencia),
pensados para `window.print()` con CSS `@page A4 portrait; margin 10mm`. **Varios cargos caben
en una sola hoja** (NO una página por viaje: cada "cargo" es `break-inside-avoid`, no fuerza
`break-after`).

### Datos de un cargo (desde `/api/cargos`)
- `codigo_viaje` = código del viaje (va como "Cód. Envío"), `codigo_pedido` = código del pedido.
- `nro_viaje` = número ordinal del viaje de entrega (1ro, 2do…) contando solo entregas no
  canceladas ordenadas por `creado_el`. Se pinta diminuto `V{n}` en la esquina sup. izq.
- Productos = **solo los del viaje** (`detalles_pedido.viaje_id`), no todos los del pedido.
- `ciudad` → se muestra como **"Ciudad"** en ENVIO y como **"Distrito"** en VISITA.
- `fecha_viaje` es la fecha del viaje (filtro), `fecha_entrega` la fecha del pedido.
- `monto_total` = `viaje.total`. Regalo y observaciones son campos **distintos** de BD
  (`pedidos.regalo` texto y `pedidos.observaciones` texto).

### Diseño ENVIO vs VISITA (depende de `pedidos.tipo_pedido`)
**CargoDespacho:**
- ENVIO: "Tipo de Envío: X Menor", muestra Fecha de pago + Empresa, "Ciudad".
- VISITA: "Mediante: MOTORIZADO", sin Fecha de pago ni Empresa, "Distrito", añade filas
  Regalo y Observación dentro de Info del Pedido. Productos muestran `[Entallar a: <talla>]`
  cuando hay entalle.
- La 1ra columna SIEMPRE se titula **"Interno"** (aunque sea visita).

**CargoAgencia:**
- ENVIO: Remitente (dueña de `config`) + Destinatario (cliente) + Productos + Regalo.
- VISITA: **sin remitente** (solo Destinatario/cliente) + Fecha Envio + Resumen de Productos +
  Regalo + bloque OBS (observaciones). Header indica "Visita".

### Configuración (`configuraciones` clave/valor, se edita en Admin)
- `cargo_duenia_nombre`, `cargo_duenia_dni`, `cargo_duenia_celular`, `cargo_duenia_direccion`
  → remitente de CargoAgencia ENVIO.
- `cargo_encargado_despacho` → campo "E. despacho" de CargoDespacho.

### Flujo de la página `/cargos`
- Filtros auto-aplicados (debounce 250ms, sin botón "Buscar"): rango `desde`/`hasta`, `tipo`
  (envio/visita) y `q` (código de viaje). Botón "Quitar filtros". Sin paginación (trae todos
  los viajes de entrega no cancelados). Ordenados por `viajes.fecha` ascendente.
- Checkboxes por viaje + Seleccionar todos / Ninguno + "Imprimir seleccionados".
- **"Cargos de hoy"** (botón en lista de Pedidos) navega a `/cargos?hoy=1`: la página consulta
  `GET /api/hoy` (devuelve la fecha de hoy de Lima calculada en server con
  `obtenerFechaHoyLima`), pone `desde=hasta=hoy` como filtro y listo — **sin auto-impresión**.
  El usuario ve el módulo ya filtrado por hoy y usa "Imprimir seleccionados" cuando quiera.

### Archivos clave
- `src/app/api/cargos/route.ts` — GET cargos (por viaje, filtros, excluye cancelados, nro_viaje).
- `src/app/api/hoy/route.ts` — GET `{hoy}` (fecha de hoy de Lima, server-side).
- `src/app/(app)/cargos/page.tsx` — página/printer, manejo `?hoy=1&print=1`.
- `src/components/CargoDespacho.tsx`, `src/components/CargoAgencia.tsx` — ENVIO vs VISITA.
- `src/lib/cargos.ts` — tipos `CargoPedido`/`CargoConfig` + labels.
- `src/components/AdminClient.tsx` — campos de la dueña + encargado de despacho.
- `supabase/18_regalo_text.sql` — migración idempotente `pedidos.regalo` boolean→text (corrida).
- `src/app/globals.css` — `@page` A4 + reglas `@media print` (`#print-sheet`, break-inside-avoid).

## Pagos / deudas (cobros programados) + comprobante — 03/sep/2026

Reestructura del modelado de pagos. **La tabla `pagos` pasa a ser un libro de cobros con
estado** (`pendiente` → `pagado`), en vez de solo dinero recibido. Una fila de `pagos` es un
"cobro": primero es una promesa de pago futura (pendiente, con fecha pactada) y cuando llega
el dinero se completa (marca pagado + fecha_pagada + monto + método + comprobante).

### Cambios de schema (`supabase/19_pagos_deudas.sql`, idempotente, NO corrida aún)
- Nuevo enum `pago_estado` (`pendiente`,`pagado`).
- `pagos` gana columnas: `estado` (default `pendiente`), `fecha_pactada` (date, fecha
  acordada), `fecha_pagada` (date, cuándo se pagó), `comprobante` (text, link Drive).
- `pagos.monto` y `pagos.metodo_pago` ya **no son NOT NULL** (se llenan al cobrar). El
  `check (monto > 0)` queda (null > 0 = null → pasa).
- `pedidos.comprobante` (text): capturado en el form "¿Pagó? Sí" y trasladado al cobro
  pagado en la confirmación.
- Backfill: cobros existentes → `estado='pagado'`, `fecha_pagada = fecha::date`.
- Índice `idx_pagos_pedido_estado (pedido_id, estado)`.

### Reglas
- **Deuda pendiente** = cobros `pendiente` (también equivale a `monto_total − Σ pagos pagados`).
  Todo cálculo de deuda (lista, detalle, cargos, pagos) suma **solo `estado='pagado'`**.
- **Al confirmar** (`confirmarPedido`): se genera SIEMPRE un cobro inicial con
  `fecha_pactada = fecha_entrega` del pedido. Si `monto_primer_pago > 0` ("¿Pagó? Sí" o
  "Primer pago" de partes>1) ese cobro se marca `pagado` (monto, método, fecha_pagada=hoy,
  `tipo='primer_pago'`, `comprobante` si vino del form); si no, queda `pendiente`.
- **Puede haber varias deudas** con distintas fechas (varios cobros pendientes).
- **Settle** (cobrar): `POST /pagos` con `pago_id` cancela/settlea el cobro pendiente; sin
  `pago_id` crea un cobro pagado nuevo. Guard `monto <= deuda`.
- **Agregar deuda futura**: `POST /pagos { estado:'pendiente', fecha_pactada }`.
- **Editar fecha pactada**: `PATCH /pagos/[pagoId]`. **Eliminar** solo pendientes:
  `DELETE /pagos/[pagoId]`. No se editan montos ya pagados (evita agujeros).
- **Guard**: NO se puede crear un cobro pendiente nuevo si la deuda ya está en 0
  (error "La deuda ya está cubierta").
- **Limpieza automática**: si un pago deja la deuda en 0 exacto, los cobros
  pendientes restantes se ELIMINAN en el mismo POST (quedan solo los pagados).
- **Monto visual por deuda**: en el detalle y en el modal cobrar, cada cobro
  pendiente muestra `S/ deuda / nº pendientes` (reparto de lo que falta). Es
  derivado en memoria, se ajusta solo al crear/borrar/cobrar cobros. Nunca se
  persiste ese monto por cobro (individual), solo fecha + estado.
- **Borrar cobro**: botón en cada deuda pendiente del detalle
  (`DELETE /pagos/[pagoId]`) con confirmación y recarga.

### Flujo de "siguiente cobro" (al registrar un pago parcial)
- En "Cobrar"/"Registrar pago", si el monto no cubre la deuda → campo opcional
  **"Fecha del siguiente cobro"**. Si se va sin llenarlo → modal
  **"Te estás yendo sin registrar la fecha del siguiente cobro. ¿Seguro que deseas continuar?"**
  con **Volver / Continuar**.

### Comprobante (Google Drive — plan ya documentado, upload aún NO implementado)
- El campo `comprobante` es `text` (link). Se muestra como enlace en Pagos/detalle.
- El upload a Drive (`pagos.foto_comprobante`→`comprobante`, `SubirImagen`, `/api/pagos/upload`,
  setup GCP OAuth) se integra más adelante, sin bloquear esta feature. Por ahora se pega el link.

### Archivos clave
- `supabase/19_pagos_deudas.sql` — migración (correr en SQL Editor).
- `src/lib/pedidos.ts` (`confirmarPedido`) — genera el cobro inicial al confirmar.
- `src/app/api/pedidos/[id]/pagos/route.ts` — GET/POST (settle / nuevo pendiente / nuevo pagado).
- `src/app/api/pedidos/[id]/pagos/[pagoId]/route.ts` — PATCH/DELETE.
- `src/app/api/pedidos/route.ts`, `api/pedidos/[id]/route.ts`, `api/cargos/route.ts` — deuda
  solo sumando `pagado`.
- `src/app/(app)/pagos/page.tsx` — Cobrar modal (settle + siguiente cobro + confirm).
- `src/app/(app)/pedidos/nuevo/page.tsx` — campo comprobante en "¿Pagó? Sí".
- `src/app/(app)/pedidos/[id]/page.tsx` — deudas pendientes + cobros pagados + editar fecha +
  agregar deuda + registrar pago.

## Formato de QR — 05/sep/2026

- Los QRs del sistema viejo (AppSheet) codifican IDs de **8 hex minúsculas**
  (p. ej. `f22beca3`), impresos con `api.qrserver.com` (QR estándar ISO 18004).
- Persys ahora genera los `productos_unicos.codigo_qr` con `randomHexCode(8)`
  (`src/lib/utils.ts`) en `POST /api/productos/[id]/stock` y en las tandas
  (`/api/tandas`). Antes usaba `randomCode(10)` alfanumérico.
- Los códigos de pedido/viaje siguen con `randomCode` (no cambian).
- **Base limpiada (05/sep/2026)**: se borraron pedidos, viajes, pagos, detalles,
  productos_unicos (44), movimientos_stock, tandas, clientes (8), productos (9),
  producto_tallas, historiales e inconsistencias. Se conservaron usuarios (4),
  tallas (20 seed), configuraciones y motorizados. El borrado se hizo vía REST
  con la anon key (política `app_full_access`); queda pendiente la importación
  del stock viejo desde el export AppSheet/Excel.
- **Importación de stock viejo** (`supabase/20_import_stock_viejo.sql`, generado
  desde `Base de datos Persys - Hoja 13.csv`): 722 unidades / 172 productos.
  El CSV: cada fila = unidad con su `ID_producto` 8-hex (se usa como
  `codigo_qr`), `Descripcion`, `IMEI`, `TALLA` (formato `Talla_30` → se guarda
  como `30`). Normaliza `0706CAO`→`VESTIDO LARGO CAOBA` (2 unidades del mismo
  producto). Agrega `Talla_3` (tipo C) al seed. Crea tanda `INI20260905`
  ("Importación inicial") e inserta kardex de entrada por (producto,talla).
  Pendiente: correrlo en el SQL Editor y verificar conteos.

## Pestaña "Conteo" — 05/sep/2026

- En Productos Únicos se agregó el tab **"Conteo"** (`src/components/ConteoAlmacen.tsx`).
- La cámara **NO se abre sola**: botón "Activar cámara"; una vez activada queda
  encendida y permite escanear QR tras QR ("Apagar cámara" para pausar). El input
  manual sirve siempre.
- Escaneo = solo memoria, **una consulta** inicial `GET /api/productos-unicos`
  (Map `codigo_qr` → unidad + "esperados" por IMEI·talla según `en_almacen`).
- Clasificación: verde OK (`en_almacen`), ámbar "Fuera de lugar" (el sistema dice
  que está en viaje/entregado/devuelto/almacén espera), rojo "Desconocido" (QR
  inexistente), rojo "Repetido". QR con formato inválido → aviso "QR no reconocido"
  sin registrarse. Toda fila tiene "quitar" para corregir escaneos por error.
- Dos columnas: izq. "Stock que debería estar" (unidades `en_almacen` pendientes; se van
  quitando a medida que se escanean), der. "Lo que vas escaneando". Lo que NO debería estar
  en stock se agrega igual pero al inicio de la columna derecha, en rojo, indicando el
  motivo (sistema dice que está en viaje/entregado/devuelto/almacén espera, código
  desconocido, o ya escaneado) y su Viaje + Pedido asignado. Los OK quedan en verde abajo.
- `GET /api/productos-unicos` ahora incluye `pedido` y `viaje` (códigos) por unidad, desde
  `viaje_producto_unicos` (última asignación por `fecha_alistado`).
- Sesión auto-guardada en localStorage (`persys:conteo`, v2 de formato); al recargar se
  reconcilia contra el snapshot actual. Sin cambios de BD.


