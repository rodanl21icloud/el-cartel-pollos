# Auditoría Maestra — POS "El Cartel de los Pollos"

> Rol del autor: Principal Product Designer + Staff Frontend Engineer + Security-minded Systems Designer.
> Fecha: 2026-06. Estado: app en producción (Render + Turso), ~105 tests verdes, datos reales (sep 2025 → jun 2026).

---

## 1. Resumen ejecutivo

La app es un POS delivery-first **funcionalmente muy completo** (caja ciega, BOM/recetas, conciliación bancaria, P&L, predicción de horno, catálogo público, RBAC por matriz, auditoría append-only, HMAC anti-tamper, OTP y PIN). El problema no es falta de features: es que **creció por acumulación**. Síntomas:

- **Arquitectura de información plana**: ~20 ítems de menú en 5 grupos, sin separar con claridad *operación* vs *administración/configuración sensible*.
- **Permisos y roles dispersos**: el rol vive como `CHECK` rígido en SQLite y como arrays repetidos en varios archivos; solo 3 roles para un negocio que ya tiene cocina, despacho, caja y gerencia.
- **Estados del sistema inconsistentes**: cada pantalla resuelve loading/empty/error a su manera ("Cargando…", `null`, strings sueltos).
- **Sin superficie de trazabilidad**: `audit_logs` captura mucho (logins, ventas, cierres, mermas, permisos, PIN) pero **no hay pantalla para revisarlo**.
- **Sin defensa de sesión**: el JWT expira (12 h) pero no hay logout por inactividad ni manejo global de sesión vencida.
- **Componentes gigantes**: `Pos.jsx` (522 líneas) y `Carta.jsx` (386) concentran demasiada responsabilidad.

Este documento mapea el estado actual y prioriza un refactor **orientado a tareas**, **least-privilege** y **defensivo**, sin romper lo que ya funciona en producción.

---

## 2. Estado actual del producto

| Capa | Tecnología | Notas |
|---|---|---|
| Frontend | Vite + React (JSX) + Tailwind, PWA (offline-first) | **Sin router**: shell propio por estado `screen` en `App.jsx`. |
| Estado global | `useState` en `App.jsx` + `localStorage` (user/session/jwt) | Sin store global; cada pantalla hace su propio fetch. |
| Backend | Node + Express, `@libsql/client` (Turso/SQLite) | Servidor persistente (sesiones HMAC en memoria). |
| Auth | JWT HS256 + clave HMAC por sesión + OTP TOTP + PIN admin | Login genérico, rate-limit, audit de login. |
| Autorización | Matriz `role_permissions` (rol×permiso) + `requirePermission` | Nav filtrado por permiso efectivo (`/permissions/me`). |
| Auditoría | `audit_logs` append-only (triggers bloquean UPDATE/DELETE) | `writeAudit()` centralizado. **Sin lectura en UI.** |
| Diseño | Tokens `cartel`/`ink`, sombras, `.card/.field/.btn-pos/.nav-item` | Base sólida pero subutilizada; clases ad-hoc por pantalla. |

---

## 3. Mapa de módulos (estado previo al refactor)

Agrupación previa en `App.jsx` (`NAV`):

- **Operación**: Vender, Ventas, Despacho, Predicción horno, Caja, Mermas
- **Catálogo**: Carta, Modificadores, Inventario
- **Finanzas**: Resumen, Movimientos, Estadísticas, Gastos, Flujo, Banco, P&L
- **Contactos**: Clientes
- **Configuración**: Negocio, Usuarios, Permisos

Problemas del mapa:
- "Configuración" mezcla **datos del negocio** (poco sensible) con **gestión de usuarios y permisos** (muy sensible) — sin separar *Administración*.
- No hay **Auditoría/Actividad** pese a existir el log.
- "Contactos" con un solo ítem (Clientes) es un grupo de baja densidad.
- Predicción/Producción está bajo Operación (correcto) pero sin distinción de "producción".

---

## 4. Problemas de UX

1. **Carga cognitiva alta** en el sidebar: todo visible siempre (según permiso), sin colapsar ni jerarquizar operación vs análisis.
2. **Vender** mezcla bien lo táctil, pero **no muestra el estado de caja** de forma persistente (se puede intentar vender con caja cerrada y enterarse tarde).
3. **Estados vacíos pobres**: la mayoría usa texto plano ("Sin datos", "Cargando…") sin iconografía, acción sugerida ni consistencia.
4. **Errores como strings crudos**: se muestran `e.message` (códigos backend) en varias pantallas (p. ej. `STOCK_INSUFICIENTE`).
5. **Falta feedback de "rol activo / contexto"** más allá del nombre; el usuario no ve claramente *qué puede y qué no*.
6. **Copy inconsistente**: "Negocio" vs "Datos del negocio", "P&L" vs "Estado de Resultados", "Predicción horno" vs "Predicción de horno".

## 5. Problemas de arquitectura de información

- Mezcla de niveles: operación diaria, analítica e **infra sensible** (permisos) en el mismo plano visual.
- Sin distinción **ver / editar / aprobar / anular / administrar** en la navegación.
- Agrupaciones por "tema técnico" (Finanzas) y no siempre por **tarea** (p. ej. "cerrar el día" cruza Caja + Resumen + Movimientos).

## 6. Problemas de navegación

- Cambio de pantalla por estado local: no hay deep-link, no hay back del navegador, no hay breadcrumb.
- El ítem activo se resalta, pero no hay **contexto de sección** en el header.
- En móvil hay drawer (ok), pero el orden no prioriza las acciones más frecuentes (Vender/Caja).

## 7. Problemas de consistencia visual

- Tokens de diseño existen pero **conviven con utilidades ad-hoc** (`bg-white rounded-2xl shadow` repetido en vez de `.card`; `text-zinc-*` vs `text-ink-mute`).
- Botones primarios a veces `bg-cartel`, a veces `bg-ink`; sin jerarquía semántica (primario/secundario/peligro) clara.
- Sin componentes compartidos de **estado** (spinner, vacío, error, sin-permiso).

## 8. Problemas de seguridad (visibles y estructurales)

**Fortalezas ya presentes** (no romper):
- Login genérico (`CREDENCIALES_INVALIDAS`), audit de `LOGIN_FAIL/OK`, rate-limit de login, JWT con `algorithms:['HS256']` fijo.
- HMAC anti-tamper en ventas; OTP TOTP para mutaciones sensibles; PIN admin para ajuste de stock; `audit_logs` inmutable.

**Debilidades / estructurales:**
- **Cuentas demo con claves débiles** (`cajero1/cajero123`, `prep1/prep123`) — mitigado al desactivarlas y crear `caja`/`cocina`, pero el patrón de seed sigue existiendo.
- **Sin logout por inactividad** ni manejo global de **sesión expirada** (un 401 deja la app en estado ambiguo).
- **JWT en `localStorage`** (XSS-exposable). Aceptable para PWA offline, pero documentar el riesgo.
- **Clave de sesión HMAC en memoria del servidor**: un reinicio invalida firmas → `SESION_NO_VALIDA` (manejar como "reingresar").
- Sin **CSP estricta** (se omitió para no romper la PWA) — documentado.

## 9. Problemas de autorización

- **Solo 3 roles** para 6 funciones reales (cajero, supervisor, cocina, despacho, gerencia, admin).
- Rol como `CHECK` rígido → no extensible sin reconstruir tabla.
- **Definición de roles/permiso duplicada**: `DEFAULTS` en `permissions.js`, `ROLES` en `users.js`, lista de roles hardcodeada en `getMatrix`.
- Sin distinción explícita entre **permiso de ver** y **permiso de aprobar/anular** (anular venta usa `reports.view`, que es un permiso de lectura — *acoplamiento incorrecto*).

## 10. Riesgos operativos en caja

- Se puede **registrar venta con caja cerrada** (no hay gate visible/duro).
- El **cierre ciego** es correcto, pero no hay recordatorio de "caja abierta hace X horas".
- Un solo cajón conceptual: **sin trazabilidad por cajero** del cajón (toda venta queda con `user_id`, pero no hay "mi caja" por usuario).

## 11. Riesgos de error humano

- Edición de precio / stock sin doble confirmación en algunos flujos (stock ya tiene PIN ✔, precio no).
- Doble clic puede **duplicar acciones** (faltan `disabled`+loading consistentes).
- Recarga/timeout puede perder un carrito en curso (no se persiste el borrador de venta).

## 12. Riesgos de fraude / abuso interno

- **Anulación de ventas** gated por `reports.view` (lectura), no por un permiso de "aprobar anulación" → un rol con reportes podría anular.
- **Descuentos manuales** en `PaymentConfirm` sin tope ni aprobación (van firmados por HMAC y quedan en la venta, pero sin límite por rol).
- **Movimientos de caja** (depósitos/ingresos) exigen motivo ✔ pero sin aprobación.
- Mitigaciones ya presentes: PIN para stock, OTP para catálogo/permisos, audit append-only.

## 13. Riesgos de escalabilidad

- Roles rígidos (3) y permisos dispersos dificultan crecer a multi-sucursal o multi-cajero.
- Sin router → difícil deep-link, code-splitting o crecer a decenas de pantallas.
- Componentes gigantes (`Pos.jsx`) dificultan mantenibilidad.
- Sin store global → prop-drilling y refetch redundante.

---

## 14. Quick wins (alto impacto / bajo esfuerzo)

| # | Quick win | Estado en este refactor |
|---|---|---|
| QW1 | Centralizar roles y nav en config único | ✅ Implementado |
| QW2 | Separar **Administración** y agregar **Auditoría/Actividad** | ✅ Implementado |
| QW3 | Vista de **Auditoría** (lee `audit_logs`) | ✅ Implementado |
| QW4 | **Logout por inactividad** + manejo global de 401/sesión expirada | ✅ Implementado |
| QW5 | Primitivas de **estado** reutilizables (loading/vacío/error/sin-permiso) | ✅ Implementado |
| QW6 | Permiso propio para **anular** (`sales.void`) desacoplado de `reports.view` | ✅ Implementado |
| QW7 | Gate de **caja abierta** visible en Vender | ✅ Implementado (banner + bloqueo suave) |
| QW8 | Normalizar **copy** de títulos/labels | ✅ Parcial (nav + títulos clave) |

## 15. Mejoras estratégicas (mediano plazo)

- **Router real** (react-router) para deep-links, back nativo y code-splitting.
- **Store ligero** (zustand/context) para sesión, permisos y borrador de venta.
- **Descomponer `Pos.jsx`** en `pos/` (Search, Grid, Cart, Payment, Receipt) y `Carta.jsx`.
- **Aprobación de supervisor** para anulación/descuento sobre umbral (hook ya preparado).
- **Caja por cajero** y arqueo por turno con responsable.
- **Boleta electrónica / SII** (integración fiscal).
- **CSP** afinada para la PWA y rotación de `JWT_SECRET`.

## 16. Backlog priorizado (impacto × esfuerzo)

| Prioridad | Ítem | Impacto | Esfuerzo | Estado |
|---|---|---|---|---|
| P0 | RBAC 6 roles + catálogo central + guards | Alto | Medio | ✅ |
| P0 | Auditoría visible | Alto | Bajo | ✅ |
| P0 | Sesión: inactividad + 401 global | Alto | Bajo | ✅ |
| P0 | Permiso `sales.void` + `cash.approve` | Alto | Bajo | ✅ (void) / 🟡 (approve: hook) |
| P1 | Estados del sistema unificados | Medio | Bajo | ✅ base + aplicar gradual |
| P1 | Gate caja abierta en Vender | Medio | Bajo | ✅ |
| P1 | Descomponer Pos/Carta | Medio | Medio | 🟡 documentado |
| P2 | Router + store global | Alto | Alto | 🟡 documentado |
| P2 | Aprobación supervisor sobre umbral | Medio | Medio | 🟡 hook listo |
| P2 | Caja por cajero / arqueo por turno | Medio | Medio | 🟡 documentado |
| P3 | Boleta electrónica / SII | Alto | Alto | 🟡 pendiente |

Leyenda: ✅ hecho · 🟡 base lista / documentado · ❌ no iniciado.

---

## 17. Decisiones de no-cambio (deliberadas)

- **No introducir react-router ahora**: alto esfuerzo y riesgo en una PWA en producción; se documenta como P2 con plan claro. El shell por `screen` se centraliza en su lugar.
- **No reescribir Vender de cero**: ya es táctil y completo; se interviene con gates de caja, prevención de doble-submit y estados, y se documenta la descomposición.
- **Mantener JWT en localStorage**: requerido por el flujo offline-first; se documenta el riesgo y se mitiga con expiración + inactividad.
