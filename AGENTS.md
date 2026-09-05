<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Persys_dos — contexto del proyecto

Antes de implementar, leer `NOTAS_PROYECTO.md` (raíz del proyecto): decisiones del usuario,
schema correcto (`supabase/02_schema.sql`), credenciales, enums, bugs corregidos y estado actual.
Actualizarlo cuando cambien decisiones o se resuelvan pendientes.

Leer también `DOCUMENTO_FUNCIONAL.md` (raíz del proyecto): **viaje del usuario, flujos de
estados y lógicas de negocio** definidos por el usuario. Si el código contradice ese
documento, es una inconsistencia y hay que plantearla. Mantenerlo actualizado cuando el
usuario defina nuevos flujos o reglas.

## Reglas de troubleshooting

- **Caché de Turbopack**: Si cambiaste código de `lib/` (archivos importados por API routes o
  componentes) y el cambio no se refleja en runtime, **sospechá de la caché**. Turbopack a
  veces no recarga módulos de `lib/` correctamente durante hot reload. Solución: matar el
  proceso `next dev` y levantarlo de nuevo. Esto ya causó ~30 min de debugging perdidos porque
  el código era correcto pero el server ejecutaba versión vieja.

## Reglas de diseño de UI

- **No usar `Input` de type number para cantidades en viajes**: usar botones `+` / `−`
  con display del valor. Los inputs numéricos son problemáticos en móvil y no tienen
  límites visuales. La lógica de stock se replica en el handler (`manejarCambioCantidad`)
  y en el JSX del botón.

## Reglas de stock en edición de viajes

- `cantidad_ventas` (API `/api/tallas`) YA descuenta las unidades de ESTE viaje
  (son "comprometidas"). Entonces:
  - `libres = cantidad_ventas - otras_líneas_en_este_modal`
  - `maxPermitido = cantidad_actual + libres` (NUNCA solo `libres`)
- Si `cantidad_ventas = 0` y el viaje tiene 2, max = 2 + 0 = 2. Correcto.
- Si `cantidad_ventas = 2` y el viaje tiene 2, max = 2 + 2 = 4. Correcto.

## Estado visual "Retrasado" (NO es un estado de BD)

- "Retrasado" es un estado **visual derivado**, nunca persistido. **NO tocar la BD**
  (no crear tablas/columnas/funciones/enums ni escribir nada) para esta feature.
  El estado real en Supabase (`programado`/`alistado`...) queda intacto.
- Regla de retraso: un viaje está retrasado si `estado ∈ {programado, alistado}` y
  su `fecha` programada es **anterior** a hoy (hoy NO cuenta). Enviado/terminado/
  cancelado nunca están retrasados.
- El pedido está retrasado si tiene ≥1 viaje retrasado → badge rojo
  "Entrega retrasada" / "Recojo retrasado" (según `tipo`), que **reemplaza**
  el label del estado real en el badge.
- Lógica y fuentes de hora viven en **`src/lib/retraso.ts`** (`obtenerFechaHoyLima`,
  `esRetrasado`, `etiquetaRetrasoPedido`). Reusar ese helper, no duplicar.
- **Zona horaria**: la app opera en Lima (UTC-5 fijo, Perú sin DST). La "fecha de
  hoy" se deriva de GMT − 5h.
- **NUNCA usar `new Date()` del PC para decidir "hoy"** (puede estar mal). Se lee el
  header HTTP `Date` (GMT) de hosts masivos en cadena: `api.github.com` →
  `www.cloudflare.com` → `example.com`. Si TODAS fallan, `new Date()` del server es
  solo el último recurso. Hay caché corto (TTL 30s) en el helper.
- El filtro "Retrasado" en la lista de pedidos se hace **en el cliente** (el backend
  no puede filtrar un estado que no existe en BD); el backend sí agrega un campo
  derivado `retraso`/`retrasado` por fila para poder pintar.

## Bug recurrente del modelo Big Pickle: bloques de herramienta vacíos (CERRAR la herramienta)

> **Este bug lo reportó el usuario (03/sep/2026) y afecta a como responde este modelo en opencode.**

**Qué pasaba:** el modelo emitía bloques de invocación de herramienta **malformados o vacíos**
y entraba en un **bucle infinito** que NUNCA ejecutaba la herramienta real. Ejemplos vistos:
- Varias `<invoke name="bash">` o `<read>` **con solo el nombre del parámetro** (`<parameter name="read">`)
  pero sin el valor, repetidas una y otra vez.
- Un bloque con solo el cierre (`</invoke>`) y sin la apertura/comando.
- Docenas de invocaciones idénticas encadenadas sin que ninguna se completara.

Esto dejaba la respuesta a medias, el usuario tenía que decir "continúa" todo el tiempo, y en
algunos casos se extendía hasta ser terminado por el usuario.

**Reglas para NO repetirlo:**
1. **Una sola invocación por mensaje** para cada herramienta que necesites, con TODOS los
   parámetros completos (`<parameter name="...">valor</parameter>`). Nunca un parámetro vacío.
2. **Nunca repetir el mismo bloque de invocación** sin un resultado intermedio. Si ya emitiste
   una llamada, esperá su resultado antes de emitir otra; no la reedites.
3. **Un bloque de herramienta está completo** solo si tiene apertura `<invoke>`, TODOS los
   parámetros con valor, y el cierre `</invoke>` en el MISMO bloque. No emitir solo cierres.
4. Tras invocar una herramienta, **detenerte** y esperar la respuesta; no encadenar más
   invocaciones con el formato roto.
5. Si vas a usar `bash`, ir directo a: `bash` con `command` lleno (y `workdir`/`timeout` si
   aplica). No escribir párrafos que separen la instrucción de la llamada si vas a invocar de
   inmediato; si escribís texto, es porque la hora de la llamada es después.

**ANTI-PATRON CONFIRMADO (NUNCA HACER):**
Emitir tags vacios como name=bash, name=grep, name=read **sin el bloque invoke completo**
con command, path, pattern, etc. Esto produce: cero ejecuciones reales, bucle infinito de
tags vacios que el usuario tiene que interrumpir manualmente, y la herramienta NUNCA se
ejecuta (el usuario ve solo los tags vacios en pantalla).

**Cuando se desato:** se dio durante la implementacion de la feature Retrasado (u en tareas de
edicion multiple), coincidiendo con pausas largas (build/latencia). Si notas que estas por
emitir un bloque de herramienta con parametros vacios o repitiendo el mismo, para y genera la
llamada correcta de una sola vez.

## Reglas de consistencia de estado viaje ↔ VPUs

- Un viaje `alistado` SIN VPUs activos es inconsistente → revertir a `programado`.
- En PATCH, si el viaje es `alistado` pero tiene 0 VPUs activos, tratarlo como
  `programado` (reemplazo total limpio: delete all + insert) en vez de la lógica
  de reconciliación compleja del handler `alistado`.
- Limpieza automática: detalles con `cantidad=0` y sin VPUs activos se eliminan
  al guardar el viaje.
