# Matriz de Roles y Permisos (RBAC)

Fuente de verdad en código:
- Roles: `apps/backend/src/config/roles.js` (+ espejo `apps/frontend/src/config/roles.js`)
- Permisos y defaults: `apps/backend/src/services/permissions.js`
- Navegación por permiso: `apps/frontend/src/config/nav.js`
- Persistencia: tabla `role_permissions` (rol × permiso). Editable en vivo desde **Administración → Roles y permisos**.

> El acceso NO se decide por rol hardcodeado, sino por la **matriz** `role_permissions`. Los roles son extensibles: agregar uno se hace en el catálogo + defaults (ver implementation-summary).

---

## Roles

| Rol | Tipo | Descripción |
|---|---|---|
| **Cajero** (`CAJERO`) | Operación | Vende y cobra. Opera su caja. |
| **Supervisor** (`SUPERVISOR`) | Operación | Cajero + aprueba anulaciones/descuentos y ve reportes operativos. |
| **Cocina** (`PREPARADOR`) | Operación | Producción: despacho, predicción de horno, mermas, inventario, recetas. |
| **Despacho** (`DESPACHO`) | Operación | Tablero de despacho y entregas. |
| **Gerencia** (`GERENCIA`) | Administración | Dueño/a: finanzas, catálogo, usuarios, configuración. |
| **Administrador** (`ADMIN`) | Administración | Todo + matriz de permisos + auditoría (rol de sistema). |

`GERENCIA` y `ADMIN` reciben **secreto OTP (TOTP)** al crearse y **omiten el OTP** en mutaciones sensibles (lo aprueban directamente). Son **superadmins**: nunca pierden `permissions.manage` (anti-lockout).

---

## Catálogo de permisos

| Permiso | Acción | Grupo |
|---|---|---|
| `pos.sell` | Vender en POS | Operación |
| `sales.void` | **Anular ventas** (desacoplado de reportes) | Operación |
| `cash.operate` | Abrir/cerrar caja, movimientos de efectivo | Operación |
| `dispatch.manage` | Tablero de despacho | Operación |
| `forecast.view` | Ver predicción de horno | Operación |
| `expenses.manage` | Registrar gastos | Operación |
| `inventory.merma` | Registrar mermas | Inventario |
| `inventory.manage` | Gestionar insumos (CRUD, reposición, **ajuste con PIN**) | Inventario |
| `recipes.manage` | Gestionar recetas (BOM) | Catálogo |
| `menu.manage` | Gestionar carta y modificadores | Catálogo |
| `reports.view` | Ver reportes, P&L, flujo, banco, estadísticas, movimientos | Finanzas |
| `settings.manage` | Editar datos del negocio, **PIN admin** | Administración |
| `audit.view` | Ver auditoría/actividad | Administración |
| `permissions.manage` | Administrar usuarios y la matriz de permisos | Administración |

---

## Matriz por defecto (least-privilege)

`✔` = permitido por defecto · vacío = denegado · `🔒` = forzado siempre (anti-lockout).

| Permiso | Cajero | Supervisor | Cocina | Despacho | Gerencia | Admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| pos.sell | ✔ | ✔ | | | ✔ | ✔ |
| sales.void | | ✔ | | | ✔ | ✔ |
| cash.operate | ✔ | ✔ | | | ✔ | ✔ |
| dispatch.manage | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| forecast.view | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| expenses.manage | | ✔ | | | ✔ | ✔ |
| inventory.merma | ✔ | ✔ | ✔ | | ✔ | ✔ |
| inventory.manage | | | ✔ | | ✔ | ✔ |
| recipes.manage | | | ✔ | | ✔ | ✔ |
| menu.manage | | | | | ✔ | ✔ |
| reports.view | | ✔ | | | ✔ | ✔ |
| settings.manage | | | | | ✔ | ✔ |
| audit.view | | | | | ✔ | ✔ |
| permissions.manage | | | | | 🔒 | 🔒 |

> Los defaults se siembran al inicializar la matriz y se completan con `scripts/migrate-perms.mjs`. **Cualquier celda es editable en vivo** (excepto `permissions.manage` de los superadmins).

---

## Restricciones y notas operativas

- **Anular ventas** ahora requiere `sales.void` (antes `reports.view`). Un rol que solo ve reportes **ya no puede anular**. Recomendado: dar `sales.void` a Supervisor/Gerencia.
- **Ajuste manual de stock** requiere `inventory.manage` **+ PIN de administrador** (doble control; queda en auditoría con stock anterior/nuevo/motivo).
- **Mutaciones sensibles** (PUT/DELETE de catálogo, insumos, permisos, settings) exigen **OTP de gerencia/admin** salvo que el actor sea GERENCIA/ADMIN.
- **Despacho** es el rol más acotado: solo ve el tablero y la predicción.
- **Cocina** no vende ni cobra; gestiona producción e inventario.
- El **menú se filtra por permiso** y además hay **guard por pantalla** (defensa en profundidad): aunque alguien fuerce la ruta, ve "Acceso restringido".

## Aprobaciones (hooks preparados)

- **Anulación / descuento sobre umbral** → se recomienda exigir aprobación de Supervisor. Hoy `sales.void` ya separa la capacidad; el umbral con aprobación queda como hook documentado (ver implementation-summary → "Aprobación de supervisor").
