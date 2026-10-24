// Perform a list of inputs; each is checked by the recognizer and recorded.
import { useEffect, useMemo, useRef, useState } from 'react';
import { inputSteps, parseNotation, timingHint } from '../../core/notation';
import { SequenceRecognizer, ERROR_TEXT, type InputErrorType } from '../../core/recognizer';
import { useCaptureInput, useInputFrames, usePracticeTimer } from '../hooks';
import { useStore } from '../store';
import { NotationView } from './Notation';
import { InputLog } from './InputLog';
import { inputManager } from '../../runtime/inputManager';
import { lookupMove } from '../../data';

interface Props {
  items: string[];
  lessonId?: string;
  note?: string;
  onDone(score: number): void;
}

export function InputDrill({ items, lessonId, note, onDone }: Props) {
  const { settings, record, char } = useStore();
  useCaptureInput();
  usePracticeTimer();
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const recRef = useRef<SequenceRecognizer | null>(null);
  const pauseUntil = useRef(0);
  const startedAt = useRef(0);

  const target = items[idx];
  const steps = useMemo(() => (target ? parseNotation(target) : []), [target]);
  useEffect(() => {
    recRef.current = new SequenceRecognizer(steps, settings.recognizer);
    setStepIdx(0);
  }, [steps, settings.recognizer]);

  const finishItem = (ok: boolean, text: string, error?: InputErrorType, failStep?: number) => {
    record({ kind: 'input', itemId: target, success: ok, lessonId, errorType: error, errorStep: failStep, durationMs: performance.now() - startedAt.current });
    if (ok && settings.rumble) inputManager.rumble(60, 0.4);
    const nextResults = [...results, ok];
    setResults(nextResults);
    setFeedback({ ok, text });
    pauseUntil.current = performance.now() + 700;
    window.setTimeout(() => {
      setFeedback(null);
      if (idx + 1 >= items.length) onDone(nextResults.filter(Boolean).length / items.length);
      else setIdx(idx + 1);
    }, 700);
  };

  useInputFrames((f) => {
    const rec = recRef.current;
    if (!rec || feedback || performance.now() < pauseUntil.current) return;
    if (rec.index === 0 && rec.history.frames.length === 0) startedAt.current = performance.now();
    for (const e of rec.push(f)) {
      if (e.type === 'step') setStepIdx(e.index + 1);
      if (e.type === 'complete') finishItem(true, 'Clean input!');
      if (e.type === 'fail') finishItem(false, `${ERROR_TEXT[e.error]}: ${e.detail}`, e.error, e.index);
    }
  });

  if (!target) return null;
  const move = lookupMove(char, target);
  const visible = inputSteps(steps);
  return (
    <div className="grid g2">
      <div className="card stack">
        <div className="row small muted">
          Input {idx + 1} / {items.length}
          <span className="right">{results.filter(Boolean).length} clean · {results.filter((r) => !r).length} missed</span>
        </div>
        <div className="progress"><i style={{ width: `${(idx / items.length) * 100}%` }} /></div>
        {note && <div className="small dim">{note}</div>}
        <div style={{ padding: '18px 0' }} className="center">
          <NotationView notation={target} big />
          {move && <div className="dim" style={{ marginTop: 8 }}>{move.name || move.id} · {move.startup || 'no startup data'} · block {move.block || '—'}</div>}
        </div>
        <div className="small dim">{visible.map((s, i) => <div key={i}>{i === stepIdx ? '▶ ' : ''}{timingHint(s)}</div>)}</div>
        {feedback ? (
          <div className={`result-banner ${feedback.ok ? 'ok' : 'no'}`}>{feedback.ok ? '✔' : '✖'} {feedback.text}</div>
        ) : (
          <div className="result-banner wait">Perform the input on your controller…</div>
        )}
      </div>
      <div className="card">
        <h4>Your inputs</h4>
        <InputLog />
      </div>
    </div>
  );
}
