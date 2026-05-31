// ============================================================
// Offline-First: cola de ventas en IndexedDB.
// Si la red falla, la venta (ya firmada) se guarda local y se
// reintenta al recuperar conexión. Idempotencia por client_uuid.
// ============================================================
import { signSale } from './crypto.js';

const DB_NAME = 'cartel-pollos';
const STORE = 'pending_sales';
const SYNC_URL = '/api/sales/sync';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'client_uuid' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const result = fn(store);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
  });
}

/** Registra una venta: intenta enviar; si falla la red, encola local. */
export async function recordSale(sale) {
  const envelope = await signSale(sale); // { payload, sessionId, hash }
  try {
    const res = await postSale(envelope);
    if (!res.ok) throw new Error('HTTP_' + res.status);
    return { synced: true };
  } catch {
    await tx('readwrite', (s) => s.put({ ...envelope.payload, _envelope: envelope }));
    return { synced: false, queued: true };
  }
}

/** Reintenta la cola pendiente (llamar en 'online' o por intervalo). */
export async function flushQueue() {
  for (const item of await pendingList()) {
    try {
      const res = await postSale(item._envelope);
      if (res.ok || res.status === 409) {
        // 409 = ya sincronizada (idempotente): se limpia igual.
        await tx('readwrite', (s) => s.delete(item.client_uuid));
      }
    } catch {
      // Sigue en cola; se reintenta luego.
    }
  }
}

async function pendingList() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function postSale(envelope) {
  return fetch(SYNC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('jwt') || ''}`,
    },
    body: JSON.stringify(envelope),
  });
}

// Auto-flush al recuperar conexión.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flushQueue());
}
