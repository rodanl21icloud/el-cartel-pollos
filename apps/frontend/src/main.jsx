import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import PublicCatalog from './screens/PublicCatalog.jsx';
import PublicCartelera from './screens/PublicCartelera.jsx';
import './index.css';

// Rutas públicas (sin login):
//   /catalogo/:slug | /menu/:slug   -> catálogo interactivo para clientes
//   /cartelera/:slug | /tv/:slug    -> cartelera de precios 16:9 para pantalla
const path = window.location.pathname;
const mCat = path.match(/^\/(?:catalogo|menu|carta)\/([^/]+)/);
const mTv = path.match(/^\/(?:cartelera|tv)\/([^/]+)/);
const root = mTv
  ? <PublicCartelera slug={decodeURIComponent(mTv[1])} />
  : mCat
    ? <PublicCatalog slug={decodeURIComponent(mCat[1])} />
    : <App />;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>{root}</React.StrictMode>
);
