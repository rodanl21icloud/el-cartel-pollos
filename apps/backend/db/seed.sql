-- Semilla MVP. SIN ensaladas ni vegetales frescos (regla de negocio).
-- Idempotente (INSERT OR IGNORE): seguro de re-ejecutar.

-- Insumos
INSERT OR IGNORE INTO ingredients (id, name, unit, stock_qty, min_stock_qty, cost_unit) VALUES
  ('ing-pollo',    'Pollo',          'unidad', 120,  20, 3500),
  ('ing-papas',    'Papas Scarsofy', 'gramo',  50000, 8000, 2),
  ('ing-empaque',  'Empaque Combo',  'empaque', 300, 50, 150);

-- Productos
INSERT OR IGNORE INTO products (id, sku, name, price, category) VALUES
  ('prod-combo-fam', 'COMBO-FAM', 'Combo Familiar', 18990, 'COMBO');

-- BOM / Receta del Combo Familiar
INSERT OR IGNORE INTO product_recipes (id, product_id, ingredient_id, qty_per_unit) VALUES
  ('rec-1', 'prod-combo-fam', 'ing-pollo',   1),     -- 1 pollo
  ('rec-2', 'prod-combo-fam', 'ing-papas',   600),   -- 600 g de papas
  ('rec-3', 'prod-combo-fam', 'ing-empaque', 1);     -- 1 empaque

-- Categorías de gasto
INSERT OR IGNORE INTO expense_categories (id, name, kind) VALUES
  ('cat-proveedores', 'Proveedores e insumos', 'OPERATIVO'),
  ('cat-sueldos',     'Sueldos y honorarios',  'OPERATIVO'),
  ('cat-arriendo',    'Arriendo y servicios',  'OPERATIVO'),
  ('cat-retiros',     'Retiros de socios',     'RETIRO');
