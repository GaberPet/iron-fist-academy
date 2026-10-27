// Loads the generated roster data (public/data, refreshed nightly from Wavu Wiki by GitHub Actions).
//
// Web: data is served next to the app, so every redeploy is picked up automatically.
// Desktop (Electron): the app ships a copy, and on start checks the published website for a newer
// data set with the same schema. Offline, or if the site is unreachable, the bundled copy is used.
import type { CharacterFile, Manifest, ManifestEntry } from '../types';

export const DATA_SCHEMA = 1;
export const REMOTE_DATA_BASE = 'https://gaberpet.github.io/iron-fist-academy/data/';

export interface DataLocation {
  manifest: Manifest;
  base: string;
  origin: 'bundled' | 'remote';
}

const isElectron = () => typeof window !== 'undefined' && !!window.ifaApi;

function localBase(): string {
  return new URL('data/', document.baseURI).href;
}

async function fetchJson<T>(url: string, timeoutMs = 20000): Promise<T> {
  const res = await fetch(url, { cache: 'no-cache', signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
  return res.json() as Promise<T>;
}

function usable(m: Manifest | null): m is Manifest {
  return !!m && m.schema === DATA_SCHEMA && Array.isArray(m.characters) && m.characters.length > 0;
}

/** Find the freshest usable data set. */
export async function locateData(): Promise<DataLocation> {
  let local: Manifest | null = null;
  let localError: unknown = null;
  try {
    local = await fetchJson<Manifest>(`${localBase()}manifest.json`);
  } catch (e) {
    localError = e;
  }
  if (isElectron()) {
    try {
      const remote = await fetchJson<Manifest>(`${REMOTE_DATA_BASE}manifest.json`, 6000);
      if (usable(remote) && (!usable(local) || remote.generatedAt > local.generatedAt)) {
        return { manifest: remote, base: REMOTE_DATA_BASE, origin: 'remote' };
      }
    } catch {
      /* offline or site not published yet: use the bundled data */
    }
  }
  if (!usable(local)) {
    const found = local as Manifest | null;
    throw new Error(found ? `This app version can't read data schema ${found.schema}. Please update the app.` : `Could not load character data (${(localError as Error)?.message ?? 'unknown error'}).`);
  }
  return { manifest: local, base: localBase(), origin: 'bundled' };
}

/** Load one character file; the hash in the URL busts caches whenever the data changes. */
export async function loadCharacterFile(loc: DataLocation, entry: ManifestEntry): Promise<CharacterFile> {
  const f = await fetchJson<CharacterFile>(`${loc.base}${entry.file}?v=${entry.hash}`);
  if (f.schema !== DATA_SCHEMA || f.id !== entry.id) throw new Error(`Unexpected data file for ${entry.name}`);
  return f;
}

/** Re-check for newer data (used periodically while the app is open). Returns null if nothing changed. */
export async function checkForUpdate(current: DataLocation): Promise<DataLocation | null> {
  const next = await locateData();
  return next.manifest.generatedAt > current.manifest.generatedAt ? next : null;
}
