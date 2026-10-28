import { useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { encodeTransfer } from '../../core/transfer';
import { storage } from '../../runtime/storage';
import { useStore } from '../store';
import { currentPlayer } from '../LoginGate';

const SITE = 'https://gaberpet.github.io/iron-fist-academy/';

// Desktop app and computer browser: show the progress as a QR code the phone's camera opens.
export function SendToPhone() {
  const { progress } = useStore();
  const dlg = useRef<HTMLDialogElement>(null);
  const [qr, setQr] = useState<{ svg: string; note: string } | null>(null);
  const [error, setError] = useState('');

  const open = async () => {
    setError('');
    setQr(null);
    dlg.current?.showModal();
    try {
      const { data, attempts, total } = await encodeTransfer(progress, currentPlayer()?.name ?? 'Player', storage.isElectron() ? 'desktop' : 'web');
      const base = storage.isElectron() ? SITE : location.origin + location.pathname;
      const code = qrcode(0, 'L');
      code.addData(`${base}#/import/${data}`, 'Byte');
      code.make();
      setQr({
        svg: code.createSvgTag({ cellSize: 4, margin: 4, scalable: true }),
        note: attempts < total ? `Includes all lessons and combos, and your ${attempts} most recent attempts of ${total} (the charts use these).` : 'Includes all lessons, combos and attempts.',
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <button className="btn desktop-only" onClick={open}>Send to phone</button>
      <dialog ref={dlg} className="card import-dialog" aria-labelledby="send-title" onClick={(e) => e.target === dlg.current && dlg.current?.close()}>
        <div className="stack">
          <h2 id="send-title">Send your progress to your phone</h2>
          <ol>
            <li>Open the camera on your phone and point it at the code.</li>
            <li>Tap the link that appears. Iron Fist Academy opens on your phone.</li>
            <li>Sign in as your player there and tap <b>Add to my progress</b>.</li>
          </ol>
          {error && <p className="notice warn" role="alert">{error}</p>}
          {!qr && !error && <p className="small muted">Making the code…</p>}
          {qr && (
            <>
              <div className="qr-box" role="img" aria-label="QR code with your progress" dangerouslySetInnerHTML={{ __html: qr.svg }} />
              <p className="small muted">{qr.note} It is a snapshot: scan again later to update the phone. Scanning adds to what the phone has, so codes from the app and from the website combine.</p>
            </>
          )}
          <div className="row"><button className="btn" onClick={() => dlg.current?.close()}>Close</button></div>
        </div>
      </dialog>
    </>
  );
}
