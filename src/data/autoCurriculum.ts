// Generated curriculum for characters without a hand-written one.
//
// Everything here is selected from the character's own imported data (frame data, punisher table,
// Wavu combos) with general Tekken rules; no character-specific fact is written by hand. The text is
// regenerated whenever the data updates, so numbers in it stay current. Lessons and notes carry
// `generated: true` so the UI can label them.
import type { CharacterFile, ComboDef, Exercise, KeyMoveNote, Lesson, Move, MoveRole, PunisherEntry } from '../types';
import { classifySafety, firstHitLevel, hitLevelName, SAFETY_TEXT } from '../core/frames';
import { parseNotation } from '../core/notation';

const parses = (s: string) => {
  try {
    return parseNotation(s).some((x) => x.kind === 'press');
  } catch {
    return false;
  }
};

/** A move done from neutral standing: no parent, no stance, Heat or Rage prefix. */
const isPlain = (m: Move) => !m.parent && !/^[0-9]?[A-Za-z]{1,6}\./.test(m.id) && !m.id.startsWith('(') && parses(m.id);
const launchesOnHit = (m: Move) => /[+-]?\d+a\b/.test(m.hit) && (m.hitFrame ?? 0) >= 20;
const launchesOnCh = (m: Move) => /[+-]?\d+a\b/.test(m.ch) && !launchesOnHit(m);
const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const bySpeed = (a: Move, b: Move) => (a.startupFrame ?? 99) - (b.startupFrame ?? 99);

function describe(m: Move): string {
  const lv = m.hitLevels.length ? hitLevelName(m.hitLevels[0]).toLowerCase() : 'special';
  const parts = [`${lv}`, m.startup && `${m.startup}`, m.block && `${m.block} on block`].filter(Boolean);
  return `\`${m.id}\`${m.name ? ` (${m.name})` : ''}: ${parts.join(', ')}`;
}

function note(m: Move, roles: MoveRole[], c: string): KeyMoveNote {
  const s = classifySafety(m);
  const lv = firstHitLevel(m);
  const unsafe = s === 'punishable' || s === 'launch-punishable';
  const launches = launchesOnHit(m);
  const purpose = roles.includes('launcher')
    ? 'Launches on hit: your route into a full combo.'
    : roles.includes('counter-hit')
      ? 'Launches on counter hit: use it when you expect the opponent to press a button.'
      : roles.includes('punisher')
        ? `Guaranteed damage after blocking moves that leave the opponent ${m.startupFrame ? `${m.startupFrame} or more` : 'enough'} frames minus.`
        : roles.includes('low')
          ? 'Hits opponents who stand and block: the low half of your mix-ups.'
          : roles.includes('throw')
            ? 'Beats opponents who only block.'
            : 'A quick check that keeps your turn and wins small exchanges.';
  return {
    id: m.id,
    roles,
    generated: true,
    summary: `${m.name || m.id}: ${lv === 'other' ? 'special' : lv}${m.startup ? `, ${m.startup}` : ''}.`,
    purpose,
    use: roles.includes('punisher')
      ? `After blocking a move that is ${m.startupFrame ? `-${m.startupFrame}` : 'very minus'} or worse.`
      : roles.includes('counter-hit')
        ? 'When the opponent tends to press buttons after being minus.'
        : unsafe
          ? 'As a punisher or a read, not as a habit in neutral.'
          : 'In neutral and pressure, at its range.',
    avoid: [
      unsafe ? `Throwing it out raw: it is ${m.block} on block (${SAFETY_TEXT[s].toLowerCase()}).` : '',
      lv === 'high' ? 'Against crouching opponents: it is a high and gets ducked.' : '',
      lv === 'low' ? 'When the opponent is ready to block low.' : '',
    ].filter(Boolean).join(' ') || 'No major drawback in the frame data; watch its range.',
    counterplay:
      lv === 'high' ? 'Ducking it, then punishing while standing up.' : lv === 'low' ? 'Blocking low, then punishing with a while-standing move.' : lv === 'throw' ? 'Breaking the throw or crouching.' : unsafe ? 'Blocking it and punishing.' : 'Blocking it; sidestepping if it is linear.',
    afterBlock: m.block ? `${m.block} on block: ${SAFETY_TEXT[s].toLowerCase()}.` : 'No block data recorded.',
    afterHit: launches ? `${m.hit} on hit: launches, follow with a combo (Combo Lab).` : m.hit ? `${m.hit} on hit.` : 'No hit data recorded.',
    afterEvade: unsafe ? 'If it whiffs you are open to a whiff punish.' : 'A whiff costs little; reset your spacing.',
    gamePlan: `Part of ${c}'s core kit, selected from the frame data.`,
  };
}

interface Pick {
  jab?: Move;
  pokes: Move[];
  lows: Move[];
  launchers: Move[];
  ch: Move[];
  throws: Move[];
  heat: Move[];
  wsPunishers: string[];
  stanceMoves: Move[];
}

function pickMoves(f: CharacterFile, punishers: PunisherEntry[], engagers: string[], stanceCodes: string[]): Pick {
  const moves = f.frames.moves;
  const byId = new Map(moves.map((m) => [m.id, m]));
  const plain = moves.filter(isPlain);
  const jab = byId.get('1');
  const pokes = plain
    .filter((m) => m.startupFrame !== null && m.startupFrame <= 15 && ['safe', 'plus'].includes(classifySafety(m)) && ['mid', 'high'].includes(firstHitLevel(m)))
    .sort((a, b) => Number(firstHitLevel(a) !== 'mid') - Number(firstHitLevel(b) !== 'mid') || bySpeed(a, b))
    .filter((m) => m.id !== '1')
    .slice(0, 4);
  const lowsAll = plain.filter((m) => firstHitLevel(m) === 'low' && m.startupFrame !== null && m.startupFrame <= 24).sort(bySpeed);
  const lows = uniq([...lowsAll.filter((m) => (m.blockFrame ?? -99) >= -14).slice(0, 2), ...lowsAll.filter(launchesOnHit).slice(0, 1)]);
  const punishLaunch = punishers.filter((p) => p.window <= -15).map((p) => byId.get(p.moveId)).filter((m): m is Move => !!m && parses(m.id));
  const launchers = uniq([...punishLaunch, ...plain.filter((m) => launchesOnHit(m) && (m.startupFrame ?? 99) <= 18).sort(bySpeed)]).slice(0, 3);
  const ch = plain.filter((m) => launchesOnCh(m) && (m.startupFrame ?? 99) <= 16).sort(bySpeed).slice(0, 3);
  const throws = ['1+3', '2+4'].map((id) => byId.get(id)).filter((m): m is Move => !!m);
  const cmdThrow = plain.find((m) => m.isThrow && !throws.includes(m) && m.startupFrame !== null);
  if (cmdThrow) throws.push(cmdThrow);
  const heat = uniq(engagers.map((e) => byId.get(e)).filter((m): m is Move => !!m && parses(m.id))).slice(0, 3);
  const wsPunishers = uniq(punishers.filter((p) => p.stance === 'crouching' && /^ws/.test(p.moveId) && byId.has(p.moveId) && parses(p.moveId)).map((p) => p.moveId)).slice(0, 4);
  const stanceMoves = moves.filter((m) => !m.parent && stanceCodes.some((code) => m.id.startsWith(`${code}.`)) && m.hitLevels.length).slice(0, 8);
  return { jab, pokes, lows, launchers, ch, throws, heat, wsPunishers, stanceMoves };
}

const ids = (ms: (Move | undefined)[]) => uniq(ms.filter((m): m is Move => !!m).map((m) => m.id));
const lines = (ms: Move[]) => ms.map((m) => `- ${describe(m)}`).join('\n');

export function generateCurriculum(f: CharacterFile, combos: ComboDef[], punishers: PunisherEntry[], engagers: string[], stanceCodes: string[]): { keyMoves: KeyMoveNote[]; lessons: Lesson[] } {
  const name = f.name;
  const p = pickMoves(f, punishers, engagers, stanceCodes);
  const trainable = combos.filter((c) => c.parseOk !== false && (c.starters.length === 0 || parses(c.starters[0]) || c.starters.some(parses)));
  const inSection = (re: RegExp) => trainable.filter((c) => re.test(c.section ?? ''));
  const bnb = inSection(/^bread/i)[0] ?? inSection(/^staple/i)[0] ?? trainable[0];
  const mini = inSection(/^mini/i)[0] ?? trainable.find((c) => c.id !== bnb?.id) ?? bnb;
  const staple = inSection(/^staple/i).find((c) => c.id !== bnb?.id) ?? inSection(/^staple/i)[0] ?? bnb;
  const wall = inSection(/^wall/i)[0];

  const comboOr = (c: ComboDef | undefined, reps: number, fallback: string[]): Exercise =>
    c ? { type: 'combo', comboId: c.id, reps } : { type: 'input', moves: fallback.length ? fallback : ['1', '1,2'].filter(parses), reps: 3 };
  const inputs = (moves: string[], reps = 2, noteText?: string): Exercise => ({ type: 'input', moves: moves.length ? moves : ['1'], reps, ...(noteText ? { note: noteText } : {}) });
  const launcherIds = ids(p.launchers);
  const keyIds = ids([p.jab, ...p.pokes, ...p.lows, ...p.launchers, ...p.ch]);
  const id = (s: string) => `x-${s}`;
  const src = `Generated from ${name}'s frame data, punisher table and Wavu combos. It updates whenever the data does.`;

  const keyMoves: KeyMoveNote[] = [];
  const add = (m: Move | undefined, role: MoveRole) => {
    if (!m) return;
    const existing = keyMoves.find((k) => k.id === m.id);
    if (existing) {
      if (!existing.roles.includes(role)) existing.roles.push(role);
      return;
    }
    keyMoves.push(note(m, [role], name));
  };
  add(p.jab, 'poke');
  p.pokes.forEach((m) => add(m, 'poke'));
  p.launchers.forEach((m) => add(m, 'launcher'));
  punishers.filter((x) => x.stance === 'standing').slice(0, 3).forEach((x) => add(f.frames.moves.find((m) => m.id === x.moveId), 'punisher'));
  p.ch.forEach((m) => add(m, 'counter-hit'));
  p.lows.forEach((m) => add(m, 'low'));
  p.throws.forEach((m) => add(m, 'throw'));
  p.heat.forEach((m) => add(m, 'heat'));

  const standing = punishers.filter((x) => x.stance === 'standing').sort((a, b) => b.window - a.window);
  const crouching = punishers.filter((x) => x.stance === 'crouching').sort((a, b) => b.window - a.window);
  const punList = (xs: PunisherEntry[]) => xs.map((x) => `- **${x.window}**: \`${x.moveId}\``).join('\n');

  const L = (l: Omit<Lesson, 'generated'>): Lesson => ({ ...l, generated: true });
  const lessons: Lesson[] = [
    L({
      id: id('overview'), stage: 1, title: `Who is ${name}?`,
      objectives: [`Know ${name}'s core moves and their hit levels`, 'Know which of them are safe on block'],
      explanation: `${f.profile.overview || `${name} at a glance, from the frame data.`}\n\nCore moves picked from the frame data:\n\n${lines([p.jab, ...p.pokes, ...p.launchers].filter((m): m is Move => !!m).slice(0, 6))}\n\n${src}`,
      visual: { type: 'moves', moveIds: keyIds.slice(0, 6) },
      guided: { type: 'quiz', generator: 'hitlevel', moveIds: keyIds, count: Math.min(6, Math.max(3, keyIds.length)) },
      challenge: { type: 'quiz', generator: 'safety', moveIds: keyIds, count: Math.min(6, Math.max(3, keyIds.length)) },
      success: 'Mastery threshold on both quizzes.',
      review: ['Highs can be ducked and lows must be blocked crouching: know which of your moves are which.'],
      related: { moves: keyIds.slice(0, 4), lessons: [id('pokes')] },
    }),
    L({
      id: id('pokes'), stage: 1, title: 'Essential pokes',
      objectives: [`Execute ${name}'s fastest safe moves cleanly`],
      explanation: `Pokes win small exchanges without risk. ${name}'s fastest safe options, from the frame data:\n\n${lines([p.jab, ...p.pokes].filter((m): m is Move => !!m))}\n\nUse them to check the opponent and keep your turn.`,
      visual: { type: 'frames', moveIds: ids([p.jab, ...p.pokes]) },
      guided: inputs(ids([p.jab, ...p.pokes])),
      challenge: inputs(ids([...p.pokes, p.jab]), 3, 'Clean inputs: exact diagonals.'),
      success: 'Inputs at the mastery threshold.',
      review: ['Most misses here are diagonals: check the input log.'],
      related: { moves: ids(p.pokes), lessons: [id('throws')] },
    }),
    L({
      id: id('throws'), stage: 1, title: `${name}'s throws`,
      objectives: ['Perform the generic throws', 'Break throws in the simulation'],
      explanation: `Throws beat opponents who only block.\n\n${lines(p.throws)}\n\nOn defence: break 1+3 with 1, 2+4 with 2. Check the Move Library notes for break information on command throws.`,
      visual: { type: 'frames', moveIds: ids(p.throws) },
      guided: inputs(ids(p.throws).filter(parses), 3),
      challenge: { type: 'drill', drill: 'throw-break', reps: 12, passRate: 0.75 },
      success: 'Throw inputs and breaks at the required rates.',
      review: ['Press both buttons together, within a couple of frames.'],
      related: { lessons: ['g-throws'] },
    }),
    L({
      id: id('s1-test'), stage: 1, title: 'Stage 1 test: foundations', isStageTest: true,
      objectives: [`Read notation and execute ${name}'s basic inputs`],
      explanation: 'Mixed inputs and a frame-data quiz. Pass to unlock Stage 2.',
      guided: inputs(uniq([...ids([p.jab, ...p.pokes]), ...launcherIds.slice(0, 1), 'backdash']), 2),
      challenge: { type: 'quiz', generator: 'safety', count: 8 },
      success: 'Mastery threshold on both parts.',
      review: ['Retry the lesson whose inputs you missed.'],
      related: { lessons: [id('pokes'), 'g-frames'] },
    }),
    L({
      id: id('launchers'), stage: 2, title: 'Launchers',
      objectives: [`Execute ${name}'s launchers`, 'Use them as punishers, not pokes'],
      explanation: `A launcher puts the opponent in the air for a combo. ${name}'s, from the frame data and punisher table:\n\n${lines(p.launchers)}\n\nMost launchers are punishable on block: use them to punish, not as a habit.`,
      visual: { type: 'frames', moveIds: launcherIds },
      guided: inputs(launcherIds, 3),
      challenge: { type: 'quiz', generator: 'punisher', count: 6 },
      success: 'Inputs and quiz at the mastery threshold.',
      review: ['A while-standing (ws) input fails if you are still holding down when you press.'],
      related: { moves: launcherIds, combos: ids([]).concat(bnb ? [bnb.id] : []) },
    }),
    L({
      id: id('first-combos'), stage: 2, title: 'First combo',
      objectives: ['Land a short combo consistently'],
      explanation: mini ? `Start with a short documented route: **${mini.name}**: \`${mini.route}\`.\n\nUse Slow mode in the Combo Lab first, then Consistency mode.` : `No trainable combo is documented for ${name} on Wavu yet, so this lesson drills the launchers instead. It switches to a combo automatically once one is added to the wiki.`,
      guided: comboOr(mini, 3, launcherIds),
      challenge: comboOr(mini, 3, launcherIds),
      success: 'Required consecutive clean executions.',
      review: ['Most early drops are pressing the follow-up before the previous hit lands.'],
      related: { combos: mini ? [mini.id] : [] },
    }),
    L({
      id: id('punish-standing'), stage: 2, title: 'Standing punishment',
      objectives: ['Pick the right punisher for each window', 'Punish in the simulation on time'],
      explanation: standing.length ? `${name}'s standing punishers (Wavu punisher table):\n\n${punList(standing)}\n\nUse the strongest one that fits the window.` : `No standing punisher table for ${name} on Wavu yet; the drill still trains your timing.`,
      guided: { type: 'quiz', generator: 'punisher', count: 8 },
      challenge: { type: 'drill', drill: 'punish-standing', reps: 10, passRate: 0.7 },
      success: 'Quiz at the threshold, drill at the pass rate.',
      review: ["'Too slow' means you pressed after the window: input the punisher during blockstun."],
      related: { lessons: ['g-punish'] },
    }),
    L({
      id: id('punish-crouching'), stage: 2, title: 'Crouching punishment',
      objectives: ['Punish blocked lows with while-standing moves'],
      explanation: crouching.length ? `After crouch-blocking a low (Wavu punisher table):\n\n${punList(crouching)}` : `No crouching punisher table for ${name} on Wavu yet; the drill still trains the timing.`,
      guided: inputs(p.wsPunishers.length ? p.wsPunishers : launcherIds, 2),
      challenge: { type: 'drill', drill: 'punish-crouching', reps: 10, passRate: 0.7 },
      success: 'Inputs and drill at the pass rate.',
      review: ['Release down and press almost together.'],
      related: { moves: p.wsPunishers },
    }),
    L({
      id: id('neutral'), stage: 2, title: 'Basic neutral',
      objectives: ['Know which moves are fastest', 'Practise spacing in Tekken 8'],
      explanation: `Neutral is when neither player has advantage. Use fast safe pokes up close, lows at mid range, and movement (backdash, sidestep) to make the opponent whiff.\n\nThis lesson's challenge happens in Tekken 8: the app cannot see the game, so confirm the checklist yourself.`,
      guided: { type: 'quiz', generator: 'startup', count: 6 },
      challenge: { type: 'checklist', items: [`Play 3 matches with ${name} focusing only on blocking and punishing`, 'Watch one replay and note one move you could have punished', 'In Practice mode, record a sidestep and find which of your moves still hit'] },
      success: 'Quiz at the threshold and the checklist confirmed.',
      review: ['If you lose neutral often, slow down: block more, attack less.'],
      related: { lessons: [id('punish-standing')] },
    }),
    L({
      id: id('s2-test'), stage: 2, title: 'Stage 2 test: core combat', isStageTest: true,
      objectives: ['Punish and combo under test conditions'],
      explanation: 'A combo check and a punishment drill. Pass to unlock Stage 3.',
      guided: comboOr(mini, 3, launcherIds),
      challenge: { type: 'drill', drill: 'punish-standing', reps: 12, passRate: 0.75 },
      success: 'Consistency and drill pass rate.',
      review: ['Check the Progress page for your most common error.'],
      related: { lessons: [id('punish-standing'), id('first-combos')] },
    }),
    L({
      id: id('bnb'), stage: 3, title: 'Bread-and-butter combo',
      objectives: [`Land ${name}'s main launch combo`],
      explanation: bnb ? `Wavu's main route: **${bnb.name}**: \`${bnb.route}\`${bnb.starters.length ? ` after ${bnb.starters.map((s) => `\`${s}\``).join(', ')}` : ''}.\n\nLearn it in pieces with Step-by-step and Slow modes, then confirm in Tekken 8 Practice that every hit connects.` : `No trainable bread-and-butter combo is documented for ${name} yet; this lesson drills the launchers until one is added to Wavu.`,
      guided: comboOr(bnb, 2, launcherIds),
      challenge: comboOr(bnb, 5, launcherIds),
      success: 'Required consecutive clean executions.',
      review: ['Use Progress → weakest transition to drill the exact step you drop.'],
      related: { combos: bnb ? [bnb.id] : [] },
    }),
    L({
      id: id('ch-tools'), stage: 3, title: 'Counter-hit tools',
      objectives: ['Know which moves launch on counter hit'],
      explanation: p.ch.length ? `These launch on counter hit (frame data):\n\n${lines(p.ch)}\n\nUse them when the opponent presses buttons after being minus.` : `The frame data lists no fast counter-hit launcher for ${name}; use this lesson to drill launchers and safe pokes instead.`,
      visual: { type: 'frames', moveIds: ids(p.ch.length ? p.ch : p.pokes) },
      guided: inputs(ids(p.ch.length ? p.ch : p.pokes), 3),
      challenge: { type: 'quiz', generator: 'safety', moveIds: ids([...p.ch, ...p.pokes, ...p.launchers]), count: 6 },
      success: 'Inputs and quiz at the threshold.',
      review: ['Counter-hit tools only pay out against opponents who press buttons.'],
      related: { moves: ids(p.ch) },
    }),
    L({
      id: id('lows'), stage: 3, title: 'Lows and pressure',
      objectives: ['Know which lows are safe and which are risky'],
      explanation: p.lows.length ? `${name}'s lows from the frame data:\n\n${lines(p.lows)}\n\nMix them with mids so the opponent has to guess.` : `No fast lows found in ${name}'s frame data; pressure comes from mids and throws.`,
      visual: { type: 'frames', moveIds: ids(p.lows) },
      guided: { type: 'quiz', generator: 'safety', moveIds: ids([...p.lows, ...p.pokes]), count: 6 },
      challenge: inputs(ids(p.lows.length ? p.lows : p.pokes), 3),
      success: 'Quiz and inputs at the threshold.',
      review: ["Don't repeat the same low: opponents will start blocking it."],
      related: { moves: ids(p.lows) },
    }),
    L({
      id: id('whiff'), stage: 3, title: 'Whiff punishment',
      objectives: ['Punish whiffed moves within their recovery'],
      explanation: `When an attack misses, the attacker is stuck in recovery. Backdash to make moves whiff, then hit them with a fast long-range move or a launcher (${launcherIds.map((x) => `\`${x}\``).join(', ') || 'see the Move Library'}).\n\nThe simulation trains timing; range must be learned in Tekken 8.`,
      guided: { type: 'drill', drill: 'whiff-punish', reps: 8, passRate: 0.6 },
      challenge: { type: 'drill', drill: 'whiff-punish', reps: 12, passRate: 0.75 },
      success: 'Drill pass rate.',
      review: ["Wait for the recovery; don't press during the active frames."],
      related: { moves: launcherIds },
    }),
    L({
      id: id('s3-test'), stage: 3, title: 'Stage 3 test: reliable execution', isStageTest: true,
      objectives: ['Combo consistency and crouching punishment'],
      explanation: 'Pass to unlock Stage 4.',
      guided: comboOr(bnb, 5, launcherIds),
      challenge: { type: 'drill', drill: 'punish-crouching', reps: 12, passRate: 0.75 },
      success: 'Consistency and drill pass rate.',
      review: ['Drill your weakest transition.'],
      related: { lessons: [id('bnb')] },
    }),
    L({
      id: id('stances'), stage: 4, title: p.stanceMoves.length ? 'Stances' : 'Special moves',
      objectives: p.stanceMoves.length ? ['Know the stances and what comes out of them'] : ['Know the special properties in the move list'],
      explanation: stanceCodes.length
        ? `${name}'s stances (Wavu):\n\n${f.profile.stances?.map((s) => `- ${s}`).join('\n')}\n\nMoves from them:\n\n${lines(p.stanceMoves.slice(0, 6))}`
        : `Wavu lists no stances for ${name}. Look through the Move Library for moves with special properties (crushes, homing, Heat): the notes column shows them.`,
      visual: { type: 'frames', moveIds: ids(p.stanceMoves.length ? p.stanceMoves.slice(0, 6) : p.launchers) },
      guided: { type: 'quiz', generator: 'hitlevel', moveIds: ids(p.stanceMoves.length >= 3 ? p.stanceMoves : [...p.pokes, ...p.lows, ...p.launchers]), count: 5 },
      challenge: { type: 'quiz', generator: 'safety', moveIds: ids(p.stanceMoves.length >= 3 ? p.stanceMoves : [...p.pokes, ...p.lows, ...p.launchers]), count: 5 },
      success: 'Both quizzes at the threshold.',
      review: ['A stance can usually be interrupted: do not sit in it.'],
      related: { moves: ids(p.stanceMoves.slice(0, 4)) },
    }),
    L({
      id: id('staple'), stage: 4, title: 'Optimized route',
      objectives: ['Land a higher-damage documented route'],
      explanation: staple ? `**${staple.name}**: \`${staple.route}\`${staple.damage ? ` (${staple.damage} on Wavu)` : ''}.\n\nIf it is too hard, fall back to the bread-and-butter route in matches.` : `No staple route documented for ${name} yet.`,
      guided: comboOr(staple, 2, launcherIds),
      challenge: comboOr(staple, 5, launcherIds),
      success: 'Required consecutive clean executions.',
      review: ['Confirm in Tekken 8 Practice that each hit connects.'],
      related: { combos: staple ? [staple.id] : [] },
    }),
    L({
      id: id('wall'), stage: 4, title: 'Wall combos',
      objectives: ['Finish combos at the wall'],
      explanation: wall ? `Wavu's wall route: \`${wall.route}\`${wall.damage ? ` (${wall.damage})` : ''}. Wall combos scale damage heavily: short and reliable is fine.` : `No wall combo is documented for ${name} on Wavu yet. Find one in Practice mode with the checklist below.`,
      guided: wall ? { type: 'combo', comboId: wall.id, reps: 3 } : inputs(launcherIds, 2),
      challenge: wall ? { type: 'combo', comboId: wall.id, reps: 5 } : { type: 'checklist', items: ['In Tekken 8 Practice, wall splat the dummy', 'Find a short follow-up that connects after the splat', 'Land it 5 times in a row'] },
      success: wall ? 'Required consecutive clean executions.' : 'Checklist confirmed.',
      review: ["Don't overextend at the wall: scaling is heavy."],
      related: { combos: wall ? [wall.id] : [] },
    }),
    L({
      id: id('defense'), stage: 4, title: 'Defence under pressure',
      objectives: ['Block mix-ups, break throws and punish in a mixed scenario'],
      explanation: 'The adaptive bot mixes unsafe moves, safe moves, lows and throws, and uses more of what you fail. It is a timing simulation, not Tekken 8.',
      guided: { type: 'drill', drill: 'mixed-pressure', reps: 15, passRate: 0.65 },
      challenge: { type: 'drill', drill: 'mixed-pressure', reps: 20, passRate: 0.75 },
      success: 'Drill pass rate.',
      review: ['If you press into safe moves often, block once more before acting.'],
      related: { lessons: ['g-blocking', 'g-throws'] },
    }),
    L({
      id: id('heat'), stage: 4, title: 'Using Heat',
      objectives: [`Know ${name}'s Heat Engagers`],
      explanation: `Heat Engagers (Wavu): ${(f.profile.heatEngagers ?? []).map((h) => `\`${h.split(' – ').pop()}\``).join(', ') || 'not listed on Wavu yet'}.\n\nHeat Burst is 2+3; Heat Smash is H.2+3.${p.heat.length ? `\n\n${lines(p.heat)}` : ''}`,
      visual: { type: 'frames', moveIds: ids(p.heat) },
      guided: inputs(uniq([...ids(p.heat), '2+3']), 3),
      challenge: { type: 'checklist', items: [`In Tekken 8 Practice, enter Heat with one of ${name}'s Heat Engagers`, 'Land the Heat Smash (H.2+3)', 'Note which engager you confirm most reliably'] },
      success: 'Inputs and checklist.',
      review: ['Heat is once per round: spend it where it converts.'],
      related: { moves: ids(p.heat) },
    }),
    L({
      id: id('s4-test'), stage: 4, title: 'Stage 4 test: advanced play', isStageTest: true,
      objectives: ['Advanced route and defence'],
      explanation: 'Pass to unlock Stage 5.',
      guided: comboOr(staple, 3, launcherIds),
      challenge: { type: 'drill', drill: 'mixed-pressure', reps: 20, passRate: 0.75 },
      success: 'Consistency and drill pass rate.',
      review: ['Use the dashboard review suggestions.'],
      related: { lessons: [id('staple'), id('defense')] },
    }),
    L({
      id: id('scenarios'), stage: 5, title: 'Scenario challenges',
      objectives: ['Make the right decision under pressure'],
      explanation: 'Set the drill difficulty to Hard (shorter reaction windows) and pass the adaptive scenario.',
      guided: { type: 'drill', drill: 'mixed-pressure', reps: 25, passRate: 0.75 },
      challenge: { type: 'drill', drill: 'mixed-pressure', reps: 30, passRate: 0.8 },
      success: 'Drill pass rate.',
      review: ['Fix your single biggest error category first.'],
      related: { lessons: [id('defense')] },
    }),
    L({
      id: id('matchups'), stage: 5, title: 'Matchup preparation',
      objectives: ['Build a punishment sheet for your common opponents'],
      explanation: `Know what to punish, and with what, against the characters you meet most. Use the Punishment trainer with an opponent filter, then confirm in Tekken 8.`,
      guided: { type: 'quiz', generator: 'punisher', count: 10 },
      challenge: { type: 'checklist', items: ['List the 3 characters you lose to most', 'Record 2 unsafe moves of each in Practice and find your best punish', "Check Wavu's punisher page for matchup-specific punishes"] },
      success: 'Quiz and checklist.',
      review: ['Revisit after each patch.'],
      related: { lessons: [id('punish-standing'), id('punish-crouching')] },
    }),
    L({
      id: id('final-test'), stage: 5, title: 'Final test: competitive readiness', isStageTest: true,
      objectives: ['Execution, punishment and decision-making together'],
      explanation: 'Your main combo under consistency rules, and the adaptive scenario.',
      guided: comboOr(bnb, 8, launcherIds),
      challenge: { type: 'drill', drill: 'mixed-pressure', reps: 30, passRate: 0.8 },
      success: 'Both parts at the required level.',
      review: ['Keep training daily: skills decay without practice.'],
      related: { lessons: [id('scenarios')] },
    }),
  ];
  return { keyMoves, lessons };
}
