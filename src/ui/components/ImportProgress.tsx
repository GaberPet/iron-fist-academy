import { useRef, useState } from 'react';
import { migrateProgress } from '../../core/progress';
import { storage } from '../../runtime/storage';
import { useStore } from '../store';
import { currentPlayer } from '../LoginGate';

// Desktop app: step-by-step help for bringing progress over from the website, then the file picker.
export function ImportProgressButton() {
  const { replaceProgress } = useStore();
  const dlg = useRef<HTMLDialogElement>(null);
  const [msg, setMsg] = useState('');

  const pick = async () => {
    const text = await storage.importText();
    if (!text) return;
    try {
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.attempts)) throw new Error('this is not a progress file');
      replaceProgress(migrateProgress(parsed));
      setMsg(`Done: imported ${parsed.attempts.length} attempts into ${currentPlayer()?.name ?? 'this player'}.`);
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}. Your current progress was not changed.`);
    }
  };

  return (
    <>
      <button className="btn import-btn" title="Import progress from the website" onClick={() => { setMsg(''); dlg.current?.showModal(); }}>
        <span aria-hidden>⬆</span> <span className="lbl">Import progress</span>
      </button>
      <dialog ref={dlg} className="card import-dialog" aria-labelledby="import-title" onClick={(e) => e.target === dlg.current && dlg.current?.close()}>
        <div className="stack">
          <h2 id="import-title">Import your progress from the website</h2>
          <p className="small muted">The app and the website save progress separately. Copy it over in two steps:</p>
          <ol>
            <li>On the website, sign in as your player, open <b>Progress</b> and click <b>Export all progress (JSON)</b>. Save the file somewhere this computer can reach (a USB stick, cloud storage or your Downloads folder).</li>
            <li>Here in the app, click <b>Choose file…</b> below and pick that file.</li>
          </ol>
          <p className="small">This replaces the progress of the player you are signed in as now: <b>{currentPlayer()?.name}</b>. Lessons, combos and stats come over; settings such as theme and favourite character do not.</p>
          {msg && <p className="notice info" role="status">{msg}</p>}
          <div className="row">
            <button className="btn primary" onClick={pick}>Choose file…</button>
            <button className="btn" onClick={() => dlg.current?.close()}>Close</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
