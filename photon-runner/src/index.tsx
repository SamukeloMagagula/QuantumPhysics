import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

// Deliberately no React.StrictMode: it double-invokes effects in dev, which
// double-mounts the WebGL GameEngine (two renderers briefly racing for the
// same canvas before cleanup runs) and shows up as animation stutter on
// first load. Safe to omit for an imperative render-loop app like this one.
ReactDOM.createRoot(rootEl).render(<App />);
