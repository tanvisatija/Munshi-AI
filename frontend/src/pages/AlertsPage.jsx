import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { inr } from '../api';
import { useApp, useMerchant } from '../AppContext';
import { AlertRow } from '../components/Alerts';
import { Icon } from '../components/icons';
import { markAlertsSeen } from '../components/Layout';
import { AnimatedText, Btn, Rise, Skeleton, Stagger } from '../components/motion';
import { Card, ErrorNote } from '../components/ui';

const TABS = [
  ['all', 'All'],
  ['risk', 'Risk and compliance'],
  ['growth', 'Growth ideas'],
];
const URGENCY = [
  ['high', 'Act now', 'bg-danger text-white'],
  ['medium', 'This week', 'bg-warning text-navy-900'],
  ['low', 'Ideas', 'bg-cerulean text-white'],
];

function SidePanel({ list, mid }) {
  const { pro, setUpgradeOpen } = useApp();
  const reg = list.find((s) => s.id === 'reg-upi-mdr' && !s.locked);
  const imp = reg?.details?.impact;
  const locked = list.filter((s) => s.locked).length;
  return (
    <div className="space-y-4">
      <div className="rounded-card bg-navy p-5 text-white shadow-card">
        <div className="text-xs font-semibold text-cerulean-200">Right now</div>
        <div className="font-heading text-3xl font-bold"><AnimatedText text={String(list.length)} /> things to look at</div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {URGENCY.map(([sev, label, cls]) => (
            <div key={sev} className="rounded-2xl bg-white/[0.07] p-2.5 text-center">
              <div className="font-heading text-2xl font-bold">{list.filter((s) => !s.locked && s.severity === sev).length}</div>
              <span className={`pill mt-1 ${cls}`}>{label}</span>
            </div>
          ))}
        </div>
      </div>
      {imp && !imp.small_merchant_exempt && (
        <Card className="p-5">
          <div className="text-xs font-semibold text-slate-500">New UPI fee, next quarter after GST credit</div>
          <div className="num text-2xl text-danger-700"><AnimatedText text={`${inr(imp.forward_estimate.net_low)} to ${inr(imp.forward_estimate.net_high)}`} /></div>
          <div className="mt-1 text-xs text-slate-500">{inr(imp.retrospective.itc_recoverable)} of GST credit to claim from the last 90 days</div>
          <Btn className="mt-3 w-full" to={`/m/${mid}/alerts/reg-upi-mdr`}>See the fixes <Icon name="chevronRight" className="h-4 w-4" /></Btn>
        </Card>
      )}
      {!pro && locked > 0 && (
        <div className="rounded-card bg-warning p-5 text-navy-900 shadow-card">
          <div className="font-heading text-lg font-bold">{locked} growth ideas are waiting</div>
          <p className="mt-1 text-sm">Pro shows the customers, the hours and the rupees, and sends each fix in one tap.</p>
          <Btn variant="navy" className="mt-3" onClick={() => setUpgradeOpen(true)}>See Pro</Btn>
        </div>
      )}
    </div>
  );
}

export default function AlertsPage() {
  const { mid, signals, merchants } = useMerchant();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'all';
  const list = signals.data || [];
  const shown = tab === 'all' ? list : list.filter((s) => s.category === tab);
  const count = (k) => (k === 'all' ? list.length : list.filter((s) => s.category === k).length);
  const shop = (merchants.data || []).find((m) => m.id === mid);

  useEffect(() => {
    if (signals.data) markAlertsSeen(mid, signals.data.map((s) => s.id));
  }, [signals.data, mid]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <h1 className="text-xl font-bold sm:text-2xl">Munshi's watchlist{shop ? ` for ${shop.name}` : ''}</h1>
      <p className="text-sm text-slate-500">Everything spotted in your Paytm payments, most urgent first.</p>

      <div className="mt-4 grid gap-4 lg:grid-cols-12 [&>*]:min-w-0">
        <div className="lg:col-span-8">
          <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-full bg-white p-1 shadow-card">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setParams(k === 'all' ? {} : { tab: k })}
                className={`relative shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors ${tab === k ? 'text-white' : 'text-slate-500 hover:text-navy'}`}
              >
                {tab === k && <motion.span layoutId="alerts-tab" className="absolute inset-0 rounded-full bg-cerulean" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <span className="relative">{label} <span className={tab === k ? 'text-cerulean-100' : 'text-slate-400'}>{count(k)}</span></span>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <ErrorNote error={!signals.data ? signals.error : null} />
            {!signals.data && !signals.error ? (
              <Card className="space-y-3 p-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-xl" />
                    <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-5/6" /></div>
                  </div>
                ))}
              </Card>
            ) : shown.length === 0 ? (
              <Card className="p-6 text-center text-sm text-slate-500">Nothing here right now.</Card>
            ) : (
              <Stagger key={tab}>
                <Card className="divide-y divide-navy-50 p-2">
                  {shown.map((s) => (
                    <Rise key={s.id}><AlertRow signal={s} merchantId={mid} /></Rise>
                  ))}
                </Card>
              </Stagger>
            )}
          </div>
        </div>
        <div className="lg:col-span-4">
          {signals.data ? <SidePanel list={list} mid={mid} /> : <Skeleton className="h-48 rounded-card" />}
        </div>
      </div>
    </main>
  );
}
