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

# Cargar la carta real (40 productos) + insumos y recetas con food cost
npm -w @cartel/backend run seed:carta     # 40 productos en 6 categorías
npm -w @cartel/backend run seed:recetas   # 24 insumos + recetas (BOM) + tabla de food cost

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
| GET  | `/api/reports/turn-summary` · `/closures` · `/cash-flow` · `/pnl` | permiso `reports.view` |
| POST/PUT/DELETE | `/api/inventory/ingredients[...]` | permiso `inventory.manage` (+OTP en PUT/DELETE) |
| POST | `/api/inventory/ingredients/:id/restock` | reponer stock (+gasto opcional) |
| POST | `/api/products` · PUT/DELETE `:id` | permiso `menu.manage` (+OTP en PUT/DELETE) |
| GET/PUT | `/api/products/:id/recipe` | permiso `recipes.manage` (decimales) |
| GET/PUT | `/api/dispatch[/:saleId/status]` | permiso `dispatch.manage` |
| GET/PUT | `/api/permissions` · `/api/permissions/me` | permiso `permissions.manage` |
| GET | `/api/sales/:id/receipt` | datos del comprobante (imprimir/reenviar) |
| GET/PUT | `/api/settings` | datos del negocio (PUT: permiso `settings.manage` +OTP) |

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

## Permisos por módulo
La matriz `role_permissions` define qué puede hacer cada rol (10 módulos). Gerencia la
edita en caliente (`/permissions`, pantalla **Permisos**); el middleware `requirePermission`
gatea cada endpoint y la nav del frontend se arma según `permissions/me`. El **OTP de gerencia**
ya no es global: se aplica de forma selectiva solo a operaciones sensibles (editar/eliminar
carta, insumos y permisos), no a acciones operativas (despacho, recetas).

## Carta, inventario y recetas
- **Carta**: crear/editar/eliminar platos (SKU autogenerado, baja lógica).
- **Inventario**: crear/editar/eliminar insumos + **reponer stock** (con gasto enlazado opcional).
  Borrar un insumo en uso por una receta queda bloqueado.
- **Recetas (BOM)**: constructor por producto con cantidades **enteras o decimales**
  (ej. 0,5 pollo, 0,6 kg papas); muestra costo y margen en vivo. Al vender, descuenta del
  inventario en decimales.

## Comprobantes e impresión
Al cobrar, el POS muestra el N° de orden y permite **imprimir ticket de cocina** (sin precios,
ítems grandes), **imprimir boleta** para el cliente y **enviar el comprobante por WhatsApp**
(link `wa.me` con el resumen). La impresión es vía diálogo del SO (sirve con impresora térmica
58/80mm instalada como impresora del sistema); el ancho de papel se configura en **Ajustes**,
junto con nombre, dirección, teléfono, RUT y mensaje de pie. Los pedidos se pueden
**reimprimir / reenviar** desde el tablero de Despacho.

## Despacho (número de orden)
Cada venta recibe un **número de orden correlativo por día** (zona America/Santiago),
asignado por el **servidor al sincronizar** (sin choques entre cajas ni offline; una venta
offline recibe su número al reconectar). El **tablero de despacho** lista los pedidos del día
y permite avanzarlos: Pendiente → En preparación → Listo → Entregado.

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
