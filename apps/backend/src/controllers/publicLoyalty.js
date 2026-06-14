// Billetera de fidelización — consulta PÚBLICA por teléfono (sin login).
import { walletByPhone } from '../services/marketing/commercial.js';

/** GET /api/public/clients/:phone/wallet */
export async function getPublicWallet(req, res) {
  try {
    return res.json(await walletByPhone(req.params.phone));
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'ERROR' });
  }
}
