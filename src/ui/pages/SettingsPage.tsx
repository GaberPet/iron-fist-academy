import { useState } from 'react';
import { BUNDLED } from '../../data';
import { DEFAULT_SETTINGS, type Settings } from '../../core/progress';
import { DEFAULT_OPTIONS } from '../../core/recognizer';
import { useStore } from '../store';
import { storage } from '../../runtime/storage';
import { navigate } from '../hooks';

function Num({ label, value, min, max, step = 1, onChange, help }: { label: string; value: number; min: number; max: number; step?: number; onChange(v: number): void; help?: string }) {
  return (
    <label className="field">
      {label}: <b style={{ color: 'var(--text)' }}>{value}</b>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {help && <span className="muted" style={{ fontWeight: 400 }}>{help}</span>}
    </label>
  );
}

export function SettingsPage() {
  const { settings, updateSettings, characters, frameCache, refreshFrames, revertFrames, overrides, setOverride, storageInfo } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const set = (p: Partial<Settings>) => updateSettings(p);
  const rec = settings.recognizer;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Settings & data</h1>
          <p>All data stays on this computer. No account or subscription is needed.</p>
        </div>
      </div>

      <div className="grid g2">
        <div className="card stack">
          <h3>Mastery & progression</h3>
          <Num label="Mastery threshold (%)" value={Math.round(settings.masteryThreshold * 100)} min={50} max={100} step={5} onChange={(v) => set({ masteryThreshold: v / 100 })} help="Accuracy needed to pass input exercises and quizzes." />
          <Num label="Combo consistency (clean runs in a row)" value={settings.comboConsistency} min={2} max={15} onChange={(v) => set({ comboConsistency: v })} help="Required to mark a combo mastered in Combo Lab." />
          <Num label="Stage unlock requirement (%)" value={Math.round(settings.unlockRequirement * 100)} min={50} max={100} step={10} onChange={(v) => set({ unlockRequirement: v / 100 })} help="Share of the previous stage that must be mastered (its stage test is always required)." />
          <label className="row"><input type="checkbox" checked={settings.allowPreview} onChange={(e) => set({ allowPreview: e.target.checked })} /> Allow reading locked lessons (exercises stay locked, no credit)</label>
          <Num label="Review mastered lessons after (days)" value={settings.reviewAfterDays} min={2} max={30} onChange={(v) => set({ reviewAfterDays: v })} />
        </div>
        <div className="card stack">
          <h3>Practice</h3>
          <Num label="Daily goal (minutes)" value={settings.dailyGoalMinutes} min={5} max={180} step={5} onChange={(v) => set({ dailyGoalMinutes: v })} />
          <Num label="Practice session length (minutes)" value={settings.sessionMinutes} min={5} max={180} step={5} onChange={(v) => set({ sessionMinutes: v })} help="Used by the session timer on the dashboard." />
          <Num label="Throw break window (frames)" value={settings.throwBreakWindow} min={8} max={30} onChange={(v) => set({ throwBreakWindow: v })} help="Simulation approximation; default 20. Verify the real window in Tekken 8." />
          <div className="row"><span className="small dim">Drill difficulty: <b>{settings.drillDifficulty}</b> (change it in Bot Dojo)</span><button className="btn sm" onClick={() => navigate('dojo')}>Open Bot Dojo</button></div>
        </div>
      </div>

      <div className="card stack">
        <div className="card-title"><h3>Input recognition</h3><button className="btn sm" onClick={() => set({ recognizer: { ...DEFAULT_OPTIONS } })}>Defaults</button></div>
        <div className="grid g4">
          <Num label="Simultaneous-press window (frames)" value={rec.simulWindow} min={1} max={8} onChange={(v) => set({ recognizer: { ...rec, simulWindow: v } })} help="How far apart 1+2 may be pressed." />
          <Num label="Motion window (frames)" value={rec.motionWindow} min={10} max={45} onChange={(v) => set({ recognizer: { ...rec, motionWindow: v } })} help="Max length of f,n,d,df / qcf motions." />
          <Num label="Max gap between inputs (frames)" value={rec.maxGap} min={20} max={240} step={5} onChange={(v) => set({ recognizer: { ...rec, maxGap: v } })} help={`${(rec.maxGap / 60).toFixed(1)}s. Slow mode ignores it.`} />
          <Num label="While-standing window (frames)" value={rec.wsWindow} min={4} max={30} onChange={(v) => set({ recognizer: { ...rec, wsWindow: v } })} help="Time after releasing down that still counts as ws." />
        </div>
        <div className="small muted">These control how strict the app is. They are not Tekken 8's own input buffers, which the app cannot measure.</div>
      </div>

      <div className="card stack">
        <h3>Character data</h3>
        <p className="small dim" style={{ margin: 0 }}>Frame data is imported from <a href="https://wavu.wiki" target="_blank" rel="noreferrer">Wavu Wiki</a> (CC0 public domain). You can refresh it after a patch; the app shows what changed and you can revert to the bundled copy. Curated content (lessons, combos, coach notes) lives in <code>src/data/characters/&lt;id&gt;/curated.json</code>.</p>
        <table className="data">
          <thead><tr><th>Character</th><th>Frame data in use</th><th>Your corrections</th><th>Actions</th></tr></thead>
          <tbody>
            {characters.map((c) => {
              const id = c.profile.id;
              const src = c.frames.source;
              const ov = Object.entries(overrides[id] ?? {});
              const bundled = BUNDLED.find((b) => b.id === id)!;
              return (
                <tr key={id}>
                  <td><b>{c.profile.name}</b><div className="small muted">{c.frames.moves.length} moves</div></td>
                  <td className="small">
                    {frameCache[id] ? <span className="badge warn">Refreshed in-app</span> : <span className="badge info">Bundled</span>} rev {src.revision ?? '?'} · fetched {src.fetchedAt?.slice(0, 10)}
                    {frameCache[id] && <div className="muted">Bundled copy: rev {bundled.frames.source.revision ?? '?'} · {bundled.frames.source.fetchedAt?.slice(0, 10)}</div>}
                    {msg[id] && <div style={{ color: 'var(--info)' }}>{msg[id]}</div>}
                  </td>
                  <td className="small">
                    {ov.length ? ov.map(([mid, o]) => (
                      <div key={mid} className="row"><code>{mid}</code> <span className="muted">{Object.keys(o.fields).join(', ')}</span> <button className="btn sm ghost" onClick={() => setOverride(id, mid, null)}>Revert</button></div>
                    )) : <span className="muted">None</span>}
                  </td>
                  <td>
                    <div className="row">
                      <button className="btn sm" disabled={busy === id} onClick={async () => {
                        setBusy(id);
                        try {
                          const r = await refreshFrames(id);
                          setMsg((m) => ({ ...m, [id]: r }));
                        } catch (e) {
                          setMsg((m) => ({ ...m, [id]: `Refresh failed: ${(e as Error).message}. Existing data kept.` }));
                        } finally {
                          setBusy(null);
                        }
                      }}>{busy === id ? 'Fetching…' : 'Refresh from Wavu'}</button>
                      {frameCache[id] && <button className="btn sm" onClick={() => { revertFrames(id); setMsg((m) => ({ ...m, [id]: 'Reverted to the bundled data.' })); }}>Use bundled</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card stack">
        <h3>Storage</h3>
        <div className="small dim">
          {storageInfo?.kind === 'electron' ? <>Data folder: <code>{storageInfo.dataDir}</code> (settings.json, progress.json, overrides.json, frame-cache.json; each with a .bak backup). App version {storageInfo.version}.</> : <>Running in a browser (development mode): data is kept in this browser's localStorage.</>}
        </div>
        <div className="row">
          {storageInfo?.kind === 'electron' && <button className="btn sm" onClick={() => storage.openDataFolder()}>Open data folder</button>}
          <button className="btn sm" onClick={() => navigate('progress')}>Export / import / reset progress</button>
          <button className="btn sm danger" onClick={() => updateSettings({ ...DEFAULT_SETTINGS, activeChar: settings.activeChar, controller: settings.controller })}>Reset settings (keeps controller setup)</button>
        </div>
      </div>

      <div className="card small dim">
        Iron Fist Academy is an unofficial fan tool, not affiliated with or endorsed by Bandai Namco. TEKKEN is a trademark of Bandai Namco Entertainment Inc. Code: MIT. Lessons and coach notes: CC BY-SA 4.0. Frame data: Wavu Wiki contributors, CC0. Source: github.com/GaberPet/iron-fist-academy.
      </div>
    </div>
  );
}
