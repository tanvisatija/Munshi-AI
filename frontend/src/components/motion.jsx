import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { animate, motion, useReducedMotion } from 'framer-motion';
import { Icon } from './icons';

const EASE = [0.16, 1, 0.3, 1];
const MotionLink = motion.create(Link);

// ---------------------------------------------------------------- count-up

// A background tab gets no animation frames, so a count-up would sit at 0 until the user
// switches back. When the page is hidden, show the real number straight away.
const pageHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

export function useCountUp(value, duration = 1.1) {
  const reduce = useReducedMotion();
  const target = Number(value) || 0;
  const [shown, setShown] = useState(reduce || pageHidden() ? target : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduce || pageHidden()) {
      setShown(target);
      from.current = target;
      return undefined;
    }
    const controls = animate(from.current, target, { duration, ease: EASE, onUpdate: setShown });
    from.current = target;
    return () => controls.stop();
  }, [target, duration, reduce]);
  return shown;
}

function formatLike(n, template) {
  const decimals = template.includes('.') ? template.split('.')[1].length : 0;
  if (template.includes(',') || n >= 1000) {
    return n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return n.toFixed(decimals);
}

function CountToken({ token, duration }) {
  const target = parseFloat(token.replace(/,/g, ''));
  const v = useCountUp(target, duration);
  return <>{formatLike(v, token)}</>;
}

/** Renders a value string ("₹3,197", "58", "4.9x", "₹2,577 to ₹3,183") with every number ticking up. */
export function AnimatedText({ text, duration = 1.1 }) {
  const parts = String(text ?? '').split(/(\d[\d,]*(?:\.\d+)?)/);
  return (
    <>
      {parts.map((p, i) =>
        /^\d/.test(p) && !/^(am|pm)/i.test(parts[i + 1] || '') ? <CountToken key={i} token={p} duration={duration} /> : <span key={i}>{p}</span>,
      )}
    </>
  );
}

export function CountUp({ value, format = (v) => Math.round(v).toLocaleString('en-IN'), duration }) {
  const v = useCountUp(value, duration);
  return <>{format(v)}</>;
}

// ---------------------------------------------------------------- buttons

const VARIANTS = {
  primary: 'bg-cerulean text-white hover:bg-cerulean-600',
  navy: 'bg-navy text-white hover:bg-navy-700',
  ghost: 'bg-white text-navy shadow-card hover:bg-cerulean-50 hover:text-cerulean-700',
  soft: 'bg-cerulean-50 text-cerulean-700 hover:bg-cerulean-100',
  pro: 'bg-warning text-navy-900 hover:brightness-105',
  white: 'bg-white text-cerulean-700 hover:bg-cerulean-50',
};
const SIZES = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm', lg: 'px-5 py-3 text-[15px]' };

/** Tactile button: scales to 0.97 on press and throws a ripple from the touch point. */
export const Btn = forwardRef(function Btn(
  { variant = 'primary', size = 'md', className = '', children, to, href, onClick, disabled, type = 'button', ...rest },
  ref,
) {
  const [ripples, setRipples] = useState([]);
  const onPointerDown = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const s = Math.max(r.width, r.height) * 2;
    const id = `${Date.now()}${Math.random()}`;
    setRipples((rs) => [...rs, { id, x: e.clientX - r.left - s / 2, y: e.clientY - r.top - s / 2, s }]);
    setTimeout(() => setRipples((rs) => rs.filter((x) => x.id !== id)), 650);
  };
  const light = variant === 'ghost' || variant === 'white' || variant === 'soft';
  const cls = `relative isolate select-none overflow-hidden inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${SIZES[size]} ${VARIANTS[variant]} ${className}`;
  const inner = (
    <>
      {children}
      {ripples.map((r) => (
        <motion.span
          key={r.id}
          className={`pointer-events-none absolute -z-10 rounded-full ${light ? 'bg-cerulean/20' : 'bg-white/35'}`}
          style={{ left: r.x, top: r.y, width: r.s, height: r.s }}
          initial={{ scale: 0, opacity: 0.8 }}
          animate={{ scale: 1, opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      ))}
    </>
  );
  const common = {
    ref,
    className: cls,
    whileTap: disabled ? undefined : { scale: 0.97 },
    onPointerDown: disabled ? undefined : onPointerDown,
    ...rest,
  };
  if (to) return <MotionLink to={to} onClick={onClick} {...common}>{inner}</MotionLink>;
  if (href) return <motion.a href={href} onClick={onClick} {...common}>{inner}</motion.a>;
  return <motion.button type={type} onClick={onClick} disabled={disabled} {...common}>{inner}</motion.button>;
});

/** Unstyled pressable (tiles, list rows). */
export function Tap({ to, onClick, className = '', children, ...rest }) {
  const props = { className, whileTap: { scale: 0.96 }, transition: { type: 'spring', stiffness: 500, damping: 30 }, ...rest };
  if (to) return <MotionLink to={to} onClick={onClick} {...props}>{children}</MotionLink>;
  return <motion.button type="button" onClick={onClick} {...props}>{children}</motion.button>;
}

// ---------------------------------------------------------------- entrance

const staggerVariants = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const riseVariants = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } } };

/** Children marked <Rise> fade and slide up one after another, ~70ms apart. */
export function Stagger({ className = '', children }) {
  return (
    <motion.div className={className} variants={staggerVariants} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function Rise({ className = '', children, ...rest }) {
  return (
    <motion.div className={className} variants={riseVariants} {...rest}>
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------- skeleton

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

// ---------------------------------------------------------------- health ring

export function Ring({ value, size = 136, stroke = 13, dark = false }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = useCountUp(value, 1.4);
  const color = value >= 75 ? '#1DB954' : value >= 60 ? '#00BAF2' : '#FFB020';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={dark ? 'rgba(255,255,255,0.12)' : '#E6F8FE'} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value / 100) }}
          transition={{ duration: 1.4, ease: EASE }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-heading font-bold leading-none tabular-nums ${dark ? 'text-white' : 'text-navy'}`} style={{ fontSize: size * 0.3 }}>{Math.round(shown)}</span>
        <span className={`mt-1 text-[11px] font-medium ${dark ? 'text-cerulean-100' : 'text-slate-500'}`}>out of 100</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- reward moment

const CONFETTI = ['#00BAF2', '#002E6E', '#FFB020', '#1DB954', '#E5484D'];

/** Checkmark pop with a small confetti burst. Plays once on mount. */
export function Celebrate({ label, sub }) {
  const pieces = useMemo(
    () => Array.from({ length: 26 }, (_, i) => ({
      angle: (i / 26) * Math.PI * 2 + Math.random() * 0.35,
      dist: 70 + Math.random() * 70,
      color: CONFETTI[i % CONFETTI.length],
      size: 6 + Math.random() * 6,
      spin: Math.random() * 540 - 270,
    })),
    [],
  );
  return (
    <div className="flex flex-col items-center py-3">
      <div className="relative h-20 w-20">
        {pieces.map((p, i) => (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 rounded-[2px]"
            style={{ width: p.size, height: p.size * 0.55, background: p.color, marginLeft: -p.size / 2, marginTop: -p.size / 4 }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.3 }}
            animate={{ x: Math.cos(p.angle) * p.dist, y: Math.sin(p.angle) * p.dist + 30, opacity: 0, rotate: p.spin, scale: 1 }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.12 }}
          />
        ))}
        <motion.span
          className="absolute inset-0 flex items-center justify-center rounded-full bg-success text-white shadow-lift"
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.2, 1] }}
          transition={{ duration: 0.5, times: [0, 0.6, 1], ease: 'easeOut' }}
        >
          <Icon name="check" className="h-10 w-10" />
        </motion.span>
      </div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-4 text-center">
        <div className="font-heading text-lg font-bold text-navy">{label}</div>
        {sub && <div className="mt-0.5 text-sm text-slate-500">{sub}</div>}
      </motion.div>
    </div>
  );
}
