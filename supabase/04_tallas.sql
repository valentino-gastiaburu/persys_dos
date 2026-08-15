-- ============================================================
-- Persys — Migración: combos de tipo de talla AB y ABC
-- Permite que un producto tenga A+B o A+B+C a la vez.
-- Aditiva e idempotente. No depende de 03_tandas.sql.
-- ============================================================

alter type tipo_talla add value if not exists 'AB';
alter type tipo_talla add value if not exists 'ABC';
