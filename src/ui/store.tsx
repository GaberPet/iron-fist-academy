// Global app state: settings, progress, data overrides (local storage) + roster data (loaded on demand).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Changelog, CharacterData, CharacterFile, ManifestEntry } from '../types';
import { CURATED, buildCharacter, type MoveOverride, type OverrideMap } from '../data';
import {
  addPracticeSeconds, emptyProgress, migrateProgress, migrateSettings, recordAttempt, recordComboAttempt,
  resetProgress, setLessonPart, DEFAULT_SETTINGS, type AttemptRecord, type ProgressData, type Settings,
} from '../core/progress';
import { storage, type StorageInfo } from '../runtime/storage';
import { inputManager } from '../runtime/inputManager';
import { checkForUpdate, loadChangelog, loadCharacterFile, locateData, type DataLocation } from '../runtime/dataService';
import { fmtDate } from './format';
import { pull, push } from '../runtime/sync';
import { mergeProgress } from '../core/transfer';
import { currentPlayer } from './LoginGate';

export interface SyncState { state: 'off' | 'syncing' | 'ok' | 'error'; at?: string; error?: string }

const UPDATE_CHECK_MS = 6 * 60 * 60 * 1000;

interface Store {
  settings: Settings;
  progress: ProgressData;
  overrides: OverrideMap;
  /** Every character in the data set (loaded or not). */
  roster: ManifestEntry[];
  data: DataLocation;
  changelog: Changelog | null;
  /** Characters whose data is loaded. */
  characters: CharacterData[];
  char: CharacterData;
  opponents: CharacterData[];
  loadingIds: string[];
  storageInfo: StorageInfo | null;
  saveError: string | null;
  dataNotice: string | null;
  isCurated(id: string): boolean;
  ensureLoaded(ids: string[]): Promise<void>;
  checkForDataUpdate(): Promise<string>;
  dismissDataNotice(): void;
  updateSettings(patch: Partial<Settings>): void;
  setActiveChar(id: string): void;
  record(a: Omit<AttemptRecord, 'at' | 'char'> & { char?: string }): void;
  recordCombo(a: Omit<AttemptRecord, 'at' | 'char' | 'kind'>): void;
  setLesson(lessonId: string, part: 'guided' | 'challenge', score: number, passed: boolean): void;
  addPractice(seconds: number): void;
  reset(char: string | 'all'): void;
  replaceProgress(p: ProgressData): void;
  sync: SyncState;
  syncNow(): Promise<void>;
  setOverride(charId: string, moveId: string, o: MoveOverride | null): void;
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
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [data, setData] = useState<DataLocation | null>(null);
  const [files, setFiles] = useState<Record<string, CharacterFile>>({});
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [dataNotice, setDataNotice] = useState<string | null>(null);
  const [changelog, setChangelog] = useState<Changelog | null>(null);
  const inflight = useRef(new Map<string, Promise<void>>());
  const lastCheck = useRef(0);

  const loadInto = useCallback(async (loc: DataLocation, ids: string[]) => {
    const todo = ids.filter((id) => loc.manifest.characters.some((c) => c.id === id));
    await Promise.all(
      todo.map((id) => {
        const key = `${loc.manifest.generatedAt}:${id}`;
        const existing = inflight.current.get(key);
        if (existing) return existing;
        const entry = loc.manifest.characters.find((c) => c.id === id)!;
        setLoadingIds((l) => [...new Set([...l, id])]);
        const p = loadCharacterFile(loc, entry)
          .then((f) => setFiles((fs) => ({ ...fs, [id]: f })))
          .finally(() => setLoadingIds((l) => l.filter((x) => x !== id)));
        inflight.current.set(key, p);
        return p;
      }),
    );
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [s, p, o, info, loc] = await Promise.all([
          storage.load('settings'),
          storage.load('progress'),
          storage.load<OverrideMap>('overrides'),
          storage.info(),
          locateData(),
        ]);
        const st = migrateSettings(s);
        // The favourite is where every tab starts after sign-in; switching later lasts for the session.
        if (loc.manifest.characters.some((c) => c.id === st.favoriteChar)) st.activeChar = st.favoriteChar;
        if (!loc.manifest.characters.some((c) => c.id === st.activeChar)) st.activeChar = loc.manifest.characters.find((c) => c.id === 'anna')?.id ?? loc.manifest.characters[0].id;
        setSettings(st);
        setProgress(migrateProgress(p));
        setOverrides(o && typeof o === 'object' ? o : {});
        setStorageInfo(info);
        setData(loc);
        loadChangelog(loc).then(setChangelog);
        lastCheck.current = Date.now();
        await loadInto(loc, [st.activeChar]);
        setReady(true);
      } catch (e) {
        setLoadError(`Could not start: ${(e as Error).message}`);
      }
    })();
  }, [loadInto]);

  useDebouncedSave('settings', settings, ready, setSaveError);
  useDebouncedSave('progress', progress, ready, setSaveError);
  useDebouncedSave('overrides', overrides, ready, setSaveError);

  // Live sync (optional): pull the other devices' progress, merge it in, push the result back.
  // Resets carry a timestamp, so a reset on one device clears the older progress on all of them.
  const [sync, setSync] = useState<SyncState>({ state: 'off' });
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const syncNow = useCallback(async () => {
    const code = settings.syncCode;
    if (!code) return setSync({ state: 'off' });
    setSync((s) => ({ ...s, state: 'syncing' }));
    try {
      const remote = await pull(code);
      const mine = progressRef.current;
      const merged = remote ? mergeProgress(mine, migrateProgress(remote.data)) : mine;
      if (JSON.stringify(merged) !== JSON.stringify(mine)) setProgress(merged);
      if (!remote || JSON.stringify(merged) !== JSON.stringify(migrateProgress(remote.data))) await push(code, currentPlayer()?.name ?? '', merged);
      setSync({ state: 'ok', at: new Date().toISOString() });
    } catch (e) {
      setSync({ state: 'error', error: (e as Error).message });
    }
  }, [settings.syncCode]);
  useEffect(() => {
    if (!ready || !settings.syncCode) return void setSync({ state: 'off' });
    syncNow();
    const id = window.setInterval(syncNow, 30000);
    const onFocus = () => document.visibilityState === 'visible' && syncNow();
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [ready, settings.syncCode, syncNow]);
  useEffect(() => {
    if (!ready || !settings.syncCode) return;
    const id = window.setTimeout(syncNow, 4000); // new progress reaches the other devices within seconds
    return () => window.clearTimeout(id);
  }, [progress]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    inputManager.setConfig(settings.controller, settings.keyboardEnabled);
  }, [settings.controller, settings.keyboardEnabled]);

  const characters = useMemo(
    () => Object.values(files).map((f) => buildCharacter(f, CURATED[f.id], overrides[f.id] ?? {})).sort((a, b) => a.profile.name.localeCompare(b.profile.name)),
    [files, overrides],
  );
  const char = characters.find((c) => c.profile.id === settings.activeChar) ?? characters[0];

  const ensureLoaded = useCallback(async (ids: string[]) => {
    if (data) await loadInto(data, ids.filter((id) => !files[id]));
  }, [data, files, loadInto]);

  const applyUpdate = useCallback(async (next: DataLocation) => {
    const prev = data;
    setData(next);
    loadChangelog(next).then(setChangelog);
    const changed = Object.keys(files).filter((id) => next.manifest.characters.find((c) => c.id === id)?.hash !== prev?.manifest.characters.find((c) => c.id === id)?.hash);
    await loadInto(next, changed);
    const added = next.manifest.characters.length - (prev?.manifest.characters.length ?? 0);
    return `Character data updated (${fmtDate(next.manifest.generatedAt)})${changed.length ? `: ${changed.length} loaded character(s) refreshed` : ''}${added > 0 ? `, ${added} new character(s)` : ''}.`;
  }, [data, files, loadInto]);

  const checkForDataUpdate = useCallback(async () => {
    if (!data) return 'Data not loaded yet.';
    lastCheck.current = Date.now();
    const next = await checkForUpdate(data);
    if (!next) return `Up to date (data from ${fmtDate(data.manifest.generatedAt)}).`;
    const msg = await applyUpdate(next);
    setDataNotice(msg);
    return msg;
  }, [data, applyUpdate]);

  // Re-check for new data when the app regains focus, at most every few hours.
  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastCheck.current > UPDATE_CHECK_MS) checkForDataUpdate().catch(() => undefined);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [checkForDataUpdate]);

  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const setActiveChar = useCallback(
    (id: string) => {
      // Switch once the character's data is loaded, so pages never render without it.
      ensureLoaded([id]).then(() => setSettings((s) => ({ ...s, activeChar: id })), (e) => setDataNotice(`Could not load ${id}: ${(e as Error).message}`));
    },
    [ensureLoaded],
  );
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
  const isCurated = useCallback((id: string) => !!CURATED[id], []);
  const dismissDataNotice = useCallback(() => setDataNotice(null), []);

  const value = useMemo<Store | null>(
    () =>
      data && char
        ? {
            settings, progress, overrides, roster: data.manifest.characters, data, changelog, characters, char, opponents: characters, loadingIds,
            storageInfo, saveError, dataNotice, isCurated, ensureLoaded, checkForDataUpdate, dismissDataNotice,
            updateSettings, setActiveChar, record, recordCombo, setLesson, addPractice, reset, replaceProgress, setOverride, sync, syncNow,
          }
        : null,
    [settings, progress, overrides, data, changelog, characters, char, loadingIds, storageInfo, saveError, dataNotice, isCurated, ensureLoaded, checkForDataUpdate, dismissDataNotice, updateSettings, setActiveChar, record, recordCombo, setLesson, addPractice, reset, replaceProgress, setOverride, sync, syncNow],
  );

  if (loadError) return <>{errorView(loadError)}</>;
  if (!ready || !value) return <>{fallback}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
