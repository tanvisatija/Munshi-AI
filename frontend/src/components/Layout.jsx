import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { MerchantProvider, useApp, useMerchant } from '../AppContext';
import { LogoMark, WORDMARK_PNG_URL } from './brand';
import ChatPanel from './ChatPanel';
import { Icon } from './icons';
import UpgradeModal from './UpgradeModal';

// The lockup PNG sits on a small white plate so it reads on the navy bar whatever colours
// the artwork uses. Set to false if the wordmark file is already designed for dark backgrounds.
const WORDMARK_ON_PLATE = true;

export function Wordmark() {
  if (WORDMARK_PNG_URL) {
    return (
      <Link to="/" className="flex shrink-0 items-center" aria-label="Munshi AI home">
        <LogoMark onDark className="h-9 w-9 min-[400px]:hidden" />
        <span className={`hidden min-[400px]:flex ${WORDMARK_ON_PLATE ? 'items-center rounded-xl bg-white px-2 py-1' : ''}`}>
          <img src={WORDMARK_PNG_URL} alt="Munshi AI" className="h-7 w-auto" draggable="false" />
        </span>
      </Link>
    );
  }
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="Munshi AI home">
      <LogoMark onDark className="h-9 w-9" />
      <span className="hidden whitespace-nowrap font-heading text-[19px] font-bold text-white min-[400px]:inline">
        Munshi <span className="text-cerulean">AI</span>
      </span>
    </Link>
  );
}

export function BuiltForBadge({ className = '' }) {
  return (
    <span className={`rounded-full bg-cerulean px-3 py-1 text-[11px] font-bold text-white ${className}`}>
      Built for Paytm Build for India: Merchant Growth AI
    </span>
  );
}

// ------------------------------------------------------------------ top bar

function seenKey(mid) {
  return `munshi-seen-alerts-${mid}`;
}
function readSeen(mid) {
  try {
    return new Set(JSON.parse(localStorage.getItem(seenKey(mid)) || '[]'));
  } catch {
    return new Set();
  }
}
function writeSeen(mid, ids) {
  try {
    localStorage.setItem(seenKey(mid), JSON.stringify(ids));
  } catch {
    /* storage unavailable: the badge just won't persist */
  }
}

/** Called by the Alerts page too, so opening alerts from anywhere clears the badge. */
export function markAlertsSeen(mid, ids) {
  writeSeen(mid, ids);
  window.dispatchEvent(new CustomEvent('munshi-alerts-seen', { detail: mid }));
}

function Bell() {
  const { mid, signals } = useMerchant();
  const navigate = useNavigate();
  const controls = useAnimationControls();
  const [unseen, setUnseen] = useState(0);
  const lastIds = useRef('');

  useEffect(() => {
    const list = signals.data;
    if (!list) return;
    const ids = list.map((s) => s.id);
    const key = `${mid}:${ids.join('|')}`;
    if (key === lastIds.current) return;
    lastIds.current = key;
    const seen = readSeen(mid);
    const fresh = ids.filter((id) => !seen.has(id));
    setUnseen(fresh.length);
    // Shake once when there is something new to look at.
    if (fresh.length) controls.start({ rotate: [0, -18, 15, -11, 8, -4, 0], transition: { duration: 0.9, delay: 0.6 } });
  }, [signals.data, mid, controls]);

  useEffect(() => {
    const onSeen = (e) => e.detail === mid && setUnseen(0);
    window.addEventListener('munshi-alerts-seen', onSeen);
    return () => window.removeEventListener('munshi-alerts-seen', onSeen);
  }, [mid]);

  function open() {
    markAlertsSeen(mid, (signals.data || []).map((s) => s.id));
    navigate(`/m/${mid}/alerts`);
  }

  return (
    <button onClick={open} className="relative rounded-full p-2 text-white hover:bg-white/10" aria-label={`Alerts${unseen ? `, ${unseen} new` : ''}`}>
      <motion.span animate={controls} className="block origin-top">
        <Icon name="bell" className="h-6 w-6" />
      </motion.span>
      <AnimatePresence>
        {unseen > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-navy"
          >
            {unseen}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

function MerchantSwitcher() {
  const { mid, merchants } = useMerchant();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const list = merchants.data || [];
  const current = list.find((m) => m.id === mid);
  return (
    <div className="relative min-w-0 flex-1 sm:flex-none">
      <button onClick={() => setOpen(!open)} className="flex w-full min-w-0 max-w-[280px] items-center gap-1.5 rounded-xl px-2 py-1 text-left hover:bg-white/10" aria-label="Switch merchant">
        <span className="block min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{current?.name || 'Loading'}</span>
          <span className="hidden truncate text-[11px] text-cerulean-200 sm:block">{current ? `${current.category}, ${current.city}` : ''}</span>
        </span>
        <Icon name="chevronDown" className="h-4 w-4 shrink-0 text-cerulean-200" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="card absolute left-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] p-2 shadow-lift"
            onMouseLeave={() => setOpen(false)}
          >
            {list.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setOpen(false);
                  navigate(`/m/${m.id}`);
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-canvas ${m.id === mid ? 'bg-cerulean-50' : ''}`}
              >
                <span>
                  <span className="block text-sm font-semibold text-navy">{m.name}</span>
                  <span className="block text-xs text-slate-500">{m.category}, {m.city}</span>
                </span>
                {m.id === mid && <Icon name="check" className="h-4 w-4 text-cerulean" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PlanPill() {
  const { pro, setUpgradeOpen } = useApp();
  const { mid } = useMerchant();
  return pro ? (
    <Link to={`/m/${mid}/profile`} className="pill bg-warning text-navy-900">Pro</Link>
  ) : (
    <button onClick={() => setUpgradeOpen(true)} className="pill bg-white/15 text-white hover:bg-white/25">
      Free<span className="hidden sm:inline"> · Get Pro</span>
    </button>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-40 bg-navy">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 sm:gap-3">
        <Wordmark />
        <span className="hidden h-7 w-px bg-white/20 sm:block" />
        <MerchantSwitcher />
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <BuiltForBadge className="hidden xl:inline" />
          <PlanPill />
          <Bell />
        </div>
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ bottom nav

function BottomNav() {
  const { mid } = useParams();
  const { pathname } = useLocation();
  const { setChatOpen } = useApp();
  const base = `/m/${mid}`;
  const active =
    pathname === base ? 'home'
      : pathname.startsWith(`${base}/alerts`) ? 'alerts'
      : pathname.startsWith(`${base}/actions`) ? 'actions'
      : pathname.startsWith(`${base}/profile`) ? 'profile' : '';
  const items = [
    { key: 'home', label: 'Home', icon: 'home', to: base },
    { key: 'alerts', label: 'Alerts', icon: 'shield', to: `${base}/alerts` },
    { key: 'ask' },
    { key: 'actions', label: 'Actions', icon: 'clipboard', to: `${base}/actions` },
    { key: 'profile', label: 'Profile', icon: 'user', to: `${base}/profile` },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 bg-white shadow-nav">
      <div className="mx-auto grid max-w-lg grid-cols-5 items-end px-2 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5">
        {items.map((it) =>
          it.key === 'ask' ? (
            <div key="ask" className="flex justify-center">
              {/* Raised centre button, same treatment as Paytm's scan button. */}
              <motion.button whileTap={{ scale: 0.92 }} onClick={() => setChatOpen(true)} className="-mt-8 flex flex-col items-center" aria-label="Ask Munshi">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-cerulean p-1 shadow-lift ring-[5px] ring-white">
                  <LogoMark className="h-full w-full" />
                </span>
                <span className="mt-1 whitespace-nowrap text-[11px] font-bold text-cerulean-700">Ask Munshi</span>
              </motion.button>
            </div>
          ) : (
            <Link key={it.key} to={it.to} className="relative flex flex-col items-center gap-0.5 py-1.5">
              {active === it.key && (
                <motion.span layoutId="nav-indicator" className="absolute -top-1.5 h-1 w-8 rounded-full bg-cerulean" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />
              )}
              <Icon name={it.icon} className={`h-6 w-6 transition-colors ${active === it.key ? 'text-cerulean' : 'text-slate-400'}`} />
              <span className={`text-[11px] font-semibold ${active === it.key ? 'text-navy' : 'text-slate-500'}`}>{it.label}</span>
            </Link>
          ),
        )}
      </div>
    </nav>
  );
}

export default function Layout() {
  const { mid } = useParams();
  return (
    <MerchantProvider mid={mid}>
      <div className="min-h-screen pb-28">
        <TopBar />
        <Outlet />
        <BottomNav />
        <ChatPanel merchantId={mid} />
        <UpgradeModal />
      </div>
    </MerchantProvider>
  );
}
