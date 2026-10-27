// Attribution for the character card photos (Wikimedia Commons) and the data sources.
import { useEffect, useState } from 'react';
import { useStore } from '../store';

interface PhotoCredit {
  motif: string;
  title: string;
  source: string;
  artist: string;
  license: string;
  licenseUrl: string | null;
}

export function CreditsPage() {
  const { roster } = useStore();
  const [credits, setCredits] = useState<Record<string, PhotoCredit> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(new URL('portraits/credits.json', document.baseURI).href)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setCredits, (e) => setError((e as Error).message));
  }, []);
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Credits</h1>
          <p>Character cards show a photo of something tied to each character, never official game art or a real person. Every photo comes from Wikimedia Commons under a free licence and is credited below.</p>
        </div>
      </div>
      <section className="card stack">
        <h2>Card photos</h2>
        {error && <div className="notice bad">Could not load the photo credits ({error}).</div>}
        {!credits && !error && <div className="empty">Loading credits…</div>}
        {credits && (
          <div className="scroll">
            <table className="data">
              <thead><tr><th>Character</th><th>Motif</th><th>Photo</th><th>Author</th><th>Licence</th></tr></thead>
              <tbody>
                {roster.filter((r) => credits[r.id]).map((r) => {
                  const c = credits[r.id];
                  return (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{c.motif}</td>
                      <td><a href={c.source} target="_blank" rel="noreferrer">{c.title}</a></td>
                      <td>{c.artist}</td>
                      <td>{c.licenseUrl ? <a href={c.licenseUrl} target="_blank" rel="noreferrer">{c.license}</a> : c.license}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="small dim">Photos are cropped to a 480 pixel square and compressed; otherwise unmodified. Shared-alike (CC BY-SA) photos remain under their licence.</p>
      </section>
      <section className="card stack">
        <h2>Data and fonts</h2>
        <p className="dim">Frame data, combo routes and punisher tables: <a href="https://wavu.wiki" target="_blank" rel="noreferrer">Wavu Wiki</a> contributors, CC0. Fonts: Teko and JetBrains Mono (SIL Open Font License), Metropolis (Unlicense). Lessons and coach notes: Iron Fist Academy contributors, CC BY-SA 4.0. Code: MIT.</p>
        <p className="dim">Iron Fist Academy is an unofficial fan project, not affiliated with or endorsed by Bandai Namco Entertainment. TEKKEN is their trademark.</p>
      </section>
    </div>
  );
}
