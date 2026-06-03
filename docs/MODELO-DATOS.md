# Modelo de datos

Fuente: `apps/backend/db/schema.sql` (Turso/libSQL = SQLite). IDs `TEXT` (UUID),
timestamps `TEXT` (ISO/`datetime('now')`). `PRAGMA foreign_keys = ON`.

## Tablas

| Tabla | Propósito | Columnas clave | Relaciones |
|---|---|---|---|
| `users` | Operadores y gerencia | `username`(unique), `password_hash`, `role`, `otp_secret`, `is_active` | referida por casi todas las tablas con `user_id` |
| `role_permissions` | Matriz RBAC | PK(`role`,`permission`), `allowed` | — (roles validados en código) |
| `business_settings` | Datos del local (fila única `id=1`) | `name`, `address`, `whatsapp`, `catalog_slug`, `paper_width`, `admin_pin_hash`, `bank_balance`, `pickup/delivery_enabled` | — |
| `ingredients` | Insumos del inventario teórico | `name`(unique), `unit`, `stock_qty`, `min_stock_qty`, `cost_unit` | — |
| `products` | Productos de venta | `sku`(unique), `name`, `price`, `category`, `in_catalog`, `is_active` | — |
| `product_recipes` | **BOM**: insumo por unidad de producto | `qty_per_unit`, unique(`product_id`,`ingredient_id`) | `product_id`→products(CASCADE), `ingredient_id`→ingredients(RESTRICT) |
| `sales` | Cabecera de venta | `client_uuid`(unique), `total`, `payment_method`, `status`, `payload_hash`, `business_day`, `order_number`, `dispatch_status`, `is_backdated`, `sold_at` | `user_id`→users; `client_id`→clients (lógico) |
| `sale_items` | Detalle de venta (precio congelado) | `qty`, `unit_price`, `modifiers`(JSON), `line_total` | `sale_id`→sales(CASCADE), `product_id`→products(RESTRICT) |
| `clients` | Clientes para domicilio | `phone`(unique), `name`, `address` | referida por `sales.client_id` |
| `modifier_groups` | Grupos de adiciones | `min_select`, `max_select`, `is_required` | — |
| `modifier_options` | Opciones del grupo | `name`, `price_delta` | `group_id`→modifier_groups(CASCADE) |
| `product_modifier_groups` | Enlace producto↔grupo | PK(`product_id`,`group_id`) | →products, →modifier_groups (CASCADE) |
| `inventory_adjustments` | Movimientos de stock (COGS) | `type`(MERMA/VENTA/REPOSICION/CONTEO), `qty_delta`, `unit_cost`(congelado), `reason` | `ingredient_id`→ingredients, `user_id`→users, `sale_id`→sales(SET NULL) |
| `cash_sessions` | Apertura/cierre de caja con fondo | `opening_float`, `status`(OPEN/CLOSED), `closure_id` | `opened_by`→users |
| `cash_movements` | Efectivo no-venta de la sesión | `type`(DEPOSITO/INGRESO), `amount`, `reason` | `session_id`→cash_sessions(CASCADE), `user_id`→users |
| `cash_register_closures` | Cierre ciego (declarado vs teórico) | `efectivo/pos/transferencias_declarado`, `*_teorico`, `diff_*`, `has_descuadre` | `user_id`→users, `session_id`→cash_sessions(SET NULL) |
| `expense_categories` | Categorías de gasto | `name`(unique), `kind`(OPERATIVO/RETIRO) | referida por `expenses.category_id` |
| `expenses` | Egresos/gastos | `amount`, `payment_method`, `supplier`, `description`, `spent_at` | `category_id`→expense_categories, `user_id`→users |
| `bank_movements` | Conciliación bancaria | `fecha`, `amount`, `direction`(INGRESO/EGRESO), `reconciled`, `category` | `created_by`→users; `sale_id` (lógico) |
| `audit_logs` | Bitácora **append-only** | `action`, `entity`, `severity`(INFO/WARN/ALERT), `metadata`(JSON), `ip_address` | `user_id`→users (nullable) |

## Relaciones (vista textual)
```
users ──< sales ──< sale_items >── products ──< product_recipes >── ingredients
                         │                                  ▲
                         └─ modifiers(JSON)                 │ (descuento BOM)
products ──< product_modifier_groups >── modifier_groups ──< modifier_options
sales ──< inventory_adjustments >── ingredients         (type=VENTA: COGS congelado)
users ──< cash_sessions ──< cash_movements
            └──< cash_register_closures
expense_categories ──< expenses ── users
bank_movements ── users
clients ──< sales
```

## Notas e invariantes
- **Append-only de auditoría**: triggers `audit_logs_no_update` / `audit_logs_no_delete`
  hacen `RAISE(ABORT, …)` ante cualquier UPDATE/DELETE sobre `audit_logs`.
- **Una sola caja abierta**: índice único parcial `uniq_one_open_session` sobre
  `cash_sessions(status) WHERE status='OPEN'`.
- **Conciliación sin duplicados**: índice único `uniq_bankmov` sobre
  `bank_movements(fecha, amount, description, bank_type, direction)`.
- **COGS / food cost**: el costo de insumos del P&L sale de `inventory_adjustments`
  tipo `VENTA` (`SUM(ABS(qty_delta)*unit_cost)`), con **costo congelado** al momento
  de la venta — no se recalcula con el costo actual del insumo.
- **`sales`**: `business_day` (zona America/Santiago) + `order_number` correlativo
  por día (despacho); `payload_hash` guarda la firma HMAC; `client_uuid` da idempotencia
  offline.
- Aplicar el esquema: usar `db.executeMultiple(sql)` (parseo server-side, soporta
  triggers) — no dividir por `;` en cliente contra Turso remoto.
