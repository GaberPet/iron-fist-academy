import { useState } from 'react';
import { PLAN_COLUMNS, type CharNotes } from '../../core/progress';
import { useStore } from '../store';
import { NotationView } from '../components/Notation';

type Column = (typeof PLAN_COLUMNS)[number];
const EMPTY: Omit<CharNotes, 'updatedAt'> = { text: '', columns: {} };
const HINT: Record<Column, string> = {
  Punishment: 'What you hit back with after blocking',
  'Keep out': 'Moves that keep them away from you',
  '50/50': 'Mix-ups where they must guess high/mid or low',
  Neutral: 'Pokes and tools at mid range',
  Oki: 'What to do when they are knocked down',
};

// Game plan: a board of 5 columns of moves per character, saved with the player.
export function GamePlanPage() {
  const { char, progress, setNotes } = useStore();
  const id = char.profile.id;
  const mine = progress.notes?.[id] ?? EMPTY;
  const [draft, setDraft] = useState<Partial<Record<Column, string>>>({});

  const add = (col: Column) => {
    const move = (draft[col] ?? '').trim();
    if (!move) return;
    setNotes(id, { ...mine, columns: { ...mine.columns, [col]: [...(mine.columns[col] ?? []), move] } });
    setDraft({ ...draft, [col]: '' });
  };
  const remove = (col: Column, i: number) =>
    setNotes(id, { ...mine, columns: { ...mine.columns, [col]: (mine.columns[col] ?? []).filter((_, j) => j !== i) } });

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Game plan · {char.profile.name}</h1>
          <p>Your own game plan, sorted by situation. Saved for this player, and synced to your other devices if sync is on.</p>
        </div>
      </div>

      <section className="card stack">
        <p className="small muted">Type a move (for example df+2) and press Enter or Add. The list suggests {char.profile.short}'s moves as you type.</p>
        <datalist id="char-moves">{char.frames.moves.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</datalist>
        <div className="plan-board">
          {PLAN_COLUMNS.map((col) => (
            <div key={col} className="plan-col">
              <h3>{col}</h3>
              <p className="small muted">{HINT[col]}</p>
              <ul className="plan-moves">
                {(mine.columns[col] ?? []).map((m, i) => (
                  <li key={`${m}-${i}`}>
                    <NotationView notation={m} />
                    <button className="btn sm" aria-label={`Remove ${m} from ${col}`} onClick={() => remove(col, i)}>✕</button>
                  </li>
                ))}
              </ul>
              <form className="row" onSubmit={(e) => { e.preventDefault(); add(col); }}>
                <input list="char-moves" aria-label={`Add a move to ${col}`} placeholder="Move…" autoComplete="off" spellCheck={false} value={draft[col] ?? ''} onChange={(e) => setDraft({ ...draft, [col]: e.target.value })} />
                <button className="btn sm" type="submit">Add</button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// Notes: free personal notes for the selected character and for every character.
export function NotesPage() {
  const { char, progress, setNotes } = useStore();
  const id = char.profile.id;
  const mine = progress.notes?.[id] ?? EMPTY;
  const general = progress.notes?.general ?? EMPTY;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Notes · {char.profile.name}</h1>
          <p>Write down anything you want to remember. Saved for this player, and synced to your other devices if sync is on.</p>
        </div>
      </div>

      <div className="grid g2">
        <section className="card stack">
          <h2>Notes for {char.profile.short}</h2>
          <textarea className="notes-text" aria-label={`Personal notes for ${char.profile.name}`} placeholder="Anything you want to remember about this character…" value={mine.text} onChange={(e) => setNotes(id, { ...mine, text: e.target.value })} />
        </section>
        <section className="card stack">
          <h2>General notes</h2>
          <textarea className="notes-text" aria-label="General notes" placeholder="Notes for every character: habits, matchups, goals…" value={general.text} onChange={(e) => setNotes('general', { ...general, text: e.target.value })} />
        </section>
      </div>
    </div>
  );
}
