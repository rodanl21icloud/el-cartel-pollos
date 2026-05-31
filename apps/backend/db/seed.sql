-- Semilla MVP. SIN ensaladas ni vegetales frescos (regla de negocio).
-- IDs fijos para reproducibilidad del MVP.

-- Insumos
INSERT INTO ingredients (id, name, unit, stock_qty, min_stock_qty, cost_unit) VALUES
  ('ing-pollo',    'Pollo',          'unidad', 120,  20, 3500),
  ('ing-papas',    'Papas Scarsofy', 'gramo',  50000, 8000, 2),
  ('ing-empaque',  'Empaque Combo',  'empaque', 300, 50, 150);

-- Productos
INSERT INTO products (id, sku, name, price, category) VALUES
  ('prod-combo-fam', 'COMBO-FAM', 'Combo Familiar', 18990, 'COMBO');

-- BOM / Receta del Combo Familiar
INSERT INTO product_recipes (id, product_id, ingredient_id, qty_per_unit) VALUES
  ('rec-1', 'prod-combo-fam', 'ing-pollo',   1),     -- 1 pollo
  ('rec-2', 'prod-combo-fam', 'ing-papas',   600),   -- 600 g de papas
  ('rec-3', 'prod-combo-fam', 'ing-empaque', 1);     -- 1 empaque
