import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../../lib/api.js';

function Toggle({ label, on, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} className="w-full flex items-center justify-between py-2">
      <span className="font-semibold text-zinc-700">{label}</span>
      <span className={`w-11 h-6 rounded-full transition relative ${on ? 'bg-green-500' : 'bg-zinc-300'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

// Catálogo virtual: link compartible + QR + formas de entrega (estilo Treinta).
export default function CatalogShareModal({ otp, count, onClose, onError, flash }) {
  const [s, setS] = useState(null);
  const [slug, setSlug] = useState('');
  const [whats, setWhats] = useState('');
  const [qr, setQr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/settings').then((d) => {
      setS(d); setSlug(d.catalog_slug || ''); setWhats(d.whatsapp || '');
      // Si no hay slug, generamos uno y lo persistimos.
      if (!d.catalog_slug) {
        const base = (d.instagram || d.name || 'mi-negocio').toLowerCase()
          .replace(/^@/, '').replace(/\.cl$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
        save({ catalog_slug: base });
      }
    }).catch(onError);
  }, []);

  const url = slug ? `${window.location.origin}/catalogo/${slug}` : '';
  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { width: 260, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } })
      .then(setQr).catch(() => setQr(''));
  }, [url]);

  async function save(patch) {
    setSaving(true);
    try {
      const d = await api('/settings', { method: 'PUT', body: patch, otp });
      setS(d); if (d.catalog_slug != null) setSlug(d.catalog_slug);
    } catch (e) { onError(e); } finally { setSaving(false); }
  }
  const toggle = (key) => save({ [key]: s[key] ? 0 : 1 });
  function copy() { navigator.clipboard?.writeText(url).then(() => flash('Link copiado')); }
  function download() {
    if (!qr) return;
    const a = document.createElement('a'); a.href = qr; a.download = `catalogo-${slug || 'cartel'}.png`; a.click();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-black text-lg">Catálogo virtual</h3>
          <button onClick={onClose} className="text-zinc-400 text-xl">✕</button>
        </div>
        <p className="text-sm text-zinc-500 mb-4">Comparte este link con tus clientes. Verán {count} producto{count === 1 ? '' : 's'} publicado{count === 1 ? '' : 's'}. Para ocultar uno, usa el ícono 👁️ en la tabla.</p>

        {!s ? <p className="text-zinc-400">Cargando…</p> : (
          <>
            {/* QR */}
            <div className="flex justify-center mb-3">
              {qr ? <img src={qr} alt="QR del catálogo" className="w-44 h-44 rounded-xl border border-zinc-100" /> : <div className="w-44 h-44 rounded-xl bg-zinc-100 animate-pulse" />}
            </div>

            {/* Link + slug */}
            <label className="text-xs font-bold text-zinc-500">Tu link</label>
            <div className="flex items-center gap-1 mt-1 mb-1 bg-zinc-50 border-2 border-zinc-200 rounded-xl px-3 py-2">
              <span className="text-sm text-zinc-400 truncate">{window.location.host}/catalogo/</span>
              <input value={slug} onChange={(e) => setSlug(e.target.value)} onBlur={() => slug && slug !== s.catalog_slug && save({ catalog_slug: slug })}
                className="flex-1 min-w-0 bg-transparent outline-none text-sm font-bold text-ink" />
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={copy} className="flex-1 py-2 rounded-xl bg-cartel text-white font-bold text-sm">Copiar link</button>
              <button onClick={download} className="px-4 py-2 rounded-xl bg-zinc-200 font-bold text-sm">Descargar QR</button>
              <a href={url} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-zinc-200 font-bold text-sm grid place-items-center">Ver</a>
            </div>

            {/* Formas de entrega */}
            <div className="border-t pt-3">
              <div className="text-xs font-bold text-zinc-500 mb-2">Formas de entrega</div>
              <Toggle label="🏠 Retiro en tienda" on={!!s.pickup_enabled} onClick={() => toggle('pickup_enabled')} disabled={saving} />
              <Toggle label="🛵 Entrega a domicilio" on={!!s.delivery_enabled} onClick={() => toggle('delivery_enabled')} disabled={saving} />
            </div>

            {/* WhatsApp para recibir pedidos */}
            <div className="border-t pt-3 mt-3">
              <label className="text-xs font-bold text-zinc-500">WhatsApp para pedidos (con código país)</label>
              <input value={whats} onChange={(e) => setWhats(e.target.value)} onBlur={() => whats !== (s.whatsapp || '') && save({ whatsapp: whats })}
                placeholder="+569 1234 5678" inputMode="tel"
                className="w-full mt-1 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none text-sm" />
              <p className="text-xs text-zinc-400 mt-1">Los pedidos del catálogo llegan a este número por WhatsApp.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
