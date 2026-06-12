-- Semilla ESTRUCTURAL (datos de referencia mínimos para que la app funcione).
-- NO incluye datos demo (insumos/carta) ni el nombre del negocio: eso lo fija
-- la provisión por instancia (provision.mjs, variable BUSINESS_NAME).
-- Idempotente.

-- Categorías de gasto (requeridas por el módulo de Gastos).
INSERT OR IGNORE INTO expense_categories (id, name, kind) VALUES
  ('cat-proveedores', 'Proveedores e insumos', 'OPERATIVO'),
  ('cat-sueldos',     'Sueldos y honorarios',  'OPERATIVO'),
  ('cat-arriendo',    'Arriendo y servicios',  'OPERATIVO'),
  ('cat-retiros',     'Retiros de socios',     'RETIRO');
