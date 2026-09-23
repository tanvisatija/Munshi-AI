import { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, inr, plain } from '../api';
import { useApp, useFetch } from '../AppContext';
import { iconFor } from '../components/Alerts';
import { MonthlyFeeChart, PeakHours } from '../components/Charts';
import { Icon, IconTile } from '../components/icons';
import { AnimatedText, Rise, Skeleton, Stagger } from '../components/motion';
import { RecommendationCard } from '../components/Recommendations';
import RegulationExtractor from '../components/RegulationExtractor';
import { Card, ErrorNote, LockedButton, SeverityChip } from '../components/ui';

function Impact({ signal }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="border-l-[6px] border-cerulean p-5 lg:col-span-2">
        <div className="label text-cerulean-700">What it means for you</div>
        <p className="mt-2 text-[15px] leading-relaxed text-navy">{plain(signal.how_it_affects_you)}</p>
        {signal.metrics?.length > 0 && (() => {
          const [lead, ...rest] = signal.metrics;
          return (
            <div className="mt-4 grid gap-4 rounded-2xl bg-canvas p-4 sm:grid-cols-[1.1fr_1fr]">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-500">{lead.label}</div>
                <div className="num text-[34px] leading-tight text-cerulean-700 sm:text-[40px]"><AnimatedText text={plain(lead.value)} /></div>
                <div className="text-xs text-slate-500">{plain(lead.hint)}</div>
              </div>
              <div className="min-w-0 space-y-2 sm:border-l-4 sm:border-white sm:pl-4">
                {rest.map((m) => (
                  <div key={m.label} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-xs text-slate-600">{m.label}<span className="block truncate text-[11px] text-slate-400">{plain(m.hint)}</span></span>
                    <span className="num shrink-0 text-lg"><AnimatedText text={plain(m.value)} /></span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </Card>
      <div className="grid gap-4">
        <Card className="p-5">
          <div className="label">What changed</div>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{plain(signal.what_changed)}</p>
        </Card>
        <Card className="bg-navy p-5 text-white">
          <div className="label text-cerulean-200">What to do</div>
          <p className="mt-1.5 text-sm font-medium leading-relaxed">{plain(signal.what_to_do)}</p>
        </Card>
      </div>
    </div>
  );
}

function RegulatoryBreakdown({ impact, merchantId }) {
  const { retrospective: r, forward_estimate: f, breakdown, monthly, rule } = impact;
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="p-5 lg:col-span-7">
          <div className="text-[15px] font-bold text-navy">Your last 90 days, sorted by the rule</div>
          <p className="text-xs text-slate-500">Every payment, and whether it pays the fee</p>
          <div className="mt-3 divide-y divide-navy-50">
            {breakdown.map((b) => (
              <div key={b.key} className="flex items-center gap-3 py-3">
                <span className={`h-9 w-1.5 shrink-0 rounded-full ${b.fee > 0 ? 'bg-warning' : 'bg-success'}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-navy">{b.label}</div>
                  <div className="text-xs text-slate-500">{b.count.toLocaleString('en-IN')} bills · {inr(b.value)}</div>
                </div>
                <div className="text-right">
                  <div className={`num text-lg ${b.fee > 0 ? 'text-danger-700' : 'text-slate-300'}`}>{inr(b.fee)}</div>
                  <div className={`text-[11px] font-semibold ${b.fee > 0 ? 'text-danger-700' : 'text-success-700'}`}>{plain(b.note)}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 rounded-2xl bg-canvas p-3 text-center">
            <div><div className="text-[11px] font-semibold text-slate-500">Fee</div><div className="num text-lg">{inr(r.mdr)}</div></div>
            <div><div className="text-[11px] font-semibold text-slate-500">Plus 18% GST</div><div className="num text-lg">{inr(r.gst)}</div></div>
            <div><div className="text-[11px] font-semibold text-slate-500">Total</div><div className="num text-lg text-danger-700">{inr(r.gross_cost)}</div></div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Fee is {rule.rate_pct}% of the bill, never more than ₹{rule.cap} a bill. GST is charged on the fee, not on the bill.
            {r.cap_hits > 0 ? ` ${r.cap_hits} of your bills hit the ₹${rule.cap} cap.` : ''}
          </p>
        </Card>
        <Card className="p-5 lg:col-span-5">
          <div className="text-[15px] font-bold text-navy">Month by month, if the rule had applied</div>
          <p className="text-xs text-slate-500">Navy is the fee you pay. Blue is GST you get back.</p>
          <div className="mt-2"><MonthlyFeeChart monthly={monthly} /></div>
          <div className="mt-2 rounded-2xl bg-cerulean-50 p-3.5">
            <div className="text-[11px] font-semibold text-slate-500">Next 3 months, after GST credit</div>
            <div className="num text-2xl"><AnimatedText text={`${inr(f.net_low)} to ${inr(f.net_high)}`} /></div>
            <div className="text-[11px] text-slate-500">{inr(f.gross_low)} to {inr(f.gross_high)} before GST credit</div>
            <p className="mt-2 text-xs text-slate-600"><b>How we got this range:</b> {plain(f.assumption)}</p>
          </div>
        </Card>
      </div>
      <RegulationExtractor merchantId={merchantId} baseline={r} />
    </>
  );
}

function ChurnDetail({ details }) {
  const m = details.model;
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="p-5 lg:col-span-8">
        <div className="text-[15px] font-bold text-navy">Who to call first</div>
        <p className="text-xs text-slate-500">Ranked by how likely they are to leave, times what they used to spend</p>
        <div className="mt-3 max-h-[420px] overflow-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="sticky top-0 bg-white text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr><th className="py-2 pl-2">Customer</th><th>Chance of leaving</th><th className="text-right">Days away</th><th className="text-right">Usually every</th><th className="text-right">Spent a month</th></tr>
            </thead>
            <tbody>
              {details.at_risk_customers.map((c, i) => (
                <tr key={c.customer} className="odd:bg-canvas">
                  <td className="rounded-l-lg py-2.5 pl-2 font-semibold text-navy">{c.customer}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-canvas">
                        <motion.div className="h-full rounded-full bg-danger" initial={{ width: 0 }} animate={{ width: `${c.risk_score * 100}%` }} transition={{ duration: 0.8, delay: Math.min(i, 12) * 0.04 }} />
                      </div>
                      <span className="text-xs font-bold tabular-nums">{Math.round(c.risk_score * 100)}%</span>
                    </div>
                  </td>
                  <td className="text-right font-semibold tabular-nums">{c.days_since_last_visit}</td>
                  <td className="text-right tabular-nums text-slate-500">{Math.round(c.usual_gap_days)} days</td>
                  <td className="text-right font-semibold tabular-nums text-navy">{inr(c.monthly_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="p-5 lg:col-span-4">
        <div className="flex items-center gap-3">
          <IconTile name="growth" color="navy" size="sm" />
          <div className="text-[15px] font-bold text-navy">How Munshi picks them</div>
        </div>
        <p className="mt-2 text-xs text-slate-600">
          A gradient boosting model (scikit-learn). It learnt from past customers who went quiet for 45 days or more, then scores everyone buying from you today.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div><div className="text-[11px] font-semibold text-slate-500">Accuracy (AUC)</div><div className="num text-2xl"><AnimatedText text={String(m.holdout_auc)} /></div></div>
          <div><div className="text-[11px] font-semibold text-slate-500">Customers learnt from</div><div className="num text-2xl"><AnimatedText text={m.training_rows.toLocaleString('en-IN')} /></div></div>
        </div>
        <div className="label mt-4">What matters most</div>
        <div className="mt-2 space-y-2">
          {Object.entries(m.feature_importance).slice(0, 5).map(([k, v], i) => (
            <div key={k} className="text-xs">
              <div className="flex justify-between font-semibold text-navy"><span>{k.replaceAll('_', ' ')}</span><span className="tabular-nums">{Math.round(v * 100)}%</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas">
                <motion.div className="h-full rounded-full bg-cerulean" initial={{ width: 0 }} animate={{ width: `${v * 100}%` }} transition={{ duration: 0.9, delay: 0.2 + i * 0.08 }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function BenchmarkDetail({ details }) {
  return (
    <Card className="p-5">
      <div className="text-[15px] font-bold text-navy">You and merchants like you</div>
      <p className="text-xs text-slate-500">Compared with {details.peer_count} other merchants on Munshi. {plain(details.note)}</p>
      <div className="mt-3 divide-y divide-navy-50">
        {details.benchmarks.map((b) => (
          <div key={b.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-3 text-sm">
            <span className="font-semibold text-navy">{b.label}</span>
            <span className="text-right">
              <span className="num text-lg">{b.you}%</span>
              <span className="ml-1.5 text-xs text-slate-400">vs {b.peer_avg}%</span>
            </span>
            <span className={`pill ${b.ahead ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'}`}>
              {b.ahead ? 'Ahead' : 'Behind'} {Math.abs(b.difference)} pts
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-24 rounded-card" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-48 rounded-card lg:col-span-2" />
        <Skeleton className="h-48 rounded-card" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 rounded-card" />
        <Skeleton className="h-56 rounded-card" />
      </div>
    </main>
  );
}

export default function AlertDetail() {
  const { mid, sid } = useParams();
  const { hash } = useLocation();
  const { pro, version } = useApp();
  const { data: s, error } = useFetch(() => api.signal(mid, sid), [mid, sid, pro, version]);

  // Deep links from the home grid (#itc-summary, #autopay-conversion, #rule-check).
  useEffect(() => {
    if (!s || !hash) return undefined;
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 450);
    return () => clearTimeout(t);
  }, [s, hash]);

  if (error && !s) return <main className="mx-auto max-w-6xl px-4 py-6"><ErrorNote error={error} /></main>;
  if (!s || s.id !== sid) return <DetailSkeleton />;

  const [icon, color] = s.locked ? ['lock', 'orange'] : iconFor(s);
  const isReg = s.agent_id === 'regulatory';

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <Stagger key={s.id} className="space-y-4">
        <Rise>
          <Link to={`/m/${mid}`} className="inline-flex items-center gap-1 text-sm font-semibold text-cerulean-700 hover:underline">
            <Icon name="chevronLeft" className="h-4 w-4" /> Home
          </Link>
        </Rise>
        <Rise>
          <Card className="flex items-start gap-4 p-5">
            <IconTile name={icon} color={color} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap gap-1.5">
                <span className={`pill ${s.category === 'risk' ? 'bg-danger-50 text-danger-700' : 'bg-success-50 text-success-700'}`}>
                  {s.category === 'risk' ? 'Risk and compliance' : 'Growth idea'}
                </span>
                {!s.locked && <SeverityChip severity={s.severity} />}
              </div>
              <h1 className="mt-1.5 text-xl font-bold leading-snug sm:text-2xl">{plain(s.title)}</h1>
            </div>
          </Card>
        </Rise>

        {s.locked ? (
          <Rise>
            <Card className="flex flex-col items-center p-8 text-center">
              <IconTile name="lock" color="orange" size="lg" />
              <p className="mt-3 max-w-md text-slate-600">{plain(s.what_changed)} The numbers and the one-tap fix come with Pro.</p>
              <LockedButton className="mt-4" label="Switch to Pro" />
            </Card>
          </Rise>
        ) : (
          <>
            <Rise><Impact signal={s} /></Rise>

            {s.recommendations?.length > 0 && (
              <Rise>
                <div className="mb-3">
                  <h2 className="text-[17px] font-bold">{isReg ? `${s.recommendations.length} ways to cut this cost` : 'What to do next'}</h2>
                  {isReg && <p className="text-xs text-slate-500">All of these are within the rules. Munshi never suggests splitting a bill to dodge the fee.</p>}
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  {s.recommendations.map((rec, i) => (
                    <RecommendationCard key={rec.id} rec={rec} index={i + 1} merchantId={mid} signalId={s.id} />
                  ))}
                </div>
              </Rise>
            )}

            {s.details?.impact && <Rise className="space-y-4"><RegulatoryBreakdown impact={s.details.impact} merchantId={mid} /></Rise>}
            {s.details?.at_risk_customers && <Rise><ChurnDetail details={s.details} /></Rise>}
            {s.details?.hourly && (
              <Rise>
                <Card className="p-5">
                  <div className="text-[15px] font-bold text-navy">Payments by hour</div>
                  <p className="mb-2 text-xs text-slate-500">Navy is your rush, orange is your quiet stretch</p>
                  <PeakHours hourly={s.details.hourly} peakStart={s.details.peak_start} quietStart={s.details.quiet_start} height={250} />
                </Card>
              </Rise>
            )}
            {s.details?.benchmarks && <Rise><BenchmarkDetail details={s.details} /></Rise>}
          </>
        )}
      </Stagger>
    </main>
  );
}
