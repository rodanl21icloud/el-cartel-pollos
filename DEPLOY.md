# Deploy a internet — El Cartel de los Pollos

Arquitectura de producción: **un solo servicio** en Render (servidor Node
persistente) que sirve la **API** en `/api` y la **PWA** en el mismo dominio.
La base de datos es **Turso (libSQL)** en la nube.

> ¿Por qué un servidor persistente y no funciones serverless? El backend guarda
> las claves de sesión HMAC y la caché de permisos **en memoria**. Un proceso
> único garantiza que la firma de una venta se valide contra la misma sesión
> del login. Render mantiene ese proceso vivo.

---

## Resumen (lo que harás)

1. Crear la base de datos en Turso y obtener su URL + token.
2. Provisionar la base (tablas + datos base + usuario gerencia con OTP).
3. Subir el repo a GitHub.
4. Crear el servicio en Render con el blueprint `render.yaml`.
5. Pegar las 2 variables secretas de Turso. Deploy.
6. Verificar e iniciar sesión.

Tiempo estimado: ~20 minutos.

---

## 1. Base de datos en Turso

Crea una cuenta gratuita en <https://turso.tech> e instala la CLI:

```bash
# macOS / Linux
curl -sSfL https://get.tur.so/install.sh | bash
# Windows: usa WSL, o instala con scoop:  scoop install turso
turso auth login
```

Crea la base y obtén credenciales:

```bash
turso db create cartel-pollos
turso db show --url cartel-pollos        # -> TURSO_DATABASE_URL (libsql://...)
turso db tokens create cartel-pollos     # -> TURSO_AUTH_TOKEN (eyJ...)
```

Guarda ambos valores.

---

## 2. Provisionar la base (desde tu máquina)

Crea `apps/backend/.env.production` a partir de la plantilla y completa los 2
valores de Turso:

```bash
cp apps/backend/.env.production.example apps/backend/.env.production
# edita el archivo y pega TURSO_DATABASE_URL y TURSO_AUTH_TOKEN
```

Instala dependencias y provisiona (crea tablas, triggers, categorías, datos del
negocio y el usuario **gerencia** con su secreto OTP):

```bash
npm ci
npm run provision           # equivale a: provision:local con .env.production
```

> El script imprime **usuario, contraseña y secreto OTP** UNA vez. Cárgalos en
> Google Authenticator / Authy. La contraseña no se vuelve a mostrar.
> Puedes fijar tu propia clave con `ADMIN_PASSWORD=...` en `.env.production`.

(Opcional) Cargar tu carta y recetas reales:

```bash
cd apps/backend
node --env-file=.env.production scripts/seedRecetasReal.mjs
# o importar tus Excel/cartolas con los scripts de import correspondientes
```

---

## 3. Subir a GitHub

```bash
git add -A && git commit -m "chore: preparar deploy"   # si falta
git branch -M main
git remote add origin https://github.com/<tu-usuario>/el-cartel-pollos.git
git push -u origin main
```

---

## 4. Crear el servicio en Render

1. Entra a <https://dashboard.render.com> → **New** → **Blueprint**.
2. Conecta tu repositorio de GitHub. Render detecta `render.yaml`.
3. Aprueba la creación del servicio `cartel-pollos`.

El blueprint ya define el build (`npm ci --include=dev && npm run build`), el
arranque (`npm start`), el health check (`/health`), `NODE_ENV=production` y
genera `JWT_SECRET` automáticamente.

---

## 5. Variables secretas

En el servicio → **Environment**, completa las dos marcadas como _sync:false_:

| Variable | Valor |
|---|---|
| `TURSO_DATABASE_URL` | `libsql://cartel-pollos-...turso.io` |
| `TURSO_AUTH_TOKEN`   | `eyJ...` |

Guarda. Render hará el primer deploy. Sigue los logs hasta ver
`API en :10000` y `Frontend estático servido desde ...`.

---

## 6. Verificar

```bash
curl https://cartel-pollos.onrender.com/health        # {"ok":true}
```

Abre `https://cartel-pollos.onrender.com` en el navegador → debe cargar el POS.
Inicia sesión con el usuario gerencia provisionado en el paso 2.
Como es PWA, puedes **instalarla** en el teléfono ("Agregar a pantalla de inicio").

---

## Operación

- **Plan free**: el servicio se duerme tras ~15 min de inactividad; el primer
  request tarda ~30 s en despertar. Para un local en operación, sube a **Starter**
  (US$7/mes) y queda siempre activo.
- **Auto-deploy**: cada `git push` a `main` redepliega solo.
- **Respaldos de la base**: `turso db shell cartel-pollos .dump > backup.sql`
  (o programa respaldos con la CLI de Turso). El script `scripts/backup.mjs`
  sirve para snapshots locales.
- **Logs y auditoría**: los logs del proceso están en Render; la auditoría de
  negocio (ventas, cierres, permisos) está en la tabla `audit_logs` (append-only).

## Seguridad en producción (ya incluido)

- `trust proxy` activo → IP real del cliente en auditoría y rate limiting.
- Rate limit de **30 intentos de login por IP / 5 min** (anti fuerza bruta).
- Cabeceras `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
- `JWT_SECRET` fuerte generado por Render; OTP TOTP para mutaciones sensibles.
- Firma HMAC de ventas (anti-tamper) y triggers append-only en auditoría.

## Cambiar el dominio

En Render → **Settings → Custom Domain** puedes apuntar `pos.tudominio.cl`.
No requiere cambios de código (la app usa rutas `/api` relativas).

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| Build falla en `vite: not found` | no se instalaron devDeps | el blueprint ya usa `--include=dev`; verifica que no haya `NODE_ENV=production` en el paso de build manual |
| `SESION_NO_VALIDA` al vender | el proceso se reinició entre login y venta | reingresa (nuevo login). En plan free, evita inactividad larga o sube a Starter |
| 500 al abrir | faltan `TURSO_*` | completa las variables en Environment |
| App carga pero `/api` da 404 | build del frontend ausente | revisa que `npm run build` haya corrido en el deploy |
