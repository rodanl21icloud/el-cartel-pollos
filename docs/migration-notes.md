# Notas de Migración — Refactor RBAC + Auditoría

## 1. Cambios potencialmente breaking

| Cambio | Impacto | Mitigación |
|---|---|---|
| Anular venta: `reports.view` → **`sales.void`** | Un rol que solo veía reportes ya **no puede anular** hasta tener `sales.void`. | `migrate-perms.mjs` siembra `sales.void` para SUPERVISOR/GERENCIA/ADMIN. |
| Nuevo permiso **`audit.view`** | Sin la fila en `role_permissions`, **nadie** ve Auditoría (ni gerencia). | `migrate-perms.mjs` lo siembra para GERENCIA/ADMIN. |
| Permisos de **CAJERO reducidos** (sin `reports.view` ni `expenses.manage`) | Un cajero existente pierde esos accesos (intencional, least-privilege). | Si se requiere, usar rol **Supervisor** o activar el permiso puntual en la matriz. |
| **CHECK de `role` removido** | Requiere reconstruir `users` y `role_permissions` en bases existentes. | `migrate-roles.mjs` (idempotente, preserva datos). |
| Frontend: shell/nav refactorizado | Cambian etiquetas/orden del menú; grupo **Administración**. | Sin breaking funcional; solo IA/labels. |

> **No se eliminó funcionalidad.** Toda capacidad previa sigue disponible (con permisos reorganizados).

## 2. Supuestos

- La base de producción fue creada con el esquema antiguo (con `CHECK` de rol). Las migraciones detectan y solo actúan si corresponde (idempotentes).
- `GERENCIA`/`ADMIN` son superadmins: conservan `permissions.manage` por salvaguarda.
- El cliente libsql sobre **archivo local** mantiene `PRAGMA foreign_keys=OFF` durante el rebuild (verificado: integridad FK intacta tras migrar local).

## 3. Pasos de despliegue (orden importa)

> Ejecutar las migraciones **antes o junto** al deploy del código, para que no haya ventana sin permisos.

```bash
# 1) En producción (variables Turso en apps/backend/.env.production)
cd apps/backend

# 1a) Quitar el CHECK de rol (reconstruye users y role_permissions, preserva datos)
node --env-file=.env.production scripts/migrate-roles.mjs

# 1b) Sembrar permisos faltantes (6 roles + sales.void + audit.view)
node --env-file=.env.production scripts/migrate-perms.mjs

# 2) Subir el código (Render auto-deploy)
git push

# 3) Repetir 1a/1b en local si se va a operar local
node --env-file=.env scripts/migrate-roles.mjs
node --env-file=.env scripts/migrate-perms.mjs
```

Si `migrate-roles.mjs` reporta `⚠ Violaciones de FK`, **no continuar**: revisar (no debería ocurrir; preserva ids).

## 4. Checklist de QA

- [ ] Login OK con gerencia; ver **Administración → Auditoría** carga eventos.
- [ ] Crear usuario rol **Supervisor**, **Despacho**, **Cocina**, **Administrador** → 201.
- [ ] Cajero (rol CAJERO): **no** ve Finanzas ni Administración; **no** puede anular.
- [ ] Supervisor: puede **anular** una venta (queda `SALE_VOID` en Auditoría).
- [ ] Ajuste de stock con PIN → aparece `STOCK_AJUSTE` con stock anterior/nuevo.
- [ ] Cambiar un permiso en **Roles y permisos** → aparece `PERMISSION_UPDATE`.
- [ ] Forzar pantalla sin permiso → "Acceso restringido".
- [ ] Sesión: esperar inactividad / token vencido → redirige a login con aviso.
- [ ] Vender con caja cerrada → bloqueado con "Abrir caja".

## 5. Checklist de permisos (post-migración)

- [ ] `GET /api/permissions` devuelve **6 roles** y `role_meta`.
- [ ] `sales.void` = sí para SUPERVISOR/GERENCIA/ADMIN; no para CAJERO/COCINA/DESPACHO.
- [ ] `audit.view` = sí solo para GERENCIA/ADMIN.
- [ ] `permissions.manage` = 🔒 sí para GERENCIA/ADMIN (no se puede apagar).

## 6. Checklist de rollout

- [ ] Migraciones corridas en **prod** (1a, 1b) sin warnings de FK.
- [ ] Deploy verificado: `GET /api/audit` responde a gerencia (200) y a cajero (403).
- [ ] Asignar roles reales a las cuentas (`caja`=CAJERO, `cocina`=PREPARADOR; crear Supervisor/Despacho según el equipo).
- [ ] (Opcional) Crear una cuenta **ADMIN** separada de la de dueño/a si se desea segregar sistema vs negocio.
- [ ] Comunicar al equipo el nuevo menú (Administración) y que **anular** ahora es permiso aparte.

## 7. Rollback

- El código es retrocompatible con datos: revertir el deploy (git) **no** requiere revertir las migraciones (las columnas/relajación de CHECK son aditivas/neutras).
- Si fuese necesario volver a 3 roles: basta reasignar usuarios a los 3 roles previos; las filas extra en `role_permissions` son inertes.
- La auditoría es **append-only**: no se borra; un rollback de código no afecta su contenido.
