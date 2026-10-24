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

export const storage = {
  isElectron: () => !!api(),

  async load<T>(key: string): Promise<T | null> {
    const a = api();
    if (a) return (await a.load(key)) as T | null;
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  },

  async save(key: string, value: unknown): Promise<void> {
    const a = api();
    if (a) {
      await a.save(key, value);
      return;
    }
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
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
