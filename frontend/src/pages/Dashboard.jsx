import { useApp, useMerchant } from '../AppContext';
import { AlertGroup, MdrCard } from '../components/Alerts';
import InsightCarousel from '../components/Carousel';
import { PeakHours, RevenueLine, VolumeBreakdown } from '../components/Charts';
import { HealthScore, MoneyCard, SummaryCard, VisibilityScore } from '../components/DashboardWidgets';
import { Btn, Rise, Skeleton, Stagger } from '../components/motion';
import QuickTiles from '../components/QuickTiles';
import { Card, ErrorNote } from '../components/ui';
import { plain } from '../api';

function DashboardSkeleton() {
  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-[248px] rounded-card sm:h-[190px]" />
      <Skeleton className="h-[190px] rounded-card" />
      <div className="grid gap-4 lg:grid-cols-12">
        <Skeleton className="h-52 rounded-card lg:col-span-7" />
        <Skeleton className="h-52 rounded-card lg:col-span-5" />
      </div>
      <Skeleton className="h-64 rounded-card" />
    </main>
  );
}

function ProNudge() {
  const { pro, setUpgradeOpen } = useApp();
  if (pro) return null;
  return (
    <Card className="flex flex-wrap items-center gap-3 border-l-[6px] border-warning p-4">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold text-navy">You're on the Free plan</div>
        <div className="text-sm text-slate-600">Pro shows which customers stopped coming, your busy hours, and sends each fix in one tap.</div>
      </div>
      <Btn variant="pro" onClick={() => setUpgradeOpen(true)}>See Pro</Btn>
    </Card>
  );
}

export default function Dashboard() {
  const { mid, dash, signals } = useMerchant();
  const base = `/m/${mid}`;

  if (dash.error && !dash.data) {
    return <main className="mx-auto max-w-6xl px-4 py-6"><ErrorNote error={dash.error} /></main>;
  }
  if (!dash.data || dash.data.merchant.id !== mid) return <DashboardSkeleton />;

  const { merchant, stats, health } = dash.data;
  const list = signals.data || [];
  const reg = list.find((s) => s.id === 'reg-upi-mdr' && !s.locked);
  const peak = list.find((s) => s.id === 'growth-peak-hours' && !s.locked);
  const risk = list.filter((s) => s.category === 'risk');
  const growth = list.filter((s) => s.category === 'growth');
  const asOf = new Date(stats.as_of).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const scrollToHealth = () => document.getElementById('health')?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <Stagger key={mid} className="space-y-4">
        <Rise className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-bold sm:text-2xl">Namaste, {merchant.owner_name.split(' ')[0]}</h1>
          <span className="text-xs font-medium text-slate-500">Numbers up to {asOf}</span>
        </Rise>

        <Rise>
          <InsightCarousel signals={list} base={base} loading={signals.loading} />
        </Rise>

        <Rise>
          <QuickTiles base={base} onHealth={scrollToHealth} />
        </Rise>

        <Rise className="grid gap-4 lg:grid-cols-12 [&>*]:min-w-0">
          <div className="lg:col-span-7"><HealthScore health={health} /></div>
          <div className="lg:col-span-5"><MoneyCard stats={stats} /></div>
        </Rise>

        {reg && (
          <Rise>
            <MdrCard signal={reg} merchantId={mid} />
          </Rise>
        )}

        <Rise className="grid items-start gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <AlertGroup title="Risk and compliance" count={risk.length} tone="bg-danger-50 text-danger-700" items={risk} merchantId={mid} empty="Nothing risky right now." />
          <AlertGroup title="Growth ideas" count={growth.length} tone="bg-success-50 text-success-700" items={growth} merchantId={mid} empty="No new ideas this week." />
        </Rise>

        <Rise><ProNudge /></Rise>

        <Rise className="grid gap-4 lg:grid-cols-12 [&>*]:min-w-0">
          <div className="lg:col-span-8"><SummaryCard merchantId={mid} /></div>
          <div className="lg:col-span-4"><VisibilityScore merchantId={mid} initial={merchant.visibility_pct} /></div>
        </Rise>

        <Rise className="grid gap-4 lg:grid-cols-12 [&>*]:min-w-0">
          <Card className="p-5 lg:col-span-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-[15px] font-bold text-navy">Weekly takings</div>
              <span className="text-xs text-slate-500">Last 26 weeks. Hover or tap for a week.</span>
            </div>
            <div className="mt-2"><RevenueLine data={stats.weekly_revenue} /></div>
          </Card>
          <Card className="p-5 lg:col-span-4">
            <div className="text-[15px] font-bold text-navy">Bills by size</div>
            <div className="mb-4 text-xs text-slate-500">Last 90 days. Only the orange group pays the new fee.</div>
            <VolumeBreakdown buckets={stats.volume_breakdown} />
          </Card>
        </Rise>

        <Rise>
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="text-[15px] font-bold text-navy">When customers pay</div>
              <span className="text-xs text-slate-500">Average payments per day, by hour, last 90 days</span>
              <span className="ml-auto flex gap-3 text-xs font-semibold text-slate-600">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-navy" /> Rush</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-warning" /> Quiet</span>
              </span>
            </div>
            <div className="mt-3">
              <PeakHours hourly={stats.hourly} peakStart={peak?.details?.peak_start} quietStart={peak?.details?.quiet_start} />
            </div>
            {peak ? (
              <p className="mt-2 text-sm text-slate-700"><b className="text-navy">{plain(peak.title)}.</b> {plain(peak.what_to_do)}</p>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Rush and quiet hours, with a staffing plan, come with Pro.</p>
            )}
          </Card>
        </Rise>
      </Stagger>
    </main>
  );
}
