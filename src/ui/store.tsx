// Global app state: settings, progress, data overrides; loaded from and saved to local storage.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CharacterData, FrameDataFile } from '../types';
import { BUNDLED, buildCharacter, type MoveOverride, type OverrideMap } from '../data';
import {
  addPracticeSeconds, emptyProgress, migrateProgress, migrateSettings, recordAttempt, recordComboAttempt,
  resetProgress, setLessonPart, DEFAULT_SETTINGS, type AttemptRecord, type ProgressData, type Settings,
} from '../core/progress';
import { storage, type StorageInfo } from '../runtime/storage';
import { inputManager } from '../runtime/inputManager';
import { fetchFrameData, diffFrames } from '../runtime/wavu';

interface Store {
  settings: Settings;
  progress: ProgressData;
  overrides: OverrideMap;
  frameCache: Record<string, FrameDataFile>;
  characters: CharacterData[];
  char: CharacterData;
  opponents: CharacterData[];
  storageInfo: StorageInfo | null;
  saveError: string | null;
  updateSettings(patch: Partial<Settings>): void;
  setActiveChar(id: string): void;
  record(a: Omit<AttemptRecord, 'at' | 'char'> & { char?: string }): void;
  recordCombo(a: Omit<AttemptRecord, 'at' | 'char' | 'kind'>): void;
  setLesson(lessonId: string, part: 'guided' | 'challenge', score: number, passed: boolean): void;
  addPractice(seconds: number): void;
  reset(char: string | 'all'): void;
  replaceProgress(p: ProgressData): void;
  setOverride(charId: string, moveId: string, o: MoveOverride | null): void;
  refreshFrames(charId: string): Promise<string>;
  revertFrames(charId: string): void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('Store not ready');
  return s;
}

function useDebouncedSave(key: string, value: unknown, ready: boolean, onError: (e: string | null) => void) {
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      storage.save(key, value).then(() => onError(null), (e) => onError(`Could not save ${key}: ${e?.message ?? e}`));
    }, 400);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [key, value, ready, onError]);
}

export function StoreProvider({ children, fallback, errorView }: { children: ReactNode; fallback: ReactNode; errorView: (e: string) => ReactNode }) {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [progress, setProgress] = useState<ProgressData>(emptyProgress());
  const [overrides, setOverrides] = useState<OverrideMap>({});
  const [frameCache, setFrameCache] = useState<Record<string, FrameDataFile>>({});
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, p, o, f, info] = await Promise.all([
          storage.load('settings'),
          storage.load('progress'),
          storage.load<OverrideMap>('overrides'),
          storage.load<Record<string, FrameDataFile>>('frame-cache'),
          storage.info(),
        ]);
        setSettings(migrateSettings(s));
        setProgress(migrateProgress(p));
        setOverrides(o && typeof o === 'object' ? o : {});
        setFrameCache(f && typeof f === 'object' ? f : {});
        setStorageInfo(info);
        setReady(true);
      } catch (e) {
        setLoadError(`Could not load your local data: ${(e as Error).message}`);
      }
    })();
  }, []);

  useDebouncedSave('settings', settings, ready, setSaveError);
  useDebouncedSave('progress', progress, ready, setSaveError);
  useDebouncedSave('overrides', overrides, ready, setSaveError);
  useDebouncedSave('frame-cache', frameCache, ready, setSaveError);

  useEffect(() => {
    inputManager.setConfig(settings.controller, settings.keyboardEnabled);
  }, [settings.controller, settings.keyboardEnabled]);

  const characters = useMemo(
    () => BUNDLED.map((b) => buildCharacter(frameCache[b.id] ?? b.frames, b.curated, overrides[b.id] ?? {})),
    [frameCache, overrides],
  );
  const char = characters.find((c) => c.profile.id === settings.activeChar) ?? characters[0];
  const opponents = characters; // all loaded characters (including the mirror) feed drills and quizzes

  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const setActiveChar = useCallback((id: string) => setSettings((s) => ({ ...s, activeChar: id })), []);
  const record = useCallback(
    (a: Omit<AttemptRecord, 'at' | 'char'> & { char?: string }) =>
      setProgress((p) => recordAttempt(p, { ...a, char: a.char ?? settings.activeChar, at: new Date().toISOString() })),
    [settings.activeChar],
  );
  const recordCombo = useCallback(
    (a: Omit<AttemptRecord, 'at' | 'char' | 'kind'>) =>
      setProgress((p) => recordComboAttempt(p, { ...a, kind: 'combo', char: settings.activeChar, at: new Date().toISOString() }, settings.comboConsistency)),
    [settings.activeChar, settings.comboConsistency],
  );
  const setLesson = useCallback(
    (lessonId: string, part: 'guided' | 'challenge', score: number, passed: boolean) =>
      setProgress((p) => setLessonPart(p, settings.activeChar, lessonId, part, score, passed, new Date().toISOString())),
    [settings.activeChar],
  );
  const addPractice = useCallback((sec: number) => setProgress((p) => addPracticeSeconds(p, sec)), []);
  const reset = useCallback((c: string | 'all') => setProgress((p) => resetProgress(p, c)), []);
  const replaceProgress = useCallback((p: ProgressData) => setProgress(migrateProgress(p)), []);
  const setOverride = useCallback((charId: string, moveId: string, o: MoveOverride | null) => {
    setOverrides((prev) => {
      const forChar = { ...(prev[charId] ?? {}) };
      if (o) forChar[moveId] = o;
      else delete forChar[moveId];
      return { ...prev, [charId]: forChar };
    });
  }, []);
  const refreshFrames = useCallback(
    async (charId: string) => {
      const b = BUNDLED.find((x) => x.id === charId);
      if (!b) throw new Error('Unknown character');
      const fresh = await fetchFrameData(charId, b.wavuName);
      const current = frameCache[charId] ?? b.frames;
      const d = diffFrames(current, fresh);
      setFrameCache((fc) => ({ ...fc, [charId]: fresh }));
      return `${fresh.moves.length} moves fetched (revision ${fresh.source.revision ?? '?'}): ${d.changed.length} changed, ${d.added.length} added, ${d.removed.length} removed.`;
    },
    [frameCache],
  );
  const revertFrames = useCallback((charId: string) => {
    setFrameCache((fc) => {
      const n = { ...fc };
      delete n[charId];
      return n;
    });
  }, []);

  const value = useMemo<Store>(
    () => ({
      settings, progress, overrides, frameCache, characters, char, opponents, storageInfo, saveError,
      updateSettings, setActiveChar, record, recordCombo, setLesson, addPractice, reset, replaceProgress, setOverride, refreshFrames, revertFrames,
    }),
    [settings, progress, overrides, frameCache, characters, char, opponents, storageInfo, saveError, updateSettings, setActiveChar, record, recordCombo, setLesson, addPractice, reset, replaceProgress, setOverride, refreshFrames, revertFrames],
  );

  if (loadError) return <>{errorView(loadError)}</>;
  if (!ready) return <>{fallback}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
