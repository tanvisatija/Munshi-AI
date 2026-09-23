import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { compactInr, inr } from '../api';
import { AnimatedText } from './motion';

const tooltipStyle = { borderRadius: 12, border: 'none', boxShadow: '0 10px 32px rgba(0,70,140,0.16)', fontSize: 12, fontWeight: 600 };

/** Weekly revenue line that draws itself in on load (animated SVG stroke). */
export function RevenueLine({ data, height = 210 }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const W = 640;
  const H = height;
  const pad = { l: 8, r: 8, t: 16, b: 26 };
  const { path, area, points, max } = useMemo(() => {
    const vals = data.map((d) => d.revenue);
    const mx = Math.max(...vals, 1) * 1.1;
    const pts = data.map((d, i) => ({
      x: pad.l + (i / Math.max(data.length - 1, 1)) * (W - pad.l - pad.r),
      y: pad.t + (1 - d.revenue / mx) * (H - pad.t - pad.b),
      d,
    }));
    // Smooth curve through the points (Catmull-Rom to Bezier).
    let p = `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      p += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`;
    }
    const a = `${p} L${pts.at(-1).x},${H - pad.b} L${pts[0].x},${H - pad.b} Z`;
    return { path: p, area: a, points: pts, max: mx };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, H]);

  function onMove(e) {
    const rect = ref.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    points.forEach((pt, i) => {
      if (Math.abs(pt.x - x) < Math.abs(points[best].x - x)) best = i;
    });
    setHover(best);
  }

  const h = hover != null ? points[hover] : null;
  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad.l} x2={W - pad.r} y1={pad.t + f * (H - pad.t - pad.b)} y2={pad.t + f * (H - pad.t - pad.b)} stroke="#EEF2F7" strokeDasharray="4 4" />
        ))}
        <text x={W - pad.r} y={pad.t + 0.25 * (H - pad.t - pad.b) - 4} textAnchor="end" fontSize="11" fill="#94a3b8">{compactInr(max * 0.75)}</text>
        <motion.path d={area} fill="#00BAF2" initial={{ opacity: 0 }} animate={{ opacity: 0.12 }} transition={{ delay: 0.9, duration: 0.6 }} />
        <motion.path
          d={path} fill="none" stroke="#00BAF2" strokeWidth="3.5" strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
        />
        {data.map((d, i) => ((i % 4 === 0 && data.length - 1 - i >= 3) || i === data.length - 1 ? (
          <text key={d.week_ending} x={points[i].x} y={H - 6} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} fontSize="11" fill="#94a3b8">{d.label}</text>
        ) : null))}
        {h && (
          <g>
            <line x1={h.x} x2={h.x} y1={pad.t} y2={H - pad.b} stroke="#00BAF2" strokeOpacity="0.35" />
            <circle cx={h.x} cy={h.y} r="6" fill="#fff" stroke="#00BAF2" strokeWidth="3" />
          </g>
        )}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-xl bg-navy px-2.5 py-1.5 text-center text-white shadow-lift"
          style={{ left: `${(h.x / W) * 100}%` }}
        >
          <div className="text-[10px] text-cerulean-200">Week to {h.d.label}</div>
          <div className="text-sm font-bold tabular-nums">{inr(h.d.revenue)}</div>
        </div>
      )}
    </div>
  );
}

const BUCKET_COLORS = { small: '#00BAF2', large_one_off: '#FFB020', recurring: '#1DB954' };
const BUCKET_NOTE = { small: 'No fee', large_one_off: 'Fee applies', recurring: 'No fee' };

export function VolumeBreakdown({ buckets }) {
  return (
    <div className="space-y-3.5">
      {buckets.map((b, i) => (
        <div key={b.key}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold text-navy">{b.label}</span>
            <span className="num text-base"><AnimatedText text={b.count.toLocaleString('en-IN')} /></span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-canvas">
            <motion.div
              className="h-full rounded-full"
              style={{ background: BUCKET_COLORS[b.key] }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(b.count_pct, 1.5)}%` }}
              transition={{ duration: 1, delay: 0.2 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-slate-500">
            <span className={b.key === 'large_one_off' ? 'font-semibold text-warning-700' : ''}>{BUCKET_NOTE[b.key]}</span>
            <span>{compactInr(b.value)} · {b.value_pct}% of takings</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PeakHours({ hourly, peakStart, quietStart, height = 210 }) {
  const open = hourly.filter((h) => h.avg_transactions > 0);
  const first = open.length ? open[0].hour : 0;
  const last = open.length ? open[open.length - 1].hour : 23;
  const data = hourly.filter((h) => h.hour >= first && h.hour <= last);
  const colorFor = (h) => {
    if (peakStart != null && (h === peakStart || h === peakStart + 1)) return '#002E6E';
    if (quietStart != null && (h === quietStart || h === quietStart + 1)) return '#FFB020';
    return '#00BAF2';
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="4 4" stroke="#EEF2F7" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
        <Tooltip cursor={{ fill: '#E6F8FE' }} contentStyle={tooltipStyle} formatter={(v) => [`${v} payments a day`, 'Average']} />
        <Bar dataKey="avg_transactions" radius={[7, 7, 0, 0]} animationDuration={1100}>
          {data.map((d) => (
            <Cell key={d.hour} fill={colorFor(d.hour)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MonthlyFeeChart({ monthly }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={monthly} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="4 4" stroke="#EEF2F7" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={compactInr} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={56} />
        <Tooltip
          cursor={{ fill: '#E6F8FE' }}
          contentStyle={tooltipStyle}
          formatter={(v, n) => [inr(v), n === 'mdr' ? 'Fee (your cost)' : 'GST (you get this back)']}
          labelFormatter={(l) => `30 days to ${l}`}
        />
        <Bar dataKey="mdr" stackId="a" fill="#002E6E" animationDuration={1000} />
        <Bar dataKey="gst" stackId="a" fill="#00BAF2" radius={[7, 7, 0, 0]} animationDuration={1000} />
      </BarChart>
    </ResponsiveContainer>
  );
}
