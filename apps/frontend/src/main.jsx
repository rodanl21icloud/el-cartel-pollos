import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import PublicCatalog from './screens/PublicCatalog.jsx';
import './index.css';

// Ruta pública del catálogo: /catalogo/:slug (o /menu/:slug), sin login.
const m = window.location.pathname.match(/^\/(?:catalogo|menu)\/([^/]+)/);
const root = m
  ? <PublicCatalog slug={decodeURIComponent(m[1])} />
  : <App />;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>{root}</React.StrictMode>
);
