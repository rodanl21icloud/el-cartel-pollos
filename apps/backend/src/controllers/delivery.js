// ============================================================
// Cotización de despacho (público). Calcula la distancia de CONDUCCIÓN desde el
// local hasta la dirección del cliente (Google Distance Matrix) y aplica la tarifa.
// La API key va en el SERVIDOR (sin CORS, sin exponerla en el navegador).
// ============================================================

// ---- Reglas de cobertura/tarifa (editables) ----
const ORIGIN = '-33.6252938,-70.6797704'; // 📍 Local en San Bernardo (lat,lng). Cambia aquí el origen.
const MAX_KM = 8;        // radio máximo de reparto
const BASE_KM = 2.5;     // tramo con tarifa base
const BASE_FEE = 2000;   // tarifa base (0–BASE_KM km) en CLP
const PER_KM = 1000;     // CLP por km adicional sobre BASE_KM (proporcional)

const round0 = (n) => Math.round(n);

/** GET /api/public/delivery-quote?address=... */
export async function deliveryQuote(req, res) {
  const address = String(req.query.address || '').trim();
  if (address.length < 6) return res.json({ ok: false, reason: 'direccion_corta', message: 'Ingresa una dirección más completa.' });

  // 🔑 API KEY: define GOOGLE_MAPS_API_KEY en el entorno (.env.production) con tu
  //    cuenta de facturación activa y "Distance Matrix API" habilitada.
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.json({ ok: false, reason: 'no_config', message: 'Cálculo de envío no disponible; coordina por WhatsApp.' });

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?units=metric&mode=driving`
      + `&origins=${encodeURIComponent(ORIGIN)}&destinations=${encodeURIComponent(address + ', Chile')}&key=${key}`;
    const j = await (await fetch(url)).json();
    const el = j.rows?.[0]?.elements?.[0];

    if (j.status !== 'OK' || !el || el.status !== 'OK') {
      // No se pudo geolocalizar / sin ruta.
      return res.json({ ok: false, reason: 'no_geo', message: 'No pudimos ubicar esa dirección. Revísala o coordina por WhatsApp.' });
    }

    const km = el.distance.value / 1000;
    if (km > MAX_KM) {
      return res.json({ ok: false, reason: 'fuera_zona', km: Math.round(km * 10) / 10, message: 'Lo sentimos, esta dirección está fuera de nuestra zona de reparto.' });
    }
    const fee = km <= BASE_KM ? BASE_FEE : BASE_FEE + round0((km - BASE_KM) * PER_KM);
    return res.json({ ok: true, km: Math.round(km * 10) / 10, eta: el.duration?.text || null, fee, currency: 'CLP' });
  } catch (e) {
    return res.json({ ok: false, reason: 'error', message: 'No pudimos calcular el envío ahora. Intenta de nuevo o coordina por WhatsApp.' });
  }
}
