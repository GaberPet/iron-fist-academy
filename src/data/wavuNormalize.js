// Normalizes raw Wavu Wiki Cargo "Move" rows into the app's Move shape.
// Plain JS (with JSDoc) so the Node import script and the app share it.

const ENTITIES = { '&#039;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>', '&amp;': '&', '&ndash;': '–', '&nbsp;': ' ' };

/** @param {unknown} s */
export function cleanText(s) {
  if (s === null || s === undefined || s === 'None') return '';
  let t = String(s);
  for (const [k, v] of Object.entries(ENTITIES)) t = t.split(k).join(v);
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/​/g, '');
  t = t.replace(/\{\{\s*\w+\s*\|?/g, '').replace(/\}\}/g, '');
  t = t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');
  t = t
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s*/, '').trim())
    .filter(Boolean)
    .join(', ');
  return t.replace(/\s+/g, ' ').replace(/^,\s*/, '').trim();
}

/** First signed integer in a frame string like "-14~+35", "+1c", "+27a (+17)". */
export function parseFrame(s) {
  const m = /([+-]?\d+)/.exec(s || '');
  return m ? Number(m[1]) : null;
}

/** Range of a frame string "-14~+35" -> [-14, 35]; "+5" -> [5, 5]. */
export function parseFrameRange(s) {
  const m = /^\s*([+-]?\d+)[a-z]*\s*(?:~\s*([+-]?\d+))?/i.exec(s || '');
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] !== undefined ? Number(m[2]) : a;
  return [Math.min(a, b), Math.max(a, b)];
}

/** "i15~16" -> 15; "16" -> 16; ",i23~72 i36~85" -> 23 */
export function parseStartup(s) {
  const m = /i?(\d+)/.exec(s || '');
  return m ? Number(m[1]) : null;
}

/** Hit levels of the final hit(s) of this move: "m,m,m" -> ["m","m","m"] */
export function parseHitLevels(s) {
  return cleanText(s)
    .split(/[,\s]+/)
    .filter(Boolean);
}

/** Wavu alt inputs are a wiki list ("{{Dotlist|\n* ub+2\n* u+2}}"); entries can contain commas. */
export function parseAltList(raw) {
  if (!raw || raw === 'None') return [];
  const text = String(raw).replace(/\{\{\s*\w+\s*\|?/g, '').replace(/\}\}/g, '');
  const lines = text.split('\n').map((l) => l.replace(/^\s*\*\s*/, '').trim()).filter(Boolean);
  return lines.map((l) => cleanText(l)).filter(Boolean);
}

/**
 * @param {Array<Record<string, any>>} rows raw Cargo rows
 * @param {string} prefix e.g. "Anna" (ids look like "Anna-df+2")
 */
export function normalizeWavuRows(rows, prefix) {
  return rows
    .map((r) => {
      const input = String(r.id).slice(prefix.length + 1);
      const target = cleanText(r.target);
      const block = cleanText(r.block);
      const hit = cleanText(r.hit);
      const ch = cleanText(r.ch);
      const startup = cleanText(r.startup);
      const isThrow = /^t/i.test(target);
      return {
        id: input,
        num: r.num ? Number(r.num) : null,
        name: cleanText(r.name),
        alt: parseAltList(r.alt),
        input,
        parent: r.parent && r.parent !== 'None' ? String(r.parent).slice(prefix.length + 1) : null,
        hitLevels: parseHitLevels(target),
        damage: cleanText(r.damage),
        startup,
        startupFrame: parseStartup(startup),
        block,
        blockFrame: parseFrame(block),
        blockRange: parseFrameRange(block),
        hit,
        hitFrame: parseFrame(hit),
        ch,
        crush: cleanText(r.crush),
        recovery: cleanText(r.recv),
        reach: cleanText(r.reach),
        tracks: [cleanText(r.tracksLeft), cleanText(r.tracksRight)].filter(Boolean).join(' / '),
        notes: cleanText(r.notes).slice(0, 600),
        isThrow,
      };
    })
    .sort((a, b) => (a.num ?? 9999) - (b.num ?? 9999) || a.id.localeCompare(b.id));
}
