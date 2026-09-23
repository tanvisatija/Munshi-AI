// Empty VITE_API_URL = same origin (Vite dev proxy, nginx proxy, or FastAPI serving the build).
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const apiUrl = (path) => `${BASE}${path}`;

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(apiUrl(path), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      detail = typeof data.detail === 'string' ? data.detail : detail;
    } catch {
      /* non-JSON error body */
    }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const api = {
  settings: () => request('/api/settings'),
  setPro: (pro_enabled) => request('/api/settings', { method: 'PUT', body: { pro_enabled } }),
  merchants: () => request('/api/merchants'),
  dashboard: (mid) => request(`/api/merchants/${mid}/dashboard`),
  setVisibility: (mid, visibility_pct) =>
    request(`/api/merchants/${mid}/visibility`, { method: 'PUT', body: { visibility_pct } }),
  summary: (mid, lang, refresh = false) =>
    request(`/api/merchants/${mid}/summary?lang=${lang}${refresh ? '&refresh=true' : ''}`),
  signals: (mid) => request(`/api/merchants/${mid}/signals`),
  signal: (mid, sid) => request(`/api/merchants/${mid}/signals/${sid}`),
  runAction: (mid, signal_id, recommendation_id, message) =>
    request(`/api/merchants/${mid}/actions`, { method: 'POST', body: { signal_id, recommendation_id, message } }),
  actions: (mid) => request(`/api/merchants/${mid}/actions`),
  confirmAction: (id) => request(`/api/actions/${id}/confirm`, { method: 'POST' }),
  cancelAction: (id) => request(`/api/actions/${id}/cancel`, { method: 'POST' }),
  chatHistory: (mid) => request(`/api/merchants/${mid}/chat`),
  chat: (mid, message) => request(`/api/merchants/${mid}/chat`, { method: 'POST', body: { message } }),
  clearChat: (mid) => request(`/api/merchants/${mid}/chat`, { method: 'DELETE' }),
  extractRule: (text) => request('/api/regulations/extract', { method: 'POST', body: { text } }),
  simulateRule: (mid, rule) => request(`/api/merchants/${mid}/regulations/simulate`, { method: 'POST', body: rule }),
};

// ₹1,23,456: Indian digit grouping.
export function inr(value, { decimals = 0 } = {}) {
  const n = Number(value || 0);
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}`;
}

export function compactInr(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  if (Math.abs(n) >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return inr(n);
}

export const LLM_LABEL = { anthropic: 'Claude', openai: 'OpenAI', mock: 'Offline mode' };

// UI copy rule: no em or en dashes. Backend text (alert titles, summaries, chat) still
// contains them, so every server string is passed through this before rendering.
//   "₹2,577–₹3,183" -> "₹2,577 to ₹3,183"      "4pm–6pm" -> "4pm to 6pm"
//   "... 30+ days — win them back" -> "... 30+ days. Win them back"
//   "exactly ₹3,197 — ₹2,710 MDR" -> "exactly ₹3,197: ₹2,710 MDR"
export function plain(text) {
  if (text == null) return text;
  return String(text)
    .replace(/(\S)\s*–\s*(\S)/g, '$1 to $2')
    .replace(/\s+—\s+([a-z])/g, (_, c) => `. ${c.toUpperCase()}`)
    .replace(/\s+—\s+/g, ': ')
    .replace(/[—–]/g, ', ');
}
