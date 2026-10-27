import { useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterData, ComboDef, Move } from '../../types';
import { inputSteps, parseNotation, stringNotation, timingHint, type InputStep } from '../../core/notation';
import { ERROR_TEXT, SequenceRecognizer, type InputErrorType, type RecognizerOptions } from '../../core/recognizer';
import type { PadButton } from '../../core/input';
import { lookupMove } from '../../data';
import { useCaptureInput, useInputFrames, usePracticeTimer } from '../hooks';
import { useStore } from '../store';
import { StepChip, type StepState } from './Notation';
import { InputLog } from './InputLog';
import { ControllerDiagram } from './ControllerDiagram';
import { inputManager } from '../../runtime/inputManager';

const errText = (e: InputErrorType | 'self-reported') => (e === 'self-reported' ? 'Self-reported drop' : ERROR_TEXT[e]);

export type TrainerMode = 'step' | 'full' | 'slow' | 'memory' | 'consistency';

export const MODE_INFO: Record<TrainerMode, { label: string; help: string }> = {
  step: { label: 'Step-by-step', help: 'Shows one input at a time with its timing notes.' },
  full: { label: 'Full combo', help: 'The complete sequence; your progress is highlighted live.' },
  slow: { label: 'Slow practice', help: 'No time limit between inputs and a wider window for simultaneous buttons. Learn the order first.' },
  memory: { label: 'Memory', help: 'Upcoming inputs are hidden. Recall the route.' },
  consistency: { label: 'Consistency', help: 'Land it several times in a row to master it. A drop resets the streak.' },
};

interface Props {
  char: CharacterData;
  combo: ComboDef;
  mode: TrainerMode;
  /** Required consecutive clean runs (consistency mode, lessons). */
  requiredStreak?: number;
  /** Practise only the transition around this step index (focus drill). */
  focusStep?: number;
  lessonId?: string;
  onMastered?(): void;
}

interface Attempt {
  status: 'ready' | 'running' | 'complete' | 'fail';
  index: number; // next step to input (in `steps`)
  fail?: { index: number; error: InputErrorType | 'self-reported'; detail: string };
  frames?: number;
}

/** Explain how the stance needed for a step is entered, using the source notes of the previous move. */
export function stanceTip(c: CharacterData, steps: InputStep[], i: number): string | null {
  const s = steps[i];
  if (!s.stance || ['ws', 'iws', 'FC', 'hFC', 'wr', 'SS', 'ss', 'OTG'].includes(s.stance)) return null;
  const st = c.profile.stances.find((x) => x.code === s.stance);
  for (let j = i - 1; j >= 0; j--) {
    if (steps[j].kind !== 'press') continue;
    const prev = lookupMove(c, stringNotation(steps, j));
    if (prev && new RegExp(`(Transition to|Enter)[^,]*\\b${s.stance}\\b`, 'i').test(prev.notes)) {
      const note = prev.notes.split(', ').find((n) => n.includes(s.stance!));
      return `${prev.input} → ${s.stance}: "${note}" (source notes)`;
    }
    break;
  }
  if (st) return `${s.stance} = ${st.name}, entered with ${st.entry}.`;
  if (c.profile.stanceAliases?.[`${s.stance}.`]) return `${s.stance}.x is shorthand for ${c.profile.stanceAliases[`${s.stance}.`]}x.`;
  return null;
}

/** Scripted input for the demo playback of a step list. */
function demoScript(steps: InputStep[]): { pad: PadButton[]; stepIndex: number }[] {
  const out: { pad: PadButton[]; stepIndex: number }[] = [];
  const dirPad: Record<string, PadButton[]> = {
    n: [], u: ['up'], d: ['down'], f: ['right'], b: ['left'], uf: ['up', 'right'], ub: ['up', 'left'], df: ['down', 'right'], db: ['down', 'left'],
  };
  const btnPad: Record<number, PadButton> = { 1: 'square', 2: 'triangle', 3: 'cross', 4: 'circle' };
  steps.forEach((s, i) => {
    if (s.kind === 'marker') {
      for (let k = 0; k < 18; k++) out.push({ pad: [], stepIndex: i });
      return;
    }
    s.motion.forEach((m, mi) => {
      const len = m.hold || mi === s.motion.length - 1 ? 8 : 5;
      for (let k = 0; k < len; k++) out.push({ pad: dirPad[m.dir], stepIndex: i });
      if (mi < s.motion.length - 1 && s.motion[mi + 1].dir === m.dir) out.push({ pad: [], stepIndex: i });
    });
    if (s.buttons.length) {
      const hold = s.motion.length ? dirPad[s.motion[s.motion.length - 1].dir] : [];
      for (let k = 0; k < (s.holdButton ? 30 : 8); k++) out.push({ pad: [...hold, ...s.buttons.map((b) => btnPad[b])], stepIndex: i });
    }
    for (let k = 0; k < 14; k++) out.push({ pad: [], stepIndex: i });
  });
  return out;
}

export function ComboTrainer({ char, combo, mode, requiredStreak, focusStep, lessonId, onMastered }: Props) {
  const { settings, recordCombo, progress } = useStore();
  const startersParse = useMemo(() => combo.starters.map((s) => {
    try {
      return parseNotation(s).some((x) => x.kind === 'press');
    } catch {
      return false;
    }
  }), [combo.starters]);
  const firstParseable = startersParse.indexOf(true);
  const [starterIdx, setStarterIdx] = useState(Math.max(0, firstParseable));
  const [includeStarter, setIncludeStarter] = useState(firstParseable >= 0);
  const [manual, setManual] = useState(false);
  const [manualIdx, setManualIdx] = useState(0);
  const [attempt, setAttempt] = useState<Attempt>({ status: 'ready', index: 0 });
  const [streak, setStreak] = useState(0);
  const [session, setSession] = useState({ ok: 0, fail: 0 });
  const [demo, setDemo] = useState<{ frame: number; script: ReturnType<typeof demoScript> } | null>(null);
  const recRef = useRef<SequenceRecognizer | null>(null);
  const resetTimer = useRef<number | null>(null);
  const mastered = useRef(false);
  useCaptureInput(!manual);
  usePracticeTimer();

  const starter = startersParse[starterIdx] ? combo.starters[starterIdx] : undefined;
  const fullNotation = includeStarter && starter ? `${starter} ${combo.route}` : combo.route;
  const allSteps = useMemo(() => parseNotation(fullNotation), [fullNotation]);
  const range = useMemo(() => {
    if (focusStep === undefined) return [0, allSteps.length] as const;
    const inputs = allSteps.map((s, i) => ({ s, i })).filter(({ s }) => s.kind !== 'marker');
    const pos = Math.max(0, inputs.findIndex(({ i }) => i >= focusStep));
    const from = inputs[Math.max(0, pos - 1)]?.i ?? 0;
    const to = (inputs[Math.min(inputs.length - 1, pos + 1)]?.i ?? allSteps.length - 1) + 1;
    return [from, to] as const;
  }, [allSteps, focusStep]);
  const steps = useMemo(() => allSteps.slice(range[0], range[1]), [allSteps, range]);

  const opts: RecognizerOptions = useMemo(() => {
    const base = settings.recognizer;
    if (mode === 'slow') return { ...base, maxGap: 0, simulWindow: base.simulWindow + 2, motionWindow: Math.round(base.motionWindow * 1.5) };
    return base;
  }, [settings.recognizer, mode]);

  const reset = () => {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    recRef.current = new SequenceRecognizer(steps, opts);
    setAttempt({ status: 'ready', index: recRef.current.index });
  };
  useEffect(reset, [steps, opts]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setStreak(0);
    setSession({ ok: 0, fail: 0 });
    mastered.current = false;
  }, [combo.id, mode, fullNotation]);
  useEffect(() => () => { if (resetTimer.current) window.clearTimeout(resetTimer.current); }, []);

  const finish = (ok: boolean, info?: Attempt['fail'], frames?: number) => {
    const globalIndex = info ? info.index + range[0] : undefined;
    recordCombo({
      itemId: combo.id,
      success: ok,
      mode: focusStep !== undefined ? 'focus' : mode,
      lessonId,
      errorType: info?.error,
      errorStep: globalIndex,
      errorStepText: globalIndex !== undefined ? allSteps[globalIndex]?.text : undefined,
      durationMs: frames !== undefined ? Math.round((frames / 60) * 1000) : undefined,
      detail: info?.detail,
    });
    if (ok && settings.rumble) inputManager.rumble(120, 0.7);
    const nextStreak = ok ? streak + 1 : 0;
    setStreak(nextStreak);
    setSession((s) => ({ ok: s.ok + (ok ? 1 : 0), fail: s.fail + (ok ? 0 : 1) }));
    if (requiredStreak && nextStreak >= requiredStreak && !mastered.current) {
      mastered.current = true;
      onMastered?.();
    }
    resetTimer.current = window.setTimeout(reset, ok ? 900 : 1400);
  };

  useInputFrames((f) => {
    const rec = recRef.current;
    if (!rec || demo || manual) return;
    if (attempt.status === 'complete' || attempt.status === 'fail') return;
    for (const e of rec.push(f)) {
      if (e.type === 'step') setAttempt((a) => ({ ...a, status: 'running', index: e.index + 1 }));
      if (e.type === 'complete') {
        setAttempt({ status: 'complete', index: steps.length, frames: e.durationFrames });
        finish(true, undefined, e.durationFrames);
      }
      if (e.type === 'fail') {
        const info = { index: e.index, error: e.error, detail: e.detail };
        setAttempt({ status: 'fail', index: e.index, fail: info });
        finish(false, info);
      }
    }
  });

  // Demo playback (driven by animation frames, independent of the controller).
  useEffect(() => {
    if (!demo) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      const fr = Math.floor((performance.now() - t0) / (1000 / 60) / (mode === 'slow' ? 2 : 1));
      if (fr >= demo.script.length) {
        setDemo(null);
        return;
      }
      setDemo((d) => (d ? { ...d, frame: fr } : d));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [demo?.script]); // eslint-disable-line react-hooks/exhaustive-deps

  const comboState = progress.combos[`${char.profile.id}:${combo.id}`];
  const demoStep = demo ? demo.script[demo.frame]?.stepIndex : undefined;
  const curIndex = manual ? manualIdx : demo ? demoStep ?? 0 : attempt.index;

  const stateOf = (i: number): StepState => {
    if (attempt.status === 'fail' && !manual && !demo && i === attempt.fail?.index) return 'fail';
    if (i < curIndex) return 'done';
    if (i === curIndex) return 'cur';
    if (mode === 'memory' && !demo) return 'hidden';
    return undefined;
  };

  const moveFor = (i: number): Move | undefined => (steps[i].kind === 'press' ? lookupMove(char, stringNotation(allSteps, i + range[0])) : undefined);
  const visibleIdx = mode === 'step' ? steps.map((_, i) => i).filter((i) => i === curIndex || (i === curIndex + 1 && steps[i])) : steps.map((_, i) => i);
  const nInputs = inputSteps(steps).length;

  return (
    <div className="stack">
      <div className="row">
        {combo.starters.length > 0 && (
          <>
            <label className="row small dim">
              <input type="checkbox" checked={includeStarter} disabled={firstParseable < 0} onChange={(e) => setIncludeStarter(e.target.checked)} /> Include starter
            </label>
            <select value={starterIdx} onChange={(e) => setStarterIdx(Number(e.target.value))} disabled={!includeStarter} aria-label="Starter">
              {combo.starters.map((s, i) => (
                <option key={s} value={i} disabled={!startersParse[i]}>{s}</option>
              ))}
            </select>
          </>
        )}
        {focusStep !== undefined && <span className="badge warn">Focus drill: steps {range[0] + 1}–{range[1]} only</span>}
        <span className="right" />
        <button className="btn sm" onClick={() => setDemo({ frame: 0, script: demoScript(steps) })} disabled={!!demo}>▶ Demo</button>
        <button className={`btn sm ${manual ? 'active' : ''}`} onClick={() => { setManual(!manual); setManualIdx(0); }} title="Step through manually and self-report, e.g. while practising inside Tekken 8">
          {manual ? 'Manual mode: on' : 'Manual mode'}
        </button>
        <button className="btn sm" onClick={reset}>↺ Reset</button>
      </div>

      {manual && (
        <div className="notice info">
          <b>Manual mode.</b> Controller recognition is off. Use this when practising inside Tekken 8 (the app cannot see the game) or if your controller isn't detected: step through the inputs, then report the result yourself. Results are recorded as self-reported.
        </div>
      )}

      <div className={`steps ${mode === 'step' ? '' : ''}`}>
        {visibleIdx.map((i) => {
          const s = steps[i];
          const st = stateOf(i);
          const m = moveFor(i);
          const tip = stanceTip(char, allSteps, i + range[0]);
          const custom = combo.stepTips?.[s.text];
          return (
            <div key={i} className={`step-card ${st ?? ''}`} style={mode === 'step' && i === curIndex ? { gridColumn: 'span 2' } : undefined}>
              <div className="step-idx">STEP {i + range[0] + 1}{s.kind === 'marker' ? ' · MARKER' : s.kind === 'motion' ? ' · MOVEMENT' : ''}</div>
              <div className={mode === 'step' && i === curIndex ? 'big' : ''}><StepChip step={s} state={st === 'hidden' ? 'hidden' : undefined} /></div>
              {st !== 'hidden' && (
                <>
                  {m && <div className="small">{m.name || m.input} <span className="muted">· {m.startup || '—'} · {m.hitLevels.join(',') || '—'} · {m.damage || '—'} dmg</span></div>}
                  {(mode !== 'full' || i === curIndex) && <div className="step-hint">{timingHint(s)}</div>}
                  {tip && <div className="step-hint" style={{ color: 'var(--info)' }}>{tip}</div>}
                  {custom && <div className="step-hint" style={{ color: 'var(--warn)' }}>Coach tip: {custom}</div>}
                </>
              )}
              {attempt.status === 'fail' && !manual && attempt.fail?.index === i && (
                <div className="small" style={{ color: 'var(--bad)' }}>{errText(attempt.fail.error)} — {attempt.fail.detail}</div>
              )}
            </div>
          );
        })}
      </div>

      {manual ? (
        <div className="row">
          <button className="btn" onClick={() => setManualIdx(Math.max(0, manualIdx - 1))} disabled={manualIdx === 0}>← Back</button>
          <button className="btn" onClick={() => setManualIdx(Math.min(steps.length - 1, manualIdx + 1))} disabled={manualIdx >= steps.length - 1}>Next step →</button>
          <span className="right" />
          <button className="btn primary" onClick={() => { setManualIdx(0); finish(true); }}>I landed it</button>
          <button className="btn danger" onClick={() => { finish(false, { index: manualIdx, error: 'self-reported', detail: 'Self-reported drop at this step' }); setManualIdx(0); }}>
            I dropped it at step {manualIdx + range[0] + 1}
          </button>
        </div>
      ) : (
        <div className={`result-banner ${attempt.status === 'complete' ? 'ok' : attempt.status === 'fail' ? 'no' : 'wait'}`}>
          {demo ? 'Demo playing… watch the controller.' : attempt.status === 'complete' ? `✔ Clean! ${attempt.frames !== undefined ? `${(attempt.frames / 60).toFixed(2)}s` : ''}` : attempt.status === 'fail' ? `✖ Dropped at step ${(attempt.fail?.index ?? 0) + range[0] + 1}: ${errText(attempt.fail!.error)}` : attempt.status === 'running' ? `In progress: ${attempt.index}/${steps.length}` : 'Ready: start the combo on your controller.'}
          <span className="right small" style={{ fontWeight: 600 }}>
            Streak {streak}{requiredStreak ? ` / ${requiredStreak}` : ''} · session {session.ok}✔ {session.fail}✖
            {comboState ? ` · all-time ${comboState.successes}/${comboState.attempts}${comboState.mastered ? ' · mastered' : ''}` : ''}
          </span>
        </div>
      )}

      <div className="grid g2">
        <div className="card tight">
          <h4>Controller</h4>
          <ControllerDiagram pressed={demo ? demo.script[demo.frame]?.pad ?? [] : []} />
          {!demo && <div className="small muted center">Press ▶ Demo to see the inputs played on the diagram. Live presses are shown on the Controller page.</div>}
        </div>
        <div className="card tight">
          <h4>Input history</h4>
          <InputLog rows={16} />
        </div>
      </div>
      <div className="source-line">
        Route: {combo.source.name} {combo.source.revision ? `(rev ${combo.source.revision})` : ''} · {nInputs} inputs. The trainer checks input order, directions, simultaneous presses and gaps; it cannot confirm that hits connect in Tekken 8. Verify new routes in Practice mode.
      </div>
    </div>
  );
}
