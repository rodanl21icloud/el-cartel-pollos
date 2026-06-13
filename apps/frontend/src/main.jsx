import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import App from './App.jsx';
import PublicCatalog from './screens/PublicCatalog.jsx';
import PublicCartelera from './screens/PublicCartelera.jsx';
import { BRAND_NAME } from './config/brand.js';
import './index.css';

// Título de la pestaña según la instancia (branding por deploy).
document.title = `${BRAND_NAME} — POS`;

// Rutas públicas (sin login) — leen el :slug y lo pasan como prop a la pantalla.
//   /catalogo/:slug | /menu/:slug | /carta/:slug -> catálogo interactivo
//   /cartelera/:slug | /tv/:slug                 -> cartelera de precios 16:9
// Van ANTES del catch-all /* (App). Como exigen segmento :slug, /carta y
// /cartelera sin slug caen al shell autenticado (rutas internas homónimas).
function CatalogRoute() { const { slug } = useParams(); return <PublicCatalog slug={decodeURIComponent(slug)} />; }
function CarteleraRoute() { const { slug } = useParams(); return <PublicCartelera slug={decodeURIComponent(slug)} />; }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/catalogo/:slug" element={<CatalogRoute />} />
        <Route path="/menu/:slug" element={<CatalogRoute />} />
        <Route path="/carta/:slug" element={<CatalogRoute />} />
        <Route path="/cartelera/:slug" element={<CarteleraRoute />} />
        <Route path="/tv/:slug" element={<CarteleraRoute />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
