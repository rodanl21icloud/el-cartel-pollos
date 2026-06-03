# Arquitectura — El Cartel de los Pollos

POS + gestión para una rotisería: venta (offline-first), caja ciega, inventario por
receta (BOM), finanzas (P&L, flujo, banco), predicción de horno, carta pública y
cartelera para TV. Producción: https://cartel-pollos.onrender.com

## Stack
- **Monorepo** npm workspaces (`apps/*`).
- **Backend** (`apps/backend`): Node.js + **Express** (ESM) + **Turso/libSQL** (`@libsql/client`).
- **Frontend** (`apps/frontend`): **Vite + React (JSX) + TailwindCSS**, **PWA** (vite-plugin-pwa, cola offline en IndexedDB).
- **Un solo servicio**: Express expone la API en `/api` y **sirve la PWA** (build de Vite en `apps/frontend/dist`) en el mismo dominio → sin CORS.
- **Deploy**: Render (`render.yaml`, servicio Node persistente) + Turso. Detalle en `DEPLOY.md`.

> ¿Por qué servidor persistente y no serverless? Las **claves HMAC de sesión** que
> firman las ventas viven en memoria del proceso; serverless las perdería.

## Layout del repo
```
apps/backend/
  src/index.js            # montaje de TODAS las rutas /api + estáticos del frontend
  src/db.js               # cliente libSQL (TURSO_DATABASE_URL/_AUTH_TOKEN)
  src/controllers/*       # auth, sales, cashRegister, dispatch, inventory, admin,
                          # recipes, modifiers, clients, expenses, bank, reports,
                          # settings, users, permissions, audit, publicCatalog
  src/middleware/         # auth.js (requireAuth, requireOtpForMutation), permissions.js
                          # (requirePermission), hmac.js (verifyHmac), rateLimit.js
  src/services/           # permissions.js (matriz RBAC), audit.js (writeAudit)
  src/config/roles.js     # catálogo de roles
  db/schema.sql           # esquema completo + triggers (append-only de auditoría)
  db/seed.sql             # datos base idempotentes
  scripts/                # provision, migrate-*, set-admin-pin, backup, e2e, etc.
  test/                   # vitest (helpers, suites por dominio)
apps/frontend/
  src/main.jsx            # entrypoint: enruta páginas PÚBLICAS por pathname
  src/App.jsx             # shell autenticado (estado `screen`, sin react-router)
  src/screens/*.jsx       # una pantalla por módulo (ver MODULOS.md)
  src/components/          # PeriodNav, ui/States, AbrirCajaModal, denoms, etc.
  src/config/nav.js       # arquitectura de información (módulos × permiso) — fuente única
  src/config/roles.js     # etiquetas de rol para la UI
  src/lib/                # api.js, offlineStore.js, receipt.js, crypto.js, print.js,
                          # productName.js, categoryAssets.js
  public/                 # landing.html, logo.jpeg, hero-*.jpg, iconos PWA
docs/                     # esta documentación
render.yaml               # blueprint de Render
```

## Ruteo (sin react-router)
- **App autenticada**: `App.jsx` mantiene un estado `screen`; el menú lateral se
  arma desde `config/nav.js` filtrando por permiso. Cada pantalla se renderiza con
  `{screen === 'x' && <Pantalla/>}` y hay un **guard por permiso** (`<Forbidden/>`
  si falta el permiso del ítem). Incluye **auto-logout por inactividad** (30 min) y
  manejo global del evento `session-expired` (401) para cerrar sesión limpio.
- **Páginas públicas** (sin login), resueltas en `main.jsx` por `window.location.pathname`:
  - `/catalogo/:slug` | `/menu/:slug` | `/carta/:slug` → **PublicCatalog** (carta para clientes, pedido por WhatsApp).
  - `/cartelera/:slug` | `/tv/:slug` → **PublicCartelera** (menuboard 16:9 para TV).
  - `/landing.html` → landing estática (servida desde `public/`).

## Flujo de una venta (offline-first + anti-tamper)
1. Al **login** el backend entrega `{ token, user, session:{ id, key } }`. La `key`
   (clave HMAC de la sesión) se guarda **solo en memoria** del cliente (`lib/crypto.js`).
2. El POS arma el payload de la venta y lo **firma con HMAC-SHA256** usando esa clave.
3. `POST /api/sales/sync` pasa por `verifyHmac` (middleware) → si la firma no cuadra
   con la sesión, se rechaza (anti-tamper) y se audita.
4. `controllers/sales.syncSale` persiste `sales` + `sale_items`, **descuenta inventario
   por BOM** (`product_recipes` → `inventory_adjustments` tipo `VENTA` con **costo
   congelado**), asigna `order_number` correlativo por `business_day` y escribe `audit_logs`.
5. **Offline**: si no hay red, `lib/offlineStore.js` encola la venta en IndexedDB;
   `flushQueue()` la sincroniza al recuperar conexión (idempotente por `client_uuid`).

## Datos y seguridad (resumen)
- **Auth**: JWT HS256; `requireAuth` protege **todo** `/api` (salvo `/api/auth/login` y
  `/api/public/...`). Ver `SEGURIDAD-RBAC.md`.
- **RBAC**: matriz `role_permissions` (data-driven) + `requirePermission(perm)`.
- **OTP** (TOTP): `requireOtpForMutation` en mutaciones sensibles (editar carta,
  ajustes, permisos). **PIN de admin** (bcrypt) para ajuste de stock auditado.
- **Auditoría**: `audit_logs` **append-only** (triggers bloquean UPDATE/DELETE).
- Modelo de datos completo en `MODELO-DATOS.md`.

## PWA
- `registerType: 'autoUpdate'`; `navigateFallback: '/index.html'` con denylist
  `[/^\/api\//, /^\/landing/]`. El SW precachea la app; tras un deploy, una pantalla
  ya abierta necesita una recarga para tomar la versión nueva (ver nota en DEPLOY.md).

## Deploy y variables de entorno
- **Render** (`render.yaml`): `buildCommand: npm ci --include=dev && npm run build`,
  `startCommand: npm start`, `healthCheckPath: /health`, `autoDeploy: true`.
- **Variables**:
  | Variable | Uso |
  |---|---|
  | `TURSO_DATABASE_URL` | URL libSQL de la base (secreto) |
  | `TURSO_AUTH_TOKEN` | token de Turso (secreto) |
  | `JWT_SECRET` | firma de tokens (Render lo genera) |
  | `JWT_TTL` | vigencia del token (def. `12h`) |
  | `NODE_ENV` | `production` (≠ `serverless` para que el server haga `listen`) |
  | `PORT` | puerto local (def. 3000) |
- **Bootstrap** de una base nueva: `scripts/provision.mjs` (aplica `schema.sql` + `seed.sql`
  y crea un usuario GERENCIA con contraseña fuerte + OTP). Ver `ONBOARDING.md`.

## Tests
- **Vitest** (`apps/backend/test`), single-fork (BD en memoria + Map HMAC compartidos).
  `npm test --workspace @cartel/backend`.
