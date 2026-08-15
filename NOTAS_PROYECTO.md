# Persys_dos — Contexto del proyecto

> Bitácora resumida: decisiones del usuario, respuestas a preguntas y estado actual.
> Última actualización: 14/ago/2026.

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

## Preguntas respondidas en el camino (resumen técnico)

- **¿Por qué `GET /api/auth/me` daba 401?** No era bug del app: (a) el cliente de prueba no
  guardaba la cookie `Secure` sobre `http://`, y (b) el server de `:3000` era un build viejo.
  Reconstruyendo y reiniciando funcionó. Flujo sesión verificado con cookie.
- **¿Por qué fallaba agregar detalle de pedido?** Error de PostgREST: `detalles_pedido` tiene
  **dos** FKs a `tallas` (`talla_id` y `talla_inicial`) → embed ambiguo. Se arregló usando
  hint `tallas!detalles_pedido_talla_id_fkey(nombre)` en 6 archivos.
- **¿Por qué faltaba la columna en la lista de pedidos?** `resumen_productos` no existía en
  `supabase/02_schema.sql` (la usaba el código). Se agregó la columna al schema y se re-corrió.
- **¿Por qué el PATCH del viaje fallaba en el smoke test?** El script enviaba POST (curl `-d`
  implica POST) a una ruta que solo implementa PATCH → 405 con cuerpo vacío. Artefacto del test.
- **Login con curl daba 500?** Artefacto de comillas de PowerShell al pasar `-d '...'`;
  usando body desde archivo (`-d @file`) funcionó. No era del app.

## Bugs corregidos (de esta fase)

1. `pedidos.resumen_productos` faltaba en `supabase/02_schema.sql` → se agregó (columna `text`).
2. Embed ambiguo `detalles_pedido → tallas` (doble FK) → hint `!detalles_pedido_talla_id_fkey`
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

Para una BD nueva: **01 → 02 → 03 → 04**. Para la BD existente: basta correr **03 y 04**
(aditivas e idempotentes; no tocan datos).

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

## GitHub

- Repo: `https://github.com/valentino-gastiaburu/persys_dos` (remoto `origin`, rama `main`,
  primer commit `bdd4bd2` pusheado el 12/ago/2026).

## Pendientes / notas

- **Ejecutar en Supabase SQL Editor:** `supabase/03_tandas.sql` y `supabase/04_tallas.sql`
  (sin correrlos, "Añadir stock" no funciona y no se puede elegir AB/ABC).
- El smoke test dejó **datos de prueba** en la BD (productos/clientes/pedidos con "SMOKE").
  Preguntar al usuario si limpiarlos.
- La ruta `detalles/route.ts` devuelve el mensaje de Postgres en errores (útil para debug;
  se puede quitar si prefiere mensajes genéricos).
- Evaluar bucket de Supabase Storage para `productos.foto_url` (no implementado).
