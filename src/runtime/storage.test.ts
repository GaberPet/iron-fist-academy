import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setPersist, setProfile, storage } from './storage';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) });

describe('player profiles in storage', () => {
  beforeEach(() => { mem.clear(); setProfile(null); setPersist(true); });

  it('keeps each player apart and lets the first player adopt older data', async () => {
    await storage.save('progress', { old: true });
    setProfile('a', true);
    expect(await storage.load('progress')).toEqual({ old: true });
    await storage.save('progress', { a: 1 });
    setProfile('b');
    expect(await storage.load('progress')).toBeNull();
    setProfile('a', true);
    expect(await storage.load('progress')).toEqual({ a: 1 });
  });

  it('writes nothing to the browser when saving is declined', async () => {
    setPersist(false);
    await storage.save('progress', { x: 1 });
    expect(await storage.load('progress')).toEqual({ x: 1 });
    expect(mem.size).toBe(0);
  });
});
