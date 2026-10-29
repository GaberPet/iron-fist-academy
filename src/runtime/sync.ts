// Optional live sync of one player's progress through Supabase (see supabase/sync.sql).
// The publishable key is meant to be public; the table is only reachable through two functions
// that need the player's private sync code.
const API = 'https://glqxyghdcindimggnwml.supabase.co/rest/v1/rpc/';
const KEY = 'sb_publishable_OatiT521MtUNk6gLQIa0yQ_67echjry';
export const SYNC_ORIGIN = 'https://glqxyghdcindimggnwml.supabase.co';

async function rpc<T>(fn: string, body: unknown): Promise<T> {
  const r = await fetch(API + fn, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(r.status === 404 ? 'This is not set up on the server yet.' : `Sync server error ${r.status}`);
  return r.json() as Promise<T>;
}

export interface Remote { player: string; data: unknown; updated_at: string }

export const pull = async (code: string): Promise<Remote | null> => (await rpc<Remote[]>('sync_pull', { p_code: code }))[0] ?? null;
export const push = (code: string, player: string, data: unknown) => rpc<string>('sync_push', { p_code: code, p_player: player, p_data: data });

// 26 characters from a 32-letter alphabet without look-alikes (0/O, 1/I): 130 random bits.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(26)), (b) => ALPHABET[b % 32]).join('');
}
/** Accepts what people type: lower case, spaces and dashes are fine. Returns null if it can't be a code. */
export function cleanCode(s: string): string | null {
  const c = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 26 && [...c].every((ch) => ALPHABET.includes(ch)) ? c : null;
}
export const showCode = (c: string) => c.match(/.{1,4}/g)!.join('-');

// Optional public leaderboard (supabase/leaderboard.sql): only a display name and points are public.
export interface BoardRow { name: string; points: number; updated_at: string }
export const boardSubmit = (key: string, name: string, points: number) => rpc<null>('board_submit', { p_key: key, p_name: name, p_points: points });
export const boardTop = () => rpc<BoardRow[]>('board_top', {});
export const boardPlace = async (key: string) => (await rpc<{ place: number; players: number }[]>('board_place', { p_key: key }))[0] ?? null;
export const boardLeave = (key: string) => rpc<null>('board_leave', { p_key: key });
/** With sync on, every device of a player shares one leaderboard entry: the key is derived from the sync code. */
export async function boardKeyFor(syncCode: string): Promise<string> {
  if (!syncCode) return newCode();
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`board:${syncCode}`)));
  return Array.from(h.slice(0, 26), (b) => ALPHABET[b % 32]).join('');
}
