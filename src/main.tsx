import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { LoginGate } from './ui/LoginGate';
import { StoreProvider } from './ui/store';
import { inputManager } from './runtime/inputManager';
import '@fontsource/montserrat/300.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/800.css';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/600.css';
import '@fontsource/source-sans-3/700.css';
// Arcade theme fonts (only downloaded when that theme is on)
import '@fontsource-variable/teko';
import '@fontsource/metropolis/400.css';
import '@fontsource/metropolis/600.css';
import '@fontsource/metropolis/700.css';
import '@fontsource-variable/jetbrains-mono';
import './ui/styles.css';

inputManager.start();

// Website only: offline cache for the installed phone app (the desktop app has its files built in).
if (import.meta.env.PROD && 'serviceWorker' in navigator && !window.ifaApi) {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LoginGate>
    <StoreProvider
      fallback={<div className="loading"><div><div className="spinner" />Loading your training data…</div></div>}
      errorView={(e) => (
        <div className="loading"><div className="notice bad" style={{ maxWidth: 520 }}><b>Something went wrong.</b> {e}<br />Your data files are untouched; restart the app. If it persists, see README → Troubleshooting.</div></div>
      )}
    >
      <App />
    </StoreProvider>
    </LoginGate>
  </StrictMode>,
);
