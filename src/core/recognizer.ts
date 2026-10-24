// Input recognition: checks a stream of 60 Hz Tekken input frames against parsed notation steps.
//
// What this CAN verify: the order of inputs, buttons, direction at the press, motion inputs
// (qcf, f,n,d,df, dash...), simultaneous presses, rough gaps between steps.
// What it CANNOT verify: whether the hit actually connects in Tekken 8 (link windows,
// hitboxes, character-specific juggles). The app always states this to the user.
import type { Dir } from '../types';
import { isDownish, type InputStep } from './notation';
import { buttonsOf, maskOf, type TekkenInput } from './input';

export interface Frame extends TekkenInput {
  frame: number;
}

export interface DirSegment {
  dir: Dir;
  start: number;
  end: number; // inclusive
}

export interface RecognizerOptions {
  /** Frames allowed between the first and last button of a "1+2" press. */
  simulWindow: number;
  /** Max frames a whole motion input (e.g. f,n,d,df) may take. */
  motionWindow: number;
  /** Max frames between completing one step and pressing the next (0 = unlimited). */
  maxGap: number;
  /** Frames a held direction (uppercase, e.g. ~DF) must be held. */
  holdFrames: number;
  /** Frames after leaving crouch in which a "ws" move is still accepted. */
  wsWindow: number;
}

export const DEFAULT_OPTIONS: RecognizerOptions = {
  simulWindow: 3,
  motionWindow: 24,
  maxGap: 90,
  holdFrames: 3,
  wsWindow: 14,
};

export type InputErrorType =
  | 'wrong-button'
  | 'wrong-direction'
  | 'missing-motion'
  | 'not-simultaneous'
  | 'missing-crouch'
  | 'too-slow';

export const ERROR_TEXT: Record<InputErrorType, string> = {
  'wrong-button': 'Wrong button',
  'wrong-direction': 'Wrong direction held at the press',
  'missing-motion': 'Motion input missing or out of order',
  'not-simultaneous': 'Buttons not pressed together',
  'missing-crouch': 'Needed a crouch / while-standing input',
  'too-slow': 'Too slow before the next input',
};

export interface PressGroup {
  start: number;
  mask: number;
  dirAtStart: Dir;
}

/** Ring buffer of input frames with derived direction segments. */
export class InputHistory {
  frames: Frame[] = [];
  constructor(private capacity = 240) {}

  push(f: Frame) {
    this.frames.push(f);
    if (this.frames.length > this.capacity) this.frames.splice(0, this.frames.length - this.capacity);
  }

  get last(): Frame | undefined {
    return this.frames[this.frames.length - 1];
  }

  prev(n = 1): Frame | undefined {
    return this.frames[this.frames.length - 1 - n];
  }

  /** Newly pressed buttons on the last frame. */
  newPresses(): number {
    const cur = this.last;
    if (!cur) return 0;
    const before = this.prev()?.buttons ?? 0;
    return cur.buttons & ~before;
  }

  /** Collapsed direction runs from `fromFrame` up to the last frame. */
  segments(fromFrame = -Infinity): DirSegment[] {
    const segs: DirSegment[] = [];
    for (const f of this.frames) {
      if (f.frame < fromFrame) continue;
      const s = segs[segs.length - 1];
      if (s && s.dir === f.dir) s.end = f.frame;
      else segs.push({ dir: f.dir, start: f.frame, end: f.frame });
    }
    return segs;
  }

  dirAt(frame: number): Dir {
    for (let i = this.frames.length - 1; i >= 0; i--) if (this.frames[i].frame <= frame) return this.frames[i].dir;
    return 'n';
  }

  clear() {
    this.frames = [];
  }
}

/**
 * Does `required` (ordered) appear as a subsequence of the direction segments, ending on the
 * current segment? Extra directions in between are tolerated (players rarely move perfectly).
 */
export function matchMotion(required: Dir[], segs: DirSegment[]): boolean {
  if (!required.length) return true;
  if (!segs.length) return false;
  const lastSeg = segs[segs.length - 1];
  if (lastSeg.dir !== required[required.length - 1]) return false;
  let ri = required.length - 2;
  for (let si = segs.length - 2; si >= 0 && ri >= 0; si--) {
    if (segs[si].dir === required[ri]) ri--;
  }
  return ri < 0;
}

export type PressCheck = { ok: true } | { ok: false; error: InputErrorType; detail: string };

/** Check one press group against a press step, using the input history for motion/stance context. */
export function checkPress(step: InputStep, group: PressGroup, history: InputHistory, opts: RecognizerOptions): PressCheck {
  const required = maskOf(step.buttons);
  if (group.mask !== required) {
    const overlap = group.mask & required;
    if (overlap && overlap !== required && (group.mask & ~required) === 0) {
      return { ok: false, error: 'not-simultaneous', detail: `Pressed ${buttonsOf(group.mask).join('+')}, needed ${step.buttons.join('+')} together` };
    }
    return { ok: false, error: 'wrong-button', detail: `Pressed ${buttonsOf(group.mask).join('+') || 'nothing'}, needed ${step.buttons.join('+')}` };
  }
  const pressFrame = group.start;
  const dirNow = history.dirAt(pressFrame + Math.max(0, opts.simulWindow - 1));
  const dirStart = group.dirAtStart;
  const segs = history.segments(pressFrame - opts.motionWindow);
  // trim segments after the press
  const segsAtPress = segs.filter((s) => s.start <= pressFrame).map((s) => ({ ...s, end: Math.min(s.end, pressFrame) }));

  const st = step.stance;
  if (st === 'ws' || st === 'iws') {
    const recentCrouch = segsAtPress.some((s) => isDownish(s.dir) && pressFrame - s.end <= opts.wsWindow);
    if (!recentCrouch) return { ok: false, error: 'missing-crouch', detail: 'Crouch first, then press while rising' };
    if (isDownish(dirStart) && step.pressDir === 'any') {
      return { ok: false, error: 'missing-crouch', detail: 'Release down before pressing (still crouching)' };
    }
  }
  if ((st === 'FC' || st === 'hFC') && step.pressDir === 'any' && !isDownish(dirStart)) {
    return { ok: false, error: 'missing-crouch', detail: 'Hold down (full crouch) while pressing' };
  }
  if ((st === 'SS' || st === 'ss') && !segsAtPress.some((s) => s.dir === 'u' || s.dir === 'd')) {
    return { ok: false, error: 'missing-motion', detail: 'Sidestep (tap up or down) before pressing' };
  }

  if (step.pressDir !== 'any' && dirStart !== step.pressDir && dirNow !== step.pressDir) {
    return { ok: false, error: 'wrong-direction', detail: `Held ${dirStart}, needed ${step.pressDir}` };
  }
  if (step.motion.length > 1) {
    const req = step.motion.map((m) => m.dir);
    const usedDir = dirStart === step.pressDir ? dirStart : dirNow;
    const trimmed = segsAtPress.slice();
    if (trimmed.length && trimmed[trimmed.length - 1].dir !== usedDir) trimmed.push({ dir: usedDir, start: pressFrame, end: pressFrame });
    if (!matchMotion(req, trimmed)) {
      return { ok: false, error: 'missing-motion', detail: `Motion ${req.join(',')} not found in the last ${opts.motionWindow} frames` };
    }
  }
  return { ok: true };
}

/** Is a motion-only step (dash, ~DF, ssr...) satisfied by the recent directions? */
export function checkMotionStep(step: InputStep, history: InputHistory, sinceFrame: number, opts: RecognizerOptions): boolean {
  const segs = history.segments(Math.max(sinceFrame, (history.last?.frame ?? 0) - opts.motionWindow));
  const req = step.motion.map((m) => m.dir);
  if (!segs.length) return false;
  // Find the requirement as an ordered subsequence ending anywhere (not necessarily current).
  let ri = 0;
  let lastMatched: DirSegment | null = null;
  for (const s of segs) {
    if (ri < req.length && s.dir === req[ri]) {
      ri++;
      lastMatched = s;
    }
  }
  if (ri < req.length || !lastMatched) return false;
  const finalReq = step.motion[step.motion.length - 1];
  if (finalReq.hold) {
    const held = lastMatched.end - lastMatched.start + 1;
    const stillHolding = history.last?.dir === finalReq.dir;
    return held >= opts.holdFrames || (stillHolding && held >= 1 && step.immediate);
  }
  return true;
}

export type RecognizerEvent =
  | { type: 'step'; index: number; frame: number }
  | { type: 'complete'; frame: number; durationFrames: number }
  | { type: 'fail'; index: number; frame: number; error: InputErrorType; detail: string };

/**
 * Tracks progress through a sequence of steps. Feed it one frame at a time with `push`.
 * Marker steps (T!, W!) are skipped automatically. Optional steps may be skipped.
 */
export class SequenceRecognizer {
  readonly steps: InputStep[];
  index = 0;
  history = new InputHistory();
  private group: PressGroup | null = null;
  private lastStepFrame = -1;
  private startFrame = -1;
  done = false;

  constructor(steps: InputStep[], public opts: RecognizerOptions = DEFAULT_OPTIONS) {
    this.steps = steps;
    this.skipMarkers();
  }

  reset() {
    this.primed = false;
    this.history.clear();
    this.index = 0;
    this.group = null;
    this.lastStepFrame = -1;
    this.startFrame = -1;
    this.done = false;
    this.skipMarkers();
  }

  private skipMarkers() {
    while (this.index < this.steps.length && this.steps[this.index].kind === 'marker') this.index++;
    if (this.index >= this.steps.length) this.done = true;
  }

  private advance(frame: number, events: RecognizerEvent[]) {
    events.push({ type: 'step', index: this.index, frame });
    if (this.startFrame < 0) this.startFrame = frame;
    this.lastStepFrame = frame;
    this.index++;
    this.skipMarkers();
    if (this.done) events.push({ type: 'complete', frame, durationFrames: frame - this.startFrame });
  }

  private fail(error: InputErrorType, detail: string, frame: number, events: RecognizerEvent[]) {
    events.push({ type: 'fail', index: this.index, frame, error, detail });
    this.done = true;
  }

  /** Steps that a press could legally satisfy now: current, or the next one if current is optional/motion. */
  private candidates(dirAtPress: Dir): number[] {
    const out: number[] = [];
    for (let i = this.index; i < this.steps.length; i++) {
      const s = this.steps[i];
      if (s.kind === 'marker') continue;
      out.push(i);
      if (s.optional) continue;
      // A held-direction cancel (e.g. "~DF" then "CD.1") counts if the direction is held at the press.
      const finalDir = s.motion[s.motion.length - 1];
      if (s.kind === 'motion' && finalDir?.hold && finalDir.dir === dirAtPress) continue;
      break;
    }
    return out;
  }

  /** Seed the history with the current controller state so held buttons don't count as new presses. */
  prime(input: Frame) {
    this.history.push(input);
    this.primed = true;
  }

  primed = false;

  push(input: Frame): RecognizerEvent[] {
    const events: RecognizerEvent[] = [];
    if (!this.primed) {
      this.primed = true;
      if (input.buttons) {
        // Buttons already held when the attempt started are ignored until released.
        this.history.push(input);
        return events;
      }
    }
    this.history.push(input);
    if (this.done) return events;
    const f = input.frame;

    if (this.lastStepFrame >= 0 && this.opts.maxGap > 0 && f - this.lastStepFrame > this.opts.maxGap && !this.group) {
      this.fail('too-slow', `More than ${this.opts.maxGap} frames (${(this.opts.maxGap / 60).toFixed(1)}s) before the next input`, f, events);
      return events;
    }

    // Motion-only steps complete as soon as their directions are seen.
    const cur = this.steps[this.index];
    if (cur && cur.kind === 'motion' && checkMotionStep(cur, this.history, this.lastStepFrame < 0 ? -Infinity : this.lastStepFrame, this.opts)) {
      this.advance(f, events);
      if (this.done) return events;
    }

    const fresh = this.history.newPresses();
    if (fresh) {
      if (!this.group) this.group = { start: f, mask: fresh, dirAtStart: input.dir };
      else this.group.mask |= fresh;
    }
    if (!this.group) return events;

    // Evaluate the press group once it is complete or the simultaneity window elapsed.
    const cands = this.candidates(this.group.dirAtStart);
    const target = cands.map((i) => this.steps[i]).find((s) => s.kind === 'press');
    const required = target ? maskOf(target.buttons) : 0;
    const windowOver = f - this.group.start >= this.opts.simulWindow - 1;
    const complete = (this.group.mask & required) === required && required !== 0;
    if (!windowOver && !(complete && this.group.mask === required)) return events;

    const group = this.group;
    this.group = null;
    let firstError: PressCheck | null = null;
    for (const i of cands) {
      const s = this.steps[i];
      if (s.kind !== 'press') continue;
      const res = checkPress(s, group, this.history, this.opts);
      if (res.ok) {
        // Skipped optional / motion steps before this one are considered done.
        while (this.index < i) this.advance(group.start, events);
        this.advance(group.start, events);
        return events;
      }
      if (!firstError) firstError = res;
    }
    if (firstError && !firstError.ok) this.fail(firstError.error, firstError.detail, f, events);
    else if (!firstError) {
      const m = this.steps[this.index];
      this.fail('missing-motion', `Expected ${m?.text ?? 'a directional input'} before pressing a button`, f, events);
    }
    return events;
  }
}
