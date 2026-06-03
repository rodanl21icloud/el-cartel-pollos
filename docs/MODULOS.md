# Guía de módulos

Cada módulo del menú lateral (`apps/frontend/src/config/nav.js`) tiene una pantalla
en `apps/frontend/src/screens/`. Formato por módulo: **Qué hace · Pantalla ·
Endpoints · Permiso · Tablas · Reglas clave**. Para los endpoints ver `API.md`; para
permisos ver `SEGURIDAD-RBAC.md`; para tablas ver `MODELO-DATOS.md`.

---
## OPERACIÓN

### 🛒 Vender (`pos`)
- **Qué hace**: punto de venta. Venta de productos (con modificadores) o venta libre (monto).
- **Pantalla**: `Pos.jsx` · **Permiso**: `pos.sell`
- **Endpoints**: `GET /products`, `POST /sales/sync` (firma HMAC), `GET /cash-register/current`, `GET/POST /clients`, `GET /products/:id/modifiers`, `GET /settings`.
- **Tablas**: `sales`, `sale_items`, `products`, `clients`, `inventory_adjustments`.
- **Reglas**: exige **caja abierta** (modal de apertura obligatorio si está cerrada); la venta se **firma con HMAC** (anti-tamper) y descuenta inventario por **BOM**; **offline-first** (cola IndexedDB, idempotente por `client_uuid`).

### 🧾 Ventas (`ventas`)
- **Qué hace**: historial de transacciones, ver/reimprimir comprobante, anular.
- **Pantalla**: `Ventas.jsx` · **Permiso**: `pos.sell` (anular: `sales.void`)
- **Endpoints**: `GET /sales`, `GET /sales/:id/receipt`, `POST /sales/:id/void`.
- **Tablas**: `sales`, `sale_items`.
- **Reglas**: anular cambia `status` a `ANULADA` (audita); no borra.

### 🕓 Venta retroactiva (`retroactiva`)
- **Qué hace**: registrar una venta con **fecha/hora pasada**.
- **Pantalla**: `VentaRetroactiva.jsx` · **Permiso**: `sales.backdate`
- **Endpoints**: `POST /sales/backdate`.
- **Tablas**: `sales` (`is_backdated`, `backdate_reason`).
- **Reglas**: flujo separado de gerencia, **máx. ~30 días atrás**, justificación obligatoria, fuertemente auditada.

### 💵 Caja (`cash`)
- **Qué hace**: apertura con fondo, depósitos/ingresos y **cierre ciego** con arqueo.
- **Pantalla**: `CashClose.jsx` (usa `AbrirCajaModal`, `denoms`) · **Permiso**: `cash.operate`
- **Endpoints**: `GET /cash-register/current`, `POST /cash-register/open|movement|close`.
- **Tablas**: `cash_sessions`, `cash_movements`, `cash_register_closures`.
- **Reglas**: el operador **declara** efectivo/POS/transferencias sin ver el teórico; el backend calcula el **teórico** y la **diferencia/descuadre** (se persisten). Solo **una sesión OPEN** a la vez (índice único). El resumen del turno solo lo ve quien tenga `reports.view`.

### 🛵 Despacho (`despacho`)
- **Qué hace**: tablero de pedidos con número de orden y estados.
- **Pantalla**: `Despacho.jsx` · **Permiso**: `dispatch.manage`
- **Endpoints**: `GET /dispatch`, `PUT /dispatch/:saleId/status`.
- **Tablas**: `sales` (`dispatch_status`, `order_number`, `business_day`).
- **Reglas**: estados `PENDIENTE → EN_PREPARACION → LISTO → ENTREGADO`.

### 🔮 Predicción de horno (`prediccion`)
- **Qué hace**: recomienda cuántos pollos hornear por día/franja.
- **Pantalla**: `Prediccion.jsx` · **Permiso**: `forecast.view`
- **Endpoints**: `GET /reports/forecast`.
- **Tablas**: `sales`, `sale_items`.
- **Reglas**: demanda en **pollo-equivalente** por día de semana con **recencia** (semanas recientes pesan más), ajuste por **clima** (open-meteo) y **feriados** chilenos; plan de horneadas por ventana de servicio.

### 🗑️ Mermas (`merma`)
- **Qué hace**: registrar pérdida de insumos.
- **Pantalla**: `Merma.jsx` · **Permiso**: `inventory.merma`
- **Endpoints**: `POST /inventory/merma`, `GET /inventory/ingredients`.
- **Tablas**: `inventory_adjustments` (tipo `MERMA`), `ingredients`.
- **Reglas**: **motivo obligatorio**; descuenta stock; alimenta la línea "mermas" del P&L.

---
## CATÁLOGO

### 🍗 Carta (`carta`)
- **Qué hace**: ABM de productos, precios, recetas (BOM), foto, visibilidad y **catálogo virtual** (link + QR).
- **Pantalla**: `Carta.jsx` · **Permiso**: `menu.manage` (recetas: `recipes.manage`)
- **Endpoints**: `GET /products/catalog`, `POST /products`, `PUT/DELETE /products/:id` (OTP), `GET/PUT /products/:id/recipe`, `GET/PUT /settings`.
- **Tablas**: `products`, `product_recipes`, `ingredients`, `business_settings`.
- **Reglas**: **validación de nombre** (descriptivo, sin códigos tipo `UPBEB125`); costo/ganancia/margen calculados por **BOM**; `in_catalog` controla visibilidad pública; editar precio/nombre exige **OTP** a roles no gerenciales.

### 📋 Cartelera (`cartelera`)
- **Qué hace**: arma una cartelera de precios imprimible desde la carta actual.
- **Pantalla**: `Cartelera.jsx` · **Permiso**: `menu.manage`
- **Endpoints**: `GET /products/catalog`.
- **Reglas**: selección de productos + filtro por categoría; relacionada con la **cartelera pública para TV** (`/cartelera/:slug`).

### ✨ Modificadores (`modificadores`)
- **Qué hace**: grupos de adiciones/opciones (presa, salsas) y su enlace a productos.
- **Pantalla**: `Modificadores.jsx` · **Permiso**: `menu.manage`
- **Endpoints**: `GET /modifiers`, `POST/DELETE /modifiers/groups`, `PUT /modifiers/groups/:id/products`, `POST/DELETE /modifiers/options`.
- **Tablas**: `modifier_groups`, `modifier_options`, `product_modifier_groups`.
- **Reglas**: cada grupo define `min/max_select` y si es requerido; cada opción tiene `price_delta`.

### 📦 Inventario (`inventario`)
- **Qué hace**: insumos (stock teórico), alertas de stock bajo, reposición y **ajuste auditado con PIN**.
- **Pantalla**: `Inventario.jsx` · **Permiso**: `inventory.manage`
- **Endpoints**: `GET /inventory/ingredients|alerts`, `POST /inventory/ingredients`, `PUT/DELETE /inventory/ingredients/:id` (OTP), `POST /inventory/ingredients/:id/restock`, `POST /inventory/ingredients/:id/set-stock` (PIN admin + rate-limit).
- **Tablas**: `ingredients`, `inventory_adjustments`.
- **Reglas**: stock teórico que descuenta el BOM al vender; el **set-stock** (reemplaza/suma) exige el **PIN de administrador** (bcrypt) y queda auditado.

---
## FINANZAS *(permiso base `reports.view`)*

### 📋 Resumen (`resumen`)
- KPIs del día/turno. **Pantalla**: `Resumen.jsx` · **Endpoints**: `GET /reports/dashboard`, `GET /reports/turn-summary`.

### 💱 Movimientos (`movimientos`)
- Ledger unificado (ventas, gastos, movimientos de caja). **Pantalla**: `Movimientos.jsx` · **Endpoints**: `GET /reports/movements`.

### 💸 Gastos (`gastos`)
- **Qué hace**: registrar egresos y retiros. **Pantalla**: `Gastos.jsx` · **Permiso**: `expenses.manage` (listar: `reports.view`).
- **Endpoints**: `GET /expenses`, `GET /expenses/categories`, `POST /expenses`.
- **Tablas**: `expenses`, `expense_categories` (kind `OPERATIVO`/`RETIRO`).
- **Reglas**: el método de pago afecta flujo y, si es efectivo en sesión, la cuadratura.

### 📈 Flujo de caja (`flujo`)
- Ingresos/egresos por día + saldo acumulado. **Pantalla**: `Flujo.jsx` · **Endpoints**: `GET /reports/cash-flow`.

### 🏦 Banco (`banco`)
- **Qué hace**: movimientos bancarios + conciliación; alimenta la "realidad bancaria" del P&L.
- **Pantalla**: `Banco.jsx` · **Endpoints**: `GET /bank/summary|movements|reconcile`, `POST /bank/movements` (`expenses.manage`), `PUT /bank/movements/:id/reconcile` (`expenses.manage`).
- **Tablas**: `bank_movements`, `business_settings` (`bank_balance`).

### 🧮 P&L (`pnl`)
- Estado de resultados. **Pantalla**: `Pnl.jsx` · **Endpoints**: `GET /reports/pnl`.
- **Fórmula**: `Utilidad bruta = Ventas − Costo insumos (BOM congelado, vía inventory_adjustments)`; `Utilidad operativa = bruta − Mermas − Gastos operativos`; **Retiros** aparte; sección **"realidad bancaria"** (egresos reales del banco).

### 📊 Estadísticas (`estadisticas`)
- Ventas por día/método, ranking de productos, comparativo de período. **Pantalla**: `Estadisticas.jsx` · **Endpoints**: `GET /reports/stats`.

---
## CLIENTES

### 👥 Clientes (`clientes`)
- ABM de clientes para domicilios (lookup por teléfono). **Pantalla**: `Clientes.jsx` · **Permiso**: `pos.sell` · **Endpoints**: `GET/POST /clients` · **Tablas**: `clients`.

---
## ADMINISTRACIÓN

### 🏪 Negocio (`ajustes`)
- Datos del local: nombre, dirección, WhatsApp, **slug del catálogo**, formas de entrega, ancho de papel, **PIN de admin**.
- **Pantalla**: `Ajustes.jsx` · **Permiso**: `settings.manage` · **Endpoints**: `GET/PUT /settings` (OTP), `PUT /settings/admin-pin` (OTP) · **Tablas**: `business_settings`.

### 👤 Usuarios (`usuarios`)
- Crear/editar staff, resetear contraseña, activar/desactivar.
- **Pantalla**: `Usuarios.jsx` · **Permiso**: `permissions.manage` · **Endpoints**: `GET/POST /users`, `PUT /users/:id`, `POST /users/:id/password` · **Tablas**: `users`.

### 🔐 Roles y permisos (`permisos`)
- Matriz **rol × permiso** editable.
- **Pantalla**: `Permisos.jsx` · **Permiso**: `permissions.manage` · **Endpoints**: `GET/PUT /permissions` (OTP), `GET /permissions/me` · **Tablas**: `role_permissions`.
- **Reglas**: **anti-lockout** — GERENCIA/ADMIN nunca pierden `permissions.manage`.

### 🛡️ Auditoría (`auditoria`)
- Bitácora de actividad (solo lectura).
- **Pantalla**: `Auditoria.jsx` · **Permiso**: `audit.view` · **Endpoints**: `GET /audit`, `GET /audit/actions` · **Tablas**: `audit_logs` (**append-only**, severidad INFO/WARN/ALERT).

---
## VISTAS PÚBLICAS (sin login)

### Carta pública — `PublicCatalog.jsx`
- Rutas `/carta/:slug` · `/catalogo/:slug` · `/menu/:slug`. **Endpoint**: `GET /public/catalog/:slug`.
- Muestra productos con `in_catalog=1`; el cliente arma pedido y lo envía por **WhatsApp** según las formas de entrega habilitadas. **Tablas**: `products`, `business_settings`.

### Cartelera TV — `PublicCartelera.jsx`
- Rutas `/cartelera/:slug` · `/tv/:slug`. **Endpoint**: `GET /public/catalog/:slug`.
- **Menuboard 16:9** rotativo (slides hero + columnas), **QR de WhatsApp**, **auto-refresco cada 60s**, autoescalado a la pantalla.

### Landing — `public/landing.html`
- Sitio estático de marca (link-in-bio) con CTAs a la **carta** y a **WhatsApp**, reseñas y redes. Servido en `/landing.html`.
