import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { StoreProvider } from './ui/store';
import { inputManager } from './runtime/inputManager';
import '@fontsource-variable/teko';
import '@fontsource/metropolis/400.css';
import '@fontsource/metropolis/700.css';
import '@fontsource-variable/jetbrains-mono';
import './ui/styles.css';

inputManager.start();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider
      fallback={<div className="loading"><div><div className="spinner" />Loading your training data…</div></div>}
      errorView={(e) => (
        <div className="loading"><div className="notice bad" style={{ maxWidth: 520 }}><b>Something went wrong.</b> {e}<br />Your data files are untouched; restart the app. If it persists, see README → Troubleshooting.</div></div>
      )}
    >
      <App />
    </StoreProvider>
  </StrictMode>,
);
