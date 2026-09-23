import { api, inr } from '../api';
import { useFetch } from '../AppContext';
import { LogoMark } from '../components/brand';
import { Icon, IconTile } from '../components/icons';
import { BuiltForBadge, Wordmark } from '../components/Layout';
import { CountUp, Rise, Skeleton, Stagger, Tap } from '../components/motion';
import { ErrorNote } from '../components/ui';

const PERSONA = {
  kirana: ['store', 'cyan', 'Lots of small bills, a monthly ration khata, evening rush'],
  salon: ['heart', 'orange', 'Mid-size bills every few weeks, big bridal bookings'],
  tuition: ['doc', 'green', 'Monthly fees above ₹2,000, half already on Autopay'],
};

const THREE_THINGS = [
  ['shield', 'red', 'What changed', 'A new UPI fee, a customer who stopped coming, a slow afternoon.'],
  ['rupee', 'orange', 'What it costs you', 'In rupees, worked out from your own payments. No averages.'],
  ['check', 'green', 'What to do', 'One tap to send the offer, file the GST credit or record the decision.'],
];

export default function MerchantSelect() {
  const { data, error } = useFetch(() => api.merchants(), []);
  return (
    <div className="min-h-screen">
      <header className="bg-navy">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Wordmark />
          <BuiltForBadge className="hidden sm:inline" />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Stagger className="grid gap-4 lg:grid-cols-12 [&>*]:min-w-0">
          <Rise className="lg:col-span-5">
            <div className="h-full rounded-card bg-navy p-6 text-white shadow-lift">
              <LogoMark onDark className="h-14 w-14" />
              <h1 className="mt-4 text-2xl font-bold leading-tight !text-white sm:text-3xl">Your shop's munshi, inside Paytm.</h1>
              <p className="mt-2 text-sm text-cerulean-100">Munshi reads every Paytm payment your shop gets and tells you three things:</p>
              <div className="mt-4 space-y-3">
                {THREE_THINGS.map(([icon, color, title, text]) => (
                  <div key={title} className="flex gap-3 rounded-2xl bg-white/[0.07] p-3">
                    <IconTile name={icon} color={color} size="sm" />
                    <div>
                      <div className="font-heading text-sm font-bold">{title}</div>
                      <div className="text-xs text-cerulean-100">{text}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Rise>

          <Rise className="space-y-3 lg:col-span-7">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold">Pick a demo shop</h2>
              <span className="text-xs text-slate-500">6 months of made-up UPI payments each</span>
            </div>
            <ErrorNote error={error} />
            {!data && !error && [0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-card" />)}
            {data?.map((m) => {
              const [icon, color, blurb] = PERSONA[m.persona] || PERSONA.kirana;
              return (
                <Tap key={m.id} to={`/m/${m.id}`} className="card flex w-full flex-wrap items-center gap-4 p-4 text-left hover:shadow-lift sm:flex-nowrap sm:p-5">
                  <IconTile name={icon} color={color} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-bold text-navy">{m.name}</div>
                    <div className="text-sm text-slate-500">{m.category}, {m.city}</div>
                    <div className="mt-1 text-xs text-slate-500">{blurb}</div>
                  </div>
                  <div className="flex items-center gap-5">
                    <div className="text-right">
                      <div className="text-[11px] font-semibold text-slate-500">Last 30 days</div>
                      <div className="num text-2xl"><CountUp value={m.revenue_30d} format={(v) => inr(v)} /></div>
                    </div>
                    <div className="rounded-2xl bg-navy px-3 py-2 text-center text-white">
                      <div className="text-[10px] font-semibold text-cerulean-200">Health</div>
                      <div className="font-heading text-xl font-bold leading-none"><CountUp value={m.health_score} /></div>
                    </div>
                    <Icon name="chevronRight" className="h-5 w-5 text-cerulean" />
                  </div>
                </Tap>
              );
            })}
          </Rise>
        </Stagger>
      </main>
    </div>
  );
}
