import { storage } from '../../runtime/storage';

// Help: the beginner's guide (public/guide.pdf). The desktop app opens the online copy in the browser.
const GUIDE = storage.isElectron() ? 'https://gaberpet.github.io/iron-fist-academy/guide.pdf' : './guide.pdf';

const QUICK: [string, string][] = [
  ['Where do I start?', "On the Dashboard, look at \"Today's plan\" and press Start. It always picks the next useful thing."],
  ['How do I change character?', 'Click the character box at the top of the screen, or open Characters. Set your main one as Favourite character on the Dashboard.'],
  ['My controller does nothing', 'Open Controller, choose PlayStation, Xbox or Arcade stick, and press any button on it once.'],
  ['How do I get my progress on another device?', 'Settings and data → Sync between devices → Turn on sync, then type the code on the other device.'],
  ['What do the numbers like i15 and -12 mean?', 'i15 = how fast the move hits. -12 on block = you can be hit back after it is blocked. The guide explains all of this in Part 1.'],
];

export function HelpPage() {
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Help</h1>
          <p>A complete, simple guide to every tab, with pictures. No experience needed.</p>
        </div>
      </div>
      <section className="card stack">
        <h2>The beginner's guide</h2>
        <p>About 30 pages: words explained, how to install the apps, every tab step by step, controllers, sync, fixes and a first-week training plan.</p>
        <div className="row">
          <a className="btn primary" href={GUIDE} target="_blank" rel="noreferrer">Open the guide (PDF)</a>
          <a className="btn" href={GUIDE} download="Iron-Fist-Academy-Guide.pdf">Download it</a>
        </div>
      </section>
      <section className="card stack">
        <h2>Quick answers</h2>
        {QUICK.map(([q, a]) => (
          <details key={q}>
            <summary><b>{q}</b></summary>
            <p className="small" style={{ marginTop: 'var(--space-xs)' }}>{a}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
