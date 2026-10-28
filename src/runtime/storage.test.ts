import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setProfile, storage } from './storage';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) });

describe('player profiles in storage', () => {
  beforeEach(() => { mem.clear(); setProfile(null); });

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
});
