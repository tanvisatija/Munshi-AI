import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Splash from '../Splash';
import { CROSS_FADE_MS, FLAT_NAVY_AT_MS, LEAVE_AT_MS, LOAD_TIMEOUT_MS } from './timeline';

// The three.js chunk is only fetched when the 3D splash will actually run, and fetching starts
// the moment we know that, so it never blocks the app bundle or a quick skip.
const loadScene = () => import('./Scene3D');
const Scene3D = lazy(loadScene);

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext(); // don't hold a context just for the check
    return !!gl;
  } catch {
    return false;
  }
}

/** '3d' or '2d'. `?splash=2d|3d` in the URL forces one (handy for demos and testing). */
function chooseMode() {
  if (typeof window === 'undefined') return '2d';
  const forced = new URLSearchParams(window.location.search).get('splash');
  if (forced === '2d' || forced === '3d') return forced === '3d' && !hasWebGL() ? '2d' : forced;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return !reduce && hasWebGL() ? '3d' : '2d';
}

class SceneBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.warn('3D splash failed, using the 2D splash instead:', error);
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** 3D shell: navy backdrop, lazy scene, timers, skip. Falls back to 2D via onFail. */
function Shell3D({ onLeaving, onDone, onFail }) {
  const [ready, setReady] = useState(false);
  const [flat, setFlat] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const left = useRef(false);
  const readyRef = useRef(false);
  const timers = useRef([]);
  const cb = useRef({ onLeaving, onDone, onFail });
  cb.current = { onLeaving, onDone, onFail };

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  const leave = useCallback(() => {
    if (left.current) return;
    left.current = true;
    setFlat(true);
    setLeaving(true);
    cb.current.onLeaving?.();
    later(() => cb.current.onDone?.(), CROSS_FADE_MS);
  }, []);

  // Too slow to load or to draw a first frame: hand over to the 2D splash.
  useEffect(() => {
    const t = setTimeout(() => !left.current && !readyRef.current && cb.current.onFail(), LOAD_TIMEOUT_MS);
    const onKey = (e) => ['Enter', ' ', 'Escape'].includes(e.key) && leave();
    window.addEventListener('keydown', onKey);
    const all = timers.current;
    return () => {
      clearTimeout(t);
      all.forEach(clearTimeout);
      window.removeEventListener('keydown', onKey);
    };
  }, [leave]);

  const onReady = useCallback(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    setReady(true);
    later(() => setFlat(true), FLAT_NAVY_AT_MS);
    later(leave, LEAVE_AT_MS);
  }, [leave]);

  return (
    <div
      className="fixed inset-0 z-[100] cursor-pointer select-none overflow-hidden bg-navy"
      style={{ opacity: leaving ? 0 : 1, transition: `opacity ${CROSS_FADE_MS}ms ease-in-out`, pointerEvents: leaving ? 'none' : 'auto' }}
      onClick={leave}
      role="button"
      tabIndex={0}
      aria-label="Munshi AI is starting. Tap to skip."
    >
      <SceneBoundary onError={() => cb.current.onFail()}>
        <Suspense fallback={null}>
          <div className="absolute inset-0" style={{ opacity: ready ? 1 : 0, transition: 'opacity 250ms ease-out' }}>
            <Scene3D paused={leaving} onReady={onReady} onContextLost={() => !left.current && cb.current.onFail()} />
          </div>
        </Suspense>
      </SceneBoundary>
      {/* Scene fades to flat navy before the hand-off to the dashboard. */}
      <div className="pointer-events-none absolute inset-0 bg-navy" style={{ opacity: flat ? 1 : 0, transition: 'opacity 400ms ease-in-out' }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),28px)] text-center text-xs font-medium text-cerulean-200">
        Tap anywhere to skip
      </div>
    </div>
  );
}

/**
 * Launch screen. Uses the 3D "Growth Ascension" scene when WebGL is available and the user
 * hasn't asked for reduced motion; otherwise, or if anything in 3D throws, loses its context
 * or is too slow to start, it falls back to the 2D splash. Same onLeaving/onDone contract.
 */
export default function Splash3D({ onLeaving, onDone }) {
  const [mode, setMode] = useState(chooseMode);
  useEffect(() => {
    if (mode === '3d') loadScene().catch(() => setMode('2d'));
  }, [mode]);

  if (mode === '2d') return <Splash onLeaving={onLeaving} onDone={onDone} />;
  return <Shell3D onLeaving={onLeaving} onDone={onDone} onFail={() => setMode('2d')} />;
}
