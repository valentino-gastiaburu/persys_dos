# Persys — Documento funcional (viaje del usuario, flujos y lógicas)

> Documento vivo: aquí vive **cómo funciona la app** según lo que el usuario va
> definiendo. Antes de implementar cualquier cambio, leer este documento +
> `NOTAS_PROYECTO.md`. Si algo del código contradice esto, es una **inconsistencia**
> y hay que plantearla, no ignorarla.
>
> Última actualización: 15/ago/2026

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
   - Productos: búsqueda por nombre/IMEI, talla, cantidad (no puede exceder el
     stock disponible por talla), precio, género.
    - **Equipo de vendedoras**: Vendedora, Vendedora que colaboró 1 y Vendedora que
      colaboró 2 (por defecto = quien crea el pedido; cambiable a cualquier vendedora
      activa). La **Agendadora** no se muestra al crear (por defecto = quien crea) y
      solo se ve en el **detalle del pedido**.
    - Guardar → **"Terminar después"** crea el pedido en **`borrador`** (no reserva
      stock; puede seguir editándose y confirmarse después). **"Guardar Pedido"** crea
      y confirma en un solo paso (pedido `confirmado` + viaje).
3. **Confirmación** (vendedora): calcula total y resumen, crea el **viaje de
   entrega** (programado) y registra el **primer pago** si aplica.
4. **Almacén** → Almacén / Viajes: abre el viaje y **escanea QRs** para alistar
   cada unidad (valida talla; aplica *entalle* si la prenda lo requiere; controla
   cantidades por detalle). Con todas las unidades alistadas, marca el viaje
   **alistado** → el pedido pasa **automáticamente** a `alistado`.
5. **Envío**: viaje **enviado** → unidades salen de almacén (kardex de salida),
   pedido → `enviado`.
6. **Entrega**: viaje **terminado** → unidades `entregadas`, pedido → `entregado`,
   luego `cerrado`.
7. **Devoluciones/cambios**: se crea viaje tipo **recojo**. Mientras esté pendiente,
   el pedido queda `esperando_devolucion` o `esperando_cambio`. Al terminar el
   recojo, las unidades vuelven a almacén (kardex de entrada).
8. **Cancelación**: manual desde `solicitado` o `confirmado` (ver §3).
9. **Pagos**: registrar pagos (monto + método); la deuda se calcula
   `monto_total − pagado`.
10. **Mobile**: la barra lateral desaparece; se navega con un **botón flotante ☰**
    (abajo a la derecha) que abre el menú de módulos con iconos.

---

## 3. Flujo de estados del pedido

```
   crear: "Terminar después" → BORRADOR (no reserva stock)
          "Guardar Pedido" → CONFIRMADO directo (crea viaje)
        │
        ▼
   ┌────────────┐   Confirmar   ┌───────────────┐
   │ SOLICITADO │ ────────────► │  CONFIRMADO   │
   │            │               │               │
   │  ─ Confirmar (vía /confirmar)              │
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
- `confirmado` → `alistado` cuando el **viaje de entrega** pasa a `alistado`;
  luego `enviado` y `entregado` siguiendo al viaje.
- Con un **recojo pendiente** → `esperando_devolucion` / `esperando_cambio`.
- Cuando todos los viajes terminan → `entregado`.

---

## 4. Lógicas de negocio

### 4.1 Partes a pagar (formulario de nuevo pedido)

- `partes_a_pagar = 1` → en el form solo aparece el desplegable **"¿Pagó? Sí/No"**:
  - **Sí** → `monto_primer_pago = total` (al confirmar se registra el pago completo).
  - **No** → `monto_primer_pago = null`.
- `partes_a_pagar > 1` → aparece **"Primer pago (S/)"** y **"Fecha de la parte 2"**
  (guarda en `fecha_siguiente_pago`).

### 4.2 Confirmación del pedido

- Calcula `monto_total` = suma de subtotales de detalles activos + `costo_envio`.
- Genera `resumen_productos` con formato `IMEI (cant/talla/género)`.
- Crea el viaje de entrega `programado` y asigna los detalles al viaje.
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
  `talla_original` y se registra en el historial.
- **Stock por talla** = unidades existentes (excepto `eliminado`), no solo las
  `en_almacen`. El stock se carga con **tandas** (Productos Únicos → Añadir stock).
- **Stock ventas (comercial)** = stock almacén por talla **menos** las unidades
  comprometidas en **pedidos realizados**. Reservan stock los estados activos
  (`solicitado`, `confirmado`, `alistado`, `enviado`, `entregado`, `cerrado`,
  `esperando_devolucion`, `esperando_cambio`); **NO reservan** los borradores ni los
  cancelados/devueltos. Se ve en Productos → Lista con el toggle "Stock almacén / Stock
  ventas". Número azul = disponible, gris = 0, rojo = negativo (vendido de más).
- **Regla de negocio:** TODAS las validaciones al crear/editar un pedido usan el
  **stock de ventas**, no el de almacén: el select de tallas del pedido (nuevo pedido y
  modal "Editar productos") solo ofrece tallas con disponible > 0, y el servidor valida
  contra `getStockVentasPorTalla` al agregar un producto o subir su cantidad.
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

- El producto debe estar `en_almacen` y pertenecer al listado del viaje.
- Coincide talla exacta, salvo si el detalle es `entalle` (entonces cualquier talla
  del producto y la unidad se entalla).
- No puede exceder la `cantidad` del detalle. No se puede alistar en un viaje ya
  `enviado`/`terminado` ni un QR ya alistado en el viaje.
- Para marcar el viaje **alistado** se exige que **todas** las unidades del viaje
  estén alistadas.

### 4.6 Envío / término de viajes

- Orden de estados: `programado` → `alistado` → `enviado` → `terminado`. **No se
  puede retroceder.**
- `enviado`: unidades pasan a `en_viaje` + kardex `salida`.
- `terminado` (entrega): unidades `entregado`.
- `terminado` (recojo): unidades vuelven a `en_almacen` + kardex `entrada`.

### 4.7 Códigos

- Pedido: 8 caracteres aleatorios únicos. Viaje: `V` + 7 caracteres.

### 4.8 Lista de pedidos

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
4. **Pendientes SQL**: falta ejecutar `03_tandas.sql` y `04_tallas.sql` en Supabase
   (sin `04`, no existen los combos AB/AC/BC/ABC).
5. **Datos de prueba "SMOKE"** quedaron en la BD. ¿Limpiarlos?
6. El enum `tipo_talla` del `02_schema.sql` no incluye `AB`/`ABC` (solo los agrega
   `04_tallas.sql`). Al reconstruir la BD hay que correr ambos.
