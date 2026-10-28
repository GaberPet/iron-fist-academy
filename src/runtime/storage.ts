// Persistence: Electron writes JSON files in the user-data folder (atomic, with .bak);
// the browser dev build falls back to localStorage.
export interface StorageInfo {
  kind: 'electron' | 'browser';
  dataDir?: string;
  version?: string;
}

interface IfaApi {
  load(key: string): Promise<unknown>;
  save(key: string, value: unknown): Promise<boolean>;
  info(): Promise<{ dataDir: string; version: string; platform: string }>;
  exportFile(name: string, text: string): Promise<string | null>;
  importFile(): Promise<string | null>;
  openDataFolder(): Promise<string>;
}

declare global {
  interface Window {
    ifaApi?: IfaApi;
  }
}

const api = () => (typeof window !== 'undefined' ? window.ifaApi : undefined);
const LS_PREFIX = 'ironfist:';

// Browser storage consent: when the visitor declines, data lives in memory only and is gone when the tab closes.
let persist = true;
const mem = new Map<string, string>();
export function setPersist(on: boolean) {
  persist = on;
}
export const canPersist = () => persist;
const ls = {
  get: (k: string) => (persist ? localStorage.getItem(k) : (mem.get(k) ?? null)),
  set: (k: string, v: string) => (persist ? localStorage.setItem(k, v) : void mem.set(k, v)),
};

// Player profiles: each player's data lives under its own keys. The first player adopts data saved before profiles existed.
let profile: { id: string; legacy: boolean } | null = null;
export function setProfile(id: string | null, legacy = false) {
  profile = id ? { id, legacy } : null;
}
const scoped = (key: string) => (profile ? `p-${profile.id}-${key}` : key);

async function rawLoad<T>(key: string): Promise<T | null> {
  const a = api();
  if (a) return (await a.load(key)) as T | null;
  const raw = ls.get(LS_PREFIX + key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export const storage = {
  isElectron: () => !!api(),

  async load<T>(key: string): Promise<T | null> {
    const v = await rawLoad<T>(scoped(key));
    return v === null && profile?.legacy ? rawLoad<T>(key) : v;
  },

  /** Unscoped: data shared by every player on this device (the profile list). */
  loadShared: rawLoad,

  async saveShared(key: string, value: unknown): Promise<void> {
    const a = api();
    if (a) {
      await a.save(key, value);
      return;
    }
    ls.set(LS_PREFIX + key, JSON.stringify(value));
  },

  async save(key: string, value: unknown): Promise<void> {
    key = scoped(key);
    const a = api();
    if (a) {
      await a.save(key, value);
      return;
    }
    ls.set(LS_PREFIX + key, JSON.stringify(value));
  },

  async info(): Promise<StorageInfo> {
    const a = api();
    if (a) {
      const i = await a.info();
      return { kind: 'electron', dataDir: i.dataDir, version: i.version };
    }
    return { kind: 'browser' };
  },

  /** Save text to a user-chosen file. Returns the path (Electron) or the download name (browser). */
  async exportText(name: string, text: string): Promise<string | null> {
    const a = api();
    if (a) return a.exportFile(name, text);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return name;
  },

  async importText(): Promise<string | null> {
    const a = api();
    if (a) return a.importFile();
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return resolve(null);
        f.text().then(resolve, () => resolve(null));
      };
      input.click();
    });
  },

  openDataFolder: () => api()?.openDataFolder(),
};
