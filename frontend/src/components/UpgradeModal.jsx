import { useApp } from '../AppContext';
import { Icon } from './icons';
import { Btn } from './motion';
import { Modal } from './ui';

const FREE = ['Business health score and dashboard', 'How much Munshi can see (visibility score)', 'Fee and compliance alerts, with your exact cost', "Munshi's take and chat"];
const PRO = [
  'Customers who stopped coming, ranked, with a win-back offer',
  'Your busy and quiet hours, with a staffing plan',
  'How you compare with merchants like you',
  'One tap to send, file or record every fix',
  'GST credit summary as PDF and CSV',
];

export default function UpgradeModal() {
  const { upgradeOpen, setUpgradeOpen, setPro, pro } = useApp();
  return (
    <Modal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} title="Munshi AI Pro" wide>
      <div className="grid gap-3 sm:grid-cols-[1fr_1.25fr]">
        <div className="rounded-2xl bg-canvas p-4">
          <div className="label">Free, always</div>
          <div className="num mt-1 text-3xl">₹0</div>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {FREE.map((f) => (
              <li key={f} className="flex gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-success" />{f}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-navy p-4 text-white">
          <div className="flex items-center justify-between">
            <span className="pill bg-warning text-navy-900">Pro</span>
            <span className="text-[11px] text-cerulean-200">Everything in Free, plus</span>
          </div>
          <div className="mt-1 font-heading text-3xl font-bold">₹199<span className="text-sm font-medium text-cerulean-200"> a month</span></div>
          <ul className="mt-3 space-y-2 text-sm">
            {PRO.map((f) => (
              <li key={f} className="flex gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />{f}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">Demo only. The price is illustrative and no payment is taken. This just switches the plan so you can see both.</p>
      <div className="mt-4 flex justify-end gap-2">
        <Btn variant="ghost" onClick={() => setUpgradeOpen(false)}>Not now</Btn>
        <Btn
          variant="pro"
          disabled={pro}
          onClick={async () => {
            await setPro(true);
            setUpgradeOpen(false);
          }}
        >
          {pro ? "You're on Pro" : 'Switch to Pro'}
        </Btn>
      </div>
    </Modal>
  );
}
