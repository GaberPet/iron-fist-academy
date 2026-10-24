// Small single-series SVG charts with hover tooltips (dark theme, series slot 1).
import { useState } from 'react';

interface Point { label: string; value: number; note?: string }

export function BarChart({ data, height = 160, unit = '', title }: { data: Point[]; height?: number; unit?: string; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 600;
  const pad = { l: 34, r: 8, t: 10, b: 22 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const bw = (w - pad.l - pad.r) / data.length;
  const y = (v: number) => pad.t + (height - pad.t - pad.b) * (1 - v / top);
  return (
    <div className="chart" aria-label={title}>
      <svg viewBox={`0 0 ${w} ${height}`} role="img" aria-label={title}>
        <g className="grid">{ticks.map((t) => <line key={t} x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} />)}</g>
        <g className="axis">
          {ticks.map((t) => <text key={t} x={pad.l - 6} y={y(t) + 3} textAnchor="end">{t}</text>)}
          {data.map((d, i) => (i % Math.ceil(data.length / 7) === 0 || i === data.length - 1 ? <text key={i} x={pad.l + bw * i + bw / 2} y={height - 6} textAnchor="middle">{d.label}</text> : null))}
        </g>
        {data.map((d, i) => {
          const x = pad.l + bw * i + 2;
          const bh = Math.max(0, y(0) - y(d.value));
          const bwid = Math.max(2, bw - 4);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + bw * i} y={pad.t} width={bw} height={height - pad.t - pad.b} fill="transparent" />
              {d.value > 0 && <path d={roundedTop(x, y(d.value), bwid, bh, 4)} fill="var(--series-1)" opacity={hover === null || hover === i ? 1 : 0.55} />}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((pad.l + bw * hover + bw / 2) / w) * 100}%`, top: `${(y(data[hover].value) / height) * 100}%` }}>
          <b>{data[hover].label}</b>: {data[hover].value}{unit}{data[hover].note ? ` · ${data[hover].note}` : ''}
        </div>
      )}
    </div>
  );
}

export function LineChart({ data, height = 160, max = 100, unit = '%', title }: { data: { label: string; value: number | null; note?: string }[]; height?: number; max?: number; unit?: string; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 600;
  const pad = { l: 34, r: 10, t: 10, b: 22 };
  const step = (w - pad.l - pad.r) / Math.max(1, data.length - 1);
  const x = (i: number) => pad.l + step * i;
  const y = (v: number) => pad.t + (height - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, max / 2, max];
  const pts = data.map((d, i) => (d.value === null ? null : [x(i), y(d.value)] as const));
  let path = '';
  pts.forEach((p, i) => {
    if (!p) return;
    path += `${path && pts[i - 1] ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)} `;
  });
  return (
    <div className="chart" aria-label={title}>
      <svg viewBox={`0 0 ${w} ${height}`} role="img" aria-label={title} onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * w;
          setHover(Math.max(0, Math.min(data.length - 1, Math.round((px - pad.l) / step))));
        }}>
        <g className="grid">{ticks.map((t) => <line key={t} x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} />)}</g>
        <g className="axis">
          {ticks.map((t) => <text key={t} x={pad.l - 6} y={y(t) + 3} textAnchor="end">{t}{unit}</text>)}
          {data.map((d, i) => (i % Math.ceil(data.length / 7) === 0 || i === data.length - 1 ? <text key={i} x={x(i)} y={height - 6} textAnchor="middle">{d.label}</text> : null))}
        </g>
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} stroke="var(--line-2)" />}
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" />
        {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={hover === i ? 5 : 4} fill="var(--series-1)" stroke="var(--panel)" strokeWidth="2" />)}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${(x(hover) / w) * 100}%`, top: `${((data[hover].value === null ? y(max / 2) : y(data[hover].value!)) / height) * 100}%` }}>
          <b>{data[hover].label}</b>: {data[hover].value === null ? 'no attempts' : `${Math.round(data[hover].value!)}${unit}`}{data[hover].note ? ` · ${data[hover].note}` : ''}
        </div>
      )}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

function niceTicks(max: number): number[] {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const s = steps.find((st) => max / st <= 4) ?? Math.ceil(max / 4);
  const top = Math.ceil(max / s) * s;
  const out: number[] = [];
  for (let v = 0; v <= top; v += s) out.push(v);
  return out;
}

export function Ring({ value, size = 92, label }: { value: number; size?: number; label: string }) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel-3)" strokeWidth="8" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--char)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dy="5" fill="var(--text)" fontWeight="800" fontSize="16">{Math.round(v * 100)}%</text>
    </svg>
  );
}
