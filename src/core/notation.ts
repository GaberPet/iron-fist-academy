// Tekken notation parser.
// Converts strings like "df+3 f+3,2~DF CD.1 f+3,2,1 T! dash f+1+2~F BAD.2+4"
// into a list of InputSteps the recognizer can check against controller input.
// Notation follows Wavu Wiki's combo notation (https://wavu.wiki/t/Notation).
import type { Dir, TekkenButton } from '../types';

export type StepKind = 'press' | 'motion' | 'marker';

export interface DirReq {
  dir: Dir;
  hold: boolean; // uppercase in notation, e.g. F = hold forward
}

export interface InputStep {
  kind: StepKind;
  text: string; // display notation for this step
  /** Direction sequence. For press steps the final entry (if any) is the direction held at the press. */
  motion: DirReq[];
  /**
   * Direction required at the moment of the press.
   * 'any' = direction does not matter (string continuation / stance move).
   */
  pressDir: Dir | 'any';
  buttons: TekkenButton[];
  holdButton: boolean; // '*'
  sameFrame: boolean; // '#'
  justFrame: boolean; // ':' before the step
  immediate: boolean; // '~' before the step
  delayed: boolean; // '<' or '>' before the step
  stance: string | null; // HAM, CJM, ws, FC, BAD...
  heat: boolean;
  rage: boolean;
  counterHit: boolean;
  optional: boolean;
  marker: string | null; // T!, W! ...
  /** Motion steps that are a word ("dash", "ssr") keep it here for display. */
  word: string | null;
  /** Index of the whitespace-separated token this step came from (steps of one string share it). */
  group: number;
}

const MARKERS: Record<string, string> = {
  'T!': 'Tornado (screw) — opponent spins; the juggle continues after the tornado hit.',
  'W!': 'Wall splat — opponent is stuck on the wall; switch to a wall combo.',
  'WB!': 'Wall break.',
  'WH!': 'Wall hazard (break or blast).',
  'F!': 'Floor break.',
  'FH!': 'Floor hazard.',
  'BB!': 'Balcony break.',
  'HB!': 'Marker from the source combo (see source page).',
};

export function markerDescription(m: string): string {
  return MARKERS[m] ?? 'Marker from the source combo.';
}

const DIR_WORDS: Record<string, Dir> = {
  n: 'n', u: 'u', uf: 'uf', f: 'f', df: 'df', d: 'd', db: 'db', b: 'b', ub: 'ub',
};

const MOTION_EXPANSIONS: Record<string, Dir[]> = {
  qcf: ['d', 'df', 'f'],
  qcb: ['d', 'db', 'b'],
  hcf: ['b', 'db', 'd', 'df', 'f'],
  hcb: ['f', 'df', 'd', 'db', 'b'],
};

/** Movement words that become motion steps. */
const MOVEMENT_WORDS: Record<string, DirReq[]> = {
  dash: [{ dir: 'f', hold: false }, { dir: 'f', hold: false }],
  run: [{ dir: 'f', hold: false }, { dir: 'f', hold: false }, { dir: 'f', hold: true }],
  backdash: [{ dir: 'b', hold: false }, { dir: 'b', hold: false }],
  ssr: [{ dir: 'd', hold: false }],
  ssl: [{ dir: 'u', hold: false }],
  sswr: [{ dir: 'd', hold: true }],
  sswl: [{ dir: 'u', hold: true }],
};

const DOWNISH = new Set<Dir>(['d', 'db', 'df']);
export const isDownish = (d: Dir) => DOWNISH.has(d);

function baseStep(): InputStep {
  return {
    kind: 'press', text: '', motion: [], pressDir: 'any', buttons: [], holdButton: false, sameFrame: false,
    justFrame: false, immediate: false, delayed: false, stance: null, heat: false, rage: false,
    counterHit: false, optional: false, marker: null, word: null, group: 0,
  };
}

/** Parse a direction token ("df", "DF", "u/f", "qcf"). Returns null if not a direction. */
export function parseDirToken(tok: string): DirReq[] | null {
  const t = tok.replace('/', '');
  const lower = t.toLowerCase();
  if (MOTION_EXPANSIONS[lower]) return MOTION_EXPANSIONS[lower].map((dir) => ({ dir, hold: false }));
  if (DIR_WORDS[lower] && (t === lower || t === t.toUpperCase())) {
    return [{ dir: DIR_WORDS[lower], hold: t !== lower }];
  }
  return null;
}

interface Part {
  sep: ',' | '~' | ':' | '<' | '>' | '';
  body: string;
}

function splitParts(segment: string): Part[] {
  const parts: Part[] = [];
  let sep: Part['sep'] = '';
  let cur = '';
  for (const ch of segment) {
    if (ch === ',' || ch === '~' || ch === ':' || ch === '<' || ch === '>') {
      if (cur) parts.push({ sep, body: cur });
      else if (parts.length === 0 && sep === '') {
        /* leading separator, e.g. "~F" */
      }
      sep = ch as Part['sep'];
      cur = '';
    } else cur += ch;
  }
  if (cur) parts.push({ sep, body: cur });
  return parts;
}

const STANCE_RE = /^([A-Za-z]{1,6})\.(.*)$/;
const WS_RE = /^(i?ws|wr|hFC|FC|ss|SS)(?=[1-4udfbnUDFB])(.*)$/;

interface ParsedBody {
  dirs: DirReq[] | null;
  buttons: TekkenButton[];
  holdButton: boolean;
  sameFrame: boolean;
  stance: string | null;
  heat: boolean;
  rage: boolean;
}

/** Parse one part body like "H.df+1+2*", "CD.1", "ws3", "DF", "d+3+4". */
export function parseBody(raw: string): ParsedBody | null {
  let body = raw;
  let stance: string | null = null;
  let heat = false;
  let rage = false;
  // Prefix chain: H. / R. / STANCE.
  for (let i = 0; i < 3; i++) {
    const m = STANCE_RE.exec(body);
    if (!m) break;
    const p = m[1];
    if (p === 'H') heat = true;
    else if (p === 'R') rage = true;
    else stance = p;
    body = m[2];
  }
  const ws = WS_RE.exec(body);
  if (ws) {
    stance = ws[1];
    body = ws[2];
  }
  let holdButton = false;
  if (body.endsWith('*')) {
    holdButton = true;
    body = body.slice(0, -1);
  }
  const m = /^([A-Za-z/]+)?([+#])?([1-4](?:[+#][1-4])*)?$/.exec(body);
  if (!m || (!m[1] && !m[3])) return null;
  let dirs: DirReq[] | null = null;
  if (m[1]) {
    dirs = parseDirToken(m[1]);
    if (!dirs) return null;
  }
  const buttons = m[3] ? (m[3].split(/[+#]/).map(Number) as TekkenButton[]) : [];
  const sameFrame = (m[2] === '#') || (m[3]?.includes('#') ?? false);
  return { dirs, buttons: [...new Set(buttons)].sort() as TekkenButton[], holdButton, sameFrame, stance, heat, rage };
}

const MARKER_RE = /(T!|W!|WB!|WH!|F!|FH!|BB!|HB!)$/;

/** Parse a full combo / move notation string into steps. Throws on unparseable input. */
export function parseNotation(notation: string): InputStep[] {
  const steps: InputStep[] = [];
  const tokens = notation
    .replace(/\b([udUD])\/([fbFB])\b/g, '$1$2')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let counterHitNext = false;
  let stanceNext: string | null = null; // bare stance token, e.g. "CJM u/f+3"

  for (const [tokIndex, tokRaw] of tokens.entries()) {
    let rawTok = tokRaw;
    const before = steps.length;
    const tagGroup = () => {
      for (let i = before; i < steps.length; i++) steps[i].group = tokIndex;
    };
    if (rawTok === 'CH' || rawTok === 'CL') {
      counterHitNext = rawTok === 'CH';
      continue;
    }
    let optional = false;
    if (/^\(.*\)$/.test(rawTok) && !/^\(.*\)[,~]/.test(rawTok)) {
      optional = true;
      rawTok = rawTok.slice(1, -1);
    }
    // Inline parentheses like "(b+1,2),2" mean whiffed/blocked hits: still inputs.
    let tok = rawTok.replace(/[()]/g, '');
    const trailingMarkers: string[] = [];
    for (;;) {
      const mm = MARKER_RE.exec(tok);
      if (!mm) break;
      trailingMarkers.unshift(mm[1]);
      tok = tok.slice(0, -mm[1].length);
    }

    const lowerTok = tok.toLowerCase();
    if (/^[A-Z]{2,5}$/.test(tok) && !parseDirToken(tok) && !MOVEMENT_WORDS[lowerTok]) {
      stanceNext = tok;
      continue;
    }
    if (tok && MOVEMENT_WORDS[lowerTok]) {
      steps.push({ ...baseStep(), kind: 'motion', text: tok, motion: MOVEMENT_WORDS[lowerTok], word: lowerTok, optional });
    } else if (tok) {
      const parts = splitParts(tok);
      let pending: DirReq[] = [];
      let pendingText: string[] = [];
      let pendingSep: Part['sep'] = '';
      let firstPressInToken = true;
      let heatCarry = false;
      let stanceCarry: string | null = null;
      const flushMotion = () => {
        if (!pending.length) return;
        steps.push({
          ...baseStep(), kind: 'motion', text: pendingText.join(','), motion: pending,
          immediate: pendingSep === '~', heat: heatCarry, stance: stanceCarry, optional,
        });
        pending = [];
        pendingText = [];
        heatCarry = false;
        stanceCarry = null;
      };
      for (const part of parts) {
        const pb = parseBody(part.body);
        if (!pb) throw new Error(`Cannot parse "${part.body}" in "${notation}"`);
        if (pb.buttons.length === 0) {
          // direction-only part: accumulate into motion
          if (!pending.length) pendingSep = part.sep;
          pending.push(...(pb.dirs ?? []));
          pendingText.push(part.body);
          heatCarry = heatCarry || pb.heat;
          stanceCarry = stanceCarry ?? pb.stance;
          continue;
        }
        const motion = [...pending, ...(pb.dirs ?? [])];
        const sepForStep = pending.length ? pendingSep : part.sep;
        let pressDir: Dir | 'any';
        if (pb.dirs?.length) pressDir = pb.dirs[pb.dirs.length - 1].dir;
        else if (pending.length) pressDir = pending[pending.length - 1].dir;
        else if (firstPressInToken && !pb.stance && !stanceNext && sepForStep === '') pressDir = 'n';
        else pressDir = 'any';
        const text = [...pendingText, part.body].join(',');
        steps.push({
          ...baseStep(),
          kind: 'press',
          text,
          motion,
          pressDir,
          buttons: pb.buttons,
          holdButton: pb.holdButton,
          sameFrame: pb.sameFrame,
          justFrame: part.sep === ':',
          immediate: sepForStep === '~',
          delayed: part.sep === '<' || part.sep === '>',
          stance: pb.stance ?? stanceCarry ?? (firstPressInToken ? stanceNext : null),
          heat: pb.heat || heatCarry,
          rage: pb.rage,
          counterHit: counterHitNext && firstPressInToken,
          optional,
        });
        pending = [];
        pendingText = [];
        heatCarry = false;
        stanceCarry = null;
        firstPressInToken = false;
      }
      flushMotion();
    }
    counterHitNext = false;
    if (tok && steps.length && steps[steps.length - 1].kind === 'press') stanceNext = null;
    for (const m of trailingMarkers) steps.push({ ...baseStep(), kind: 'marker', text: m, marker: m });
    tagGroup();
  }
  return steps;
}

/** Steps a player must physically input (markers excluded). */
export function inputSteps(steps: InputStep[]): InputStep[] {
  return steps.filter((s) => s.kind !== 'marker');
}

/** Human-readable timing/execution hint for a step. */
export function timingHint(step: InputStep): string {
  if (step.kind === 'marker') return markerDescription(step.marker ?? '');
  const hints: string[] = [];
  if (step.word === 'dash') hints.push('Dash: tap forward twice (f, f).');
  else if (step.word === 'run') hints.push('Run: tap forward twice, then keep holding forward.');
  else if (step.word === 'ssr') hints.push('Sidestep right: tap down once.');
  else if (step.word === 'ssl') hints.push('Sidestep left: tap up once.');
  else if (step.word === 'backdash') hints.push('Backdash: tap back twice.');
  if (step.optional) hints.push('Optional / situational step (shown in parentheses on the source).');
  if (step.immediate) hints.push('Input immediately after the previous move (cancel, "~").');
  if (step.justFrame) hints.push('Just-frame (":"): very tight timing window.');
  if (step.delayed) hints.push('Delay this input.');
  if (step.stance === 'ws' || step.stance === 'iws')
    hints.push('While standing: from crouch, release down and press as you rise.');
  if (step.stance === 'FC' || step.stance === 'hFC') hints.push('From full crouch (holding down).');
  if (step.stance && !['ws', 'iws', 'FC', 'hFC', 'wr'].includes(step.stance))
    hints.push(`Performed from the ${step.stance} stance (entered by the previous move).`);
  if (step.motion.length > 1) hints.push(`Motion: ${step.motion.map((m) => (m.hold ? m.dir.toUpperCase() : m.dir)).join(' → ')}${step.kind === 'press' ? ' then press' : ''}.`);
  if (step.motion.some((m) => m.hold)) hints.push('Uppercase direction = hold it.');
  if (step.buttons.length > 1) hints.push(step.sameFrame ? 'Press the buttons on the exact same frame ("#").' : 'Press the buttons together.');
  if (step.holdButton) hints.push('Hold the button(s) ("*").');
  if (step.heat) hints.push('Only available during Heat ("H.").');
  if (step.rage) hints.push('Only available in Rage ("R.").');
  if (step.counterHit) hints.push('Needs a counter hit to combo.');
  if (!hints.length) hints.push(step.kind === 'press' ? 'Press after the previous hit connects.' : 'Directional input.');
  return hints.join(' ');
}

/** Full string notation for a press step, e.g. the "2" in "f+3,2" -> "f+3,2" (for move lookup). */
export function stringNotation(steps: InputStep[], index: number): string {
  const s = steps[index];
  const parts: string[] = [];
  for (let i = 0; i <= index; i++) {
    const x = steps[i];
    if (x.group !== s.group || x.kind !== 'press') continue;
    parts.push(x.text);
  }
  // A motion cancel (~DF) ends the string; the next press starts a new one.
  const lastMotion = steps.slice(0, index).map((x, i) => ({ x, i })).filter(({ x }) => x.group === s.group && x.kind === 'motion').pop();
  if (lastMotion) {
    const after = steps.slice(lastMotion.i + 1, index + 1).filter((x) => x.kind === 'press').map((x) => x.text);
    return after.join(',');
  }
  return parts.join(',');
}
