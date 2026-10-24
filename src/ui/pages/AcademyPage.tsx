import { useMemo } from 'react';
import type { Lesson } from '../../types';
import { lessonsFor, lookupMove, STAGE_NAMES } from '../../data';
import { lessonState, lessonUnlocked, stageUnlock } from '../../core/progress';
import { navigate } from '../hooks';
import { useStore } from '../store';
import { Markup } from '../components/Markup';
import { MoveCard } from '../components/MoveCard';
import { ExerciseRunner, describeExercise } from '../components/ExerciseRunner';
import { ControllerDiagram } from '../components/ControllerDiagram';
import { NotationView } from '../components/Notation';

export function AcademyPage({ lessonId }: { lessonId?: string }) {
  const { char, progress, settings } = useStore();
  const lessons = useMemo(() => lessonsFor(char), [char]);
  const lesson = lessons.find((l) => l.id === lessonId);
  if (lessonId && !lesson) return <div className="notice warn">Lesson "{lessonId}" is not part of {char.profile.name}'s curriculum. <button className="btn sm" onClick={() => navigate('academy')}>Back to Academy</button></div>;
  if (lesson) return <LessonView lesson={lesson} lessons={lessons} />;

  const id = char.profile.id;
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Learning Academy · {char.profile.name}</h1>
          <p>Five stages from foundations to competitive preparation. Each lesson needs a passed guided exercise and a passed challenge. Stages unlock through mastery (currently {Math.round(settings.unlockRequirement * 100)}% of the previous stage plus its stage test), not by opening lessons.</p>
        </div>
      </div>
      {[1, 2, 3, 4, 5].map((stage) => {
        const st = stageUnlock(lessons, progress, id, stage, settings.unlockRequirement);
        const ls = lessons.filter((l) => l.stage === stage);
        const done = ls.filter((l) => lessonState(progress, id, l.id).mastered).length;
        return (
          <section key={stage} className={`stage ${st.unlocked ? '' : 'locked'}`}>
            <div className="stage-head">
              <div className="stage-num">{stage}</div>
              <div>
                <h2 style={{ margin: 0 }}>Stage {stage}: {STAGE_NAMES[stage]}</h2>
                <div className="small muted">{done} / {ls.length} mastered{st.unlocked ? '' : ` · 🔒 ${st.reason}`}</div>
              </div>
              <div className="right" style={{ width: 180 }}><div className="progress"><i style={{ width: `${(done / ls.length) * 100}%` }} /></div></div>
            </div>
            <div className="grid g3">
              {ls.map((l) => {
                const s = lessonState(progress, id, l.id);
                const u = lessonUnlocked(lessons, progress, id, l, settings.unlockRequirement);
                return (
                  <button key={l.id} className={`list-item ${u.unlocked ? '' : 'locked'}`} style={{ alignItems: 'flex-start', flexDirection: 'column' }} onClick={() => navigate('academy', l.id)} disabled={!u.unlocked && !settings.allowPreview}>
                    <div className="row" style={{ width: '100%' }}>
                      {l.isStageTest && <span className="badge warn">Stage test</span>}
                      {l.id.startsWith('g-') && <span className="badge">Fundamentals</span>}
                      <span className="right">{s.mastered ? <span className="badge good">Mastered</span> : s.guidedPassed || s.challengePassed ? <span className="badge info">In progress</span> : !u.unlocked ? <span className="badge">🔒 Locked</span> : null}</span>
                    </div>
                    <b>{l.title}</b>
                    <span className="small dim">{l.objectives[0]}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function LessonView({ lesson, lessons }: { lesson: Lesson; lessons: Lesson[] }) {
  const { char, progress, settings, setLesson } = useStore();
  const id = char.profile.id;
  const u = lessonUnlocked(lessons, progress, id, lesson, settings.unlockRequirement);
  const s = lessonState(progress, id, lesson.id);
  const idx = lessons.indexOf(lesson);
  const next = lessons[idx + 1];
  const reviewAttempts = progress.attempts.filter((a) => a.lessonId === lesson.id && a.char === id && !a.success).slice(-6).reverse();

  return (
    <div className="stack">
      <div className="row">
        <button className="btn sm ghost" onClick={() => navigate('academy')}>← Academy</button>
        <span className="badge">Stage {lesson.stage}: {STAGE_NAMES[lesson.stage]}</span>
        {lesson.isStageTest && <span className="badge warn">Stage test</span>}
        {s.mastered && <span className="badge good">Mastered {s.masteredAt?.slice(0, 10)}</span>}
      </div>
      <h1>{lesson.title}</h1>
      {!u.unlocked && (
        <div className="notice warn"><b>Locked.</b> {u.reason} {settings.allowPreview ? 'You can read this lesson, but exercises are disabled and give no credit until it unlocks.' : ''}</div>
      )}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)' }}>
        <div className="card stack">
          <div>
            <div className="section-label">Objectives</div>
            <ul className="dim" style={{ paddingLeft: 18, margin: 0 }}>{lesson.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
          </div>
          <div>
            <div className="section-label">Explanation</div>
            <Markup text={lesson.explanation} />
          </div>
          <div>
            <div className="section-label">Success criterion</div>
            <p className="dim" style={{ margin: 0 }}>{lesson.success} (mastery threshold {Math.round(settings.masteryThreshold * 100)}%, adjustable in Settings)</p>
          </div>
        </div>
        <div className="stack">
          {lesson.visual?.type === 'controller' && (
            <div className="card"><div className="section-label">Visual aid</div><ControllerDiagram pressed={[]} labels={{ square: '1', triangle: '2', cross: '3', circle: '4' }} /></div>
          )}
          {lesson.visual && lesson.visual.type !== 'controller' && (
            <div className="card stack">
              <div className="section-label">Moves in this lesson</div>
              <table className="data">
                <thead><tr><th>Move</th><th>Startup</th><th>Block</th><th>Hit</th></tr></thead>
                <tbody>
                  {lesson.visual.moveIds.map((mid) => {
                    const m = lookupMove(char, mid);
                    return m ? (
                      <tr key={mid} className="clickable" onClick={() => navigate('moves', m.id)}>
                        <td><NotationView notation={mid} /><div className="small muted">{m.name}</div></td>
                        <td className="mono">{m.startup}</td><td className="mono">{m.block}</td><td className="mono">{m.hit}</td>
                      </tr>
                    ) : null;
                  })}
                </tbody>
              </table>
              <div className="source-line">Frame data: {char.frames.source.name}, fetched {char.frames.source.fetchedAt?.slice(0, 10)}.</div>
            </div>
          )}
          {lesson.related.moves?.slice(0, 1).map((mid) => {
            const m = lookupMove(char, mid);
            return m ? <MoveCard key={mid} c={char} m={m} compact /> : null;
          })}
        </div>
      </div>

      <div className="grid g2">
        <div className="card stack">
          <div className="card-title"><div className="section-label">1 · Guided exercise</div>{s.guidedPassed && <span className="badge good">Passed · best {Math.round((s.bestGuided ?? 0) * 100)}%</span>}</div>
          {u.unlocked ? <ExerciseRunner exercise={lesson.guided} lessonId={lesson.id} onResult={(score, passed) => setLesson(lesson.id, 'guided', score, passed)} /> : <p className="muted">{describeExercise(lesson.guided, settings.masteryThreshold)}</p>}
        </div>
        <div className="card stack">
          <div className="card-title"><div className="section-label">2 · Independent challenge</div>{s.challengePassed && <span className="badge good">Passed · best {Math.round((s.bestChallenge ?? 0) * 100)}%</span>}</div>
          {u.unlocked ? <ExerciseRunner exercise={lesson.challenge} lessonId={lesson.id} onResult={(score, passed) => setLesson(lesson.id, 'challenge', score, passed)} /> : <p className="muted">{describeExercise(lesson.challenge, settings.masteryThreshold)}</p>}
        </div>
      </div>

      <div className="grid g2">
        <div className="card stack">
          <div className="section-label">Review: common mistakes</div>
          <ul className="dim" style={{ paddingLeft: 18, margin: 0 }}>{lesson.review.map((r) => <li key={r}>{r}</li>)}</ul>
          <h4 style={{ marginTop: 10 }}>Your recent misses in this lesson</h4>
          {reviewAttempts.length ? (
            <table className="data">
              <tbody>{reviewAttempts.map((a, i) => <tr key={i}><td className="small muted">{new Date(a.at).toLocaleString()}</td><td className="mono small">{a.itemId}</td><td className="small">{a.errorType ?? 'incorrect'}{a.errorStepText ? ` at ${a.errorStepText}` : ''}</td></tr>)}</tbody>
            </table>
          ) : <div className="small muted">No misses recorded yet.</div>}
        </div>
        <div className="card stack">
          <div className="section-label">Related</div>
          <div className="row">{lesson.related.moves?.map((m) => <button key={m} className="btn sm" onClick={() => navigate('moves', m)}>{m}</button>)}</div>
          <div className="row">{lesson.related.combos?.map((c) => <button key={c} className="btn sm" onClick={() => navigate('combos', c)}>⚡ {char.combos.find((x) => x.id === c)?.name ?? c}</button>)}</div>
          <div className="row">{lesson.related.lessons?.map((l) => <button key={l} className="btn sm" onClick={() => navigate('academy', l)}>◈ {lessons.find((x) => x.id === l)?.title ?? l}</button>)}</div>
          {next && <button className="btn primary" onClick={() => navigate('academy', next.id)}>Next: {next.title} →</button>}
        </div>
      </div>
    </div>
  );
}
