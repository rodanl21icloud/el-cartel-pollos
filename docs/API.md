# Referencia de API

Base: `/api`. Derivada de `apps/backend/src/index.js`. **Todo `/api` exige JWT**
(`requireAuth`) salvo `/api/auth/login` y `/api/public/*`. Middlewares adicionales:
`requirePermission(perm)`, `requireOtpForMutation` (OTP de gerencia), `verifyHmac`
(firma de venta), `rateLimit`.

Auth: header `Authorization: Bearer <jwt>`. OTP: header `x-management-otp: <código>`.

## Público (sin JWT)
| Método | Ruta | Notas |
|---|---|---|
| POST | `/api/auth/login` | rate-limit 30/5min. Devuelve `{token, user, session:{id,key}}` |
| GET | `/api/public/catalog/:slug` | catálogo de vitrina (carta pública y cartelera) |
| GET | `/health` | healthcheck |

## Sesión / permisos
| Método | Ruta | Permiso | Propósito |
|---|---|---|---|
| GET | `/api/permissions/me` | (autenticado) | permisos efectivos del usuario (la UI muestra/oculta) |
| GET | `/api/products` | (autenticado) | catálogo para el POS |

## Ventas
| Método | Ruta | Permiso / mw | Propósito |
|---|---|---|---|
| POST | `/api/sales/sync` | `pos.sell` + `verifyHmac` | sincroniza una venta firmada (anti-tamper) |
| POST | `/api/sales/backdate` | `sales.backdate` | venta con fecha pasada (auditada) |
| GET | `/api/sales` | `pos.sell` | listado de transacciones |
| GET | `/api/sales/:id/receipt` | (autenticado) | comprobante |
| POST | `/api/sales/:id/void` | `sales.void` | anula una venta |

## Caja
| Método | Ruta | Permiso | Propósito |
|---|---|---|---|
| GET | `/api/cash-register/current` | (autenticado) | estado de la caja (ciego) |
| POST | `/api/cash-register/open` | `cash.operate` | abrir con fondo |
| POST | `/api/cash-register/movement` | `cash.operate` | depósito/ingreso |
| POST | `/api/cash-register/close` | `cash.operate` | cierre ciego |

## Despacho
| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/dispatch` | `dispatch.manage` |
| PUT | `/api/dispatch/:saleId/status` | `dispatch.manage` |

## Inventario
| Método | Ruta | Permiso / mw |
|---|---|---|
| GET | `/api/inventory/ingredients` | (autenticado) |
| GET | `/api/inventory/alerts` | (autenticado) |
| POST | `/api/inventory/merma` | `inventory.merma` |
| POST | `/api/inventory/ingredients` | `inventory.manage` |
| PUT | `/api/inventory/ingredients/:id` | `inventory.manage` + OTP |
| DELETE | `/api/inventory/ingredients/:id` | `inventory.manage` + OTP |
| POST | `/api/inventory/ingredients/:id/restock` | `inventory.manage` |
| POST | `/api/inventory/ingredients/:id/set-stock` | `inventory.manage` + rate-limit (valida **PIN admin**) |

## Carta / recetas / modificadores
| Método | Ruta | Permiso / mw |
|---|---|---|
| GET | `/api/products/catalog` | `menu.manage` |
| POST | `/api/products` | `menu.manage` |
| PUT/DELETE | `/api/products/:id` | `menu.manage` + OTP |
| GET/PUT | `/api/products/:id/recipe` | `recipes.manage` |
| GET | `/api/products/:id/modifiers` | (autenticado) |
| GET | `/api/modifiers` | `menu.manage` |
| POST/DELETE | `/api/modifiers/groups[/:id]` | `menu.manage` |
| PUT | `/api/modifiers/groups/:id/products` | `menu.manage` |
| POST/DELETE | `/api/modifiers/options[/:id]` | `menu.manage` |

## Gastos / clientes
| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/expenses/categories` | (autenticado) |
| GET | `/api/expenses` | `reports.view` |
| POST | `/api/expenses` | `expenses.manage` |
| GET | `/api/clients` | (autenticado) |
| POST | `/api/clients` | `pos.sell` |

## Reportes *(todos `reports.view`, salvo forecast)*
| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/reports/turn-summary` | `reports.view` |
| GET | `/api/reports/closures` | `reports.view` |
| GET | `/api/reports/cash-flow` | `reports.view` |
| GET | `/api/reports/pnl` | `reports.view` |
| GET | `/api/reports/stats` | `reports.view` |
| GET | `/api/reports/dashboard` | `reports.view` |
| GET | `/api/reports/movements` | `reports.view` |
| GET | `/api/reports/export` | `reports.view` (CSV) |
| GET | `/api/reports/forecast` | `forecast.view` |

## Banco
| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/bank/summary` · `/api/bank/movements` · `/api/bank/reconcile` | `reports.view` |
| POST | `/api/bank/movements` | `expenses.manage` |
| PUT | `/api/bank/movements/:id/reconcile` | `expenses.manage` |

## Negocio / usuarios / permisos / auditoría
| Método | Ruta | Permiso / mw |
|---|---|---|
| GET | `/api/settings` | (autenticado) |
| PUT | `/api/settings` | `settings.manage` + OTP |
| PUT | `/api/settings/admin-pin` | `settings.manage` + OTP |
| GET/POST | `/api/users` | `permissions.manage` |
| PUT | `/api/users/:id` | `permissions.manage` |
| POST | `/api/users/:id/password` | `permissions.manage` |
| GET | `/api/permissions` | `permissions.manage` |
| PUT | `/api/permissions` | `permissions.manage` + OTP |
| GET | `/api/audit` · `/api/audit/actions` | `audit.view` |

### Errores
Formato `{ "error": "CODIGO" }` con HTTP apropiado (401 `TOKEN_AUSENTE/INVALIDO`,
403 `PERMISO_DENEGADO`, 409 `CAJA_YA_ABIERTA`, etc.). El cliente mapea códigos a
mensajes en `src/components/ui/States.jsx` (`humanizeError`).
