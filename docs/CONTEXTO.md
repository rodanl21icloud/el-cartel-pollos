# Contexto del proyecto — El Cartel de los Pollos

> Documento maestro de contexto. Sistema de **gestión y POS** para operación
> gastronómica de **pollo a las brasas, enfocada en delivery**. Arquitectura
> "Zero Trust", inventario teórico estricto (BOM) y control financiero serio.

_Última actualización: estado en `main @ 5d84621` · 178 commits._

---

## 1. Qué es y modelo de negocio

POS + back-office completo para un local de **pollo a las brasas con delivery**.
No es solo "tomar pedidos": cubre el ciclo entero —vender → cocina → despacho →
inventario → caja → gastos → flujo de caja → utilidad (P&L)— bajo permisos
configurables y con trazabilidad total.

Reglas de negocio del dominio:
- **Delivery-first** (retiro y despacho a domicilio).
- **Inventario teórico estricto**: cada producto tiene una **receta (BOM)**; al
  vender se descuentan los insumos automáticamente (enteros y decimales).
- **Sin ensaladas/vegetales frescos** en el modelo (decisión de negocio histórica).
- **`audit_logs` append-only**: la bitácora no se edita ni borra (triggers).

---

## 2. Stack tecnológico

| Capa | Tecnología |
|---|---|
| **Frontend** | Vite + React + TailwindCSS · **PWA** offline-first (Workbox) |
| **Backend** | Node.js + Express (export de handler, apto Serverless/PaaS) |
| **Base de datos** | **Turso** (libSQL / SQLite) — `@libsql/client` |
| **Auth** | JWT (HS256) + OTP TOTP (otplib) + firma **HMAC-SHA256** de ventas |
| **IA** | `@anthropic-ai/sdk` — agente de chat comercial (Claude Haiku) |
| **Otros** | bcryptjs (hash), xlsx (export), qrcode (cartelera/catálogo) |
| **Deploy** | Render (web service que sirve API + PWA) + Turso remota |
| **CI/CD** | GitHub Actions (build + 133 tests con vitest) |

---

## 3. Estructura (monorepo)

```
el-cartel-pollos/
├─ apps/
│  ├─ backend/   Express · 26 controladores · db/schema.sql (25 tablas)
│  │            scripts/ (provision, seed, backup, migrate-perms…)
│  └─ frontend/  Vite/React · 34 pantallas · config/ (nav, brand, roles, icons)
│                public/ (logos, assets de categorías/cartelera)
├─ docs/         API, ARQUITECTURA, MODELO-DATOS, MODULOS, SEGURIDAD-RBAC,
│                NUEVA-INSTANCIA, manual del cajero (PDF), QA, este CONTEXTO
├─ render.yaml             blueprint de El Cartel
├─ render.pollo-tia.yaml   blueprint de la 2ª instancia
└─ .github/workflows/      CI
```

---

## 4. Módulos funcionales (navegación por "momentos de trabajo")

La navegación (fuente única: `frontend/src/config/nav.js`) se organiza en 6 secciones;
cada ítem se habilita por un permiso:

**Vender** — Centro de Operaciones · **Punto de venta (POS)** · Pedidos · Venta
retroactiva · **Caja** · Cuadre de turno · Clientes.
**Cocina** — **KDS (tablero de cocina)** · **Despacho** (estados Pendiente→En
preparación→Listo→Entregado) · Plan de horno (predicción) · Mermas.
**Inventario** — Stock · **Carta** (productos + recetas BOM) · **Modificadores**
(presa, salsas, con/sin) · **Cartelera** (menú para TV) · Precios de compra.
**Finanzas** — Finanzas (P&L, flujo, costos, liquidez, impuestos) · Movimientos.
**Comercial** — campañas / marketing / fidelización / asistente IA.
**Administración** — Negocio (Ajustes) · Usuarios · Roles y permisos · Auditoría.

Capacidades destacadas (diferenciadores frente a un POS común):
- **Descuento de inventario por BOM** con costo congelado por movimiento (P&L exacto).
- **Cierre de caja CIEGO** con fondo inicial: el cajero declara montos sin ver el
  teórico; el backend calcula la diferencia y alerta el descuadre.
- **Offline-first**: las ventas se firman (HMAC) y se encolan en IndexedDB si no
  hay red; se sincronizan al reconectar (idempotencia por `client_uuid`).
- **N° de orden de despacho** correlativo por día (zona America/Santiago), asignado
  por el servidor al sincronizar.
- **Comprobantes**: ticket de cocina + boleta térmica (58/80mm) + WhatsApp al cliente,
  con QR de reseña de Google.
- **Delivery**: retiro/domicilio, cálculo de envío (Google Distance Matrix), zona.
- **P&L / Estado de Resultados**: ventas − costo insumos (BOM) − mermas − gastos =
  utilidad, con **food cost %** y márgenes.
- **Catálogo público** (`/catalogo/:slug`) y **cartelera para TV** (`/tv/:slug`).
- **Fidelización** (loyalty) y **campañas** comerciales + **asistente IA** (cierra por WhatsApp).

---

## 5. Modelo de datos (25 tablas)

**Identidad y acceso:** `users`, `role_permissions`, `session_keys` (claves HMAC
persistidas), `business_settings` (datos del local + PIN admin + branding).
**Catálogo / inventario:** `products`, `product_price_history`, `ingredients`,
`product_recipes` (BOM), `inventory_adjustments` (ventas/mermas/reposición con
`unit_cost` congelado), `modifier_groups`, `modifier_options`, `product_modifier_groups`.
**Ventas / despacho:** `sales` (con `client_uuid`, `payload_hash`, `business_day`,
`order_number`, `dispatch_status`, datos de delivery), `sale_items`, `clients`.
**Caja / finanzas:** `cash_sessions` (apertura con fondo), `cash_movements`
(depósitos/ingresos), `cash_register_closures` (cierre ciego), `expense_categories`,
`expenses`, `bank_movements`.
**Marketing:** `campaigns`, `loyalty_accounts`, `loyalty_transactions`.
**Auditoría:** `audit_logs` (**append-only** por triggers).

---

## 6. Seguridad y RBAC (Zero Trust)

- **JWT** obligatorio en todo `/api`; clave de sesión HMAC entregada en login.
- **Firma HMAC-SHA256** de cada venta con clave de sesión temporal → el backend
  rechaza payloads manipulados localmente (`PAYLOAD_MANIPULADO`).
- **OTP de gerencia (TOTP)** exigido de forma **selectiva** solo en operaciones
  sensibles (editar/eliminar carta, insumos, permisos, ajustes) — no en acciones
  operativas (despacho, recetas).
- **PIN de administrador** para ajustes manuales de stock.
- **Permisos configurables por módulo** (matriz rol×permiso, editable en caliente
  por gerencia, con salvaguarda anti-lockout).
- **`audit_logs` append-only**: ni con acceso a la base se puede editar/borrar.

**Roles (6):** `CAJERO`, `SUPERVISOR`, `PREPARADOR`, `DESPACHO`, `GERENCIA`, `ADMIN`.
**Permisos (15):** `pos.sell`, `sales.void`, `sales.backdate`, `cash.operate`,
`dispatch.manage`, `forecast.view`, `expenses.manage`, `inventory.merma`,
`inventory.manage`, `recipes.manage`, `menu.manage`, `reports.view`,
`settings.manage`, `audit.view`, `permissions.manage`.

---

## 7. Multi-instancia y branding

**Mismo código → varios locales**, cada uno con su **propia base Turso** y su
**propio deploy**. El branding es por instancia:

| Branding | Mecanismo |
|---|---|
| Nombre del staff (login/sidebar/título) | `VITE_BRAND_NAME` (build) |
| Logo (login/sidebar/boleta/cartelera/catálogo) | `VITE_BRAND_LOGO` (build) |
| Nombre/datos para clientes (boletas/cartelera) | `business_settings` (`BUSINESS_NAME` al provisionar) |

Provisión de una instancia nueva y vacía:
`BUSINESS_NAME="..." node scripts/provision.mjs` (aplica esquema + `seed-core.sql`,
fija el negocio y crea el usuario gerencia). Guía: `docs/NUEVA-INSTANCIA.md`.

---

## 8. Despliegue

> **`AUDIT_CHAIN_SECRET` (cadena antifraude).** Las instancias **existentes** (El Cartel,
> El Pollo de la Tía) usan a propósito el *fallback* a `JWT_SECRET`: como `audit_logs` es
> append-only y sus registros ya se hashearon con ese secreto, fijar un `AUDIT_CHAIN_SECRET`
> distinto haría que `verifyAuditChain` reportara una ruptura permanente en todo lo previo
> (los hashes viejos no se pueden recomputar). En **instancias NUEVAS**, en cambio, definir
> un `AUDIT_CHAIN_SECRET` dedicado **desde el día cero** (antes del primer registro) para
> separar la firma JWT de la cadena de auditoría.

- Render lee `render.yaml` (El Cartel) y `render.pollo-tia.yaml` (El Pollo de la Tía)
  desde `main`. Cada servicio: build de la PWA + servidor que expone API y PWA en el
  mismo dominio; base Turso por variables (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`).
- `JWT_SECRET` se genera por servicio. Los datos de cada local quedan 100% separados.

**Instancias en producción:**
- **El Cartel de los Pollos** — servicio `cartel-pollos`.
- **El Pollo de la Tía** — `https://pollo-de-la-tia.onrender.com` (base `epdlt`, vacía,
  con su nombre y logo propios).

---

## 9. Calidad

- **133 tests** (vitest, 23 archivos) verdes; build de frontend verde.
- CI en GitHub Actions sobre cada push/PR.
- Documentación extensa en `docs/` (API, arquitectura, modelo de datos, RBAC,
  QA post-deploy, manual del cajero en PDF).

---

## 10. Correr en local

```bash
npm install
cp apps/backend/.env.example apps/backend/.env   # TURSO_* o file:local-dev.db, JWT_SECRET
npm -w @cartel/backend run db:seed               # esquema + semilla demo
npm -w @cartel/backend run seed:users            # usuarios demo + OTP
npm -w @cartel/backend run dev                   # API :3000
npm -w @cartel/frontend run dev                  # PWA :5173 (proxy /api -> :3000)
```

Rutas públicas (sin login): `/catalogo/:slug` (catálogo cliente) · `/tv/:slug`
(cartelera para pantalla).
