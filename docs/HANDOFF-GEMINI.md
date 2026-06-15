# El Cartel de los Pollos — Contexto para análisis (handoff a Gemini)

> Documento autocontenido. Estado real: `main @ d46f6ee` · 194 commits · 151 tests Vitest verdes.
> Sistema **POS + back-office** para **pollo a las brasas con delivery**, arquitectura "Zero Trust",
> inventario teórico estricto (BOM), control financiero (P&L) y multi-instancia.

---

## 1. Modelo de negocio
POS + back-office que cubre el ciclo completo: **vender → cocina → despacho → inventario → caja → gastos → flujo de caja → utilidad (P&L)**, con permisos configurables y trazabilidad total.
- **Delivery-first** (retiro + domicilio).
- **Inventario teórico estricto**: cada producto tiene **receta (BOM)**; al vender se descuentan insumos (enteros/decimales) con **costo congelado por movimiento** → P&L exacto.
- **`audit_logs` append-only** (triggers SQLite bloquean UPDATE/DELETE) + **cadena de hash encadenado** (tamper-evidence).
- Evolución reciente a modelo **D2C tipo Justo**: fidelización con cashback, tracking público, upselling y agente comercial proactivo.

## 2. Stack
| Capa | Tecnología |
|---|---|
| Frontend | Vite + React (JSX) + TailwindCSS · **PWA offline-first** (vite-plugin-pwa/Workbox) · **react-router-dom v7** · **zustand** (store de sesión) · code-splitting con `React.lazy` |
| Backend | Node.js + Express (ESM, handler exportado, apto Serverless/PaaS) |
| BD | **Turso** (libSQL/SQLite) vía `@libsql/client` |
| Auth | JWT (HS256) + OTP TOTP (otplib) + **firma HMAC-SHA256** de ventas (offline) + PIN admin (bcrypt) |
| IA | `@anthropic-ai/sdk` — chatbot de ventas y agente win-back, modelo **`claude-haiku-4-5`** (override `CHAT_MODEL`/`WINBACK_MODEL`) |
| Deploy | Render (un web service Node que sirve API **y** PWA en el mismo dominio) + Turso remota |
| CI | GitHub Actions (build + Vitest) |

## 3. Estructura (monorepo npm workspaces)
```
el-cartel-pollos/
├─ apps/
│  ├─ backend/   Express · src/controllers, src/services, src/middleware
│  │            db/schema.sql (25 tablas) · scripts/ (provision, seed, migrate-*.mjs)
│  │            test/ (27 archivos Vitest, supertest)
│  └─ frontend/  Vite/React · src/screens (37) · src/components/{pos,carta,ui}
│                src/config/{nav,brand,roles,icons} · src/lib/{api,crypto,offlineStore,...}
│                src/store/session.js (zustand) · main.jsx (router)
├─ docs/         CONTEXTO, API, ARQUITECTURA, MODELO-DATOS, SEGURIDAD-RBAC, NUEVA-INSTANCIA…
├─ render.yaml · render.pollo-tia.yaml   (2 instancias, ambas branch=main, autoDeploy)
└─ .github/workflows/
```

## 4. Flujos/arquitectura clave (lo más importante a entender)
- **Venta offline-first firmada**: el frontend arma el payload, lo **firma con HMAC-SHA256** usando una clave de sesión temporal entregada en login (`session_keys`). Si no hay red, la venta se **encola en IndexedDB** y se sincroniza al reconectar. Idempotencia por `client_uuid` (UNIQUE). El backend recalcula el hash canónico y **rechaza payloads manipulados**. Persistencia atómica vía `db.batch` (libSQL).
- **Descuento de inventario por BOM** dentro de la misma transacción atómica de la venta; `inventory_adjustments` guarda `unit_cost` congelado.
- **Cierre de caja CIEGO**: el cajero declara montos sin ver el teórico; el backend calcula diferencias y marca descuadre (`cash_register_closures`).
- **N° de orden de despacho** correlativo por **día hábil** (zona America/Santiago), asignado por el servidor al sincronizar. Estados: `PENDIENTE→EN_PREPARACION→LISTO→ENTREGADO`.
- **Cadena antifraude de auditoría**: cada registro de `audit_logs` lleva `prev_hash`/`record_hash` = `HMAC(AUDIT_CHAIN_SECRET, canonical|prev_hash)`. Serialización in-process (mutex) + orden por rowid. Endpoint `GET /api/audit/verify`. **Nota**: las instancias actuales usan el *fallback* a `JWT_SECRET` a propósito (la tabla es append-only, cambiar el secreto rompería la verificación de lo ya escrito); un `AUDIT_CHAIN_SECRET` dedicado solo en instancias nuevas desde el día cero.
- **Multi-instancia**: mismo código, **DB Turso y deploy Render separados** por local. Branding por build (`VITE_BRAND_NAME`/`VITE_BRAND_LOGO`) + datos en `business_settings`.

## 5. Modelo de datos (25 tablas; SQLite/libSQL)
- **Identidad/acceso**: `users`, `role_permissions`, `session_keys`, `business_settings` (datos del local + PIN admin + branding + `catalog_slug` + `loyalty_cashback_pct`).
- **Catálogo/inventario**: `products` (con `cost`, `tax_rate`, `track_inventory`, `in_catalog`, `available`), `product_price_history`, `ingredients`, `product_recipes` (BOM), `inventory_adjustments`, `modifier_groups`, `modifier_options`, `product_modifier_groups`.
- **Ventas/despacho**: `sales` (`client_uuid`, `payload_hash`, `business_day`, `order_number`, `dispatch_status`, `discount`, delivery, `is_backdated`…), `sale_items` (precio congelado), `clients` (key natural: `phone`).
- **Caja/finanzas**: `cash_sessions`, `cash_movements`, `cash_register_closures`, `expense_categories`, `expenses`, `bank_movements`.
- **Marketing/fidelización**: `campaigns`, `loyalty_accounts` (`points`=saldo cashback en CLP, `tier` BRONCE/PLATA/ORO), `loyalty_transactions` (EARN/REDEEM/ADJUST, ligado a `sale_id`).
- **Auditoría**: `audit_logs` (append-only + cadena de hash).

## 6. Seguridad / RBAC (Zero Trust)
- JWT obligatorio en todo `/api`; clave HMAC de sesión entregada en login y **revocada en logout** (`POST /api/auth/logout`).
- Firma HMAC por venta (offline-safe).
- **OTP de gerencia (TOTP)** selectivo solo en operaciones sensibles (editar carta/insumos/permisos/ajustes).
- **PIN admin** para ajustes manuales de stock.
- **Matriz rol×permiso editable en caliente** con salvaguarda anti-lockout.
- **Control de descuentos**: descuento sobre umbral (`DISCOUNT_MAX_PCT`, def 15%) exige **validación de supervisor** (credenciales en el payload firmado) y audita `SALE_DISCOUNT`.
- **6 roles**: `CAJERO, SUPERVISOR, PREPARADOR, DESPACHO, GERENCIA, ADMIN`.
- **15 permisos**: `pos.sell, sales.void, sales.backdate, cash.operate, dispatch.manage, forecast.view, expenses.manage, inventory.merma, inventory.manage, recipes.manage, menu.manage, reports.view, settings.manage, audit.view, permissions.manage`.

## 7. Superficie de API (selección)
**Públicas (sin JWT, montadas antes de `requireAuth`):**
- `GET /api/public/catalog/:slug` → catálogo de vitrina + bloque `upsell` (2 complementos de mayor margen calculados por BOM; nunca expone costo).
- `GET /api/public/tracking/:order_number` → estado del pedido **de hoy** (`{found,status,label,step,total_steps}`), sin PII.
- `GET /api/public/clients/:phone/wallet` → billetera de fidelización (saldo, tier, movimientos; solo primer nombre; rate-limit anti-enumeración).
- `GET /api/public/reviews`, `POST /api/public/chat` (chatbot ventas), `GET /api/public/delivery-quote`.
**Autenticadas (ejemplos):** `/api/sales/sync` (verifyHmac), `/api/cash-register/*`, `/api/products*`, `/api/inventory/*`, `/api/dispatch/:saleId/status`, `/api/reports/*`, `/api/marketing/{dashboard,customers,loyalty,winback}`, `/api/audit{,/verify}`, `/api/settings`.

## 8. Features D2C recientes (a evaluar especialmente)
- **Cashback %**: `accrueForSale` abona `round(total × loyalty_cashback_pct/100)` (1 punto = $1 CLP) dentro de la venta atómica, idempotente por `sale_id`; **tier por acumulado histórico** (SUM de EARN, no por saldo → no baja al canjear). `services/marketing/commercial.js`.
- **Billetera pública** + página `/billetera`.
- **Tracking público** + página `/seguimiento/:n` (stepper 4 estados, auto-refresh 20s).
- **Upselling BOM** en el catálogo público.
- **Agente comercial proactivo (win-back)**: `services/marketing/winback.js` selecciona clientes dormidos (15–60 días sin comprar, con teléfono, con favorito por BOM) y una **sola llamada `messages.create`** (Haiku 4.5, *structured output*, system cacheado) redacta mensajes de recuperación estilo "Los Pollos Hermanos". **El teléfono nunca se envía al modelo**; el `wa.me` se arma server-side. **No auto-envía**: gerencia revisa y envía con un clic (`GET /api/marketing/winback`, panel interno *Comercial → Recuperar clientes*). Degradación a plantilla si falta `ANTHROPIC_API_KEY`.

## 9. Frontend — cambios arquitectónicos recientes
- **Despiece** de los antiguos monolitos `Pos.jsx` (594→79 líneas) y `Carta.jsx` (690→215) en `components/pos/*` y `components/carta/*`.
- **react-router-dom v7**: `main.jsx` enruta públicas (`/catalogo`, `/menu`, `/carta`, `/cartelera`, `/tv`, `/seguimiento`, `/pedido`, `/billetera`) + `App` (resto). La pantalla activa se deriva de la URL; deep-link/refresh OK (Express sirve `index.html` + PWA `navigateFallback`).
- **Code-splitting**: pantallas `lazy()` con `<Suspense>`; `Login`/`Home`/`Pos` eager (offline). El chunk principal bajó de ~534KB a ~278KB.
- **Store global `useSession`** (zustand): user/perms/booting/sessionMsg + restore/login/logout (HMAC y revocación intactos).
- **POS responsive mobile-first**: shell `flex-col` (móvil) → `flex-row` 70/30 (lg+); carrito como **bottom sheet** deslizable en móvil (`PosCartSheet`), panel sticky 30% en desktop.
- **States primitives** (`Spinner/EmptyState/ErrorState/Forbidden/humanizeError`) estandarizadas en pantallas.

## 10. Testing y calidad
- **151 tests** Vitest (27 archivos) + supertest. Config single-process (`pool:'forks'`, `fileParallelism:false`, `isolate:false`, `maxWorkers:1`) sobre `test/test.db` compartido (se recrea por proceso vía `setup.js`).
- **Flakiness conocida**: por el `test.db` compartido en Windows, corridas consecutivas pueden mostrar fallos transitorios (locks/WAL); en verde estable al re-ejecutar. Evitar tests que dependan del **estado global** acumulado por otras suites (ya corregido en upsell).
- CI en GitHub Actions por push/PR.

## 11. Despliegue
- Render lee `render.yaml` (`cartel-pollos`) y `render.pollo-tia.yaml` (`pollo-de-la-tia`), **ambos `branch: main`, `autoDeploy: true`** → un push despliega **las dos instancias**.
- Cada servicio: `npm ci --include=dev && npm run build` (Vite) + `npm start` (Express sirve API + `apps/frontend/dist`). Catch-all de Express sirve `index.html` para rutas SPA (no `/api`, no `/health`).
- Variables por servicio: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET` (generado), `ANTHROPIC_API_KEY` (IA), opcionales `DISCOUNT_MAX_PCT`, `CHAT_MODEL`, `WINBACK_MODEL`.
- **Migraciones**: scripts idempotentes (`scripts/migrate-*.mjs`) que se aplican a prod **antes** de pushear el código que las usa. Última: `migrate-loyalty-cashback.mjs` (columna `loyalty_cashback_pct`), aplicada en ambas instancias.
- Instancias en prod: **El Cartel** (`https://cartel-pollos.onrender.com`) y **El Pollo de la Tía** (`https://pollo-de-la-tia.onrender.com`).

## 12. Restricciones de diseño vigentes (invariantes del proyecto)
- Prohibido romper la **retrocompatibilidad**, alterar el **esquema core** sin migración previa, o modificar la **matriz de roles** sin autorización explícita.
- No tocar la **lógica de carrito / firma HMAC / validación de caja** en refactors visuales.
- Mantener los **tests en verde**.

---

## 13. Ángulos sugeridos para el análisis de Gemini
1. **Seguridad**: solidez del modelo HMAC offline (replay/idempotencia), la cadena de auditoría (¿el fallback a `JWT_SECRET` es aceptable?), exposición de endpoints públicos (enumeración en `/wallet` y `/tracking`), control de descuentos por supervisor.
2. **Integridad de datos**: atomicidad venta+BOM+auditoría en un solo `batch`; correctitud del cashback (redondeos, idempotencia, tier por histórico); cierre de caja ciego.
3. **Multi-instancia**: riesgos de `autoDeploy` compartido en `main` (un push afecta ambos locales) y la coreografía migración-antes-de-push.
4. **Frontend/PWA**: estrategia offline (qué se precachea, lazy chunks offline), router + code-splitting, accesibilidad táctil del POS.
5. **IA**: diseño del agente win-back (privacidad del teléfono, structured output, degradación), idoneidad del modelo (Haiku 4.5) y costo en lote.
6. **Deuda/escalabilidad**: SQLite/libSQL para concurrencia de caja por cajero (hoy sesión de caja compartida), test.db compartido (flakiness), tablas `tips`/`work_logs` (propinas/turnos) planificadas pero no implementadas.
