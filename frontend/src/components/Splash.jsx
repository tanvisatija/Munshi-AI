import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { LogoMark } from './brand';

/** Total splash time, end to end, including the cross-fade out. Tune here. */
export const SPLASH_DURATION_MS = 2000;
/** Length of the cross-fade from splash into the app. */
export const SPLASH_FADE_OUT_MS = 400;

const ICON_IN_S = 0.5;
const TAGLINE_DELAY_S = ICON_IN_S + 0.2;

/**
 * Full-screen navy launch screen. Phases: 'show' -> 'leaving' (cross-fade) -> onDone().
 * Timing is driven by timers, not animation callbacks, so it always finishes on schedule.
 * Click, tap, Enter, Space or Escape skips straight to the cross-fade.
 */
export default function Splash({ onLeaving, onDone }) {
  const [leaving, setLeaving] = useState(false);
  const left = useRef(false);
  const callbacks = useRef({ onLeaving, onDone });
  callbacks.current = { onLeaving, onDone };
  const doneTimer = useRef(null);

  // Stable across renders, so the auto-leave timer below is set exactly once.
  const leave = useCallback(() => {
    if (left.current) return;
    left.current = true;
    setLeaving(true);
    callbacks.current.onLeaving?.();
    doneTimer.current = setTimeout(() => callbacks.current.onDone?.(), SPLASH_FADE_OUT_MS);
  }, []);

  useEffect(() => {
    const t = setTimeout(leave, SPLASH_DURATION_MS - SPLASH_FADE_OUT_MS);
    const onKey = (e) => ['Enter', ' ', 'Escape'].includes(e.key) && leave();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      clearTimeout(doneTimer.current);
      window.removeEventListener('keydown', onKey);
    };
  }, [leave]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex cursor-pointer select-none flex-col items-center justify-center bg-navy px-6"
      initial={{ opacity: 1 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: SPLASH_FADE_OUT_MS / 1000, ease: 'easeInOut' }}
      style={{ pointerEvents: leaving ? 'none' : 'auto' }}
      onClick={leave}
      role="button"
      tabIndex={0}
      aria-label="Munshi AI is starting. Tap to skip."
    >
      <div className="relative flex items-center justify-center">
        {/* One-time cyan ring expanding and fading out from behind the icon. */}
        {[0, 0.18].map((delay) => (
          <motion.span
            key={delay}
            className="absolute rounded-full border-[3px] border-cerulean"
            style={{ width: '100%', height: '100%' }}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: [0.9, 1.9], opacity: [0.7, 0] }}
            transition={{ duration: 1.1, delay: 0.25 + delay, ease: 'easeOut' }}
          />
        ))}
        <motion.span
          className="absolute rounded-full bg-cerulean"
          style={{ width: '100%', height: '100%' }}
          initial={{ scale: 1, opacity: 0 }}
          animate={{ scale: [1, 1.35], opacity: [0.35, 0] }}
          transition={{ duration: 0.9, delay: 0.3, ease: 'easeOut' }}
        />
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: ICON_IN_S, ease: [0.16, 1, 0.3, 1] }}
          className="relative"
        >
          <LogoMark onDark className="h-24 w-24 sm:h-28 sm:w-28" />
        </motion.div>
      </div>

      <motion.div
        className="mt-8 text-center"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: TAGLINE_DELAY_S, ease: 'easeOut' }}
      >
        <div className="font-heading text-[26px] font-bold leading-tight text-white sm:text-[30px]">
          Munshi <span className="text-cerulean">AI</span>
        </div>
        <div className="mt-2 font-heading text-base font-bold text-white sm:text-lg">Your business, understood.</div>
      </motion.div>

      <motion.div
        className="absolute bottom-[max(env(safe-area-inset-bottom),28px)] text-xs font-medium text-cerulean-200"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.3 }}
      >
        Tap anywhere to skip
      </motion.div>
    </motion.div>
  );
}
