# Módulo Movimientos — Casos de uso

Réplica fiel del módulo administrativo de movimientos, re-skin pollería (negro/amarillo/rojo).
Ruta: **Finanzas → Movimientos** (standalone) y también embebido en **Finanzas → Detalle**.
Acceso: rol con permiso `reports.view` (administrador/propietario: acceso total).

## Componentes (paridad con el original)
- **Acciones rápidas** (standalone): Abrir caja · Nueva venta · Nuevo gasto → navegan a Caja / POS / Gastos.
- **Tabs del módulo:** *Transacciones* (por defecto) · *Cierres de caja*.
- **Barra de filtros:** Filtrar · período (Diario/Semanal/Mensual) · fecha · búsqueda “Buscar concepto…” · Descargar reporte (CSV).
- **KPIs:** Balance · Ventas totales · Gastos totales (tarjetas negras, valor amarillo/rojo).
- **Quick-filters:** Todos · Ingresos · Egresos · Por cobrar · Por pagar.
- **Tabla:** Concepto · Valor · Medio de pago · Fecha y hora.
- **Estados:** cargando (skeleton) · vacío · error (con reintento).

## Reglas de marca
- Amarillo `#F5C400`: botón primario (Abrir caja), tab/quick-filter activo, foco de inputs, valor de Balance.
- Negro `#111`: tarjetas KPI, títulos, ingresos.
- Rojo `#C62828`: egresos, descuadres, badges críticos y estado de error.

## Casos de uso

### CU-1 · Revisar el día (administrador)
1. Entra a **Movimientos**. Tab *Transacciones*, período *Diario*.
2. Lee KPIs: Balance, Ventas, Gastos del día.
3. Escanea la tabla; egresos y descuadres resaltan en rojo.

### CU-2 · Filtrar solo egresos
1. Click en quick-filter **Egresos** → la tabla y la descarga se acotan a egresos.
2. (Por cobrar / Por pagar muestran estado vacío: el negocio opera al contado.)

### CU-3 · Buscar un concepto
1. Escribe en “Buscar concepto…” (ej. “arriendo”). La lista filtra en vivo (debounce 300ms).
   - QA: `GET /api/reports/movements?q=…` (test cubierto).

### CU-4 · Cambiar período
1. Selector **Diario → Semanal/Mensual** + campo de fecha (ancla). KPIs y tabla se recalculan.

### CU-5 · Descargar reporte
1. **Descargar reporte** → CSV (`;` separador) de movimientos o ventas según el filtro activo.
   - QA: `GET /api/reports/export?type=movimientos|ventas` (test cubierto).

### CU-6 · Revisar cierres de caja
1. Tab **Cierres de caja** → lista de cierres: período, fondo inicial, diferencia, estado (Cuadrado/Descuadre), fecha.
   - Descuadre → badge rojo. QA: `GET /api/reports/closures` (test cubierto).

### CU-7 · Acciones rápidas
1. **Abrir caja / Nueva venta / Nuevo gasto** llevan al flujo existente correspondiente.

## Datos (reutilizados, sin duplicar)
- Transacciones: `GET /api/reports/movements?from&to&type&q` (ventas + gastos unificados, KPIs).
- Cierres: `GET /api/reports/closures` (`cash_register_closures`).
- Export: `GET /api/reports/export`.

## QA automatizada
`apps/backend/test/reports-export.test.js`: KPIs ingresos/egresos, filtro por tipo, **búsqueda por concepto**, **listado de cierres**, export CSV, y bloqueo de export al cajero (403). Total suite: **125/125**.
