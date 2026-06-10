# QA post-deploy — correr después de CADA salida a producción

## 1. Smoke automático (1 comando) — obligatorio
```
cd apps/backend
node --env-file=.env.production scripts/smoke-prod.mjs
```
Debe terminar en **`X OK · 0 fallo(s)`** (exit 0). Valida en vivo:
- **HTTP:** endpoints públicos (reviews, catálogo) 200; login responde 401 a credenciales falsas; `/sales` protegido (401 sin token).
- **Esquema:** existen las 25 tablas críticas; `sales.notify_phone`, `business_day`, `dispatch_status`; `session_keys` con estructura correcta (id/key/user_id/expires_at); `expense_categories` y `users` no vacíos; `ingredients.unit` soporta kilo/onza.
- **Sesión HMAC:** emite y recupera una clave (si esto falla, **el login y las ventas se caen**).

> Estas comprobaciones existen porque cada una **ya rompió la operación** alguna vez (columna sin migrar, tabla `session_keys` corrupta, id de categoría inexistente).

## 2. Antes de desplegar un cambio de esquema
Si tocaste `db/schema.sql` o agregaste columnas/tablas, **corre la migración aditiva en prod**:
```
node --env-file=.env.production scripts/migrate-<lo-que-sea>.mjs
```
El `schema.sql` solo afecta instalaciones nuevas/tests. **Las bases existentes (prod) necesitan su migración.** El smoke detecta si te la saltaste.

## 3. Checklist manual de casos de uso (humo operativo)
Tras el deploy, en la app (recarga con Ctrl+Shift+R):
1. **Login** entra sin error → **Abrir caja** (fondo).
2. **Venta de productos:** agregar ítems → Cobrar → "Venta registrada" (sin reloj de arena "en cola").
3. **KDS:** la venta aparece en *Pendientes*; avanzar a *Listo*.
4. **Aviso WhatsApp:** venta con toggle "Avisar por WhatsApp" (+56 9 + 8 dígitos) → en KDS *Listo* aparece **Notificar**; el cliente queda en **Comercial → Clientes**.
5. **Reposición de insumo** con "Registrar como gasto" → confirma y descuenta/repone stock.
6. **Caja → Cuadre/Cierre** → en **Movimientos → Cierres de caja** abrir el turno → **Imprimir** (Arqueo de caja) muestra responsable.
7. **Movimientos:** click en una transacción abre el detalle; **Pedidos:** click en una venta abre el detalle con recibo.
8. **Boleta:** imprime con tamaño correcto y QR de reseñas.

## 4. Regla de oro
- No editar archivos críticos (`sessionKeys.js`, `schema.sql`, migraciones) desde **dos sesiones a la vez** → causa conflictos que rompen prod.
- Tras `git pull --rebase`, **revisar** que no haya entrado una versión incompatible (CI + este smoke lo atrapan).
- Suite de tests local: `npm test --workspace @cartel/backend` debe quedar verde (132+).
