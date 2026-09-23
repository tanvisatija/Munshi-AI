import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { inr } from '../api';
import { useApp, useMerchant } from '../AppContext';
import { LogoMark } from '../components/brand';
import { VisibilityScore } from '../components/DashboardWidgets';
import { Icon, IconTile } from '../components/icons';
import { BuiltForBadge } from '../components/Layout';
import { Btn, Rise, Skeleton, Stagger } from '../components/motion';
import { Card } from '../components/ui';

const ENGINE = {
  anthropic: 'Claude is writing your summaries and chat answers.',
  openai: 'OpenAI is writing your summaries and chat answers.',
  mock: 'Offline mode. Summaries and chat are built straight from your numbers, no AI key needed.',
};
const PERSONA_ICON = { kirana: 'store', salon: 'heart', tuition: 'doc' };

export default function Profile() {
  const { mid, dash, merchants } = useMerchant();
  const { pro, setPro, settings } = useApp();
  const navigate = useNavigate();

  if (!dash.data || dash.data.merchant.id !== mid) {
    return (
      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-4 lg:grid-cols-12">
        <Skeleton className="h-44 rounded-card lg:col-span-7" />
        <Skeleton className="h-44 rounded-card lg:col-span-5" />
        <Skeleton className="h-56 rounded-card lg:col-span-7" />
        <Skeleton className="h-56 rounded-card lg:col-span-5" />
      </main>
    );
  }
  const m = dash.data.merchant;
  const engine = settings.llm?.active || 'mock';

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <Stagger className="grid gap-4 lg:grid-cols-12 [&>*]:min-w-0">
        <Rise className="lg:col-span-7">
          <div className="h-full rounded-card bg-cerulean-700 p-5 text-white shadow-card">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-cerulean-700">
                <Icon name={PERSONA_ICON[m.persona] || 'store'} className="h-7 w-7" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-cerulean-100">Your shop on Munshi</div>
                <h1 className="truncate text-2xl font-bold !text-white">{m.name}</h1>
                <div className="text-sm text-cerulean-100">{m.owner_name} · {m.category} · {m.city}</div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white/10 p-3">
                <div className="text-[11px] font-semibold text-cerulean-100">Gross margin</div>
                <div className="font-heading text-2xl font-bold">{m.gross_margin_pct}%</div>
                <div className="text-[11px] text-cerulean-100">used for pricing advice</div>
              </div>
              <div className="rounded-2xl bg-white/10 p-3">
                <div className="text-[11px] font-semibold text-cerulean-100">Seen by Munshi</div>
                <div className="font-heading text-2xl font-bold">{m.visibility_pct}%</div>
                <div className="text-[11px] text-cerulean-100">of your sales</div>
              </div>
              <div className="rounded-2xl bg-white p-3 text-navy">
                <div className="text-[11px] font-semibold text-slate-500">Plan</div>
                <div className="font-heading text-2xl font-bold">{pro ? 'Pro' : 'Free'}</div>
                <div className="text-[11px] text-slate-500">{pro ? 'everything on' : 'upgrade below'}</div>
              </div>
            </div>
          </div>
        </Rise>

        <Rise className="lg:col-span-5">
          <Card className="h-full p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[15px] font-bold text-navy">Your plan</div>
              <div className="relative flex rounded-full bg-canvas p-1 text-sm font-bold">
                {[[false, 'Free'], [true, 'Pro']].map(([val, label]) => (
                  <button key={label} onClick={() => pro !== val && setPro(val)} className={`relative rounded-full px-5 py-1.5 ${pro === val ? (val ? 'text-navy-900' : 'text-white') : 'text-slate-500'}`}>
                    {pro === val && <motion.span layoutId="plan-pill" className={`absolute inset-0 rounded-full ${val ? 'bg-warning' : 'bg-navy'}`} transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
                    <span className="relative">{label}</span>
                  </button>
                ))}
              </div>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                ['Health score and every fee alert', true],
                ['Growth ideas: lost customers, busy hours, peers', pro],
                ['One-tap send, file and record', pro],
                ['GST credit summary as PDF and CSV', pro],
              ].map(([label, on]) => (
                <li key={label} className="flex items-center gap-2">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full ${on ? 'bg-success text-white' : 'bg-canvas text-slate-300'}`}>
                    <Icon name={on ? 'check' : 'lock'} className="h-3 w-3" />
                  </span>
                  <span className={on ? 'text-navy' : 'text-slate-400'}>{label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-slate-400">Demo switch. No payment is taken.</p>
          </Card>
        </Rise>

        <Rise className="lg:col-span-7">
          <Card className="h-full p-2">
            <div className="px-3 pb-1 pt-2 text-[15px] font-bold text-navy">Switch shop</div>
            {(merchants.data || []).map((x) => (
              <button
                key={x.id}
                onClick={() => navigate(`/m/${x.id}`)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-canvas ${x.id === mid ? 'bg-cerulean-50' : ''}`}
              >
                <IconTile name={PERSONA_ICON[x.persona] || 'store'} color={x.id === mid ? 'cyan' : 'navy'} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-navy">{x.name}</div>
                  <div className="text-xs text-slate-500">{x.category}, {x.city}</div>
                </div>
                <div className="text-right">
                  <div className="num text-base">{inr(x.revenue_30d)}</div>
                  <div className="text-[10px] text-slate-400">last 30 days</div>
                </div>
                {x.id === mid ? <Icon name="check" className="h-5 w-5 text-cerulean" /> : <Icon name="chevronRight" className="h-4 w-4 text-slate-300" />}
              </button>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3 px-3 pb-2 pt-3">
              <BuiltForBadge />
              <Btn variant="soft" size="sm" to="/">All demo shops</Btn>
            </div>
          </Card>
        </Rise>

        <Rise className="grid gap-4 lg:col-span-5">
          <VisibilityScore merchantId={mid} initial={m.visibility_pct} />
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <LogoMark className="h-9 w-9" />
              <div className="text-[15px] font-bold text-navy">How Munshi works for you</div>
            </div>
            <p className="mt-2 text-sm text-slate-600">{ENGINE[engine] || ENGINE.mock}</p>
            <div className="mt-3 space-y-2">
              {(settings.agents || []).map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-2 rounded-xl bg-canvas p-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-navy">{a.name}</div>
                    <div className="text-xs text-slate-500">{a.description}</div>
                  </div>
                  <span className={`pill ${a.tier === 'pro' ? 'bg-warning text-navy-900' : 'bg-success-50 text-success-700'}`}>{a.tier}</span>
                </div>
              ))}
            </div>
          </Card>
        </Rise>
      </Stagger>
    </main>
  );
}
