// Servidor Express — listo para Serverless/PaaS (export del handler).
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { requireAuth, requireOtpForMutation } from './middleware/auth.js';
import { rateLimit } from './middleware/rateLimit.js';
import { requirePermission } from './middleware/permissions.js';
import { verifyHmac } from './middleware/hmac.js';
import { login } from './controllers/auth.js';
import { closeCashRegister, getCurrentSession, openSession, registerMovement } from './controllers/cashRegister.js';
import { syncSale, listProducts, getReceipt, listSales, voidSale } from './controllers/sales.js';
import { getSettings, updateSettings } from './controllers/settings.js';
import { registerMerma, listIngredients, lowStockAlerts,
         createIngredient, deleteIngredient, restockIngredient } from './controllers/inventory.js';
import { createProduct, updateProduct, deleteProduct, updateIngredient, listCatalog } from './controllers/admin.js';
import { getRecipe, setRecipe } from './controllers/recipes.js';
import { listCategories, createExpense, listExpenses } from './controllers/expenses.js';
import { turnSummary, closuresHistory, cashFlow, pnl, stats, dashboard, movements, exportReport, forecast } from './controllers/reports.js';
import { getPermissions, myPermissions, updatePermission } from './controllers/permissions.js';
import { listGroups, createGroup, deleteGroup, createOption, deleteOption, setGroupProducts, getProductModifiers } from './controllers/modifiers.js';
import { listClients, createClient } from './controllers/clients.js';
import { bankSummary, bankMovements, addBankMovement, reconcileMovement, reconcile } from './controllers/bank.js';
import { listUsers, createUser, updateUser, resetPassword } from './controllers/users.js';
import { listDispatch, updateDispatchStatus } from './controllers/dispatch.js';
import { getPublicCatalog } from './controllers/publicCatalog.js';

const app = express();
// Detrás del proxy de Render/PaaS: req.ip refleja la IP real del cliente
// (para auditoría y rate limiting).
app.set('trust proxy', 1);

// Cabeceras de seguridad mínimas (sin CSP estricta para no romper la PWA).
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

// --- Público ---
// Anti-fuerza bruta: máx. 30 intentos de login por IP cada 5 minutos.
app.post('/api/auth/login', rateLimit({ windowMs: 5 * 60_000, max: 30 }), login);

// Catálogo público compartible (sin JWT). Solo datos de vitrina.
app.get('/api/public/catalog/:slug', getPublicCatalog);

// --- Protegido: JWT en todo /api. El OTP de gerencia se aplica de forma
// SELECTIVA solo a operaciones sensibles del catálogo/permisos (no a las
// acciones operativas como avanzar el despacho o editar una receta). ---
app.use('/api', requireAuth);

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

// Clientes / domicilios (lookup por teléfono para autocompletar en la venta)
app.get('/api/clients', listClients);
app.post('/api/clients', requirePermission('pos.sell'), createClient);

// Sincronización de ventas (firma HMAC obligatoria, anti-tamper)
app.post('/api/sales/sync', requirePermission('pos.sell'), verifyHmac, syncSale);

// Listado de ventas (transacciones) + comprobante (imprimir / reenviar)
app.get('/api/sales', requirePermission('pos.sell'), listSales);
app.get('/api/sales/:id/receipt', getReceipt);
app.post('/api/sales/:id/void', requirePermission('reports.view'), voidSale);

// Datos del negocio (comprobantes)
app.get('/api/settings', getSettings);
app.put('/api/settings', requirePermission('settings.manage'), requireOtpForMutation, updateSettings);

// Tablero de despacho (número de orden + estados)
app.get('/api/dispatch', requirePermission('dispatch.manage'), listDispatch);
app.put('/api/dispatch/:saleId/status', requirePermission('dispatch.manage'), updateDispatchStatus);

// Inventario: mermas + lecturas
app.get('/api/inventory/ingredients', listIngredients);
app.get('/api/inventory/alerts', lowStockAlerts);
app.post('/api/inventory/merma', requirePermission('inventory.merma'), registerMerma);

// Gestión de insumos (CRUD + reposición). Editar/eliminar -> también OTP de gerencia.
app.post('/api/inventory/ingredients', requirePermission('inventory.manage'), createIngredient);
app.put('/api/inventory/ingredients/:id', requirePermission('inventory.manage'), requireOtpForMutation, updateIngredient);
app.delete('/api/inventory/ingredients/:id', requirePermission('inventory.manage'), requireOtpForMutation, deleteIngredient);
app.post('/api/inventory/ingredients/:id/restock', requirePermission('inventory.manage'), restockIngredient);

// Administración de carta. Editar/eliminar precio o plato -> también OTP de gerencia.
app.get('/api/products/catalog', requirePermission('menu.manage'), listCatalog);
app.post('/api/products', requirePermission('menu.manage'), createProduct);
app.put('/api/products/:id', requirePermission('menu.manage'), requireOtpForMutation, updateProduct);
app.delete('/api/products/:id', requirePermission('menu.manage'), requireOtpForMutation, deleteProduct);

// Recetas (BOM) por producto. Decimales soportados.
app.get('/api/products/:id/recipe', requirePermission('recipes.manage'), getRecipe);
app.put('/api/products/:id/recipe', requirePermission('recipes.manage'), setRecipe);

// Modificadores / adiciones del producto (POS los lee al agregar)
app.get('/api/products/:id/modifiers', getProductModifiers);

// Administración de modificadores
app.get('/api/modifiers', requirePermission('menu.manage'), listGroups);
app.post('/api/modifiers/groups', requirePermission('menu.manage'), createGroup);
app.delete('/api/modifiers/groups/:id', requirePermission('menu.manage'), deleteGroup);
app.put('/api/modifiers/groups/:id/products', requirePermission('menu.manage'), setGroupProducts);
app.post('/api/modifiers/options', requirePermission('menu.manage'), createOption);
app.delete('/api/modifiers/options/:id', requirePermission('menu.manage'), deleteOption);

// Reportes (exponen el teórico)
app.get('/api/reports/turn-summary', requirePermission('reports.view'), turnSummary);
app.get('/api/reports/closures', requirePermission('reports.view'), closuresHistory);
app.get('/api/reports/cash-flow', requirePermission('reports.view'), cashFlow);
app.get('/api/reports/pnl', requirePermission('reports.view'), pnl);
app.get('/api/reports/stats', requirePermission('reports.view'), stats);
app.get('/api/reports/dashboard', requirePermission('reports.view'), dashboard);
app.get('/api/reports/movements', requirePermission('reports.view'), movements);
app.get('/api/reports/export', requirePermission('reports.view'), exportReport);
app.get('/api/reports/forecast', requirePermission('reports.view'), forecast);

// Conciliación bancaria
app.get('/api/bank/summary', requirePermission('reports.view'), bankSummary);
app.get('/api/bank/movements', requirePermission('reports.view'), bankMovements);
app.get('/api/bank/reconcile', requirePermission('reports.view'), reconcile);
app.post('/api/bank/movements', requirePermission('expenses.manage'), addBankMovement);
app.put('/api/bank/movements/:id/reconcile', requirePermission('expenses.manage'), reconcileMovement);

// Gestión de usuarios (permiso permissions.manage)
app.get('/api/users', requirePermission('permissions.manage'), listUsers);
app.post('/api/users', requirePermission('permissions.manage'), createUser);
app.put('/api/users/:id', requirePermission('permissions.manage'), updateUser);
app.post('/api/users/:id/password', requirePermission('permissions.manage'), resetPassword);

// Administración de permisos (matriz rol×módulo). PUT también exige OTP.
app.get('/api/permissions', requirePermission('permissions.manage'), getPermissions);
app.put('/api/permissions', requirePermission('permissions.manage'), requireOtpForMutation, updatePermission);

// --- Frontend (PWA) servido desde el mismo dominio en producción ---
// La build de Vite vive en apps/frontend/dist. Si existe, Express la sirve
// y hace fallback a index.html para las rutas del SPA (no /api ni /health).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    // El service worker y el manifest no deben cachearse agresivamente.
    return res.sendFile(path.join(DIST, 'index.html'));
  });
  console.log('Frontend estático servido desde', DIST);
}

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
