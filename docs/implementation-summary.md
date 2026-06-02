# Resumen de Implementación — Refactor POS

Refactor integral orientado a tareas, least-privilege y defensive UX, **sin romper** la app en producción (110 tests verdes, datos reales).

---

## 1. Cambios realizados (por fase)

### Fase 1–2 · Inspección y auditoría
- Mapeo completo de stack, navegación, auth, permisos, diseño y auditoría.
- Entregable: [`docs/pos-master-audit.md`](./pos-master-audit.md).

### Fase 3 · Arquitectura de información
- Nueva IA en 5 grupos orientada a tareas: **Operación · Catálogo · Finanzas · Clientes · Administración**.
- Separación explícita de **Administración** (Negocio, Usuarios, Roles y permisos, **Auditoría**) con divisor visual y candado.
- Fuente única: `apps/frontend/src/config/nav.js`.

### Fase 4 · Shell / layout
- `App.jsx` adelgazado: el menú ya **no se define inline**, se importa del config.
- Header con **contexto de sección** + **rol legible** (no la clave cruda).
- Sidebar: grupo de administración separado.

### Fase 5 · Vender (prevención)
- Gate de **caja abierta** ya presente (bloquea venta con caja cerrada, muestra fondo). Verificado y conservado.
- Pendiente documentado: descomposición de `Pos.jsx` en `pos/` (Search/Grid/Cart/Payment/Receipt) y atajos de teclado.

### Fase 6 · RBAC (núcleo del refactor)
- **Catálogo único de roles** (6): `apps/backend/src/config/roles.js` (+ espejo frontend).
- **Permisos nuevos**: `sales.void` (desacopla anular de reportes) y `audit.view`.
- **Defaults least-privilege** por rol en `services/permissions.js`; `getMatrix` y validaciones **data-driven** desde el catálogo.
- **Quitado el `CHECK` rígido** de `role` en `users` y `role_permissions` → roles extensibles. Validación movida a código.
- Salvaguarda anti-lockout para **GERENCIA y ADMIN**.
- `requireOtpForMutation` y la validación TOTP incluyen **ADMIN**.
- Guard de permiso **por pantalla** en el frontend (defensa en profundidad) + nav filtrado.

### Fase 7 · Defensive UX, estados y trazabilidad
- Primitivas reutilizables: `components/ui/States.jsx` → `Spinner`, `EmptyState`, `ErrorState`, `Forbidden`, `humanizeError` (traduce códigos backend a español).
- **Auditoría visible**: endpoint `GET /api/audit` + pantalla `Auditoria.jsx` con filtros (sensibles, severidad, búsqueda).
- **Seguridad de sesión**:
  - **401 global**: `lib/api.js` emite `session-expired`; `App.jsx` cierra sesión y avisa.
  - **Logout por inactividad** (30 min) con aviso en el login.
- Copy normalizado en nav, títulos y errores.

### Fase 8 · Documentación
- `pos-master-audit.md`, `rbac-matrix.md`, `audit-events.md`, `implementation-summary.md`, `migration-notes.md`.

---

## 2. Rationale de diseño (decisiones clave)

- **Matriz, no rol hardcodeado**: el acceso vive en `role_permissions` y es editable en vivo. Agregar roles/permisos no requiere tocar middlewares.
- **Quitar el CHECK** en vez de ampliarlo: SQLite no permite alterar CHECK; relajarlo + validar en código es más extensible y evita futuras migraciones por cada rol nuevo.
- **`sales.void` separado de `reports.view`**: *ver* ≠ *anular*. Previene que un rol de lectura anule ventas (antifraude).
- **No introducir router/store ahora**: alto riesgo en una PWA en producción; se documenta como P2 con plan. Se centraliza el shell por `screen` en su lugar (mínima complejidad viable).
- **Estados reutilizables** en vez de strings ad-hoc: consistencia y menor carga cognitiva.

---

## 3. Archivos creados / modificados

**Creados (backend):**
- `src/config/roles.js` · `src/controllers/audit.js`
- `scripts/migrate-roles.mjs` (quita CHECK) · (`scripts/migrate-perms.mjs` ya existía y re-siembra)

**Modificados (backend):**
- `db/schema.sql` (sin CHECK de rol)
- `src/services/permissions.js` (catálogo, defaults 6 roles, getMatrix data-driven, superadmins)
- `src/controllers/users.js` (roles del catálogo, OTP para ADMIN, anti-lockout admin, catch ROL_NO_DISPONIBLE)
- `src/middleware/auth.js` (bypass/validación OTP incluye ADMIN)
- `src/index.js` (rutas `/audit`, `/audit/actions`; void → `sales.void`)

**Creados (frontend):**
- `config/roles.js` · `config/nav.js` · `components/ui/States.jsx` · `screens/Auditoria.jsx`

**Modificados (frontend):**
- `App.jsx` (nav desde config, Auditoría, sesión/inactividad, guard por pantalla, header contexto+rol)
- `lib/api.js` (401 → `session-expired`)
- `screens/Login.jsx` (aviso de sesión)
- `screens/Usuarios.jsx` y `screens/Permisos.jsx` (6 roles, etiquetas, estados)

**Docs:** los 5 archivos en `/docs`.

---

## 4. Cómo extender el sistema

### Agregar un rol
1. `apps/backend/src/config/roles.js` → añadir `{ key, label, kind, desc }`.
2. `apps/frontend/src/config/roles.js` → mismo `{ key, label, kind }`.
3. `services/permissions.js → DEFAULTS` → agregar `NUEVO_ROL: [...permisos]`.
4. Ejecutar `node --env-file=.env scripts/migrate-perms.mjs` (siembra las celdas faltantes).
5. (Si la base aún tenía CHECK) `migrate-roles.mjs` ya lo quitó: nada más que hacer.

### Agregar un permiso
1. `services/permissions.js → PERMISSIONS` → `{ key, label, group }`.
2. Añadirlo a los `DEFAULTS` de los roles que correspondan.
3. Proteger la ruta con `requirePermission('nuevo.permiso')` en `index.js`.
4. (UI) usarlo en `config/nav.js` (si es una pantalla) y/o en guards de acción.
5. `migrate-perms.mjs` para sembrar en bases existentes.

### Agregar un módulo (pantalla)
1. Crear `screens/Nuevo.jsx` (usar `States.jsx` para loading/empty/error).
2. Registrar en `config/nav.js` con su `perm`.
3. Renderizarlo en `App.jsx` (`{screen === 'nuevo' && <Nuevo />}`).
4. Crear el/los endpoint(s) en backend con `requirePermission`.

### Integrar auditoría backend en una acción nueva
```js
import { writeAudit } from '../services/audit.js';
await writeAudit({ userId: req.user.id, action: 'MI_ACCION', entity: 'tabla',
  entityId: id, severity: 'WARN', ip: req.ip, metadata: { antes, despues } });
```
Aparecerá automáticamente en **Auditoría** (agregar a `SENSITIVE` si aplica).

---

## 5. Deuda técnica restante (priorizada)

| # | Deuda | Prioridad |
|---|---|---|
| D1 | `Pos.jsx` (522 líneas) y `Carta.jsx` (386) → descomponer | P1 |
| D2 | Router real (react-router) + deep-links + code-splitting | P2 |
| D3 | Store global (sesión/permiso/borrador de venta) | P2 |
| D4 | Aprobación de Supervisor para anulación/descuento sobre umbral | P2 |
| D5 | Logout endpoint + revocación de clave HMAC + evento `LOGOUT` | P2 |
| D6 | `SALE_DISCOUNT` explícito en auditoría | P2 |
| D7 | Aplicar `States.jsx` a TODAS las pantallas (hoy: Auditoría, Permisos; resto gradual) | P1 |
| D8 | CSP afinada para la PWA; rotación de `JWT_SECRET` | P2 |
| D9 | Caja por cajero / arqueo por turno con responsable | P2 |
| D10 | Boleta electrónica / SII | P3 |

---

## 6. Próximos pasos sugeridos

1. **Rollout de roles** en producción (correr migraciones, ver migration-notes) y asignar roles reales (Supervisor a quien aprueba; Despacho al repartidor).
2. **Aplicar `States.jsx`** al resto de pantallas (barrido gradual, bajo riesgo).
3. **Descomponer `Pos.jsx`** y luego evaluar router/store (habilita crecer sin caos).
4. **Aprobación de supervisor** sobre umbral de descuento/anulación (antifraude).
5. **Boleta electrónica/SII** (cumplimiento).
