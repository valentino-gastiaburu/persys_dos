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
