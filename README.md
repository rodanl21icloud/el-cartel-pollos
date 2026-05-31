# El Cartel de los Pollos — POS & Gestión (MVP)

Operación **delivery-only**. Inventario teórico estricto vía **BOM**, **cierre de caja ciego**, **offline-first** y arquitectura **Zero Trust**. Sin ensaladas/vegetales frescos en el modelo de negocio.

## Stack
- **Frontend:** Vite + React + TailwindCSS (UI Poka-yoke: botones grandes, sin texto libre innecesario).
- **Backend:** Node.js + Express (export de handler listo para Serverless/PaaS).
- **DB:** Turso DB (libSQL / SQLite).

## Estructura del monorepo

```
el-cartel-pollos/
├─ package.json                  # workspaces (apps/*, packages/*)
├─ README.md
├─ apps/
│  ├─ backend/
│  │  ├─ package.json
│  │  ├─ db/
│  │  │  ├─ schema.sql           # DDL Turso (BOM, ventas, audit append-only, cierre)
│  │  │  └─ seed.sql             # semilla SIN ensaladas
│  │  ├─ scripts/
│  │  │  ├─ applySchema.js       # aplica schema.sql / seed.sql a Turso
│  │  │  └─ seedUsers.js         # usuarios demo + secreto OTP gerencia
│  │  └─ src/
│  │     ├─ index.js             # rutas + montaje de middlewares
│  │     ├─ db.js                # cliente libSQL
│  │     ├─ middleware/
│  │     │  ├─ auth.js           # JWT + roles + OTP gerencia en PUT/DELETE
│  │     │  └─ hmac.js           # validación anti-tamper HMAC-SHA256
│  │     ├─ controllers/
│  │     │  ├─ auth.js           # login: emite JWT + clave de sesión HMAC
│  │     │  ├─ sales.js          # sync de ventas + catálogo POS
│  │     │  ├─ inventory.js      # mermas obligatorias + alertas de stock
│  │     │  ├─ admin.js          # CRUD catálogo (PUT/DELETE -> OTP)
│  │     │  ├─ reports.js        # reportes de turno (solo GERENCIA)
│  │     │  └─ cashRegister.js   # Cierre de Caja CIEGO
│  │     └─ services/
│  │        ├─ audit.js          # escritura append-only
│  │        ├─ sales.js          # registro transaccional + descuento BOM
│  │        └─ sessionKeys.js    # claves de sesión temporales (HMAC)
│  └─ frontend/                  # Vite + React + Tailwind
│     ├─ index.html
│     ├─ vite.config.js          # proxy /api -> backend
│     ├─ tailwind.config.js
│     └─ src/
│        ├─ main.jsx
│        ├─ App.jsx              # shell + estado online/offline
│        ├─ screens/
│        │  ├─ Login.jsx
│        │  ├─ Pos.jsx           # UI Poka-yoke (botones grandes)
│        │  ├─ Merma.jsx         # mermas + alertas de stock
│        │  ├─ Manage.jsx        # reportes + precios (OTP si no es gerencia)
│        │  └─ CashClose.jsx     # cierre ciego (revela tras enviar)
│        └─ lib/
│           ├─ api.js            # cliente HTTP (JWT + header OTP)
│           ├─ crypto.js         # firma HMAC-SHA256 (Web Crypto API)
│           └─ offlineStore.js   # cola de ventas en IndexedDB + auto-sync
└─ packages/
   └─ shared/                    # (futuro) tipos y constantes compartidas
```

## Variables de entorno (backend)
```
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
JWT_SECRET=...           # HS256
PORT=3000
```

## Pilares de seguridad (Zero Trust)
1. **JWT** obligatorio en `/api/*`.
2. **OTP de gerencia** exigido a Cajero/Preparador para `PUT`/`DELETE` (`x-management-otp`).
3. **HMAC-SHA256** firma cada venta con clave de sesión temporal; el backend rechaza payloads manipulados (`PAYLOAD_MANIPULADO`).
4. **Cierre ciego**: el frontend nunca recibe el teórico antes del cierre.
5. **audit_logs append-only** reforzado por triggers (`UPDATE`/`DELETE` abortan).

## Puesta en marcha
```bash
npm install

# Backend: configurar credenciales
cp apps/backend/.env.example apps/backend/.env   # editar TURSO_* y JWT_SECRET

# Crear esquema + semilla (productos/insumos) + usuarios demo
npm -w @cartel/backend run db:seed      # schema.sql + seed.sql
npm -w @cartel/backend run seed:users   # imprime credenciales y OTP de gerencia

# Levantar
npm -w @cartel/backend run dev          # API en :3000
npm -w @cartel/frontend run dev         # POS en :5173 (proxy /api -> :3000)
```

### Usuarios demo (tras `seed:users`)
| Usuario   | Clave        | Rol        |
|-----------|--------------|------------|
| `cajero1` | `cajero123`  | CAJERO     |
| `prep1`   | `prep123`    | PREPARADOR |
| `gerente` | `gerente123` | GERENCIA   |

El secreto TOTP de gerencia se imprime en consola: cárgalo en una app authenticator
para autorizar `PUT`/`DELETE` de cajero/preparador (header `x-management-otp`).

## API (resumen)
| Método | Ruta | Rol / Guard |
|--------|------|-------------|
| POST | `/api/auth/login` | público |
| GET  | `/api/products` | autenticado |
| POST | `/api/sales/sync` | autenticado + **HMAC** |
| GET  | `/api/inventory/ingredients` · `/alerts` | autenticado |
| POST | `/api/inventory/merma` | autenticado (`reason` obligatorio) |
| GET  | `/api/cash-register/current` | estado de caja (ciego, sin teórico) |
| POST | `/api/cash-register/open` | CAJERO / GERENCIA (fondo inicial) |
| POST | `/api/cash-register/movement` | CAJERO / GERENCIA (depósito/ingreso) |
| POST | `/api/cash-register/close` | CAJERO / GERENCIA (ciego) |
| GET  | `/api/expenses/categories` | autenticado |
| POST | `/api/expenses` | autenticado (registrar gasto) |
| GET  | `/api/expenses` | **solo GERENCIA** |
| PUT/DELETE | `/api/products/:id` · `/api/ingredients/:id` | **OTP gerencia** si no es GERENCIA |
| GET  | `/api/reports/turn-summary` · `/closures` · `/cash-flow` · `/pnl` | **solo GERENCIA** |

## Flujo de venta (resumen)
1. Login → backend emite JWT + clave de sesión; el frontend la importa en memoria (`crypto.js`).
2. POS arma el pedido y firma el payload con **HMAC-SHA256**.
3. Con red: `POST /api/sales/sync` → `verifyHmac` valida la firma → registro **transaccional**
   (venta + items + descuento BOM de insumos + ajuste de inventario + auditoría) atómico.
4. Sin red: la venta firmada se encola en **IndexedDB** y se reintenta al volver online
   (idempotente por `client_uuid`).

## Finanzas
- **Gastos / egresos**: registrar por categoría (proveedores, sueldos, arriendo/servicios,
  retiros de socios), método de pago, proveedor y descripción.
- **Cuadratura de caja (ciego) con fondo**: se abre caja con un fondo inicial, se registran
  depósitos/ingresos de efectivo durante el turno, y al cerrar el teórico se calcula como
  `fondo + ventas_efectivo − gastos_efectivo ± movimientos`. Solo los gastos en **efectivo**
  afectan el cajón; los pagados por POS/transferencia salen del banco (van al flujo, no a la
  cuadratura). El cajero nunca ve el teórico antes de declarar.
- **Flujo de caja** (`/reports/cash-flow`, GERENCIA): ingresos vs egresos de **todo el dinero**
  por día, con saldo acumulado y desglose de egresos por categoría.
- **Estado de Resultados / P&L** (`/reports/pnl`, GERENCIA): ventas − **costo de insumos (BOM,
  costo congelado por movimiento)** = utilidad bruta; − mermas − gastos operativos = utilidad
  operativa; los **retiros de socios** se muestran aparte (no son gasto). Incluye **food cost %**
  y márgenes. El costo unitario se congela en `inventory_adjustments.unit_cost` al vender/mermar,
  para un P&L histórico correcto aunque cambien los precios de los insumos.

> Las marcas de tiempo (`sold_at`, `opened_at`, `spent_at`) se guardan en **ISO 8601 UTC**
> para que los rangos de período sean comparables (no usar `datetime('now')` en columnas
> que se filtran por rango).

## PWA / Offline
La app es una **PWA** (`vite-plugin-pwa` + Workbox). El service worker precachea el
app shell, por lo que el POS **abre sin conexión desde cero**; el catálogo usa
`NetworkFirst` (cae a caché si no hay red). El SW solo se activa en build de producción:

```bash
npm -w @cartel/frontend run build
npm -w @cartel/frontend run preview   # http://localhost:4173
```
Para probar offline: abrir el preview, DevTools → Application → Service Workers →
marcar **Offline**, y recargar. La app carga; las ventas quedan en cola y se
sincronizan al reconectar.
