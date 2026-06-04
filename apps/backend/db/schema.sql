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
  role            TEXT NOT NULL,                    -- validado por catálogo en código (src/config/roles.js)
  otp_secret      TEXT,                             -- secreto TOTP (roles administradores)
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------
-- ROLE_PERMISSIONS — permisos configurables por módulo (matriz rol×permiso).
-- Reemplaza los chequeos de rol fijos: gerencia puede editar quién accede
-- a cada módulo. `permission` es una clave de módulo (ver services/permissions).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_permissions (
  role            TEXT NOT NULL,                    -- validado por catálogo en código (src/config/roles.js)
  permission      TEXT NOT NULL,
  allowed         INTEGER NOT NULL DEFAULT 0 CHECK (allowed IN (0,1)),
  PRIMARY KEY (role, permission)
);

-- ----------------------------------------------------------------
-- BUSINESS_SETTINGS — datos del local para comprobantes (fila única id=1).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_settings (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  name          TEXT NOT NULL DEFAULT 'El Cartel de los Pollos',
  address       TEXT,
  phone         TEXT,
  rut           TEXT,
  footer        TEXT,
  instagram     TEXT,
  paper_width   INTEGER NOT NULL DEFAULT 80 CHECK (paper_width IN (58, 80)),
  bank_balance  REAL,                               -- saldo contable bancario
  bank_balance_date TEXT,                           -- fecha del saldo
  catalog_slug  TEXT,                               -- identificador del catálogo público (URL)
  conteo_umbral INTEGER NOT NULL DEFAULT 3,         -- descalce/merma de pollos que dispara alerta de turno
  whatsapp      TEXT,                               -- número para pedidos por WhatsApp
  admin_pin_hash TEXT,                              -- PIN de administrador (bcrypt) para ajustes de stock
  pickup_enabled   INTEGER NOT NULL DEFAULT 1 CHECK (pickup_enabled IN (0,1)),   -- retiro en tienda
  delivery_enabled INTEGER NOT NULL DEFAULT 1 CHECK (delivery_enabled IN (0,1)), -- entrega a domicilio
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------
-- INGREDIENTS — insumos descontables del inventario teórico.
-- unit: 'unidad' | 'gramo' | 'mililitro' | 'litro' | 'empaque'
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingredients (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,             -- ej. 'Pollo', 'Papas Scarsofy', 'Empaque Combo'
  unit            TEXT NOT NULL CHECK (unit IN ('unidad','gramo','mililitro','litro','empaque')),
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
  image_url       TEXT,                             -- URL de la foto del producto
  description     TEXT,                             -- descripción para el catálogo público
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  in_catalog      INTEGER NOT NULL DEFAULT 1 CHECK (in_catalog IN (0,1)), -- visible en catálogo público
  available       INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0,1)),  -- disponible para vender (agotado = 0)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------
-- PRODUCT_PRICE_HISTORY — historial de cambios de precio de venta.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_price_history (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL,
  old_price   REAL,
  new_price   REAL NOT NULL,
  changed_by  TEXT,
  reason      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pph_product ON product_price_history(product_id, created_at);

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
  -- Despacho: número de orden correlativo por día (asignado por el servidor al sincronizar).
  business_day    TEXT,                             -- 'YYYY-MM-DD' (zona America/Santiago)
  order_number    INTEGER,                          -- correlativo dentro del business_day
  kind            TEXT NOT NULL DEFAULT 'PRODUCTOS' CHECK (kind IN ('PRODUCTOS','LIBRE')),
  note            TEXT,                             -- descripción (venta libre)
  subtotal        REAL,                             -- suma de ítems antes de descuento
  discount        REAL NOT NULL DEFAULT 0,          -- descuento aplicado
  client_id       TEXT,                             -- cliente (domicilio)
  delivery_address TEXT,                            -- dirección de entrega
  delivery_fee    REAL NOT NULL DEFAULT 0,          -- costo de envío
  is_backdated    INTEGER NOT NULL DEFAULT 0 CHECK (is_backdated IN (0,1)), -- venta retroactiva (fecha pasada)
  backdate_reason TEXT,                             -- justificación del registro retroactivo
  dispatch_status TEXT NOT NULL DEFAULT 'PENDIENTE'
                    CHECK (dispatch_status IN ('PENDIENTE','EN_PREPARACION','LISTO','ENTREGADO')),
  sold_at         TEXT NOT NULL DEFAULT (datetime('now')),  -- timestamp del dispositivo
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_sales_business_day ON sales(business_day, order_number);
CREATE INDEX IF NOT EXISTS idx_sales_dispatch ON sales(dispatch_status);

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
  unit_price      REAL NOT NULL CHECK (unit_price >= 0),  -- snapshot del precio base
  modifiers       TEXT,                                   -- JSON: adiciones elegidas [{name, price_delta}]
  modifiers_total REAL NOT NULL DEFAULT 0,                -- suma de price_delta por unidad
  note            TEXT,                                   -- nota/instrucción especial por ítem
  line_total      REAL NOT NULL CHECK (line_total >= 0),
  FOREIGN KEY (sale_id)    REFERENCES sales(id)    ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

-- ----------------------------------------------------------------
-- CLIENTS — clientes para domicilios (teléfono, dirección).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id              TEXT PRIMARY KEY,
  phone           TEXT UNIQUE,                      -- identificador natural
  name            TEXT NOT NULL,
  address         TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);

-- ----------------------------------------------------------------
-- MODIFICADORES / ADICIONES — grupos de opciones (presa, salsas, con/sin).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS modifier_groups (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,                    -- ej. 'Presa preferida', 'Salsas extra'
  min_select      INTEGER NOT NULL DEFAULT 0,       -- mínimo a elegir
  max_select      INTEGER NOT NULL DEFAULT 1,       -- máximo a elegir (0 = sin límite)
  is_required     INTEGER NOT NULL DEFAULT 0 CHECK (is_required IN (0,1)),
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS modifier_options (
  id              TEXT PRIMARY KEY,
  group_id        TEXT NOT NULL,
  name            TEXT NOT NULL,                    -- ej. 'Pechuga', 'Salsa BBQ', 'Sin ají'
  price_delta     REAL NOT NULL DEFAULT 0,          -- recargo (o 0)
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  FOREIGN KEY (group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE
);

-- Relación producto <-> grupo de modificadores.
CREATE TABLE IF NOT EXISTS product_modifier_groups (
  product_id      TEXT NOT NULL,
  group_id        TEXT NOT NULL,
  PRIMARY KEY (product_id, group_id),
  FOREIGN KEY (product_id) REFERENCES products(id)        ON DELETE CASCADE,
  FOREIGN KEY (group_id)   REFERENCES modifier_groups(id) ON DELETE CASCADE
);

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
  closing_detail           TEXT,                  -- JSON: conteo de efectivo al cierre
  -- CONTEO OPERATIVO de cierre (no altera inventario; solo control de turno):
  pollos_crudos_fin        INTEGER NOT NULL DEFAULT 0,
  merma_pollos             INTEGER NOT NULL DEFAULT 0,
  sacos_papas_fin          INTEGER NOT NULL DEFAULT 0,
  obs_cierre               TEXT,
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
  opening_detail  TEXT,                            -- JSON: conteo por denominación
  -- CONTEO OPERATIVO de apertura (no altera inventario; solo control de turno):
  pollos_horno     INTEGER NOT NULL DEFAULT 0,
  pollos_crudos_ini INTEGER NOT NULL DEFAULT 0,
  sacos_papas_ini  INTEGER NOT NULL DEFAULT 0,
  obs_apertura     TEXT,
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
-- BANK_MOVEMENTS — conciliación bancaria. Movimientos de la cuenta
-- (importados de cartola o registrados a mano). INGRESO/EGRESO.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_movements (
  id              TEXT PRIMARY KEY,
  fecha           TEXT NOT NULL,                    -- 'YYYY-MM-DD'
  amount          REAL NOT NULL CHECK (amount >= 0),
  direction       TEXT NOT NULL CHECK (direction IN ('INGRESO','EGRESO')),
  bank_type       TEXT,                             -- código del banco (A/C)
  description     TEXT,
  counterpart     TEXT,                             -- contraparte (cliente/proveedor)
  category        TEXT,                             -- clasificación
  source          TEXT,                             -- archivo o 'MANUAL'
  reconciled      INTEGER NOT NULL DEFAULT 0 CHECK (reconciled IN (0,1)),
  sale_id         TEXT,                             -- venta conciliada (opcional)
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_bank_fecha ON bank_movements(fecha);
-- Evita duplicar al re-importar la misma cartola.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bankmov
  ON bank_movements(fecha, amount, description, bank_type, direction);

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
