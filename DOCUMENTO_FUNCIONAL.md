# Persys — Documento funcional (viaje del usuario, flujos y lógicas)

> Documento vivo: aquí vive **cómo funciona la app** según lo que el usuario va
> definiendo. Antes de implementar cualquier cambio, leer este documento +
> `NOTAS_PROYECTO.md`. Si algo del código contradice esto, es una **inconsistencia**
> y hay que plantearla, no ignorarla.
>
> Última actualización: 16/ago/2026

---

## 1. Acceso y roles

- **Login:** DNI + contraseña (tabla `usuarios`, sin Supabase Auth; password en texto
  plano por ahora — MVP). Admin de prueba: `00000000` / `admin123`.
- **Roles** (`usuario_rol`): `vendedora`, `agendadora`, `almacen`, `controller`, `admin`.
  El admin (la dueña) crea/deshabilita cuentas desde el panel Admin.

### Matriz de permisos (API)

| Módulo / ruta | Puede |
|---|---|
| Pedidos (crear/confirmar/estado/pagos/detalles) | vendedora, agendadora, controller, admin |
| Pedidos (ver) | + almacen |
| **Crear viajes (entrega extra / regreso)** | vendedora, agendadora, controller, admin |
| Viajes (ver, cambiar estado) | almacen, controller, admin, vendedora, agendadora |
| Alistar viaje (escanear QR) | almacen, controller, admin |
| Productos / tallas / productos únicos (ver) | todos |
| Stock / tandas / crear productos únicos | almacen, controller, admin |
| Usuarios y config | admin |

---

## 2. Viaje del usuario (journey de un pedido)

1. **Login** con DNI + contraseña.
2. **Vendedora** → **Nuevo pedido**:
   - Cliente (búsqueda en vivo por nombre/número o "Agregar nuevo número").
   - Fecha de entrega (pasada avisa en rojo pero no bloquea).
   - **Tipo de pedido** condiciona método y empresa de envío:
     - `envio` → método: a_domicilio | agencia · empresa: Olva | Shalom | Otros
     - `visita` → método: a_domicilio | local_peri · empresa: Motorizado
   - Canal de venta, costo de envío, dirección/ciudad/link Maps.
   - **Método de pago** + **Partes a pagar** (ver §4.1).
    - Productos: búsqueda por nombre/IMEI, talla (ver §4.4), cantidad (no puede exceder el
      stock disponible en la talla que se consume), precio, género. Opcionalmente se marca
      **"Entallar a"** para indicar la talla vendida (destino): la prenda se toma de la talla
      de stock y se modifica a la talla vendida (el consumo de stock es en la talla de stock;
      la talla vendida puede tener 0 stock porque el entalle la "produce").
    - **Equipo de vendedoras**: Vendedora, Vendedora que colaboró 1 y Vendedora que
      colaboró 2 (por defecto = quien crea el pedido; cambiable a cualquier vendedora
      activa). La **Agendadora** no se muestra al crear (por defecto = quien crea) y
      solo se ve en el **detalle del pedido**.
    - Guardar → **"Terminar después"** crea el pedido en **`borrador`** (no reserva
      stock; puede seguir editándose y confirmarse después). **"Guardar Pedido"** crea
      el pedido en **`solicitado`** (reserva stock) y calcula el resumen/total.
3. **Confirmación** (vendedora): botón **"Confirmar pedido"** — calcula total y
   resumen (si faltan), crea el **viaje de entrega** (programado) y registra el
   **primer pago** si aplica. El pedido pasa a `confirmado`.
4. **Almacén** → Almacén / Viajes: abre el viaje y **escanea QRs** para alistar
   cada unidad (valida talla; aplica *entalle* si la prenda lo requiere; controla
   cantidades por detalle). Con todas las unidades alistadas, marca el viaje
   **alistado** → el pedido pasa **automáticamente** a `alistado`.
5. **Envío**: viaje **enviado** → unidades salen de almacén (kardex de salida),
   pedido → `enviado`.
6. **Entrega**: viaje **terminado** → unidades `entregadas`, pedido → `entregado`,
   luego `cerrado`.
7. **Después de entregado** (ver §4.7), el pedido **solo se modifica con viajes**:
   - **Viaje de regreso (recojo)**: quita productos (devolución o cambio). Los productos
     desaparecen del viaje de entrega original y pasan a estar **pendientes de devolución**
     en el viaje de regreso. Al terminar el recojo las líneas quedan `devuelto` y las
     unidades vuelven a almacén con su talla actual (kardex de entrada). El pedido queda
     `esperando_devolucion`/`esperando_cambio` mientras el recojo esté pendiente.
   - **Viaje de entrega extra**: agrega productos con su propia fecha, dirección y costo de
     envío; un pedido entregado que recibe un viaje extra vuelve a `confirmado`.
8. **Cancelación**: manual desde `solicitado` o `confirmado` (ver §3).
9. **Pagos**: registrar pagos (monto + método); la deuda se calcula
   `monto_total − pagado`.
10. **Mobile**: la barra lateral desaparece; se navega con un **botón flotante ☰**
    (abajo a la derecha) que abre el menú de módulos con iconos.

---

## 3. Flujo de estados del pedido

```
   crear: "Terminar después" → BORRADOR (no reserva stock)
          "Guardar Pedido" → SOLICITADO (reserva stock, resumen/total)
        │
        ▼
   ┌────────────┐   Confirmar   ┌───────────────┐
   │ SOLICITADO │ ────────────► │  CONFIRMADO   │
   │            │               │               │
   │  ─ Confirmar (vía /confirmar, crea viaje + primer pago)
   │  ─ Cancelar (manual)         ─ Cancelar (manual)
   └────────────┘               │  ─ Volver a Solicitar (manual)
        ▲                       └───────┬───────┘
        │            (solo manual)      │  AUTOMÁTICO:
        └───────────────────────────────┘  cuando el viaje de entrega
           Confirmado ──► Solicitado        pasa a "alistado"
                                          │
                                          ▼
                                     ALISTADO  (viaje enviado)
                                          │
                                          ▼
                                     ENVIADO  (viaje terminado)
                                          │
                                          ▼
                                     ENTREGADO ──► CERRADO
```

**Manuales** (tabla de pedidos y detalle, `POST /api/pedidos/[id]/estado`):
- `borrador`/`solicitado` → `confirmado` (botón Confirmar, usa `/confirmar`), `cancelado`
- `confirmado` → `solicitado` (Volver a Solicitar), `cancelado`

**Automáticas** (`syncEstadoPedidoPorViajes` en `lib/pedidos.ts`):
- **Regla de rank mínimo entre viajes de entrega:** el pedido sigue al viaje de
  entrega **menos avanzado** — `programado`→`confirmado`, `alistado`→`alistado`,
  `enviado`→`enviado`, todos `terminado`→`entregado`. Un pedido entregado que
  recibe un viaje de entrega extra vuelve a `confirmado` hasta que TODOS sus
  viajes avancen.
- Con un **recojo pendiente** → `esperando_devolucion` / `esperando_cambio`
  (por encima de todo).
- Sin viajes → `confirmado`.

---

## 4. Lógicas de negocio

### 4.1 Partes a pagar (formulario de nuevo pedido)

- `partes_a_pagar = 1` → en el form solo aparece el desplegable **"¿Pagó? Sí/No"**:
  - **Sí** → `monto_primer_pago = total` (al confirmar se registra el pago completo).
  - **No** → `monto_primer_pago = null`.
- `partes_a_pagar > 1` → aparece **"Primer pago (S/)"** y **"Fecha de la parte 2"**
  (guarda en `fecha_siguiente_pago`).

### 4.2 Confirmación del pedido

- Calcula `monto_total` = suma de subtotales de detalles activos + `costo_envio`
  (también queda en el **`total` del viaje de entrega** que se crea).
- Genera `resumen_productos` con formato `IMEI (cant/talla/género)`.
- Crea el viaje de entrega `programado` (con `fecha`, `direccion`, `costo_envio`
  y `total`) y asigna los detalles al viaje.
- Si `monto_primer_pago > 0` inserta un pago `tipo = primer_pago`.
- Guarda `confirmado_el` y registra el cambio en `historial_pedidos`.

### 4.3 Deuda en la tabla de pedidos

- `deuda = monto_total − pagado`.
- Deuda `0` → **"Pagado"** (verde). Deuda `= total` → **"Todo"** (rojo).
- Deuda parcial → monto en rojo.

### 4.4 Stock: productos únicos y tallas

- Un producto se vende por **unidades** (`productos_unicos`), cada una con su QR.
- Estados de la unidad: `en_almacen` → `almacen_espera` (alistada) → `en_viaje`
  (enviada) → `entregado` / `devuelto`; también `eliminado`.
- **Tallas A/B/C**: un producto puede tener una o varias; los combos (AB/AC/BC/ABC)
  se agregan con la migración `04_tallas.sql` (ver pendientes).
- El **entalle** cambia la talla actual de la unidad; la original queda en
  `talla_original` y se registra en el historial. Cada detalle de pedido tiene dos tallas:
  **`talla_stock`** (origen: la talla que hay en almacén, la unidad que se toma) y
  **`talla_vendida`** (destino: la talla que pidió el cliente). Ambas **siempre se llenan**
  (son iguales cuando no hay entalle); `entalle` es un derivado
  (`talla_stock != talla_vendida`).
- **Regla de stock con entalle:** la unidad que se consume/reserva es la de la
  **talla_stock** (`talla_stock ?? talla_vendida`), no la destino.
- **Stock por talla** = unidades existentes (excepto `eliminado`), no solo las
  `en_almacen`. El stock se carga con **tandas** (Productos Únicos → Añadir stock).
- **Stock ventas (comercial)** = stock almacén por talla **menos** las unidades
  comprometidas en **pedidos realizados**. Reservan stock los estados activos
  (`solicitado`, `confirmado`, `alistado`, `enviado`, `entregado`, `cerrado`,
  `esperando_devolucion`, `esperando_cambio`); **NO reservan** los borradores ni los
  cancelados/devueltos. Se ve en Productos → Lista con el toggle "Stock almacén / Stock
  ventas". Número azul = disponible, gris = 0, rojo = negativo (vendido de más).
- **Regla de negocio:** TODAS las validaciones al crear/editar un pedido usan el
  **stock de ventas**, no el de almacén: el select de **"Talla"** (talla stock) solo
  ofrece tallas con disponible > 0, y el servidor valida contra
  `getStockVentasPorTalla` al agregar un producto o subir su cantidad (la talla que se
  valida es la **stock**; es la que consume). El checkbox **"Entallar a"** habilita el
  select de **"Talla a entallar"** (talla vendida), que muestra **todas** las tallas del
  producto: puede tener 0 stock porque la unidad se toma de la talla stock y se modifica.
- **Validación en el click al guardar (batch):** "Guardar Pedido" / "Terminar después"
  envían el pedido completo en **un solo request** (`POST /api/pedidos` con `lineas[]`).
  El servidor **relee la BD en ese momento**, valida todo el lote por resta contra el
  stock de ventas y, si alguna talla quedaría en **negativo**, **no crea nada** y
  responde los conflictos → modal con el producto/talla afectado y los pedidos que ya
  lo reservaron (código, estado, cliente, cantidad). Si pasa, crea el pedido `borrador`
  con todas sus líneas de una vez (y si `confirmar=true`, lo confirma en la misma
  llamada). Decisión: validación 100% en JS, sin función/vista SQL (se acepta una
  ventana mínima de carrera de milisegundos).
- **Modal "Editar productos" en lote:** agregar/editar/quitar productos es **local**
  (nada se inserta al instante). El disponible de cada talla se recalcula en cliente
  (`cantidad_ventas + liberadas pendientes − agregadas pendientes`; `cantidad_ventas`
  ya excluye las líneas del propio pedido). Al presionar **"Listo"** se aplica todo
  (DELETEs → PATCHs → POSTs); si algo falla, el modal queda abierto con el error.

### 4.5 Alistado de viajes (escanear QR)

- **Flujo:** la de almacén entra a **Almacén/Viajes**, ve la lista con los viajes de
  **hoy resaltados** (fondo azul + badge "Hoy", ordenados primero). Abre un viaje y
  ve dos tablas:
  - **Productos a alistar:** columnas IMEI, TALLA (talla stock = original), CANTIDAD
    (progreso alistadas/total) y **ENTALLAR A:** (talla vendida destino, solo si hay
    entalle).
  - **Unidades alistadas:** columnas IMEI, TALLA (original), ENTALLAR A: (destino si
    se entalló) e ID PRODUCTO ÚNICO (QR), con badge "pendiente" para las no guardadas.
- **Selección:** click en una fila de la tabla de productos → se resalta visualmente
  (sin llamada a BD). Se habilita el área de alistado para ese producto.
- **Alistado local:** las unidades se agregan a una lista local (pendientes) mediante el
  **buscador con autocompletado** (desplegable que filtra en vivo por QR/IMEI) o el
  botón **"📷 Escanear con cámara"** (librería `html5-qrcode`). **Nada toca la BD hasta
  presionar "Marcar como alistado"**.
- **"Marcar como alistado":** envía todas las pendientes en **un solo request**
  (`POST /api/viajes/[id]/alistar/batch`). Si quedan unidades sin completar, solo
  guarda las pendientes; si TODAS las unidades del viaje están alistadas, además pasa
  el viaje a `alistado` automáticamente.
- **Entrega:** el producto debe estar `en_almacen` y pertenecer al listado del viaje.
  Coincide talla exacta: la unidad escaneada debe tener `talla_id == talla_stock`
  (la talla que hay en almacén). Si el detalle tiene **entalle**
  (`talla_stock != talla_vendida`), entonces se entalla a la **talla vendida** (destino).
- **Recojo:** el producto debe estar **`entregado`** y pertenecer al listado del
  regreso; la talla que coincide es la que tiene la unidad entregada (`talla_vendida`).
- No puede exceder la `cantidad` del detalle. No se puede alistar en un viaje ya
  `enviado`/`terminado` ni con la unidad ya alistada en el viaje.
- Endpoints: `POST /api/viajes/[id]/alistar/batch` (alistado en lote),
  `GET /api/viajes/[id]/stock?detalle_id=&q=` (búsqueda en el desplegable).

### 4.6 Envío / término de viajes

- Orden de estados: `programado` → `alistado` → `enviado` → `terminado`. **No se
  puede retroceder.**
- `enviado`: unidades pasan a `en_viaje` + kardex `salida`.
- `terminado` (entrega): unidades `entregado`.
- `terminado` (recojo): las líneas del regreso pasan de `pendiente_devolucion` a
  **`devuelto`** y las unidades vuelven a `en_almacen` + kardex `entrada`.

### 4.7 Pedido = colección de viajes (viajes extra y devoluciones)

- Cuando un pedido está **`entregado`** (o `esperando_*`/`cerrado`), la única forma
  de modificarlo es **mediante viajes** (`POST /api/viajes`). Quién: vendedora,
  agendadora, controller y admin. El detalle del pedido muestra una **tarjeta por
  viaje** con sus productos; la tabla de productos del pedido se oculta (cada viaje
  lleva los suyos).
- **Viaje de regreso (recojo):** `{ tipo: "recojo", motivo, fecha, lineas: [{detalle_id,
  cantidad, precio_devolucion}] }`. Solo en pedidos entregados. Al crearlo:
  - Se pide la **fecha programada** para la devolución (campo `fecha` del viaje).
  - Se crean líneas espejo con estado `pendiente_devolucion` y `devolucion_de`
    apuntando a la línea original.
  - La línea original **reduce su cantidad**; si se devuelve todo, pasa a `oculto`
    (sale del viaje de entrega y de todos los listados). Soporta **devolución
    parcial** (2 unidades → devuelven 1 → la original queda con 1).
  - Cada prenda tiene un **costo a devolver** editable (default = precio original;
    **0 permitido**). El `total` del regreso = Σ subtotales de sus líneas.
  - El `costo_envio` de un regreso es **informativo** (no se descuenta del pedido).
  - Al terminar el recojo, la unidad vuelve al almacén **con su talla actual** (no
    se restaura la talla original; por eso el entalle se mantiene) y se registra la
    **fecha efectiva de devolución** (`viajes.fecha_devolucion` = cuando almacén
    escaneó el QR y la prenda volvió al stock).
- **Viaje de entrega extra:** `{ tipo: "entrega", fecha, direccion?, costo_envio,
  lineas[] }`. Valida stock como un pedido nuevo (`validarStockLineas`). Prohibido
  en `borrador`/`solicitado`/`cancelado`/`devuelto` (el primer viaje lo crea la
  confirmación). El `costo_envio` del viaje extra **sí suma** al total del pedido.
- **Totales:** cada viaje tiene su propio `total` (`Σ subtotales + costo_envio` en
  entregas). `monto_total` del pedido = Σ totales de **entregas − Σ totales de
  regresos**, recalculado con `calcularTotalPedido` al crear/editar viajes.
- En el detalle, tras cada operación se regeneran `resumen_productos`, `monto_total`
  y el estado (regla de rank mínimo, ver §3).

### 4.8 Códigos

- Pedido: 8 caracteres aleatorios únicos. Viaje: `V` + 7 caracteres.

### 4.9 Lista de pedidos

- Filtros por estado (incluye **Borrador**) y búsqueda (código o resumen). Por defecto
  no muestra borradores ni pedidos ocultos. El controller ve todos.
- Columnas: fecha de entrega, código, cliente, N°, resumen, vendedora, total,
  deuda, partes, estado (con acciones de cambio de estado).

---

## 5. Responsive / UI

- Desktop: sidebar fijo. Móvil: sidebar oculto + **botón flotante ☰** abajo a la
  derecha que despliega el menú de módulos con iconos; el menú tiene **scroll
  propio** y **bloquea el scroll del fondo** mientras está abierto.
- Tablas con `overflow-x-auto` (scroll horizontal en pantallas chicas).
- Formularios con grillas responsivas.

---

## 6. Inconsistencias / puntos a proponer (discutir con el usuario)

1. **Revertir confirmado → solicitado** deja el viaje de entrega ya creado y el
   primer pago ya registrado. ¿Deben revertirse o anularse también?
2. **Cancelar un pedido confirmado**: ¿qué pasa con el viaje programado y las
   unidades que ya se alistaron?
3. **Password en texto plano** (riesgo; MVP). ¿Migrar a hash?
4. **Pendientes SQL**: `03_tandas`, `04_tallas`, `05_pedidos_equipo`,
   `07_talla_stock_vendida` y `08_viajes_extras` ya están en Supabase
   (07 corrida el 16/ago/2026; `detalles_pedido` usa `talla_stock`/`talla_vendida`;
   08 agrega `viajes.total/costo_envio/direccion`, `detalles_pedido.devolucion_de`
   y los estados `pendiente_devolucion`/`devuelto`).
5. **Datos de prueba "SMOKE"** quedaron en la BD. ¿Limpiarlos?
6. El enum `tipo_talla` del `02_schema.sql` no incluye `AB`/`ABC` (solo los agrega
   `04_tallas.sql`). Al reconstruir la BD hay que correr ambos.
