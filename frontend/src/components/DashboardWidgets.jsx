import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api, inr, plain } from '../api';
import { useApp } from '../AppContext';
import { LogoMark } from './brand';
import { Icon } from './icons';
import { AnimatedText, Btn, CountUp, Ring, Skeleton } from './motion';
import { Card } from './ui';

/** Last 12 weeks as small bars that grow in one after another; latest week highlighted. */
function WeekBars({ weeks }) {
  const max = Math.max(...weeks.map((w) => w.revenue), 1);
  return (
    <div className="mt-4 flex min-h-[64px] flex-1 flex-col">
      <div className="flex min-h-[64px] flex-1 items-end gap-1.5">
        {weeks.map((w, i) => (
          <div key={w.week_ending} className="group relative flex h-full flex-1 items-end">
            <motion.div
              className={`w-full rounded-t-md ${i === weeks.length - 1 ? 'bg-cerulean' : 'bg-cerulean-100 group-hover:bg-cerulean-200'}`}
              initial={{ height: 0 }}
              animate={{ height: `${(w.revenue / max) * 100}%` }}
              transition={{ duration: 0.7, delay: 0.3 + i * 0.04, ease: [0.16, 1, 0.3, 1] }}
            />
            <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-navy px-1.5 py-0.5 text-[10px] font-bold text-white group-hover:block">
              {inr(w.revenue)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>12 weeks ago</span>
        <span>This week</span>
      </div>
    </div>
  );
}

export function MoneyCard({ stats }) {
  const g = stats.revenue_growth_pct;
  const up = g == null || g >= 0;
  const minis = [
    ['Average bill', inr(stats.avg_ticket_90d), `median ${inr(stats.median_ticket_90d)}`],
    ['Came back', `${stats.repeat_customer_pct}%`, `of ${stats.active_customers_90d} customers`],
    ['Payments a day', String(stats.transactions_per_day), `${stats.new_customers_30d} new this month`],
  ];
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="label">Collected on Paytm, last 30 days</div>
      <div className="mt-1 flex flex-wrap items-end gap-3">
        <div className="num text-[40px] leading-none sm:text-[46px]">
          <CountUp value={stats.revenue_30d} format={(v) => inr(v)} duration={1.3} />
        </div>
        {g != null && (
          <span className={`mb-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${up ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'}`}>
            <Icon name={up ? 'up' : 'down'} className="h-3 w-3" /> {Math.abs(g)}% vs last month
          </span>
        )}
      </div>
      <WeekBars weeks={stats.weekly_revenue.slice(-12)} />
      <div className="mt-auto grid grid-cols-3 divide-x divide-navy-50 pt-5 [&>*]:min-w-0">
        {minis.map(([label, value, hint]) => (
          <div key={label} className="px-3 first:pl-0 last:pr-0">
            <div className="text-[11px] font-semibold text-slate-500">{label}</div>
            <div className="num mt-0.5 text-xl sm:text-2xl"><AnimatedText text={value} /></div>
            <div className="truncate text-[11px] text-slate-400">{hint}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** The dominant card on the home screen: navy fill, big ring, the four parts that make up the score. */
export function HealthScore({ health }) {
  const { score, band, components } = health;
  const bandCls = score >= 75 ? 'bg-success text-white' : score >= 60 ? 'bg-cerulean text-white' : 'bg-warning text-navy-900';
  const weakest = [...components].sort((x, y) => x.score / x.max - y.score / y.max)[0];
  return (
    <div className="h-full rounded-card bg-navy p-5 text-white shadow-lift sm:p-6" id="health">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-cerulean-200">Munshi Health Score</div>
          <div className="font-heading text-lg font-bold">How your shop is doing this month</div>
        </div>
        <span className={`pill ${bandCls}`}>{band}</span>
      </div>
      <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <Ring value={score} size={176} stroke={16} dark />
        <div className="grid w-full flex-1 grid-cols-2 gap-3">
          {components.map((c, i) => (
            <div key={c.key} className="rounded-2xl bg-white/[0.07] p-3" title={plain(c.hint)}>
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-xs font-semibold text-cerulean-100">{c.label}</span>
                <span className="font-heading text-lg font-bold tabular-nums">{Math.round(c.score)}<span className="text-xs font-medium text-cerulean-200">/{c.max}</span></span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-cerulean"
                  initial={{ width: 0 }}
                  animate={{ width: `${(c.score / c.max) * 100}%` }}
                  transition={{ duration: 1, delay: 0.3 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-cerulean-100/80">{plain(c.hint)}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-2xl bg-cerulean px-4 py-2.5 text-sm font-semibold text-white">
        Biggest lift available: {weakest.label.toLowerCase()}. {plain(weakest.hint)}.
      </div>
    </div>
  );
}

export function VisibilityScore({ merchantId, initial }) {
  const { toast, bump } = useApp();
  const [value, setValue] = useState(initial ?? 50);
  const [saved, setSaved] = useState(initial ?? 50);
  useEffect(() => {
    setValue(initial ?? 50);
    setSaved(initial ?? 50);
  }, [initial, merchantId]);

  const tier = value >= 80 ? ['Sharp', 'bg-success-50 text-success-700'] : value >= 50 ? ['Partial', 'bg-cerulean-50 text-cerulean-700'] : ['Blurry', 'bg-warning-50 text-warning-700'];
  async function save() {
    await api.setVisibility(merchantId, value);
    setSaved(value);
    bump();
    toast(`Saved. About ${value}% of your sales go through Paytm.`);
  }
  return (
    <Card className="h-full p-5">
      <div className="flex items-center justify-between">
        <div className="text-[15px] font-bold text-navy">How much Munshi can see</div>
        <span className={`pill ${tier[1]}`}>{tier[0]}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">Roughly what share of your sales comes through Paytm, not cash or other apps?</p>
      <div className="num mt-3 text-[40px] leading-none">{value}%</div>
      <input
        type="range" min="0" max="100" step="5" value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="mt-3 w-full accent-[#00BAF2]"
        aria-label="Share of sales through Paytm"
      />
      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        {value < 100
          ? `Munshi sees ₹${value} of every ₹100 you earn. Put more of your sales through your Paytm QR and these numbers get sharper.`
          : 'Munshi sees all of your sales. Every number here is complete.'}
      </p>
      {value !== saved && (
        <Btn className="mt-3 w-full" onClick={save}>Save</Btn>
      )}
    </Card>
  );
}

const SOURCE = { anthropic: 'Written by Claude', openai: 'Written by OpenAI', mock: 'Written offline' };

export function SummaryCard({ merchantId }) {
  const { pro, version } = useApp();
  const [lang, setLang] = useState('en');
  const [state, setState] = useState({ loading: true });

  function load(refresh = false) {
    setState((s) => ({ ...s, loading: true }));
    api
      .summary(merchantId, lang, refresh)
      .then((d) => setState({ loading: false, ...d }))
      .catch(() => setState({ loading: false, text: "Couldn't load the summary right now. Your numbers above are still live.", source: 'error' }));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => load(), [merchantId, lang, pro, version]);

  return (
    <Card className="h-full p-5">
      <div className="flex flex-wrap items-center gap-3">
        <LogoMark className="h-9 w-9" />
        <div className="text-[15px] font-bold text-navy">Munshi's take</div>
        <div className="relative ml-auto flex rounded-full bg-canvas p-0.5 text-xs font-bold">
          {[['en', 'English'], ['hi', 'Hinglish']].map(([k, l]) => (
            <button key={k} onClick={() => setLang(k)} className={`relative rounded-full px-3 py-1 ${lang === k ? 'text-white' : 'text-slate-500'}`}>
              {lang === k && <motion.span layoutId="lang-pill" className="absolute inset-0 rounded-full bg-cerulean" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
              <span className="relative">{l}</span>
            </button>
          ))}
        </div>
      </div>
      {state.loading && !state.text ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      ) : (
        <motion.p key={`${lang}-${state.text?.length}`} initial={{ opacity: 0 }} animate={{ opacity: state.loading ? 0.5 : 1 }} className="mt-3 text-[15px] leading-relaxed text-slate-700">
          {plain(state.text)}
        </motion.p>
      )}
      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
        <span>{SOURCE[state.source] || 'Written'} from your last 6 months of payments</span>
        <button onClick={() => load(true)} className="flex items-center gap-1 font-semibold text-cerulean-700 hover:underline">
          <Icon name="refresh" className="h-3 w-3" /> Refresh
        </button>
      </div>
    </Card>
  );
}
