# Nueva instancia (otro local) — ej. "El Pollo de la Tía"

Cada local corre el **mismo código** pero con su **propia base de datos** (Turso) y su
**propio deploy**. Los datos quedan 100% separados; el nombre/branding del local sale de
`business_settings`, que se fija al provisionar. No hay que copiar ni bifurcar el código.

## 1. Crear la base de datos del local (Turso)

```bash
turso db create pollo-de-la-tia
turso db show pollo-de-la-tia --url          # -> TURSO_DATABASE_URL
turso db tokens create pollo-de-la-tia       # -> TURSO_AUTH_TOKEN
```

> ¿Pruebas locales sin Turso? Usa una base de archivo: `TURSO_DATABASE_URL="file:pollo-tia.db"`.

## 2. Provisionar la base VACÍA y con el nombre del local

Desde `apps/backend`, con las variables de esa base en el entorno:

```bash
BUSINESS_NAME="El Pollo de la Tía" \
ADMIN_USER="gerente" \
TURSO_DATABASE_URL="libsql://...-tu-org.turso.io" \
TURSO_AUTH_TOKEN="..." \
node scripts/provision.mjs
```

Esto:
- aplica el esquema completo (todas las funciones disponibles),
- siembra solo lo estructural (categorías de gasto) — **base vacía, sin ventas ni demo**,
- fija `business_settings.name = "El Pollo de la Tía"` (boletas, cartelera, emisor del OTP),
- crea el usuario **gerencia** e imprime contraseña + secreto OTP (**guárdalos ahora**).

`WITH_DEMO=1` agrega datos de ejemplo (solo para pruebas). Para producción, no lo uses.

## 3. Desplegar la instancia

En **Render → New → Blueprint**, apunta al MISMO repo y al archivo
[`render.pollo-tia.yaml`](../render.pollo-tia.yaml). Completa `TURSO_DATABASE_URL` y
`TURSO_AUTH_TOKEN` con los de la base de **El Pollo de la Tía**. `JWT_SECRET` se genera
solo (independiente de El Cartel).

Quedarán dos servicios separados (`cartel-pollos` y `pollo-de-la-tia`), cada uno con su
dominio, su base y sus usuarios. Los fixes al código se propagan a ambos en el próximo deploy.

## 4. Branding

- **Nombre del staff** (login, sidebar, título de la pestaña): se fija con la variable de
  build **`VITE_BRAND_NAME`** (ya incluida en `render.pollo-tia.yaml`). Vite la inyecta en el
  bundle al construir. *(Requiere el soporte de marca del front — rama `design/asador-system`.)*
- **Datos del negocio para clientes** (nombre en boletas/cartelera, dirección, teléfono, RUT,
  mensaje, ancho de papel, plantilla): se editan en la app en **Ajustes** (permiso
  `settings.manage`) y salen de `business_settings` (lo fija `BUSINESS_NAME` al provisionar).
- **Logo** (sidebar / login / boleta): archivo estático `apps/frontend/public/logo.jpeg`.
  Para un logo distinto por instancia, reemplázalo en ese deploy.

## Resumen

| | El Cartel | El Pollo de la Tía |
|---|---|---|
| Código | mismo repo / branch `main` | mismo repo / branch `main` |
| Deploy | `render.yaml` | `render.pollo-tia.yaml` |
| Base Turso | propia | **propia (vacía)** |
| Branding (clientes) | `business_settings` | `business_settings` (BUSINESS_NAME al provisionar) |
| Branding (staff) | `VITE_BRAND_NAME` (def.) | `VITE_BRAND_NAME="El Pollo de la Tía"` |
| Datos | independientes | independientes |
