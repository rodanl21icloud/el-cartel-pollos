# Seguridad y RBAC

## Autenticación (JWT)
- Login `POST /api/auth/login` (rate-limit 30/5min) → `{ token, user, session:{id,key} }`.
- **JWT HS256** firmado con `JWT_SECRET` (TTL `JWT_TTL`, def. 12h). El payload lleva
  `sub`(userId), `role`, `username`.
- `requireAuth` (`src/middleware/auth.js`) valida el token en **todo `/api`** (excepto
  `/api/auth/login` y `/api/public/*`). Sin token → `401 TOKEN_AUSENTE`; inválido → `401 TOKEN_INVALIDO`.
- El frontend guarda el JWT en `localStorage`; ante 401 de sesión dispara el evento
  `session-expired` y cierra sesión. Auto-logout por **inactividad (30 min)**.

## Firma HMAC de ventas (anti-tamper)
- En el login el servidor genera una **clave de sesión HMAC** (`session.key`) y la
  guarda en un `Map` **en memoria** del proceso (por eso el deploy es un servidor
  persistente, no serverless).
- El cliente guarda la `key` **solo en memoria** (`lib/crypto.js`) y firma cada venta
  (HMAC-SHA256 sobre el payload canónico).
- `POST /api/sales/sync` pasa por `verifyHmac`: recomputa la firma con la clave de la
  sesión; si no coincide, rechaza y audita. Evita que se inyecten/alteren ventas.

## OTP de gerencia (TOTP)
- `requireOtpForMutation` (otplib) exige un código TOTP (header `x-management-otp`)
  para **mutaciones sensibles**: editar carta (`PUT/DELETE /products/:id`), insumos
  (`PUT/DELETE /inventory/ingredients/:id`), **ajustes del negocio** (`PUT /settings`,
  `PUT /settings/admin-pin`) y **permisos** (`PUT /permissions`).
- Gerencia/Admin tienen secreto OTP (se entrega en `provision.mjs`). Roles operativos
  que intenten estas acciones requieren el OTP de gerencia.

## PIN de administrador (ajuste de stock)
- `business_settings.admin_pin_hash` (bcrypt). Se fija con `scripts/set-admin-pin.mjs <PIN>`
  o `PUT /settings/admin-pin`.
- El **ajuste de stock auditado** (`POST /inventory/ingredients/:id/set-stock`) valida
  el PIN y aplica rate-limit anti-fuerza-bruta; queda registrado en `audit_logs`.

## Auditoría append-only
- `audit_logs` es **inmutable**: triggers `audit_logs_no_update`/`no_delete` abortan
  cualquier UPDATE/DELETE. Se escribe con `services/audit.writeAudit({action, entity,
  entityId, severity, metadata, ip})`. Severidades: `INFO`/`WARN`/`ALERT`.

## RBAC (matriz rol × permiso)
- Catálogo de permisos y defaults en `src/services/permissions.js`; roles en
  `src/config/roles.js`. La matriz vive en `role_permissions` y es **editable** desde
  la UI (Roles y permisos). `requirePermission(perm)` la consulta (cacheada en memoria,
  invalidada al cambiar).
- **Anti-lockout**: GERENCIA y ADMIN **siempre** conservan `permissions.manage`.

### Roles
| Rol | Etiqueta | Resumen |
|---|---|---|
| `CAJERO` | Cajero | Vende y cobra; opera su caja |
| `SUPERVISOR` | Supervisor | Cajero + anula ventas, gastos y reportes operativos |
| `PREPARADOR` | Cocina | Producción: despacho, predicción, mermas, inventario, recetas |
| `DESPACHO` | Despacho | Tablero de despacho y entrega |
| `GERENCIA` | Gerencia | Dueño/a: todo el negocio (superadmin) |
| `ADMIN` | Administrador | Todos los permisos, incl. matriz (superadmin) |

### Matriz de permisos por defecto
`✓` = permitido por defecto. Editable por rol salvo el candado anti-lockout.

| Permiso | CAJERO | SUPERVISOR | PREPARADOR | DESPACHO | GERENCIA | ADMIN |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `pos.sell` (vender) | ✓ | ✓ | · | · | ✓ | ✓ |
| `sales.void` (anular) | · | ✓ | · | · | ✓ | ✓ |
| `sales.backdate` (retroactiva) | · | · | · | · | ✓ | ✓ |
| `cash.operate` (caja) | ✓ | ✓ | · | · | ✓ | ✓ |
| `dispatch.manage` (despacho) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `forecast.view` (predicción) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `expenses.manage` (gastos) | · | ✓ | · | · | ✓ | ✓ |
| `inventory.merma` (mermas) | ✓ | ✓ | ✓ | · | ✓ | ✓ |
| `inventory.manage` (insumos) | · | · | ✓ | · | ✓ | ✓ |
| `recipes.manage` (recetas) | · | · | ✓ | · | ✓ | ✓ |
| `menu.manage` (carta) | · | · | · | · | ✓ | ✓ |
| `reports.view` (reportes/P&L) | · | ✓ | · | · | ✓ | ✓ |
| `settings.manage` (negocio) | · | · | · | · | ✓ | ✓ |
| `audit.view` (auditoría) | · | · | · | · | ✓ | ✓ |
| `permissions.manage` (permisos) | · | · | · | · | ✓🔒 | ✓🔒 |

🔒 = anti-lockout (no se puede quitar a GERENCIA/ADMIN).

## Otras protecciones
- Cabeceras: `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`.
- `trust proxy = 1` (IP real tras el proxy de Render, para auditoría y rate-limit).
- Body JSON limitado a 256kb.
- **Nunca** commitear secretos: `JWT_SECRET`/`TURSO_*` van por variables de entorno.
