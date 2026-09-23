import { inr, plain } from '../api';
import { useApp } from '../AppContext';
import { Icon, IconTile } from './icons';
import { AnimatedText, Btn, Tap } from './motion';
import { Card, SeverityChip } from './ui';

export const SIGNAL_ICON = {
  'reg-upi-mdr': ['shield', 'red'],
  'growth-churn': ['users', 'orange'],
  'growth-peak-hours': ['clock', 'cyan'],
  'growth-benchmark': ['trophy', 'navy'],
};
export const iconFor = (s) => SIGNAL_ICON[s.id] || (s.category === 'risk' ? ['shield', 'red'] : ['bulb', 'green']);

/** Flagship MDR alert. White card, red accent, numbers dominate. No dark hero. */
export function MdrCard({ signal, merchantId }) {
  if (!signal) return null;
  const imp = signal.details?.impact;
  if (!imp) return null;
  const r = imp.retrospective;
  const f = imp.forward_estimate;
  if (imp.small_merchant_exempt) {
    return (
      <Card className="border-l-[6px] border-success p-5">
        <span className="pill bg-success text-white">New rule</span>
        <div className="mt-2 text-lg font-bold text-navy">UPI fee from 15 Oct: you're exempt</div>
        <p className="mt-1 text-sm text-slate-600">{plain(signal.how_it_affects_you)}</p>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="h-1.5 bg-danger" />
      <div className="grid gap-5 p-5 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="pill bg-danger text-white">New rule</span>
            {imp.days_until_effective > 0 && <span className="pill bg-warning text-navy-900">Starts 15 Oct · {imp.days_until_effective} days left</span>}
          </div>
          <h2 className="mt-2.5 text-xl font-bold leading-snug sm:text-[22px]">UPI fee on bills above ₹2,000</h2>
          <p className="mt-1 text-sm text-slate-600">
            0.4% of the bill, up to ₹300, plus 18% GST on the fee. Your customers pay nothing extra, so it comes out of your pocket.
          </p>
          <div className="mt-4">
            <div className="text-xs font-semibold text-slate-500">
              {imp.window_fully_in_effect ? 'Your last 90 days of payments cost you' : 'On your last 90 days of payments, this would have cost'}
            </div>
            <div className="num text-[44px] leading-tight text-danger-700"><AnimatedText text={inr(r.gross_cost)} /></div>
            <div className="text-sm text-slate-600">
              <b className="text-success-700">{inr(r.itc_recoverable)}</b> of that comes back as GST credit, so your real cost is <b className="text-navy">{inr(r.net_cost_after_itc)}</b>.
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-4 rounded-2xl bg-canvas p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <div className="text-[11px] font-semibold text-slate-500">Next quarter, after GST credit</div>
              <div className="num text-[26px] leading-tight"><AnimatedText text={`${inr(f.net_low)} to ${inr(f.net_high)}`} /></div>
              <div className="text-[11px] text-slate-400">Range assumes the next 3 months look like your last 6.</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-500">Bills affected</div>
              <div className="num text-2xl"><AnimatedText text={String(r.affected_transactions)} /></div>
              <div className="text-[11px] text-slate-400">of {r.total_transactions.toLocaleString('en-IN')} in 90 days</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-500">GST you can claim back</div>
              <div className="num text-2xl text-success-700"><AnimatedText text={inr(r.itc_recoverable)} /></div>
              <div className="text-[11px] text-slate-400">as Input Tax Credit</div>
            </div>
          </div>
          <Btn to={`/m/${merchantId}/alerts/${signal.id}`} size="lg" className="w-full">
            See the {signal.recommendations?.length || 4} ways to cut it <Icon name="chevronRight" className="h-4 w-4" />
          </Btn>
        </div>
      </div>
    </Card>
  );
}

export function AlertRow({ signal, merchantId }) {
  const { setUpgradeOpen } = useApp();
  const [icon, color] = signal.locked ? ['lock', 'orange'] : iconFor(signal);
  const body = (
    <>
      <IconTile name={icon} color={color} size="sm" />
      <div className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          {signal.locked ? <span className="pill bg-warning text-navy-900">Pro</span> : <SeverityChip severity={signal.severity} />}
        </div>
        <div className="mt-1 text-[14px] font-bold leading-snug text-navy">{plain(signal.title)}</div>
        <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">
          {signal.locked ? 'Get Pro to see the numbers and send the fix in one tap.' : plain(signal.how_it_affects_you)}
        </div>
      </div>
      <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-slate-300" />
    </>
  );
  const cls = 'flex w-full items-center gap-3 rounded-2xl px-3 py-3 hover:bg-canvas';
  return signal.locked ? (
    <Tap onClick={() => setUpgradeOpen(true)} className={cls}>{body}</Tap>
  ) : (
    <Tap to={`/m/${merchantId}/alerts/${signal.id}`} className={cls}>{body}</Tap>
  );
}

export function AlertGroup({ title, count, tone, items, merchantId, empty }) {
  return (
    <Card className="p-2 sm:p-3">
      <div className="flex items-center justify-between px-3 pb-1 pt-2">
        <div className="text-[15px] font-bold text-navy">{title}</div>
        <span className={`pill ${tone}`}>{count}</span>
      </div>
      {items.length === 0 ? (
        <div className="px-3 py-4 text-sm text-slate-500">{empty}</div>
      ) : (
        <div className="divide-y divide-navy-50">
          {items.map((s) => <AlertRow key={s.id} signal={s} merchantId={merchantId} />)}
        </div>
      )}
    </Card>
  );
}
