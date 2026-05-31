// Servidor Express — listo para Serverless/PaaS (export del handler).
import express from 'express';
import { requireAuth, requireRole, requireOtpForMutation } from './middleware/auth.js';
import { verifyHmac } from './middleware/hmac.js';
import { login } from './controllers/auth.js';
import { closeCashRegister, getCurrentSession, openSession, registerMovement } from './controllers/cashRegister.js';
import { syncSale, listProducts } from './controllers/sales.js';
import { registerMerma, listIngredients, lowStockAlerts } from './controllers/inventory.js';
import { updateProduct, deleteProduct, updateIngredient } from './controllers/admin.js';
import { listCategories, createExpense, listExpenses } from './controllers/expenses.js';
import { turnSummary, closuresHistory, cashFlow } from './controllers/reports.js';

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

// --- Público ---
app.post('/api/auth/login', login);

// --- Protegido: JWT en todo /api + guard OTP sobre PUT/DELETE ---
app.use('/api', requireAuth, requireOtpForMutation);

// Catálogo POS
app.get('/api/products', listProducts);

// Caja: apertura con fondo, movimientos de efectivo y Cierre Ciego
app.get('/api/cash-register/current', getCurrentSession);
app.post('/api/cash-register/open', requireRole('CAJERO', 'GERENCIA'), openSession);
app.post('/api/cash-register/movement', requireRole('CAJERO', 'GERENCIA'), registerMovement);
app.post('/api/cash-register/close', requireRole('CAJERO', 'GERENCIA'), closeCashRegister);

// Gastos / egresos
app.get('/api/expenses/categories', listCategories);
app.post('/api/expenses', createExpense);
app.get('/api/expenses', requireRole('GERENCIA'), listExpenses);

// Sincronización de ventas (firma HMAC obligatoria, anti-tamper)
app.post('/api/sales/sync', verifyHmac, syncSale);

// Inventario: mermas (POST, sin OTP) + lecturas
app.get('/api/inventory/ingredients', listIngredients);
app.get('/api/inventory/alerts', lowStockAlerts);
app.post('/api/inventory/merma', registerMerma);

// Administración de catálogo (PUT/DELETE -> exige OTP de gerencia)
app.put('/api/products/:id', updateProduct);
app.delete('/api/products/:id', deleteProduct);
app.put('/api/ingredients/:id', updateIngredient);

// Reportes (solo GERENCIA: exponen el teórico)
app.get('/api/reports/turn-summary', requireRole('GERENCIA'), turnSummary);
app.get('/api/reports/closures', requireRole('GERENCIA'), closuresHistory);
app.get('/api/reports/cash-flow', requireRole('GERENCIA'), cashFlow);

// Handler de errores uniforme.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'ERROR_INTERNO' });
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'serverless') {
  app.listen(PORT, () => console.log(`API en :${PORT}`));
}

export default app; // handler para entornos serverless
