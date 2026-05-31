-- ============================================================
-- El Cartel de los Pollos — Esquema Turso DB (libSQL / SQLite)
-- Modelo: Delivery-only. Inventario teórico estricto (BOM).
-- Sin ensaladas / vegetales frescos (regla de negocio).
-- ============================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------
-- USERS — operadores y gerencia. Roles controlados por enum lógico.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,                 -- uuid
  username        TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,                    -- argon2/bcrypt
  full_name       TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('CAJERO','PREPARADOR','GERENCIA')),
  otp_secret      TEXT,                             -- secreto TOTP (solo GERENCIA)
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------
-- INGREDIENTS — insumos descontables del inventario teórico.
-- unit: 'unidad' | 'gramo' | 'mililitro' | 'empaque'
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingredients (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,             -- ej. 'Pollo', 'Papas Scarsofy', 'Empaque Combo'
  unit            TEXT NOT NULL CHECK (unit IN ('unidad','gramo','mililitro','empaque')),
  stock_qty       REAL NOT NULL DEFAULT 0,          -- stock teórico actual
  min_stock_qty   REAL NOT NULL DEFAULT 0,          -- umbral de alerta
  cost_unit       REAL NOT NULL DEFAULT 0,          -- costo por unidad de medida
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------
-- PRODUCTS — productos de venta (ej. 'Combo Familiar').
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY,
  sku             TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  price           REAL NOT NULL CHECK (price >= 0),
  category        TEXT NOT NULL DEFAULT 'COMBO',
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------
-- PRODUCT_RECIPES — BOM (Bill of Materials). Receta por producto.
-- Define cuánto de cada insumo se descuenta por 1 unidad vendida.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_recipes (
  id              TEXT PRIMARY KEY,
  product_id      TEXT NOT NULL,
  ingredient_id   TEXT NOT NULL,
  qty_per_unit    REAL NOT NULL CHECK (qty_per_unit > 0),  -- consumo por unidad de producto
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id)    REFERENCES products(id)    ON DELETE CASCADE,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE RESTRICT,
  UNIQUE (product_id, ingredient_id)
);

-- ----------------------------------------------------------------
-- SALES — cabecera de venta. Soporta sincronización offline-first.
-- payment_method desglosa el cierre de caja ciego.
-- client_uuid + payload_hash permiten idempotencia y anti-tamper.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales (
  id              TEXT PRIMARY KEY,
  client_uuid     TEXT NOT NULL UNIQUE,             -- generado en frontend (idempotencia)
  user_id         TEXT NOT NULL,                    -- cajero que registró
  total           REAL NOT NULL CHECK (total >= 0),
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('EFECTIVO','POS','TRANSFERENCIA')),
  status          TEXT NOT NULL DEFAULT 'CONFIRMADA' CHECK (status IN ('CONFIRMADA','ANULADA')),
  payload_hash    TEXT NOT NULL,                    -- HMAC-SHA256 del payload firmado
  synced_offline  INTEGER NOT NULL DEFAULT 0 CHECK (synced_offline IN (0,1)),
  sold_at         TEXT NOT NULL DEFAULT (datetime('now')),  -- timestamp del dispositivo
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales(sold_at);
CREATE INDEX IF NOT EXISTS idx_sales_payment ON sales(payment_method);

-- ----------------------------------------------------------------
-- SALE_ITEMS — detalle de venta. Congela precio al momento de venta.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sale_items (
  id              TEXT PRIMARY KEY,
  sale_id         TEXT NOT NULL,
  product_id      TEXT NOT NULL,
  qty             INTEGER NOT NULL CHECK (qty > 0),
  unit_price      REAL NOT NULL CHECK (unit_price >= 0),  -- snapshot del precio
  line_total      REAL NOT NULL CHECK (line_total >= 0),
  FOREIGN KEY (sale_id)    REFERENCES sales(id)    ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

-- ----------------------------------------------------------------
-- INVENTORY_ADJUSTMENTS — mermas obligatorias y ajustes manuales.
-- reason obliga a justificar toda diferencia de inventario.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id              TEXT PRIMARY KEY,
  ingredient_id   TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('MERMA','VENTA','REPOSICION','CONTEO')),
  qty_delta       REAL NOT NULL,                    -- negativo descuenta, positivo repone
  unit_cost       REAL NOT NULL DEFAULT 0,          -- costo unitario congelado al momento (P&L histórico)
  reason          TEXT NOT NULL,                    -- justificación obligatoria
  sale_id         TEXT,                             -- traza el descuento por BOM si aplica
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE RESTRICT,
  FOREIGN KEY (sale_id)       REFERENCES sales(id)       ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_adj_ingredient ON inventory_adjustments(ingredient_id);

-- ----------------------------------------------------------------
-- CASH_REGISTER_CLOSURES — Cierre de Caja Ciego.
-- Guarda lo DECLARADO por el operador y lo TEÓRICO calculado por backend.
-- La diferencia y la alerta se persisten para auditoría.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cash_register_closures (
  id                       TEXT PRIMARY KEY,
  user_id                  TEXT NOT NULL,
  session_id               TEXT,                  -- sesión de caja (apertura con fondo)
  period_start             TEXT NOT NULL,
  period_end               TEXT NOT NULL,
  opening_float            REAL NOT NULL DEFAULT 0, -- fondo inicial (vuelto)
  -- DECLARADO (lo único que envía el frontend):
  efectivo_declarado       REAL NOT NULL,
  pos_declarado            REAL NOT NULL,
  transferencias_declarado REAL NOT NULL,
  -- COMPONENTES del teórico (para transparencia del cuadre):
  ventas_efectivo          REAL NOT NULL DEFAULT 0,
  gastos_efectivo          REAL NOT NULL DEFAULT 0,
  movimientos_efectivo     REAL NOT NULL DEFAULT 0, -- DEPOSITO(-) / INGRESO(+) de caja
  -- TEÓRICO (calculado en backend, nunca expuesto antes del cierre):
  efectivo_teorico         REAL NOT NULL,
  pos_teorico              REAL NOT NULL,
  transferencias_teorico   REAL NOT NULL,
  -- DIFERENCIAS:
  diff_efectivo            REAL NOT NULL,
  diff_pos                 REAL NOT NULL,
  diff_transferencias      REAL NOT NULL,
  diff_total               REAL NOT NULL,
  has_descuadre            INTEGER NOT NULL DEFAULT 0 CHECK (has_descuadre IN (0,1)),
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (session_id) REFERENCES cash_sessions(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------
-- CASH_SESSIONS — apertura/cierre de caja con fondo inicial.
-- Solo una sesión OPEN a la vez (índice parcial único).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cash_sessions (
  id              TEXT PRIMARY KEY,
  opened_by       TEXT NOT NULL,
  opening_float   REAL NOT NULL DEFAULT 0 CHECK (opening_float >= 0),
  opened_at       TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at       TEXT,
  closure_id      TEXT,                            -- cierre asociado
  status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  FOREIGN KEY (opened_by) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_one_open_session
  ON cash_sessions(status) WHERE status = 'OPEN';

-- ----------------------------------------------------------------
-- CASH_MOVEMENTS — efectivo que entra/sale de la caja física sin ser
-- venta ni gasto (ej. depósito al banco, ingreso de fondo extra).
-- Afecta SOLO la cuadratura, no el flujo de caja (P&L).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cash_movements (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('DEPOSITO','INGRESO')), -- DEPOSITO: sale; INGRESO: entra
  amount          REAL NOT NULL CHECK (amount > 0),
  reason          TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES cash_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)         ON DELETE RESTRICT
);

-- ----------------------------------------------------------------
-- EXPENSE_CATEGORIES — categorías de gasto. kind RETIRO = no operativo.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expense_categories (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  kind            TEXT NOT NULL DEFAULT 'OPERATIVO' CHECK (kind IN ('OPERATIVO','RETIRO')),
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------
-- EXPENSES — egresos/gastos. Afectan el flujo de caja; si son en
-- efectivo dentro de la sesión, afectan también la cuadratura.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id              TEXT PRIMARY KEY,
  category_id     TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  amount          REAL NOT NULL CHECK (amount > 0),
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('EFECTIVO','POS','TRANSFERENCIA')),
  supplier        TEXT,
  description     TEXT NOT NULL,
  document_ref    TEXT,                            -- nro boleta/factura opcional
  spent_at        TEXT NOT NULL DEFAULT (datetime('now')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id)     REFERENCES users(id)              ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_expenses_spent  ON expenses(spent_at);
CREATE INDEX IF NOT EXISTS idx_expenses_method ON expenses(payment_method);
CREATE INDEX IF NOT EXISTS idx_expenses_cat    ON expenses(category_id);

-- ----------------------------------------------------------------
-- AUDIT_LOGS — APPEND-ONLY (lógico). Sin UPDATE ni DELETE permitidos.
-- Triggers bloquean cualquier mutación posterior a la inserción.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id              TEXT PRIMARY KEY,
  user_id         TEXT,                             -- puede ser NULL (evento de sistema)
  action          TEXT NOT NULL,                    -- ej. 'SALE_SYNC','CASH_CLOSE','HMAC_REJECT'
  entity          TEXT NOT NULL,                    -- tabla/recurso afectado
  entity_id       TEXT,
  severity        TEXT NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO','WARN','ALERT')),
  metadata        TEXT,                             -- JSON serializado
  ip_address      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- Append-Only enforcement: rechaza UPDATE y DELETE sobre audit_logs.
CREATE TRIGGER IF NOT EXISTS audit_logs_no_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs es append-only: UPDATE no permitido');
END;

CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs es append-only: DELETE no permitido');
END;
