# Onboarding para desarrolladores

## 1. Requisitos
- Node.js 20+ y npm. Una base **Turso** (o un archivo libSQL local para desarrollo).

## 2. Puesta en marcha local
```bash
npm install                                   # instala el monorepo

# .env del backend (apps/backend/.env)
#   TURSO_DATABASE_URL=file:local-dev.db       # o libsql://...turso.io
#   TURSO_AUTH_TOKEN=                           # vacío si es archivo local
#   JWT_SECRET=<cadena larga aleatoria>
#   JWT_TTL=12h

# Esquema + datos base + usuario GERENCIA (imprime credenciales + OTP una vez)
node apps/backend/scripts/provision.mjs
node --env-file=apps/backend/.env apps/backend/scripts/set-admin-pin.mjs <PIN>

# correr (2 terminales)
npm run dev   --workspace @cartel/backend      # API en :3000
npm run dev   --workspace @cartel/frontend     # Vite en :5173 (proxy /api → :3000)
```
> En producción Express sirve la build (`apps/frontend/dist`) en el mismo dominio;
> en dev el proxy de Vite enruta `/api`.

## 3. Scripts útiles (ver `package.json`)
| Comando | Qué hace |
|---|---|
| `npm run build` | build del frontend (Vite) |
| `npm start` | inicia el backend (sirve API + dist) |
| `npm test --workspace @cartel/backend` | suite Vitest |
| `node apps/backend/scripts/provision.mjs` | aplica schema+seed y crea GERENCIA + OTP |
| `scripts/set-admin-pin.mjs <PIN>` | fija el PIN de administrador |
| `scripts/backup.mjs` | respaldo de la base |
| `scripts/migrate-*.mjs` | migraciones idempotentes (roles, permisos, admin-pin, etc.) |

> **Aplicar `.sql`**: usa `db.executeMultiple(sql)` (parseo server-side, soporta
> triggers); no dividas por `;` en cliente contra Turso remoto.

## 4. Convenciones de código
**Frontend**
- **Sin react-router**: `App.jsx` es un shell con estado `screen`; el menú y el guard
  por permiso salen de `config/nav.js` (fuente única de módulos). Las páginas públicas
  se resuelven por `pathname` en `main.jsx`.
- `lib/api.js`: cliente HTTP único (añade `Authorization: Bearer` y, si aplica,
  `x-management-otp`). Maneja 401 de sesión globalmente.
- `lib/offlineStore.js`: cola IndexedDB (ventas offline) + `flushQueue()`.
- `components/ui/States.jsx`: `Spinner` / `EmptyState` / `ErrorState` / `Forbidden` /
  `humanizeError`. **Toda pantalla con fetch** debe tener los 4 estados (loading/error/empty/data).
- `components/PeriodNav.jsx`: navegación temporal (Día/Mes/Año) que emite `{from,to}` ISO.
- Marca/colores: `tailwind.config.js` (`colors.cartel`); textos de UI en español (Chile).

**Backend**
- Controladores delgados; lógica transversal en `services/` (`audit.writeAudit`,
  `permissions`). Middlewares: `requireAuth`, `requirePermission`, `requireOtpForMutation`,
  `verifyHmac`, `rateLimit`.
- **Auditar** toda mutación relevante con `writeAudit(...)`.
- Errores: `res.status(code).json({ error: 'CODIGO' })` (el cliente los humaniza).

## 5. Flujo de trabajo (Git + deploy)
- Rama por cambio; PR a `main`. **`main` auto-despliega a Render** (`autoDeploy: true`).
- Mensajes de commit: `tipo(scope): descripción` (`feat`/`fix`/`chore`/`docs`),
  referenciando el ticket cuando aplique (ej. `feat(KAN-22): …`). Co-autoría al final.
- **No** romper auth ni el layout; mantener los **tests verdes** antes de mergear.
- Verificar un deploy: el bundle servido cambia de hash
  (`https://cartel-pollos.onrender.com/` → `assets/index-XXXX.js`).
- El **plan free de Render duerme** (~30-50s de arranque en frío). Tras un deploy,
  una pantalla ya abierta necesita `Ctrl+Shift+R` (caché del service worker PWA).

## 6. Tests
- Vitest en `apps/backend/test` (single-fork: BD en memoria + `Map` HMAC compartidos).
  Helpers en `test/helpers.js` (aplican schema, siembran usuarios, login, firma HMAC).
- Correr: `npm test --workspace @cartel/backend`. Mantener la suite verde.

## 7. Despliegue
- Render lee `render.yaml`. Variables secretas (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`)
  se cargan en el dashboard; `JWT_SECRET` lo genera Render. Detalle en `DEPLOY.md`.
- Una base nueva se inicializa con `provision.mjs` (ver §2).
