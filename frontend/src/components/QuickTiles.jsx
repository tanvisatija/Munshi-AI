import { useApp } from '../AppContext';
import { LogoMark } from './brand';
import { IconTile } from './icons';
import { Tap } from './motion';
import { Card } from './ui';

/** Paytm-style service grid: bold filled icons, each with its own colour. */
export default function QuickTiles({ base, onHealth }) {
  const { setChatOpen, pro } = useApp();
  const tiles = [
    { label: 'Health Score', icon: 'heart', color: 'green', onClick: onHealth },
    { label: 'Growth Ideas', icon: 'growth', color: 'cyan', to: `${base}/alerts?tab=growth`, pro: true },
    { label: 'Alerts', icon: 'shield', color: 'red', to: `${base}/alerts` },
    { label: 'Ask Munshi', logo: true, onClick: () => setChatOpen(true) },
    { label: 'GST Credit', icon: 'doc', color: 'orange', to: `${base}/alerts/reg-upi-mdr#itc-summary` },
    { label: 'Autopay', icon: 'bolt', color: 'green', to: `${base}/alerts/reg-upi-mdr#autopay-conversion` },
    { label: 'Check a Rule', icon: 'search', color: 'deep', to: `${base}/alerts/reg-upi-mdr#rule-check` },
    { label: 'Actions Log', icon: 'clipboard', color: 'navy', to: `${base}/actions` },
  ];
  return (
    <Card className="px-3 py-4 sm:px-5">
      <div className="mb-3 px-1 text-[15px] font-bold text-navy">Run your shop</div>
      <div className="grid grid-cols-4 gap-y-4 md:grid-cols-8">
        {tiles.map((t) => (
          <Tap key={t.label} to={t.to} onClick={t.onClick} className="relative flex flex-col items-center gap-1.5 rounded-xl px-1 py-1 text-center">
            {t.logo ? <LogoMark className="h-11 w-11" /> : <IconTile name={t.icon} color={t.color} />}
            <span className="text-[12px] font-semibold leading-tight text-navy">{t.label}</span>
            {t.pro && !pro && <span className="pill absolute -top-1 right-1 bg-warning px-1.5 py-0 text-[9px] text-navy-900">Pro</span>}
          </Tap>
        ))}
      </div>
    </Card>
  );
}
