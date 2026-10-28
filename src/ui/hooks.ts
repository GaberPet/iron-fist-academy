import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { inputManager, type InputSnapshot, type PadInfo } from '../runtime/inputManager';
import type { Frame } from '../core/recognizer';
import { useStore } from './store';

// ---------- routing (hash based, so the controller's Circle button can go "back") ----------
function subscribeHash(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}
export function useRoute(): string[] {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash);
  const path = hash.replace(/^#\/?/, '');
  return path ? path.split('/').map(decodeURIComponent) : ['home'];
}
export function navigate(...parts: string[]) {
  window.location.hash = '/' + parts.map(encodeURIComponent).join('/');
}

/** True on mouse / trackpad devices: only there is autofocus welcome (no surprise keyboard on phones). */
export const finePointer = () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;

/** href for an in-app route (real links: keyboard, Cmd/Ctrl+click, middle-click). */
export const hrefTo = (...parts: string[]) => '#/' + parts.map(encodeURIComponent).join('/');

/** Mouse clicks anywhere on a row follow its link; the link itself handles keyboard and new-tab clicks. */
export function rowClick(...parts: string[]) {
  return (e: { target: EventTarget | null }) => {
    if (e.target instanceof Element && e.target.closest('a, button, input, select')) return;
    navigate(...parts);
  };
}

// ---------- input ----------
/** Subscribe to the 60 Hz input stream. The callback is kept fresh without resubscribing. */
export function useInputFrames(cb: (f: Frame, snap: InputSnapshot) => void, active = true) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!active) return;
    return inputManager.onFrame((f, s) => ref.current(f, s));
  }, [active]);
}

/** While mounted (and active), the controller drives the trainer instead of UI navigation. */
export function useCaptureInput(active = true) {
  useEffect(() => {
    if (!active) return;
    inputManager.capture++;
    return () => {
      inputManager.capture--;
    };
  }, [active]);
}

export function useControllerStatus(): { pads: PadInfo[]; active: number | null } {
  const [st, setSt] = useState<{ pads: PadInfo[]; active: number | null }>({ pads: [], active: null });
  useEffect(() => inputManager.onStatus((pads, active) => setSt({ pads: [...pads], active })), []);
  return st;
}

/** Re-render at most `fps` times a second with the latest input snapshot. */
export function useSnapshot(fps = 30): InputSnapshot {
  const [snap, setSnap] = useState(inputManager.snapshot);
  const last = useRef(0);
  useInputFrames((_f, s) => {
    const now = performance.now();
    if (now - last.current >= 1000 / fps) {
      last.current = now;
      setSnap(s);
    }
  });
  return snap;
}

/** Counts active practice time (window focused) into the progress store. */
export function usePracticeTimer(active = true) {
  const { addPractice } = useStore();
  useEffect(() => {
    if (!active) return;
    let acc = 0;
    const id = window.setInterval(() => {
      if (document.hasFocus()) acc += 5;
      if (acc >= 15) {
        addPractice(acc);
        acc = 0;
      }
    }, 5000);
    return () => {
      window.clearInterval(id);
      if (acc) addPractice(acc);
    };
  }, [active, addPractice]);
}
