// Locale-aware dates and times (Intl), instead of slicing ISO strings.
const day = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const shortDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const time = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' });

const parse = (iso: string | number | Date | null | undefined) => {
  if (iso === null || iso === undefined || iso === '') return null;
  const d = iso instanceof Date ? iso : new Date(typeof iso === 'string' && iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const fmtDate = (iso: string | number | Date | null | undefined) => { const d = parse(iso); return d ? day.format(d) : '—'; };
export const fmtShortDate = (iso: string | number | Date | null | undefined) => { const d = parse(iso); return d ? shortDay.format(d) : '—'; };
export const fmtDateTime = (iso: string | number | Date | null | undefined) => { const d = parse(iso); return d ? dateTime.format(d) : '—'; };
export const fmtTime = (iso: string | number | Date | null | undefined) => { const d = parse(iso); return d ? time.format(d) : '—'; };
