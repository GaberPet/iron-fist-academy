import { navigate } from '../hooks';

const ROWS: [string, string, string][] = [
  ['Lessons, move library, frame data, quizzes', 'In this app', 'Fully works offline.'],
  ['Combo input checking (DualSense)', 'In this app', 'Checks order, directions, simultaneous presses and gaps. Cannot know if hits connect in Tekken 8.'],
  ['Bot drills (punish, block, throw breaks, whiff punish, adaptive)', 'In this app (simulation)', 'Frame rules with real frame data; not Tekken 8\'s engine, animations, range or AI.'],
  ['Detecting your combos inside Tekken 8', 'Not possible', 'Tekken 8 offers no API for this. Reading game memory or hooking the process would be unsupported and risks anti-cheat action, so this app does not do it.'],
  ['Controlling the Tekken 8 dummy / AI', 'Not possible', 'No supported interface. Use Tekken 8\'s own Practice settings (below).'],
  ['Practising combos inside Tekken 8 with the app as a guide', 'Supported (manual)', 'Open Combo Lab → Manual mode on a second screen, practise in the game, self-report results.'],
  ['Online matches', 'Never touched', 'The app never interacts with matches, files or processes of the game.'],
];

const RECIPES: { title: string; drill?: string; steps: string[] }[] = [
  {
    title: 'Punishment practice',
    drill: 'punish-standing',
    steps: [
      'Open Practice mode with your character and the opponent you want to study.',
      'Use the dummy action recording to record the unsafe move you want to punish (check its block value in this app\'s Move Library, or the opponent\'s frame data).',
      'Set the dummy to play the recording back and set your own guard as needed.',
      'Block it, then punish with the punisher this app lists for that window. Use the in-game frame data display to confirm the punish is guaranteed.',
      'If the game offers a built-in punishment training option in your version, it automates this loop.',
    ],
  },
  {
    title: 'Mid / low defence',
    drill: 'block-mixup',
    steps: [
      'Record two dummy actions: one mid and one low from the opponent\'s mix-up.',
      'Set playback to random between the recordings.',
      'Block standing for the mid and crouching for the low; this trains the real animations the simulation cannot show.',
    ],
  },
  {
    title: 'Throw breaks',
    drill: 'throw-break',
    steps: [
      'Record the dummy doing 1+3 and 2+4 throws (and the opponent\'s command throws), with random playback.',
      'Break 1+3 with 1 and 2+4 with 2. Learn which arm comes first in the animation.',
    ],
  },
  {
    title: 'Combo practice',
    steps: [
      'In Combo Lab, learn the input order with Step-by-step and Slow modes using your DualSense.',
      'Then open Manual mode and practise the same route in Tekken 8 Practice. Report whether you landed it; the dashboard tracks your consistency.',
      'Use the game\'s counter-hit dummy option for CH combos.',
    ],
  },
  {
    title: 'Whiff punishment',
    drill: 'whiff-punish',
    steps: [
      'Record the dummy doing a slow move at a distance where it whiffs.',
      'Wait for it to finish, then punish with a long-range move (see your whiff punishers in the character data).',
    ],
  },
];

export function CompanionPage() {
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Using the app with Tekken 8</h1>
          <p>What works where. This is an unofficial companion: it does not read, inject into or modify Tekken 8, and it never interacts with online play or anti-cheat.</p>
        </div>
      </div>
      <div className="card">
        <table className="data">
          <thead><tr><th>Feature</th><th>Where it works</th><th>Notes</th></tr></thead>
          <tbody>
            {ROWS.map(([a, b, c]) => (
              <tr key={a}><td><b>{a}</b></td><td><span className={`badge ${b.startsWith('Not') || b.startsWith('Never') ? 'bad' : b.includes('simulation') || b.includes('manual') ? 'warn' : 'good'}`}>{b}</span></td><td className="dim">{c}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Tekken 8 practice mode recipes</h2>
      <div className="notice warn">These are general Practice-mode workflows. Exact menu names and options can differ between game versions and patches; the app cannot check your game's menus.</div>
      <div className="grid g2">
        {RECIPES.map((r) => (
          <div key={r.title} className="card stack">
            <div className="card-title"><h3>{r.title}</h3>{r.drill && <button className="btn sm desktop-only" onClick={() => navigate('dojo', r.drill!)}>App drill →</button>}</div>
            <ol className="dim" style={{ paddingLeft: 18, margin: 0 }}>{r.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          </div>
        ))}
      </div>
      <div className="notice info"><b>Using the controller in both:</b> Tekken 8 and this app can both read a DualSense on Windows. Chromium (which this app uses) may stop reading the controller while its window is in the background, so switch windows rather than expecting the app to track inputs during a match.</div>
    </div>
  );
}
