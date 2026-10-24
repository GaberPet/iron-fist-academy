import { useState } from 'react';
import type { QuizQuestion } from '../../core/quiz';
import { useStore } from '../store';

export function Quiz({ questions, lessonId, onDone }: { questions: QuizQuestion[]; lessonId?: string; onDone(score: number): void }) {
  const { record } = useStore();
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  if (!questions.length) return <div className="notice warn">Not enough data to generate questions for this quiz with the current frame data.</div>;
  const q = questions[i];
  const answer = (k: number) => {
    if (picked !== null) return;
    setPicked(k);
    const ok = k === q.answer;
    if (ok) setCorrect((c) => c + 1);
    record({ kind: 'quiz', itemId: q.id, success: ok, lessonId, detail: q.options[k] });
  };
  const next = () => {
    if (i + 1 >= questions.length) onDone(correct / questions.length);
    else {
      setI(i + 1);
      setPicked(null);
    }
  };
  return (
    <div className="stack">
      <div className="row small muted">
        Question {i + 1} / {questions.length} <span className="right">{correct} correct</span>
      </div>
      <h3>{q.prompt}</h3>
      <div>
        {q.options.map((o, k) => (
          <button key={k} className={`btn quiz-opt ${picked !== null && k === q.answer ? 'correct' : ''} ${picked === k && k !== q.answer ? 'wrong' : ''}`} onClick={() => answer(k)} disabled={picked !== null && k !== picked && k !== q.answer}>
            {o}
          </button>
        ))}
      </div>
      {picked !== null && (
        <div className={`notice ${picked === q.answer ? 'info' : 'bad'}`}>
          <b>{picked === q.answer ? 'Correct.' : 'Not quite.'}</b> {q.explain}
          {q.dataNote && <div className="source-line" style={{ marginTop: 4 }}>{q.dataNote}</div>}
        </div>
      )}
      {picked !== null && <button className="btn primary" onClick={next} autoFocus>{i + 1 >= questions.length ? 'Finish' : 'Next question'}</button>}
    </div>
  );
}
