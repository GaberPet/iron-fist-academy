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
import './ui/styles.css';

inputManager.start();

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
