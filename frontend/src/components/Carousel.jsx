import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { inr, plain } from '../api';
import { useApp } from '../AppContext';
import { Icon } from './icons';
import { AnimatedText, Btn, Skeleton } from './motion';

const ROTATE_MS = 4500;
const BG = ['bg-navy', 'bg-cerulean-700', 'bg-cerulean-600', 'bg-navy-700'];

function Badge({ tone = 'orange', children }) {
  const cls = tone === 'red' ? 'bg-danger text-white' : tone === 'white' ? 'bg-white text-navy' : 'bg-warning text-navy-900';
  return <span className={`pill ${cls} shadow-sm`}>{children}</span>;
}

/** Turns a feed signal into banner content. Numbers come straight from the merchant's data. */
function toSlide(s, base) {
  if (s.locked) {
    return {
      id: s.id,
      badges: [['orange', 'Pro'], ['white', 'New']],
      kicker: s.category === 'growth' ? 'Growth idea' : 'Alert',
      title: plain(s.title),
      big: '₹ ••,•••',
      sub: 'Get Pro to see who, how much, and send the fix in one tap.',
      cta: 'Get Pro',
      locked: true,
    };
  }
  if (s.id === 'reg-upi-mdr') {
    const imp = s.details?.impact;
    if (!imp || imp.small_merchant_exempt) {
      return { id: s.id, badges: [['white', 'New rule']], kicker: 'UPI fee from 15 Oct', title: "You're exempt from the new UPI fee", big: '₹0', sub: 'Your QR receipts are under ₹1 lakh a month.', cta: 'See details', to: `${base}/alerts/${s.id}` };
    }
    const r = imp.retrospective;
    const f = imp.forward_estimate;
    return {
      id: s.id,
      badges: [['red', 'New rule'], ['orange', `${inr(r.itc_recoverable)} recoverable`]],
      kicker: `New UPI fee on bills above ₹2,000${imp.days_until_effective ? `, starts in ${imp.days_until_effective} days` : ''}`,
      title: 'Your cost next quarter, after GST credit',
      big: `${inr(f.net_low)} to ${inr(f.net_high)}`,
      sub: `Worked out from your own ${r.total_transactions.toLocaleString('en-IN')} payments. 4 ways to cut it.`,
      cta: 'See the 4 fixes',
      to: `${base}/alerts/${s.id}`,
    };
  }
  const m = s.metrics || [];
  if (s.id === 'growth-churn') {
    return { id: s.id, badges: [['red', `${m[0]?.value} at risk`]], kicker: 'Regulars who stopped coming', title: `${m[0]?.value} customers used to spend this with you`, big: `${m[1]?.value}/mo`, sub: `A 10% cashback could bring back ${plain(m[2]?.value)} a month.`, cta: 'Send win-back offer', to: `${base}/alerts/${s.id}` };
  }
  if (s.id === 'growth-peak-hours') {
    return { id: s.id, badges: [['orange', `${m[2]?.value} rush`]], kicker: 'Your busiest 2 hours', title: `Quietest stretch: ${plain(m[1]?.value)}`, big: plain(m[0]?.value), sub: plain(s.what_to_do), cta: 'Plan staff', to: `${base}/alerts/${s.id}` };
  }
  return { id: s.id, badges: [['white', 'Vs peers']], kicker: 'Merchants like you', title: plain(s.title), big: null, sub: plain(s.what_to_do), cta: 'Compare', to: `${base}/alerts/${s.id}` };
}

export default function InsightCarousel({ signals, base, loading }) {
  const navigate = useNavigate();
  const { setUpgradeOpen } = useApp();
  const slides = (signals || []).slice(0, 4).map((s) => toSlide(s, base));
  const [[index, dir], setIndex] = useState([0, 1]);
  const [paused, setPaused] = useState(false);
  const resumeTimer = useRef(null);
  const n = slides.length;

  const go = useCallback((delta) => setIndex(([i]) => [(i + delta + n) % n, delta]), [n]);

  useEffect(() => {
    if (paused || n < 2) return undefined;
    const t = setInterval(() => go(1), ROTATE_MS);
    return () => clearInterval(t);
  }, [paused, n, go]);

  useEffect(() => setIndex(([i]) => [i < n ? i : 0, 1]), [n]);

  if (loading && !n) return <Skeleton className="h-[248px] rounded-card sm:h-[190px]" />;
  if (!n) return null;
  const s = slides[index] || slides[0];

  const pauseForTouch = () => {
    setPaused(true);
    clearTimeout(resumeTimer.current);
  };
  const resumeAfterTouch = () => {
    clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), 3000);
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={pauseForTouch}
      onTouchEnd={resumeAfterTouch}
      aria-roledescription="carousel"
    >
      <div className="relative h-[248px] overflow-hidden rounded-card sm:h-[190px]">
        <AnimatePresence initial={false} custom={dir}>
          <motion.div
            key={s.id}
            custom={dir}
            variants={{
              enter: (d) => ({ x: d > 0 ? '100%' : '-100%' }),
              center: { x: 0 },
              exit: (d) => ({ x: d > 0 ? '-100%' : '100%' }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 260, damping: 32 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60) go(1);
              else if (info.offset.x > 60) go(-1);
            }}
            className={`absolute inset-0 flex cursor-grab flex-col justify-between overflow-hidden p-5 text-white active:cursor-grabbing ${BG[index % BG.length]}`}
          >
            {/* Solid decorative discs (no glow, no blur). */}
            <span className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-cerulean/25" />
            <span className="pointer-events-none absolute -bottom-16 right-24 h-32 w-32 rounded-full bg-cerulean/15" />
            <div className="relative">
              <div className="flex flex-wrap gap-1.5">
                {s.badges.map(([tone, text]) => (
                  <Badge key={text} tone={tone}>{text}</Badge>
                ))}
              </div>
              <div className="mt-2 text-xs font-semibold text-cerulean-100">{s.kicker}</div>
              <div className="mt-0.5 max-w-xl text-[15px] font-semibold leading-snug">{s.title}</div>
            </div>
            <div className="relative flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                {s.big && <div className="font-heading text-[28px] font-bold leading-none tabular-nums sm:text-[32px]"><AnimatedText text={s.big} /></div>}
                <div className="mt-1 max-w-md text-xs text-cerulean-100">{s.sub}</div>
              </div>
              <Btn
                variant="white"
                size="sm"
                onClick={() => (s.locked ? setUpgradeOpen(true) : navigate(s.to))}
              >
                {s.locked && <Icon name="lock" className="h-3.5 w-3.5" />}
                {s.cta}
                {!s.locked && <Icon name="chevronRight" className="h-3.5 w-3.5" />}
              </Btn>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      {n > 1 && (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          {slides.map((sl, i) => (
            <button key={sl.id} onClick={() => setIndex(([cur]) => [i, i > cur ? 1 : -1])} aria-label={`Show insight ${i + 1}`} className="p-1">
              <motion.span
                className="block h-1.5 rounded-full"
                animate={{ width: i === index ? 20 : 6, backgroundColor: i === index ? '#00BAF2' : '#C7D3E3' }}
                transition={{ duration: 0.3 }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
