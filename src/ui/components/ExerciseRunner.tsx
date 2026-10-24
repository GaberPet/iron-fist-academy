import { useMemo, useState } from 'react';
import type { Exercise } from '../../types';
import { generateQuiz, seededRng } from '../../core/quiz';
import { passes } from '../../core/progress';
import { useStore } from '../store';
import { InputDrill } from './InputDrill';
import { Quiz } from './Quiz';
import { ComboTrainer } from './ComboTrainer';
import { DojoArena, DRILLS } from './DojoArena';
import { NotationView } from './Notation';

export function describeExercise(e: Exercise, threshold: number): string {
  switch (e.type) {
    case 'input':
      return `Perform ${e.moves.length} input${e.moves.length > 1 ? 's' : ''} × ${e.reps} (${e.moves.length * e.reps} total). Pass: ${Math.round(threshold * 100)}% clean.`;
    case 'combo':
      return `Land the combo ${e.reps} times in a row (consistency).`;
    case 'quiz':
      return `${e.count}-question quiz generated from frame data. Pass: ${Math.round(threshold * 100)}%.`;
    case 'drill':
      return `${DRILLS[e.drill].title} simulation, ${e.reps} rounds. Pass: ${Math.round(e.passRate * 100)}%.`;
    case 'checklist':
      return `In-game checklist (${e.items.length} items, self-reported).`;
  }
}

interface Props {
  exercise: Exercise;
  lessonId: string;
  onResult(score: number, passed: boolean): void;
}

export function ExerciseRunner({ exercise, lessonId, onResult }: Props) {
  const { char, opponents, settings } = useStore();
  const [run, setRun] = useState(0); // 0 = not started
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [checks, setChecks] = useState<boolean[]>([]);
  const threshold = settings.masteryThreshold;

  const questions = useMemo(
    () => (exercise.type === 'quiz' && run > 0 ? generateQuiz(exercise.generator, char, opponents, exercise.count, seededRng(Date.now() + run), exercise.moveIds) : []),
    [exercise, run, char, opponents],
  );
  const items = useMemo(() => (exercise.type === 'input' ? Array.from({ length: exercise.reps }, () => exercise.moves).flat() : []), [exercise]);
  const combo = exercise.type === 'combo' ? char.combos.find((c) => c.id === exercise.comboId) : undefined;

  const done = (score: number, passed: boolean) => {
    setResult({ score, passed });
    onResult(score, passed);
  };

  const start = () => {
    setResult(null);
    setChecks([]);
    setRun((r) => r + 1);
  };

  if (result) {
    return (
      <div className="stack">
        <div className={`result-banner ${result.passed ? 'ok' : 'no'}`}>
          {result.passed ? '✔ Passed' : '✖ Not yet'} · score {Math.round(result.score * 100)}%
        </div>
        <button className="btn" onClick={start}>Try again</button>
      </div>
    );
  }

  if (run === 0) {
    return (
      <div className="stack">
        <p className="dim" style={{ margin: 0 }}>{describeExercise(exercise, threshold)}</p>
        {exercise.type === 'input' && (
          <div className="row">{exercise.moves.map((m, i) => <NotationView key={i} notation={m} />)}</div>
        )}
        {exercise.type === 'combo' && combo && (
          <div className="row"><b>{combo.name}</b> <NotationView notation={combo.route} /></div>
        )}
        <div>
          <button className="btn primary" onClick={start}>Start</button>
        </div>
      </div>
    );
  }

  switch (exercise.type) {
    case 'input':
      return <InputDrill key={run} items={items} lessonId={lessonId} note={exercise.note} onDone={(s) => done(s, passes(Math.round(s * items.length), items.length, threshold))} />;
    case 'quiz':
      return <Quiz key={run} questions={questions} lessonId={lessonId} onDone={(s) => done(s, s + 1e-9 >= threshold)} />;
    case 'combo':
      if (!combo) return <div className="notice bad">Combo "{exercise.comboId}" not found in the data.</div>;
      return (
        <div className="stack">
          <ComboTrainer key={run} char={char} combo={combo} mode="consistency" requiredStreak={exercise.reps} lessonId={lessonId} onMastered={() => done(1, true)} />
          <button className="btn ghost sm" onClick={() => done(0, false)}>Stop for now</button>
        </div>
      );
    case 'drill':
      return <DojoArena key={run} drill={exercise.drill} reps={exercise.reps} difficulty={settings.drillDifficulty} lessonId={lessonId} onDone={(rate) => window.setTimeout(() => done(rate, rate + 1e-9 >= exercise.passRate), 1800)} />;
    case 'checklist':
      return (
        <div className="stack">
          <div className="notice info">These steps happen in Tekken 8. The app cannot see the game, so tick each item once you've actually done it.</div>
          {exercise.items.map((it, i) => (
            <label key={i} className="row" style={{ alignItems: 'flex-start' }}>
              <input type="checkbox" checked={!!checks[i]} onChange={(e) => setChecks((c) => Object.assign([...c], { [i]: e.target.checked }))} />
              <span>{it}</span>
            </label>
          ))}
          <div>
            <button className="btn primary" disabled={exercise.items.some((_, i) => !checks[i])} onClick={() => done(1, true)}>Confirm (self-reported)</button>
          </div>
        </div>
      );
  }
}
