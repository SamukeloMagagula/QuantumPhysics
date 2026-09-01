import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { preloadSceneFont } from './sceneText';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

// Rasterise the SDF glyph atlas while the player is still on the menu.
// Otherwise the first scene loads with blank signage for a frame or two
// while the font is fetched and processed — most visible in Reception,
// where the wall sign is the first thing you look at.
preloadSceneFont();

// Deliberately no React.StrictMode: it double-invokes effects in dev, which
// double-mounts the WebGL GameEngine (two renderers briefly racing for the
// same canvas before cleanup runs) and shows up as animation stutter on
// first load. Safe to omit for an imperative render-loop app like this one.
ReactDOM.createRoot(rootEl).render(<App />);
