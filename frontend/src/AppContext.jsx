import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';

const AppCtx = createContext(null);

export function AppProvider({ children }) {
  const [settings, setSettings] = useState({ pro_enabled: false, llm: { active: 'mock' }, agents: [] });
  const [toasts, setToasts] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  // Bumped after any action so pages refetch (feed, log, dashboard).
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api.settings().then(setSettings).catch(() => {});
  }, []);

  const toast = useCallback((message, tone = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const setPro = useCallback(
    async (on) => {
      const s = await api.setPro(on);
      setSettings(s);
      setVersion((v) => v + 1);
      toast(on ? "You're on Pro. Growth ideas and one-tap actions are switched on." : 'Back on the Free plan.', on ? 'success' : 'info');
    },
    [toast],
  );

  const value = useMemo(
    () => ({
      settings, pro: settings.pro_enabled, setPro,
      toasts, toast,
      chatOpen, setChatOpen,
      upgradeOpen, setUpgradeOpen,
      version, bump: () => setVersion((v) => v + 1),
    }),
    [settings, setPro, toasts, toast, chatOpen, upgradeOpen, version],
  );
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export const useApp = () => useContext(AppCtx);

// Tiny data hook: refetches when deps change; keeps the last data while reloading; never throws into render.
export function useFetch(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState((s) => ({ data: s.data, error, loading: false })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

// Per-merchant data shared by the header (bell), carousel, dashboard, alerts and profile pages.
const MerchantCtx = createContext(null);

export function MerchantProvider({ mid, children }) {
  const { pro, version } = useApp();
  const dash = useFetch(() => api.dashboard(mid), [mid, version]);
  const signals = useFetch(() => api.signals(mid), [mid, pro, version]);
  const merchants = useFetch(() => api.merchants(), []);
  const value = useMemo(() => ({ mid, dash, signals, merchants }), [mid, dash, signals, merchants]);
  return <MerchantCtx.Provider value={value}>{children}</MerchantCtx.Provider>;
}

export const useMerchant = () => useContext(MerchantCtx);
