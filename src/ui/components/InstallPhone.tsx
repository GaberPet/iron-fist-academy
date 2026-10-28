import { useEffect, useState } from 'react';

// Phone only: install the website as an app (home-screen icon, full screen, works offline).
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPromptEvent;
});

const installed = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function InstallPhone() {
  const [canPrompt, setCanPrompt] = useState(!!deferred);
  const [hidden, setHidden] = useState(installed());
  useEffect(() => {
    const on = () => setCanPrompt(true);
    const done = () => setHidden(true);
    window.addEventListener('beforeinstallprompt', on);
    window.addEventListener('appinstalled', done);
    return () => {
      window.removeEventListener('beforeinstallprompt', on);
      window.removeEventListener('appinstalled', done);
    };
  }, []);
  if (hidden) return null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const firefox = /Firefox/.test(navigator.userAgent);

  return (
    <section className="card stack phone-only">
      <h2>Install on your phone</h2>
      <p className="small">Get Iron Fist Academy on your home screen. It opens full screen and works offline, with every character's moves and combos.</p>
      {canPrompt ? (
        <button className="btn primary" onClick={async () => { await deferred?.prompt(); deferred = null; setCanPrompt(false); }}>Install app</button>
      ) : (
        <p className="small">
          {ios
            ? <>In Safari tap <b>Share</b>, then <b>Add to Home Screen</b>.</>
            : firefox
              ? <>Tap the <b>⋮</b> menu, then <b>Install</b> (or <b>Add to Home screen</b>).</>
              : <>Open the browser menu <b>⋮</b> and tap <b>Install app</b> or <b>Add to Home screen</b>.</>}
        </p>
      )}
      <p className="small muted">To bring your progress over, open <b>Progress</b> on your computer or in the desktop app, tap <b>Send to phone</b> and scan the code with this phone's camera.</p>
    </section>
  );
}
