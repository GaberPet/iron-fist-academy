// Polls the Gamepad API + keyboard and publishes a normalized 60 Hz input stream.
import type { Dir } from '../types';
import {
  DEFAULT_CONTROLLER, describeGamepad, pressedPadButtons, readKeyboard, readPad,
  type ControllerConfig, type PadButton, type RawPadState, type TekkenInput,
} from '../core/input';
import type { Frame } from '../core/recognizer';

export interface PadInfo {
  index: number;
  id: string;
  mapping: string;
  label: string;
  kind: ReturnType<typeof describeGamepad>['kind'];
  buttons: number;
  axes: number;
  hasRumble: boolean;
}

export interface InputSnapshot {
  frame: number;
  input: TekkenInput;
  raw: RawPadState | null;
  pressed: PadButton[];
  rawPressed: number[]; // raw button indices currently pressed (for remapping)
  keyboard: boolean; // keyboard contributed this frame
}

type FrameListener = (f: Frame, snap: InputSnapshot) => void;
type StatusListener = (pads: PadInfo[], active: number | null) => void;

const FRAME_MS = 1000 / 60;

class InputManager {
  private cfg: ControllerConfig = DEFAULT_CONTROLLER;
  private keyboardEnabled = true;
  private keys = new Set<string>();
  private frameListeners = new Set<FrameListener>();
  private statusListeners = new Set<StatusListener>();
  private started = false;
  private t0 = 0;
  private lastFrame = -1;
  private pads: PadInfo[] = [];
  private preferred: number | null = null;
  snapshot: InputSnapshot = { frame: 0, input: { dir: 'n', buttons: 0 }, raw: null, pressed: [], rawPressed: [], keyboard: false };
  /** When true, the controller drives a trainer and UI navigation is disabled. */
  capture = 0;
  private navPrev: { dir: Dir; pressed: Set<PadButton> } = { dir: 'n', pressed: new Set() };
  private navRepeatAt = 0;

  start() {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    this.t0 = performance.now();
    window.addEventListener('gamepadconnected', () => this.refreshPads());
    window.addEventListener('gamepaddisconnected', () => this.refreshPads());
    window.addEventListener('keydown', (e) => {
      if (this.isTyping(e)) return;
      if (this.keyboardEnabled && this.capture > 0 && /^(Key[WASDUIJK]|Arrow)/.test(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.refreshPads();
    const loop = () => {
      this.tick();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private isTyping(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  setConfig(cfg: ControllerConfig, keyboardEnabled: boolean) {
    this.cfg = cfg;
    this.keyboardEnabled = keyboardEnabled;
  }

  setPreferredPad(index: number | null) {
    this.preferred = index;
    this.emitStatus();
  }

  private getPads(): (Gamepad | null)[] {
    try {
      return navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    } catch {
      return [];
    }
  }

  refreshPads() {
    this.pads = this.getPads()
      .filter((g): g is Gamepad => !!g && g.connected)
      .map((g) => {
        const d = describeGamepad(g.id);
        return { index: g.index, id: g.id, mapping: g.mapping, label: d.label, kind: d.kind, buttons: g.buttons.length, axes: g.axes.length, hasRumble: !!g.vibrationActuator };
      });
    this.emitStatus();
  }

  get activeIndex(): number | null {
    if (this.preferred !== null && this.pads.some((p) => p.index === this.preferred)) return this.preferred;
    const ps = this.pads.find((p) => p.kind === 'dualsense' || p.kind === 'dualsense-edge');
    return ps?.index ?? this.pads[0]?.index ?? null;
  }

  private emitStatus() {
    for (const l of this.statusListeners) l(this.pads, this.activeIndex);
  }

  private tick() {
    const now = performance.now();
    const frame = Math.floor((now - this.t0) / FRAME_MS);
    if (frame === this.lastFrame) return;
    // Some systems connect pads without firing events until a button is pressed.
    const raw = this.getPads();
    const live = raw.filter((g) => g && g.connected).length;
    if (live !== this.pads.length) this.refreshPads();
    const active = this.activeIndex;
    const g = active !== null ? raw.find((x) => x && x.index === active) ?? null : null;
    const padState: RawPadState | null = g ? { buttons: g.buttons.map((b) => ({ pressed: b.pressed, value: b.value })), axes: [...g.axes] } : null;
    const padInput = padState ? readPad(padState, this.cfg) : { dir: 'n' as Dir, buttons: 0 };
    const kb = this.keyboardEnabled ? readKeyboard(this.keys, this.cfg.p2Side) : { dir: 'n' as Dir, buttons: 0 };
    const input: TekkenInput = { dir: padInput.dir !== 'n' ? padInput.dir : kb.dir, buttons: padInput.buttons | kb.buttons };
    const pressed = padState ? pressedPadButtons(padState, this.cfg) : [];
    const rawPressed = padState ? padState.buttons.map((b, i) => (b.pressed || b.value > 0.5 ? i : -1)).filter((i) => i >= 0) : [];
    this.snapshot = { frame, input, raw: padState, pressed, rawPressed, keyboard: kb.dir !== 'n' || kb.buttons !== 0 };
    // Emit every 60 Hz frame we crossed (catch up a few if the display is slower than 60 Hz).
    const from = this.lastFrame < 0 ? frame : Math.max(this.lastFrame + 1, frame - 4);
    for (let f = from; f <= frame; f++) {
      const fr: Frame = { frame: f, dir: input.dir, buttons: input.buttons };
      for (const l of this.frameListeners) l(fr, this.snapshot);
    }
    this.lastFrame = frame;
    if (this.capture === 0) this.uiNavigate(pressed, now);
    else {
      // While a trainer captures the controller, Options leaves the screen.
      const set = new Set(pressed);
      if (set.has('options') && !this.navPrev.pressed.has('options')) window.history.back();
      this.navPrev = { dir: 'n', pressed: set };
    }
  }

  /** Controller-driven UI navigation when no trainer is capturing input. */
  private uiNavigate(pressed: PadButton[], now: number) {
    const set = new Set(pressed);
    const edge = (b: PadButton) => set.has(b) && !this.navPrev.pressed.has(b);
    const dirs: [PadButton, number][] = [['up', -1], ['left', -1], ['down', 1], ['right', 1]];
    for (const [b, delta] of dirs) {
      const held = set.has(b);
      if (edge(b) || (held && now > this.navRepeatAt)) {
        this.moveFocus(delta);
        this.navRepeatAt = now + (edge(b) ? 380 : 120);
      }
    }
    if (edge('cross')) (document.activeElement as HTMLElement | null)?.click();
    if (edge('circle')) window.history.back();
    this.navPrev = { dir: 'n', pressed: set };
  }

  private moveFocus(delta: number) {
    const els = Array.from(document.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, [tabindex="0"]')).filter((e) => e.offsetParent !== null);
    if (!els.length) return;
    const i = els.indexOf(document.activeElement as HTMLElement);
    const next = els[(i + delta + els.length) % els.length] ?? els[0];
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }

  onFrame(l: FrameListener): () => void {
    this.frameListeners.add(l);
    return () => {
      this.frameListeners.delete(l);
    };
  }

  onStatus(l: StatusListener): () => void {
    this.statusListeners.add(l);
    l(this.pads, this.activeIndex);
    return () => {
      this.statusListeners.delete(l);
    };
  }

  get padList() {
    return this.pads;
  }

  /** Short rumble if the controller and browser support it. Errors are ignored. */
  rumble(ms = 80, strong = 0.6) {
    const idx = this.activeIndex;
    if (idx === null) return;
    const g = this.getPads().find((x) => x && x.index === idx);
    const act = g?.vibrationActuator as { playEffect?: (t: string, p: object) => Promise<unknown> } | undefined;
    act?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: strong / 2 }).catch(() => undefined);
  }
}

export const inputManager = new InputManager();
