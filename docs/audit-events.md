# Eventos de Auditoría y Trazabilidad

La app registra eventos sensibles en la tabla **`audit_logs`**, que es **inmutable**:
triggers SQL (`audit_logs_no_update`, `audit_logs_no_delete`) bloquean UPDATE y DELETE.
Se escribe con el servicio central `apps/backend/src/services/audit.js` (`writeAudit`).
Se consulta (solo lectura) en **Administración → Auditoría** (permiso `audit.view`).

## Esquema del evento

```ts
// audit_logs
{
  id: string,            // uuid
  user_id: string|null,  // autor; null = evento de sistema
  action: string,        // ver catálogo abajo
  entity: string,        // tabla/recurso afectado (sales, ingredients, users, …)
  entity_id: string|null,
  severity: 'INFO' | 'WARN' | 'ALERT',
  metadata: string|null, // JSON serializado con el detalle del evento
  ip_address: string|null,
  created_at: string     // datetime('now') UTC
}
```

Helper de escritura:

```js
import { writeAudit } from '../services/audit.js';
await writeAudit({ userId, action, entity, entityId, severity, ip, metadata: { … } });
```

## Catálogo de acciones registradas (estado actual)

| Acción | Severidad | Entidad | Metadata clave |
|---|---|---|---|
| `LOGIN_OK` | INFO | users | — |
| `LOGIN_FAIL` | WARN | users | `{ username }` |
| `SALE_SYNC` | INFO | sales | `{ total, payment_method, offline }` |
| `SALE_FREE` | INFO | sales | `{ free_amount, payment_method, note }` |
| `SALE_VOID` | ALERT | sales | `{ order_number, total, reason }` |
| `CASH_OPEN` | INFO | cash_sessions | `{ opening_float }` |
| `CASH_DEPOSITO` / `CASH_INGRESO` | INFO | cash_movements | `{ amount, reason }` |
| `CASH_CLOSE` | INFO/ALERT | cash_register_closures | `{ diff_total, has_descuadre, fondo }` |
| `STOCK_AJUSTE` | WARN | ingredients | `{ ingredient, stock_anterior, stock_nuevo, delta, motivo }` |
| `STOCK_PIN_REJECT` | ALERT | ingredients | — |
| `INV_MERMA` / `INV_REPOSICION` | WARN/INFO | inventory_adjustments | `{ ingredient, delta, reason }` |
| `PRODUCT_CREATE/UPDATE/DELETE` | INFO/WARN | products | `{ before, after }` |
| `INGREDIENT_CREATE/UPDATE/DELETE` | INFO/WARN | ingredients | — |
| `RECIPE_UPDATE` | INFO | product_recipes | `{ lineas }` |
| `EXPENSE_CREATE` | INFO | expenses | `{ amount, payment_method, category }` |
| `BANK_MOVEMENT` | INFO | bank_movements | `{ amount, direction }` |
| `DISPATCH_STATUS` | INFO | sales | `{ order_number, status }` |
| `USER_CREATE` | INFO | users | `{ username, role }` |
| `USER_UPDATE` | INFO | users | `{ full_name, role, is_active }` |
| `USER_PASSWORD_RESET` | WARN | users | — |
| `PERMISSION_UPDATE` | INFO | role_permissions | `{ role, permission, allowed }` |
| `SETTINGS_UPDATE` | INFO | business_settings | — |
| `ADMIN_PIN_SET` | WARN | business_settings | — |
| `OTP_MISSING` / `OTP_REJECT` / `OTP_GRANTED` | WARN/ALERT/INFO | (ruta) | `{ method }` |
| `HMAC_REJECT` | ALERT | sales | `{ sessionId }` |

## Acciones "sensibles" (filtro rápido en la UI)

`LOGIN_FAIL, SALE_VOID, STOCK_AJUSTE, STOCK_PIN_REJECT, HMAC_REJECT, OTP_REJECT, OTP_MISSING, PERMISSION_UPDATE, ADMIN_PIN_SET, CASH_CLOSE, USER_CREATE, USER_UPDATE, USER_PASSWORD_RESET, INV_MERMA`

(definidas en `apps/backend/src/controllers/audit.js → SENSITIVE`).

## API

- `GET /api/audit?from&to&severity&action&q&sensitive=1&limit` (perm `audit.view`) → lista enriquecida con el usuario.
- `GET /api/audit/actions` → catálogo de acciones presentes + lista sensible.

## Eventos cubiertos vs. pedidos

| Evento pedido | Estado |
|---|---|
| login/logout | ✅ login (OK/FAIL). Logout es cliente (sin endpoint); ver TODO. |
| apertura/cierre de caja | ✅ `CASH_OPEN` / `CASH_CLOSE` |
| anulación de ventas | ✅ `SALE_VOID` (ALERT) |
| descuentos manuales | 🟡 quedan en la venta (subtotal vs total, HMAC). **TODO**: emitir `SALE_DISCOUNT` explícito si supera umbral. |
| cambios de precio | ✅ `PRODUCT_UPDATE` con `{ before, after }` |
| cambios de inventario | ✅ `STOCK_AJUSTE`, `INV_MERMA`, `INV_REPOSICION` |
| mermas | ✅ `INV_MERMA` |
| cambios de rol | ✅ `USER_UPDATE` (incluye rol) |
| cambios de permisos | ✅ `PERMISSION_UPDATE` |
| acciones administrativas críticas | ✅ `ADMIN_PIN_SET`, `SETTINGS_UPDATE`, OTP/HMAC reject |

## TODO / integración faltante (documentado, no humo)

1. **Logout explícito**: hoy el cierre de sesión es solo cliente. *Sugerido*: endpoint `POST /api/auth/logout` que invalide la clave HMAC en memoria y emita `LOGOUT`. (Stub: `services/sessionKeys.js` ya tiene el `Map`; agregar `revokeSessionKey`.)
2. **`SALE_DISCOUNT` explícito**: emitir evento cuando el descuento supere un umbral configurable; enganchar con aprobación de Supervisor.
3. **Retención/expurgo**: definir política de retención del log (hoy crece indefinidamente). *Sugerido*: export mensual + archivado.
4. **Hash encadenado** (tamper-evidence fuerte): encadenar `prev_hash` por fila para detectar borrados a nivel de archivo. (Hoy la inmutabilidad es por trigger.)
