// Parsers for Wavu Wiki page wikitext (combos, punishers, character overview).
// Plain JS with JSDoc so both the Node import script and the app/tests can use it.
// Wavu Wiki content is CC0 (public domain).

import { cleanText } from './wavuNormalize.js';

/** Remove <!-- comments --> (Wavu pages comment out unverified rows). */
export function stripComments(t) {
  return String(t ?? '').replace(/<!--[\s\S]*?-->/g, '');
}

/** [[Page|label]] -> label, [[Page]] -> Page */
export function stripLinks(t) {
  return t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');
}

/** Collect <ref name="x">text</ref> definitions on a page. */
export function collectRefs(text) {
  const named = new Map();
  for (const m of text.matchAll(/<ref\b([^>]*?)>([\s\S]*?)<\/ref>/g)) {
    const name = /name\s*=\s*"?([^">/]+?)"?(?:\s|$)/.exec(m[1] + ' ')?.[1];
    const body = plain(m[2]);
    if (name && body) named.set(name.trim(), body);
  }
  return named;
}

/** Wikitext fragment -> readable plain text. */
export function plain(t) {
  return cleanText(
    stripLinks(String(t ?? ''))
      .replace(/'''?/g, '')
      .replace(/<sup>([\s\S]*?)<\/sup>/g, ' ($1)')
      .replace(/<br\s*\/?>/g, ' '),
  );
}

/** Split refs out of a line: returns the text without refs and the list of note texts. */
export function extractRefs(line, named) {
  const notes = [];
  const refName = (attrs) => /name\s*=\s*"?([^">/]+?)"?(?:\s|$)/.exec(`${attrs} `)?.[1]?.trim();
  let out = line.replace(/<ref\b([^>]*?)>([\s\S]*?)<\/ref>/g, (_m, attrs, body) => {
    const name = refName(attrs);
    const txt = plain(body) || (name ? named.get(name) : '');
    if (txt) notes.push(txt);
    return ' ';
  });
  out = out.replace(/<ref\b([^>]*?)\/>/g, (_m, attrs) => {
    const name = refName(attrs);
    const txt = name ? named.get(name) : '';
    if (txt) notes.push(txt);
    return ' ';
  });
  return { text: out, notes };
}

/** Leading "[damage]" bracket(s) of a combo line, e.g. "[+66; 42] df+3 ..." */
export function splitDamage(text) {
  const t = text.trim();
  const m = /^\[([^\]]*)\]\s*/.exec(t);
  if (!m) return { damage: '', rest: t };
  return { damage: `[${m[1].trim()}]`, rest: t.slice(m[0].length).trim() };
}

const SKIP_SECTIONS = /^(fake combos?|external links?|notes|see also|references)$/i;

/** Normalize notation variants used on Wavu so the app's notation parser accepts them. */
export function normalizeComboNotation(s) {
  const t = s
    .replace(/​/g, '')
    .replace(/<sup>[\s\S]*?<\/sup>/g, '')
    .replace(/&#58;|<nowiki>:<\/nowiki>/g, ':')
    .replace(/<\/?nowiki>/g, '')
    .replace(/\((?:x\d+|[a-z][a-z ]*)\)/gi, ' ') // "(x3)", "(easy)", "(heat)": notes, not inputs
    .replace(/\b(i?)WS\+?(?=[1-4])/g, '$1ws')
    .replace(/\b(i?)ws\+(?=[1-4])/g, '$1ws')
    .replace(/\b([udUD])\/([fbFB])\b/g, '$1$2');
  return t
    .split(/\s+/)
    .filter(Boolean)
    .map((t0) => {
      let tok = t0;
      if (/[1-4]|^(m\.?d(ash)?|md|dash|bb|ff|up)[.,;]+$/i.test(tok)) tok = tok.replace(/[.,;]+$/, ''); // "md." "up," "dash,"
      if (/^(ff|FF)$/.test(tok)) return 'dash';
      if (/^(md|MD|m\.dash|microdash)$/.test(tok)) return 'microdash';
      if (/^(bb|BB)$/.test(tok)) return 'backdash';
      if (/^heat ?smash$/i.test(tok)) return 'H.2+3';
      if (/^delay(ed)?$/i.test(tok)) return '';
      let x = tok.replace(/^ff\+?(?=[1-4])/, 'f,f+').replace(/,ff$/, ' dash');
      // "a/b" and "a_b" list alternatives: practise the first one
      if (x.includes('/')) x = x.split('/')[0];
      if (x.includes('_')) x = x.split('_')[0];
      return x;
    })
    .filter(Boolean)
    .join(' ')
    .trim();
}

/** A stable short hash so combo ids survive re-imports while the route is unchanged. */
export function hashId(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** Does a route look like real notation (not a placeholder like "combo here")? */
export function looksLikeNotation(route) {
  if (!/[1-4]/.test(route)) return false;
  const words = route.split(/\s+/).filter((w) => /^[a-z]{4,}$/i.test(w) && !/^(dash|run|ssr|ssl|sswr|sswl|backdash)$/i.test(w));
  return words.length <= 1;
}

/**
 * Parse a "<Character>_combos" page.
 * @param {string} wikitext
 * @param {{ characterId: string, url: string, revision: number|null, validate?: (notation: string) => boolean }} meta
 */
export function parseCombosPage(wikitext, meta) {
  const text = stripComments(wikitext);
  const named = collectRefs(text);
  const items = [];
  const dropped = [];
  let section = '';
  let subsection = '';
  let skipping = false;
  let starters = [];
  let lastWasRoute = false;
  const seen = new Set();

  for (const rawLine of text.split('\n')) {
    const h = /^(==+)\s*(.*?)\s*\1\s*$/.exec(rawLine.trim());
    if (h) {
      const title = plain(h[2]);
      if (h[1].length === 2) {
        section = title;
        subsection = '';
        skipping = SKIP_SECTIONS.test(title);
      } else subsection = title;
      starters = [];
      lastWasRoute = false;
      continue;
    }
    if (skipping) continue;
    const line = rawLine.replace(/^\s+/, '');
    if (line.startsWith('{{Combolist') || line.startsWith('}}')) {
      starters = [];
      lastWasRoute = false;
      continue;
    }
    const kind = line[0];
    if (kind !== ';' && kind !== ':') continue;
    const { text: noRefs, notes } = extractRefs(line.slice(1), named);
    const cleaned = stripLinks(noRefs).replace(/'''?/g, '');
    const sup = [...cleaned.matchAll(/<sup>([\s\S]*?)<\/sup>/g)].map((m) => plain(m[1]));
    const { damage, rest } = splitDamage(cleaned.replace(/<sup>[\s\S]*?<\/sup>/g, ''));
    const content = normalizeComboNotation(rest);
    if (kind === ';') {
      if (lastWasRoute) starters = [];
      lastWasRoute = false;
      if (content) starters.push({ text: content, damage, notes: [...sup, ...notes] });
      continue;
    }
    // ":" route line
    lastWasRoute = true;
    if (!content || !looksLikeNotation(content)) {
      if (content) dropped.push({ section, line: content, reason: 'placeholder or prose' });
      continue;
    }
    const startersText = starters.map((s) => s.text);
    const key = `${startersText.join('|')}=>${content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const parseOk = meta.validate ? meta.validate(content) : true;
    items.push({
      id: `w-${hashId(key)}`,
      section: subsection ? `${section} · ${subsection}` : section,
      starters: startersText,
      starterNotes: starters.flatMap((s) => [s.damage ? `${s.text}: ${s.damage}` : '', ...s.notes].filter(Boolean)),
      route: content,
      damage,
      notes: [...sup, ...notes],
      parseOk,
    });
  }
  return {
    source: { name: 'Wavu Wiki combos', url: meta.url, revision: meta.revision, license: 'CC0 1.0 (public domain)' },
    items,
    dropped,
  };
}

/**
 * Parse a "<Character>_punishers" page: the {{PunisherTable}} template, or a plain wiki table.
 * @param {string} wikitext
 * @param {string} prefix Wavu move id prefix, e.g. "Armor King"
 */
export function parsePunishersPage(wikitext, prefix) {
  const text = stripComments(wikitext);
  const named = collectRefs(text);
  const items = [];
  const tpl = text.indexOf('{{PunisherTable');
  if (tpl >= 0) {
    let stance = null;
    const body = text.slice(tpl);
    const re = /\|\s*(standing|crouching|backTurnedOpponent|groundedOpponent)\s*=|\{\{o\|\s*moveId\s*=\s*([^|}]+?)\s*(\|[^}]*)?\}\}/g;
    for (const m of body.matchAll(re)) {
      if (m[1]) {
        stance = m[1];
        continue;
      }
      if (stance !== 'standing' && stance !== 'crouching') continue;
      const fields = Object.fromEntries([...(m[3] ?? '').matchAll(/\|\s*(\w+)\s*=\s*([^|]*)/g)].map((f) => [f[1], f[2].trim()]));
      const parsed = parseInt(String(fields.enemy ?? '').replace(/[\u2010-\u2013\u2212]/g, '-'), 10);
      // Without "enemy", Wavu derives the window from the move's startup; the importer fills it in.
      const window = Number.isFinite(parsed) ? parsed : null;
      const id = m[2].trim();
      const moveId = id.startsWith(`${prefix}-`) ? id.slice(prefix.length + 1) : id;
      const note = fields.moveNote ? extractRefs(fields.moveNote, named).notes.join(' ') || plain(fields.moveNote) : '';
      items.push({ window, moveId, stance, ...(note ? { note } : {}) });
    }
    if (items.length) return items;
  }
  // Plain table format: "| colspan | Standing" category rows, rowspan'd enemy windows.
  const table = /\{\|\s*class="punishers"[\s\S]*?(?:\n\|\}|$)/.exec(text.replace(/[\u2010\u2011\u2012\u2013\u2212]/g, '-'));
  if (!table) return items;
  let stance = null;
  let window = null;
  for (const row of table[0].split(/\n\|-/)) {
    const cat = /table-cat"\s*\|\s*([A-Za-z ]+)/.exec(row);
    if (cat) {
      const c = cat[1].trim().toLowerCase();
      stance = c.startsWith('stand') ? 'standing' : c.startsWith('crouch') ? 'crouching' : null;
      window = null;
      continue;
    }
    if (!stance || /^\s*!/m.test(row)) continue;
    const joined = row
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('|') && !l.startsWith('|}'))
      .map((l) => l.slice(1))
      .join(' || ');
    if (!joined.trim()) continue;
    const cells = joined.split('||').map((c) => {
      const parts = c.split('|');
      // "rowspan="2" | -10" -> "-10"
      return (parts.length > 1 && /=/.test(parts[0]) ? parts.slice(1).join('|') : c).trim();
    });
    let i = 0;
    if (/^-\d+$/.test(cells[0])) {
      window = parseInt(cells[0], 10);
      i = 1;
    } else if (cells[0] === '') i = 1;
    const moveRaw = cells[i];
    if (window === null || !moveRaw) continue;
    const { text: moveText, notes } = extractRefs(moveRaw, named);
    const moveId = plain(moveText).replace(/^WS\+?/, 'ws');
    if (!moveId || !/[1-4]/.test(moveId)) continue;
    items.push({ window, moveId, stance, ...(notes.length ? { note: notes.join(' ') } : {}) });
  }
  return items;
}

function infoboxField(text, field) {
  const start = text.search(new RegExp(`\\|\\s*${field}\\s*=`));
  if (start < 0) return '';
  let i = text.indexOf('=', start) + 1;
  let depth = 0;
  let out = '';
  for (; i < text.length; i++) {
    const two = text.slice(i, i + 2);
    if (two === '{{') { depth++; out += two; i++; continue; }
    if (two === '}}') {
      if (depth === 0) break;
      depth--; out += two; i++; continue;
    }
    if (text[i] === '|' && depth === 0) break;
    out += text[i];
  }
  return out;
}

function listItems(fragment) {
  return stripComments(fragment)
    .split('\n')
    .map((l) => /^\s*\*+\s*(.*)$/.exec(l)?.[1])
    .filter((x) => x !== undefined)
    .map((x) => plain(x))
    .filter(Boolean);
}

/** Parse a character page: intro, strengths/weaknesses, and infobox lists. */
export function parseCharacterPage(wikitext, name) {
  const text = stripComments(wikitext);
  const box = /\{\{Infobox fighter[\s\S]*?\n\}\}/.exec(text)?.[0] ?? '';
  const get = (f) => {
    const v = infoboxField(box, f);
    const items = listItems(v);
    if (items.length) return items;
    const p = plain(v);
    return p ? [p] : [];
  };
  const introMatch = new RegExp(`^'''${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'''[^\\n]*`, 'm').exec(text);
  const intro = introMatch ? plain(introMatch[0]) : '';
  const blueRed = /\{\{BlueRed([\s\S]*?)\n\}\}/.exec(text)?.[1] ?? '';
  const blue = /\|\s*blue\s*=([\s\S]*?)(?=\|\s*red\s*=|$)/.exec(blueRed)?.[1] ?? '';
  const red = /\|\s*red\s*=([\s\S]*)$/.exec(blueRed)?.[1] ?? '';
  return {
    overview: intro,
    strengths: listItems(blue),
    weaknesses: listItems(red),
    stances: get('stances'),
    heat: get('heat'),
    heatEngagers: get('heatEngagers'),
    heatSmash: get('heatSmash'),
    launch: get('launch'),
    chLaunch: get('chLaunch'),
    splat: get('splat'),
    parry: get('parry'),
    midCheck: get('midCheck'),
  };
}
