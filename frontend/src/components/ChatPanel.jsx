import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api, plain } from '../api';
import { useApp } from '../AppContext';
import { LogoMark } from './brand';
import { Icon } from './icons';

const SUGGESTIONS = [
  'How much will the new UPI fee cost me?',
  'Which customers should I move to Autopay?',
  'Kaunse customers wapas nahi aa rahe?',
  'When is my shop busiest?',
  'Should I raise my prices?',
];

const VIA = { anthropic: 'Claude', openai: 'OpenAI', mock: 'offline' };

function Typing() {
  return (
    <div className="flex w-16 items-center justify-center gap-1 rounded-2xl rounded-bl-md bg-white py-3 shadow-card">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-cerulean"
          animate={{ y: [0, -5, 0], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

export default function ChatPanel({ merchantId }) {
  const { chatOpen, setChatOpen, pro } = useApp();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (!merchantId) return;
    api.chatHistory(merchantId).then(setMessages).catch(() => setMessages([]));
  }, [merchantId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy, chatOpen]);

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput('');
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: 'user', content: q }]);
    setBusy(true);
    try {
      const reply = await api.chat(merchantId, q);
      setMessages((m) => [...m, reply]);
    } catch (e) {
      setMessages((m) => [...m, { id: `e${Date.now()}`, role: 'assistant', content: `Couldn't reach Munshi just now (${e.message}). Try again in a moment.`, source: 'error' }]);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    await api.clearChat(merchantId).catch(() => {});
    setMessages([]);
  }

  return (
    <AnimatePresence>
      {chatOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-navy-900/35"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setChatOpen(false)}
          />
          <motion.aside
            className="fixed bottom-0 right-0 top-0 z-[61] flex w-full max-w-md flex-col bg-canvas shadow-lift"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 36 }}
          >
            <div className="flex items-center gap-3 bg-navy px-4 py-3.5 text-white">
              <LogoMark onDark className="h-10 w-10" />
              <div className="flex-1">
                <div className="font-heading text-base font-bold">Ask Munshi</div>
                <div className="text-xs text-cerulean-200">Answers come from your own Paytm payments</div>
              </div>
              <button onClick={clear} title="Clear chat" className="rounded-full p-2 text-cerulean-200 hover:bg-white/10 hover:text-white"><Icon name="trash" className="h-4 w-4" /></button>
              <button onClick={() => setChatOpen(false)} title="Close" className="rounded-full p-2 text-cerulean-200 hover:bg-white/10 hover:text-white"><Icon name="close" className="h-5 w-5" /></button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && (
                <div className="card p-4 text-sm leading-relaxed text-slate-700">
                  Namaste! Ask me anything about your shop's money. English, Hindi or Hinglish, all fine.
                  <div className="mt-2 text-xs text-slate-500">Try: "Pichhle mahine kitna kamaya?" or "What will the new UPI fee cost me?"</div>
                  {!pro && <div className="mt-2 text-xs font-semibold text-warning-700">Customer churn, busy hours and peer comparisons need Pro.</div>}
                </div>
              )}
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === 'user' ? 'rounded-br-md bg-cerulean font-medium text-white' : 'rounded-bl-md bg-white text-navy-900 shadow-card'}`}>
                    {m.role === 'user' ? m.content : plain(m.content)}
                    {m.role === 'assistant' && m.source && m.source !== 'error' && (
                      <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">via {VIA[m.source] || m.source}</div>
                    )}
                  </div>
                </motion.div>
              ))}
              {busy && <Typing />}
              <div ref={endRef} />
            </div>

            <div className="bg-white p-3 shadow-nav">
              <div className="no-scrollbar mb-2 flex gap-2 overflow-x-auto pb-1">
                {SUGGESTIONS.map((s) => (
                  <motion.button
                    key={s}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => send(s)}
                    className="shrink-0 rounded-full bg-cerulean-50 px-3 py-1.5 text-xs font-semibold text-cerulean-700 hover:bg-cerulean-100"
                  >
                    {s}
                  </motion.button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="flex gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about sales, fees, customers"
                  className="flex-1 rounded-full bg-canvas px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cerulean"
                />
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-cerulean text-white disabled:opacity-50"
                  disabled={busy || !input.trim()}
                  aria-label="Send"
                >
                  <Icon name="send" className="h-5 w-5" />
                </motion.button>
              </form>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
