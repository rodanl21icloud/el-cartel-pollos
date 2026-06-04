# Módulo Estadísticas

Dashboard analítico con pestañas (Ventas, Gastos, Propinas*, Empleados*). Mobile-first,
CLP, zona America/Santiago, permiso `reports.view`. Comparación contra período equivalente
(Hoy → mismo día de la semana anterior; rangos → ventana previa de igual largo).

## Basado en referencia validada (Treinta)
- Pestañas Ventas / Gastos / Propinas / Empleados con selector de período y fecha.
- Comparación automática vs período equivalente anterior + texto "Comparado con el {día} anterior".
- KPIs "Total ventas" y "Ganancia de las ventas" con variación %.
- Aclaración "se calcula según el costo de tus productos" (usa costo BOM congelado).
- Gráfico "Detalle de ventas" con dos series (actual vs anterior) por hora.
- Tabla "Detalle de productos vendidos" (Producto, Total ventas, Unidades) + **Producto estrella**.
- Badge "función premium" (en Propinas/Empleados).
- Gastos: KPI total + variación + breakdown por categoría con %.

## Mejoras propuestas (sobre datos existentes)
- KPIs extra: margen %, ticket promedio, N° pedidos, descuentos.
- Ranking enriquecido: categoría, precio prom., costo, ganancia, margen %, participación %,
  variación vs período anterior; baja rentabilidad resaltada.
- Insights automáticos (hora pico, producto estrella, "ganancia cae más que ventas", etc.).
- Gastos: movimientos, promedio diario, % sobre ventas, detalle exportable, insights
  ("categoría dominante", "gastos crecen más rápido que ventas").
- Exportación CSV (productos y gastos).

## Requiere modelo nuevo (fase 2 — no implementado)
- **Propinas**: tabla/columna `tips` + asignación por empleado/turno.
- **Empleados/productividad**: `work_logs` (horas por turno) + asociación venta→empleado.
- **Sucursales** (multi-local San Ramón): `store_id` transversal — refactor mayor.
- **Canales reales** (salón/retiro/delivery/apps): hoy se derivaría de `delivery_address`.
- Pestañas Propinas/Empleados quedan como placeholder premium hasta esa fase.

## Suposiciones de diseño
- Mono-sucursal: el selector de sucursal se omite por ahora.
- "Ventas/Total" = `SUM(sales.total)` (CONFIRMADA); ganancia = total − COGS (BOM congelado,
  `inventory_adjustments` type VENTA). Productos sin receta → margen estimado + aviso.
- Comparación "un día" = mismo día semana anterior; otros rangos = ventana previa de igual largo.

## Endpoints
- `GET /api/reports/estadisticas/ventas?from=&to=`
- `GET /api/reports/estadisticas/gastos?from=&to=`
