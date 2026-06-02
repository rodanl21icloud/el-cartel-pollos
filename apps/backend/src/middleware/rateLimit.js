// ============================================================
// Rate limiter en memoria (ventana fija). Suficiente para un único
// proceso persistente (Render Web Service). Protege el login de
// fuerza bruta. Se desactiva en entornos de test/serverless.
// ============================================================
const buckets = new Map();

// Limpieza perezosa de buckets vencidos para no crecer sin límite.
function sweep(now) {
  if (buckets.size < 5000) return;
  for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
}

/**
 * rateLimit({ windowMs, max, key })
 *   key(req) -> string identificador (por defecto, la IP).
 */
export function rateLimit({ windowMs = 5 * 60_000, max = 30, key = (req) => req.ip } = {}) {
  return (req, res, next) => {
    // En tests/serverless no limitamos (los flujos de prueba hacen muchos logins).
    if (process.env.NODE_ENV === 'serverless' || process.env.NODE_ENV === 'test') return next();

    const now = Date.now();
    const k = `${req.baseUrl || ''}${req.path}:${key(req)}`;
    let rec = buckets.get(k);
    if (!rec || now > rec.reset) { rec = { count: 0, reset: now + windowMs }; buckets.set(k, rec); }
    rec.count += 1;

    const remaining = Math.max(0, max - rec.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (rec.count > max) {
      const retry = Math.ceil((rec.reset - now) / 1000);
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({ error: 'DEMASIADOS_INTENTOS', retry_after_s: retry });
    }
    sweep(now);
    return next();
  };
}
