import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { flushQueue } from '../lib/offlineStore.js';
import AbrirCajaModal from '../components/AbrirCajaModal.jsx';
import { money } from '../components/pos/posShared.js';
import SaleChooser from '../components/pos/SaleChooser.jsx';
import ProductSale from '../components/pos/ProductSale.jsx';
import VentaLibre from '../components/pos/VentaLibre.jsx';
import ReceiptPanel from '../components/pos/ReceiptPanel.jsx';

// Contenedor del POS: exige caja abierta y ofrece Venta de productos / Venta libre.
export default function Pos({ onNavigate }) {
  const [caja, setCaja] = useState(null);   // null=cargando, {open}
  const [mode, setMode] = useState('choose'); // choose | productos | libre
  const [settings, setSettings] = useState({ name: 'El Cartel de los Pollos', paper_width: 80 });
  const [lastSale, setLastSale] = useState(null);
  const [preload, setPreload] = useState(null); // producto a precargar en el carro (desde sugerencias)
  const [showApertura, setShowApertura] = useState(true); // KAN-31: pedir fondo al entrar con caja cerrada

  async function loadCaja() {
    try { setCaja(await api('/cash-register/current')); } catch { setCaja({ open: false }); }
  }
  useEffect(() => { loadCaja(); }, []);
  useEffect(() => { api('/settings').then(setSettings).catch(() => {}); }, []);
  useEffect(() => { flushQueue(); }, []);

  if (caja === null) return <p className="text-zinc-500 text-center mt-10">Cargando…</p>;

  // Caja cerrada -> no se puede vender. Se exige abrir la caja declarando el fondo
  // (KAN-31: el modal aparece al entrar; "Cancelar" deja el acceso bloqueado).
  if (!caja.open) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-2xl p-8 shadow text-center mt-6">
        <div className="text-5xl mb-2">🔒</div>
        <h2 className="text-2xl font-black mb-1">Caja cerrada</h2>
        <p className="text-zinc-500 mb-5">Debes abrir la caja antes de registrar ventas.</p>
        <button onClick={() => setShowApertura(true)} className="btn-pos bg-cartel text-white w-full">
          Abrir caja
        </button>
        {showApertura && (
          <AbrirCajaModal
            onOpened={() => { setShowApertura(false); loadCaja(); }}
            onCancel={() => setShowApertura(false)}
          />
        )}
      </div>
    );
  }

  const onSold = (data) => setLastSale(data);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Barra superior con estado de caja */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {mode !== 'choose' && (
            <button onClick={() => setMode('choose')} className="px-3 py-2 rounded-lg bg-zinc-200 font-bold">← Volver</button>
          )}
          <span className="text-xs px-3 py-1 rounded-full bg-green-600 text-white font-bold">CAJA ABIERTA · fondo {money(caja.opening_float)}</span>
        </div>
      </div>

      {mode === 'choose' && <SaleChooser onPick={(m) => { setPreload(null); setMode(m); }} onPickProduct={(p) => { setPreload(p); setMode('productos'); }} />}
      {mode === 'productos' && <ProductSale settings={settings} onSold={onSold} preload={preload} />}
      {mode === 'libre' && <VentaLibre settings={settings} onSold={onSold} />}

      {lastSale && (
        <ReceiptPanel data={lastSale} settings={settings} onClose={() => setLastSale(null)} />
      )}
    </div>
  );
}
