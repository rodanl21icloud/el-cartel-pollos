// Servidor Express — listo para Serverless/PaaS (export del handler).
import express from 'express';
import { requireAuth, requireOtpForMutation } from './middleware/auth.js';
import { requirePermission } from './middleware/permissions.js';
import { verifyHmac } from './middleware/hmac.js';
import { login } from './controllers/auth.js';
import { closeCashRegister, getCurrentSession, openSession, registerMovement } from './controllers/cashRegister.js';
import { syncSale, listProducts } from './controllers/sales.js';
import { registerMerma, listIngredients, lowStockAlerts,
         createIngredient, deleteIngredient, restockIngredient } from './controllers/inventory.js';
import { createProduct, updateProduct, deleteProduct, updateIngredient } from './controllers/admin.js';
import { getRecipe, setRecipe } from './controllers/recipes.js';
import { listCategories, createExpense, listExpenses } from './controllers/expenses.js';
import { turnSummary, closuresHistory, cashFlow, pnl } from './controllers/reports.js';
import { getPermissions, myPermissions, updatePermission } from './controllers/permissions.js';

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

// --- Público ---
app.post('/api/auth/login', login);

// --- Protegido: JWT en todo /api + guard OTP sobre PUT/DELETE ---
app.use('/api', requireAuth, requireOtpForMutation);

// Permisos efectivos del usuario actual (para que la UI muestre/oculte).
app.get('/api/permissions/me', myPermissions);

// Catálogo POS (cualquier autenticado lo lee; vender requiere permiso).
app.get('/api/products', listProducts);

// Caja: apertura con fondo, movimientos de efectivo y Cierre Ciego
app.get('/api/cash-register/current', getCurrentSession);
app.post('/api/cash-register/open', requirePermission('cash.operate'), openSession);
app.post('/api/cash-register/movement', requirePermission('cash.operate'), registerMovement);
app.post('/api/cash-register/close', requirePermission('cash.operate'), closeCashRegister);

// Gastos / egresos
app.get('/api/expenses/categories', listCategories);
app.post('/api/expenses', requirePermission('expenses.manage'), createExpense);
app.get('/api/expenses', requirePermission('reports.view'), listExpenses);

// Sincronización de ventas (firma HMAC obligatoria, anti-tamper)
app.post('/api/sales/sync', requirePermission('pos.sell'), verifyHmac, syncSale);

// Inventario: mermas + lecturas
app.get('/api/inventory/ingredients', listIngredients);
app.get('/api/inventory/alerts', lowStockAlerts);
app.post('/api/inventory/merma', requirePermission('inventory.merma'), registerMerma);

// Gestión de insumos (CRUD + reposición). PUT/DELETE -> también OTP de gerencia.
app.post('/api/inventory/ingredients', requirePermission('inventory.manage'), createIngredient);
app.put('/api/inventory/ingredients/:id', requirePermission('inventory.manage'), updateIngredient);
app.delete('/api/inventory/ingredients/:id', requirePermission('inventory.manage'), deleteIngredient);
app.post('/api/inventory/ingredients/:id/restock', requirePermission('inventory.manage'), restockIngredient);

// Administración de carta (PUT/DELETE -> también exige OTP de gerencia)
app.post('/api/products', requirePermission('menu.manage'), createProduct);
app.put('/api/products/:id', requirePermission('menu.manage'), updateProduct);
app.delete('/api/products/:id', requirePermission('menu.manage'), deleteProduct);

// Recetas (BOM) por producto. Decimales soportados.
app.get('/api/products/:id/recipe', requirePermission('recipes.manage'), getRecipe);
app.put('/api/products/:id/recipe', requirePermission('recipes.manage'), setRecipe);

// Reportes (exponen el teórico)
app.get('/api/reports/turn-summary', requirePermission('reports.view'), turnSummary);
app.get('/api/reports/closures', requirePermission('reports.view'), closuresHistory);
app.get('/api/reports/cash-flow', requirePermission('reports.view'), cashFlow);
app.get('/api/reports/pnl', requirePermission('reports.view'), pnl);

// Administración de permisos (matriz rol×módulo). PUT también exige OTP.
app.get('/api/permissions', requirePermission('permissions.manage'), getPermissions);
app.put('/api/permissions', requirePermission('permissions.manage'), updatePermission);

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
