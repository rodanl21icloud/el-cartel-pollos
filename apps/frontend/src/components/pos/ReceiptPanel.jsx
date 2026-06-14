import { buildCustomerReceiptHTML, buildKitchenTicketHTML, whatsappUrl } from '../../lib/receipt.js';
import { openPrint } from '../../lib/print.js';
import { money } from './posShared.js';

// Panel post-venta: número de orden + acciones de comprobante.
export default function ReceiptPanel({ data, settings, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm text-zinc-500">Venta registrada</div>
        <div className="text-6xl font-black text-cartel my-1">{data.offline ? '⏳' : `N° ${data.order_number}`}</div>
        {data.offline && <div className="text-amber-600 font-bold mb-1">En cola · número al reconectar</div>}
        <div className="text-2xl font-black mb-4">{money(data.total)}</div>
        <div className="grid gap-2">
          <button onClick={() => openPrint(buildKitchenTicketHTML(data, settings))} className="btn-pos bg-zinc-800 text-white">🍗 Ticket de cocina</button>
          <button onClick={() => openPrint(buildCustomerReceiptHTML(data, settings))} className="btn-pos bg-blue-600 text-white">🧾 Imprimir boleta</button>
          <a href={whatsappUrl(data, settings)} target="_blank" rel="noreferrer" className="btn-pos bg-green-600 text-white block">📲 Enviar por WhatsApp</a>
          <button onClick={onClose} className="px-4 py-3 rounded-2xl bg-zinc-200 font-bold mt-1">Nueva venta</button>
        </div>
      </div>
    </div>
  );
}
