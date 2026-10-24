// Helpers to script controller input in tests (and the in-app demo playback).
import type { Dir, TekkenButton } from '../types';
import { maskOf } from './input';
import type { Frame } from './recognizer';

export interface ScriptEntry {
  dir?: Dir;
  press?: TekkenButton[];
  frames?: number;
}

/** Expand a compact script into per-frame input. Buttons in `press` are held for the entry's frames. */
export function script(entries: ScriptEntry[], startFrame = 0): Frame[] {
  const out: Frame[] = [];
  let f = startFrame;
  for (const e of entries) {
    const n = e.frames ?? 2;
    for (let i = 0; i < n; i++) out.push({ frame: f++, dir: e.dir ?? 'n', buttons: e.press ? maskOf(e.press) : 0 });
  }
  return out;
}
