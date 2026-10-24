import { useEffect, useRef, useState } from 'react';
import type { TekkenButton } from '../../types';
import { DIR_ARROW, PAD_BUTTONS, PAD_LABEL, STANDARD_INDEX, maskText, type PadButton } from '../../core/input';
import { useCaptureInput, useControllerStatus, useInputFrames, useSnapshot } from '../hooks';
import { useStore } from '../store';
import { ControllerDiagram } from '../components/ControllerDiagram';
import { InputLog } from '../components/InputLog';
import { inputManager } from '../../runtime/inputManager';

const ASSIGN_OPTIONS: { label: string; value: TekkenButton[] }[] = [
  { label: '—', value: [] },
  { label: '1', value: [1] }, { label: '2', value: [2] }, { label: '3', value: [3] }, { label: '4', value: [4] },
  { label: '1+2', value: [1, 2] }, { label: '3+4', value: [3, 4] }, { label: '1+3', value: [1, 3] }, { label: '2+4', value: [2, 4] },
  { label: '2+3 (Heat)', value: [2, 3] }, { label: '1+4', value: [1, 4] }, { label: '1+2+3+4', value: [1, 2, 3, 4] },
];
const ASSIGNABLE: PadButton[] = ['square', 'triangle', 'cross', 'circle', 'l1', 'r1', 'l2', 'r2', 'l3', 'r3'];

export function ControllerPage() {
  const { settings, updateSettings } = useStore();
  const cfg = settings.controller;
  const { pads, active } = useControllerStatus();
  const snap = useSnapshot(40);
  const [seen, setSeen] = useState<Set<PadButton>>(new Set());
  const [binding, setBinding] = useState<PadButton | null>(null);
  const bindBase = useRef<number[]>([]);
  useCaptureInput(); // the controller tests buttons here instead of navigating

  useInputFrames((_f, s) => {
    if (s.pressed.length) setSeen((prev) => (s.pressed.every((p) => prev.has(p)) ? prev : new Set([...prev, ...s.pressed])));
    if (binding) {
      const fresh = s.rawPressed.filter((i) => !bindBase.current.includes(i));
      if (fresh.length) {
        updateSettings({ controller: { ...cfg, rawIndex: { ...cfg.rawIndex, [binding]: fresh[0] } } });
        setBinding(null);
      }
    }
  });
  useEffect(() => {
    if (binding) bindBase.current = inputManager.snapshot.rawPressed;
  }, [binding]);

  const pad = pads.find((p) => p.index === active);
  const setCfg = (patch: Partial<typeof cfg>) => updateSettings({ controller: { ...cfg, ...patch } });
  const labels = Object.fromEntries(Object.entries(cfg.tekken).filter(([, v]) => v?.length).map(([k, v]) => [k, v!.join('+')])) as Partial<Record<PadButton, string>>;
  const axes = snap.raw?.axes ?? [0, 0, 0, 0];
  const stickMag = Math.hypot(axes[0] ?? 0, axes[1] ?? 0);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Controller setup</h1>
          <p>The app reads your DualSense through the Chromium Gamepad API (USB or Bluetooth, as paired in Windows). Tekken 8's default PlayStation layout is pre-set: □ = 1, △ = 2, ✕ = 3, ○ = 4.</p>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)' }}>
        <div className="card stack">
          <div className="row">
            <span className={`dot ${pad ? 'on' : 'off'}`} />
            <b>{pad ? `${pad.label} connected` : 'No controller detected'}</b>
            {pad && <span className="badge">{pad.mapping === 'standard' ? 'Standard mapping' : 'Non-standard mapping: check buttons below'}</span>}
            {pad && <span className="badge">{pad.buttons} buttons · {pad.axes} axes</span>}
            <span className="right" />
            {pads.length > 1 && (
              <select value={active ?? ''} onChange={(e) => inputManager.setPreferredPad(Number(e.target.value))} aria-label="Active controller">
                {pads.map((p) => <option key={p.index} value={p.index}>#{p.index} {p.label}</option>)}
              </select>
            )}
          </div>
          {pad && <div className="small muted mono" style={{ wordBreak: 'break-all' }}>{pad.id}</div>}
          {!pad && (
            <div className="notice warn">
              <b>Connect your DualSense.</b> USB: plug it in. Bluetooth: hold <b>PS + Create</b> until the light bar flashes, then pair it in Windows Settings → Bluetooth. Then <b>press any button</b>: browsers only report a controller after the first press. The keyboard works meanwhile (WASD + U I J K).
            </div>
          )}
          <ControllerDiagram pressed={snap.pressed} axes={axes} labels={labels} />
          <div className="row" style={{ justifyContent: 'center' }}>
            <span className="pill">Direction: <span className="dir">{DIR_ARROW[snap.input.dir]}</span> {snap.input.dir}</span>
            <span className="pill">Tekken buttons: {maskText(snap.input.buttons)}</span>
            {snap.keyboard && <span className="badge info">keyboard</span>}
          </div>
        </div>
        <div className="card stack">
          <h3>Live input history</h3>
          <InputLog rows={18} />
        </div>
      </div>

      <div className="grid g2">
        <div className="card stack">
          <div className="card-title"><h3>Button test</h3><button className="btn sm" onClick={() => setSeen(new Set())}>Reset test</button></div>
          <p className="small dim" style={{ margin: 0 }}>Press every button once. Green = detected at least once. If a button lights the wrong cell, rebind it below.</p>
          <div className="test-grid">
            {PAD_BUTTONS.map((b) => (
              <div key={b} className={`test-cell ${snap.pressed.includes(b) ? 'now' : seen.has(b) ? 'seen' : ''}`}>{PAD_LABEL[b]}</div>
            ))}
          </div>
          <div className="small muted">{seen.size} / {PAD_BUTTONS.length} detected. The PS and touchpad buttons may be reserved by Windows/Steam and not reach the app; they are not needed for training.</div>
        </div>
        <div className="card stack">
          <h3>Tekken button assignment</h3>
          <p className="small dim" style={{ margin: 0 }}>Match this to your in-game Button Config so practice transfers 1:1. Shoulder buttons are unassigned by default.</p>
          <table className="data">
            <thead><tr><th>Physical</th><th>Tekken input</th><th>Raw index</th><th /></tr></thead>
            <tbody>
              {ASSIGNABLE.map((b) => (
                <tr key={b}>
                  <td><b>{PAD_LABEL[b]}</b></td>
                  <td>
                    <select value={(cfg.tekken[b] ?? []).join('+')} onChange={(e) => {
                      const opt = ASSIGN_OPTIONS.find((o) => o.value.join('+') === e.target.value);
                      setCfg({ tekken: { ...cfg.tekken, [b]: opt?.value ?? [] } });
                    }} aria-label={`Assignment for ${PAD_LABEL[b]}`}>
                      {ASSIGN_OPTIONS.map((o) => <option key={o.label} value={o.value.join('+')}>{o.label}</option>)}
                    </select>
                  </td>
                  <td className="mono small">{cfg.rawIndex[b]}{cfg.rawIndex[b] !== STANDARD_INDEX[b] && ' (custom)'}</td>
                  <td><button className={`btn sm ${binding === b ? 'active' : ''}`} onClick={() => setBinding(binding === b ? null : b)}>{binding === b ? 'Press it now…' : 'Rebind'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <button className="btn sm" onClick={() => setCfg({ rawIndex: { ...STANDARD_INDEX } })}>Reset raw indices</button>
            <button className="btn sm" onClick={() => setCfg({ tekken: { square: [1], triangle: [2], cross: [3], circle: [4] } })}>Tekken 8 default layout</button>
          </div>
        </div>
      </div>

      <div className="grid g2">
        <div className="card stack">
          <h3>Directions & calibration</h3>
          <label className="row"><input type="checkbox" checked={cfg.useDpad} onChange={(e) => setCfg({ useDpad: e.target.checked })} /> Use D-pad</label>
          <label className="row"><input type="checkbox" checked={cfg.useLeftStick} onChange={(e) => setCfg({ useLeftStick: e.target.checked })} /> Use left stick</label>
          <label className="field">Left stick deadzone: {cfg.stickDeadzone.toFixed(2)} (current tilt {stickMag.toFixed(2)})
            <input type="range" min={0.15} max={0.9} step={0.05} value={cfg.stickDeadzone} onChange={(e) => setCfg({ stickDeadzone: Number(e.target.value) })} />
          </label>
          <p className="small dim" style={{ margin: 0 }}>Calibration: let go of the stick. If the direction above isn't ★ (neutral), raise the deadzone until it is. If diagonals are hard to hit, lower it slightly.</p>
          <label className="row"><input type="checkbox" checked={cfg.p2Side} onChange={(e) => setCfg({ p2Side: e.target.checked })} /> Practise from the P2 side (mirror left/right)</label>
          <label className="row"><input type="checkbox" checked={settings.keyboardEnabled} onChange={(e) => updateSettings({ keyboardEnabled: e.target.checked })} /> Keyboard fallback (WASD + U I J K)</label>
          <label className="row"><input type="checkbox" checked={settings.rumble} onChange={(e) => updateSettings({ rumble: e.target.checked })} /> Rumble on success (if supported)</label>
          <div><button className="btn sm" onClick={() => inputManager.rumble(250, 1)} disabled={!pad}>Test rumble</button> <span className="small muted">{pad?.hasRumble ? 'Rumble API available' : 'Rumble not reported for this controller in this environment'}</span></div>
        </div>
        <div className="card stack">
          <h3>Troubleshooting</h3>
          <ul className="dim small" style={{ paddingLeft: 18, margin: 0 }}>
            <li><b>Not detected:</b> press a button with the app focused; browsers only expose a pad after input. Re-plug USB or re-pair Bluetooth.</li>
            <li><b>Steam running:</b> Steam Input can take over PlayStation controllers and present them as a different device. Disable Steam Input for non-Steam apps, or close Steam, if buttons are mixed up.</li>
            <li><b>DS4Windows / DSX:</b> these tools may hide the DualSense and expose an Xbox controller instead. That works too, but the face buttons then map as A/B/X/Y positions: use Rebind if needed.</li>
            <li><b>Wrong buttons:</b> use Rebind: click it, then press the physical button.</li>
            <li><b>Inputs drop when the window is in the background:</b> the app keeps polling, but Chromium may stop delivering controller data to unfocused windows. Keep the app focused while training.</li>
            <li><b>Bluetooth latency:</b> a USB cable gives the most consistent timing for just-frame practice.</li>
          </ul>
          <div className="small muted">Connection type (USB vs Bluetooth) isn't exposed by the Gamepad API, so the app can't display it.</div>
        </div>
      </div>
    </div>
  );
}
