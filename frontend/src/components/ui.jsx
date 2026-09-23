import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../AppContext';
import { Icon } from './icons';
import { Btn } from './motion';

export function Card({ className = '', children, ...rest }) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function SectionHead({ title, sub, right }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-[17px] font-bold">{title}</h2>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

const SEVERITY = {
  high: ['bg-danger text-white', 'Act now'],
  medium: ['bg-warning text-navy-900', 'This week'],
  low: ['bg-cerulean-50 text-cerulean-700', 'Idea'],
  info: ['bg-navy-50 text-navy', 'FYI'],
};

export function SeverityChip({ severity }) {
  const [cls, label] = SEVERITY[severity] || SEVERITY.info;
  return <span className={`pill ${cls}`}>{label}</span>;
}

export function ProPill({ className = '' }) {
  return <span className={`pill bg-warning text-navy-900 ${className}`}>Pro</span>;
}

export function ModeChip({ mode }) {
  return mode === 'auto' ? (
    <span className="pill bg-success-50 text-success-700">Auto-executed</span>
  ) : (
    <span className="pill bg-warning-50 text-warning-700">Needs your approval</span>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return (
    <div className="flex items-center gap-2 rounded-xl bg-danger-50 p-3 text-sm font-medium text-danger-700">
      <Icon name="shield" className="h-4 w-4" /> {error.message || String(error)}
    </div>
  );
}

export function LockedButton({ label = 'Get Pro', className = '', size = 'md' }) {
  const { setUpgradeOpen } = useApp();
  return (
    <Btn variant="pro" size={size} className={className} onClick={() => setUpgradeOpen(true)}>
      <Icon name="lock" className="h-4 w-4" /> {label}
    </Btn>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-navy-900/45 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={`card max-h-[92vh] w-full overflow-y-auto rounded-b-none p-5 shadow-lift sm:rounded-b-card sm:p-6 ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h3 className="text-lg font-bold leading-snug">{title}</h3>
              <button onClick={onClose} className="rounded-full bg-canvas p-1.5 text-slate-500 hover:text-navy" aria-label="Close">
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const TOAST = {
  success: ['bg-success', 'check'],
  info: ['bg-cerulean', 'bell'],
  error: ['bg-danger', 'shield'],
};

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[80] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => {
          const [bg, icon] = TOAST[t.tone] || TOAST.info;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12 }}
              className="pointer-events-auto flex items-start gap-3 rounded-2xl bg-navy p-3 pr-4 text-sm text-white shadow-lift"
            >
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${bg}`}>
                <Icon name={icon} className="h-3.5 w-3.5" />
              </span>
              <span className="pt-0.5">{t.message}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
