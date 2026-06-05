// Reseñas reales de Google (Places API). Filtra 4★ o más, cachea 6h.
// Requiere en el entorno: GOOGLE_PLACES_API_KEY y GOOGLE_PLACE_ID.
// Si no están configuradas, devuelve vacío y el landing usa su fallback.
let cache = { at: 0, data: null };

export async function getReviews(_req, res) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;
  if (!key || !placeId) return res.json({ source: 'none', rating: null, total: null, reviews: [] });

  const now = Date.now();
  if (cache.data && now - cache.at < 6 * 3600 * 1000) return res.json(cache.data);

  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}` +
      `&fields=rating,user_ratings_total,reviews&reviews_sort=newest&language=es&key=${key}`;
    const j = await (await fetch(url)).json();
    const result = j.result || {};
    const reviews = (result.reviews || [])
      .filter((rv) => Number(rv.rating) >= 4)
      .map((rv) => ({ author: rv.author_name, rating: Number(rv.rating), text: rv.text, when: rv.relative_time_description }));
    const data = { source: 'google', rating: result.rating ?? null, total: result.user_ratings_total ?? null, reviews };
    cache = { at: now, data };
    return res.json(data);
  } catch {
    return res.json({ source: 'error', rating: null, total: null, reviews: [] });
  }
}
