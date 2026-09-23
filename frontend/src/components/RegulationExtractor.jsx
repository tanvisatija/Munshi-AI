import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api, inr, plain } from '../api';
import { Icon, IconTile } from './icons';
import { AnimatedText, Btn, Skeleton } from './motion';
import { Card } from './ui';

const SAMPLES = [
  {
    label: 'The 15 Oct 2026 rule',
    text:
      'With effect from 15 October 2026, a Merchant Discount Rate (MDR) of 0.4% shall be levied on person-to-merchant (P2M) UPI transactions above ₹2,000, capped at ₹300 per transaction. GST at 18% is applicable on the MDR. Recurring payments through UPI AutoPay mandates are exempt, as are small merchants receiving up to ₹1 lakh per month via UPI QR.',
  },
  {
    label: 'A made-up 2027 rule',
    text:
      'Illustrative circular: From 1st April 2027, P2M UPI transactions exceeding Rs. 5,000 shall attract an MDR of 0.3 per cent, subject to a maximum of Rs 150 per transaction. 18% GST shall be charged on the MDR. Transactions under recurring mandates (UPI AutoPay) shall be exempt.',
  },
];

const MISSING_LABEL = {
  threshold: 'threshold',
  rate_pct: 'fee rate',
  cap: 'cap',
  gst_pct: 'GST rate',
  effective_date: 'start date',
  exempt_recurring: 'Autopay exemption',
  small_merchant_monthly_limit: 'small-merchant limit',
};

const NONE = 'Not stated';
const FIELDS = [
  ['threshold', 'Applies above', (v) => (v == null ? NONE : inr(v))],
  ['rate_pct', 'Fee rate', (v) => (v == null ? NONE : `${v}%`)],
  ['cap', 'Cap per bill', (v, rule) => (rule.no_cap ? 'No cap' : v == null ? NONE : inr(v))],
  ['gst_pct', 'GST on the fee', (v) => (v == null ? NONE : `${v}%`)],
  ['effective_date', 'Starts', (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : NONE)],
  ['exempt_recurring', 'Autopay exempt', (v) => (v == null ? NONE : v ? 'Yes' : 'No')],
];

const SOURCE = { anthropic: 'Read by Claude', openai: 'Read by OpenAI' };

export default function RegulationExtractor({ merchantId, baseline }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(null);
  const [extracted, setExtracted] = useState(null);
  const [sim, setSim] = useState(null);
  const [error, setError] = useState(null);

  async function extract() {
    setBusy('extract');
    setError(null);
    setSim(null);
    setExtracted(null);
    try {
      setExtracted(await api.extractRule(text));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function simulate() {
    setBusy('simulate');
    setError(null);
    try {
      const { summary, ...rule } = extracted.rule; // eslint-disable-line no-unused-vars
      setSim(await api.simulateRule(merchantId, rule));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  const r = sim?.impact?.retrospective;
  const f = sim?.impact?.forward_estimate;
  const diff = r && baseline ? r.net_cost_after_itc - baseline.net_cost_after_itc : 0;
  return (
    <Card className="scroll-mt-24 p-5" id="rule-check">
      <div className="flex items-start gap-3">
        <IconTile name="search" color="deep" />
        <div>
          <h3 className="text-[17px] font-bold">Heard about a new rule? Paste it here.</h3>
          <p className="mt-0.5 text-sm text-slate-600">
            Munshi pulls out the rate, threshold, cap and start date, then runs it on your own last 90 days. Works for any fee rule, not just this one.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {SAMPLES.map((s) => (
          <Btn key={s.label} variant="soft" size="sm" onClick={() => { setText(s.text); setExtracted(null); setSim(null); }}>
            Try: {s.label}
          </Btn>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Paste the circular or news text here"
        className="mt-3 w-full rounded-2xl bg-canvas p-3.5 text-sm outline-none focus:ring-2 focus:ring-cerulean"
      />
      <div className="mt-2 flex justify-end">
        <Btn disabled={text.trim().length < 20 || !!busy} onClick={extract}>
          <Icon name="search" className="h-4 w-4" /> {busy === 'extract' ? 'Reading the rule' : 'Read this rule'}
        </Btn>
      </div>
      {error && <div className="mt-3 rounded-xl bg-danger-50 p-3 text-sm font-medium text-danger-700">{error}</div>}

      {busy === 'extract' && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {FIELDS.map(([k]) => <Skeleton key={k} className="h-14 rounded-xl" />)}
        </div>
      )}

      <AnimatePresence>
        {extracted && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <div>
              <div className="label mb-2">{SOURCE[extracted.source] || 'Read offline'} · what Munshi found</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {FIELDS.map(([k, label, fmt]) => {
                  const val = fmt(extracted.rule[k], extracted.rule);
                  return (
                    <div key={k} className="rounded-xl bg-canvas p-3">
                      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
                      <div className={`font-heading text-base font-bold ${val === NONE ? 'text-slate-400' : 'text-navy'}`}>{val}</div>
                    </div>
                  );
                })}
              </div>
              {extracted.missing?.length > 0 && extracted.usable !== false && (
                <p className="mt-2 text-xs text-warning-700">
                  Not in the text: {extracted.missing.map((k) => MISSING_LABEL[k] || k).join(', ')}. Munshi uses today's rule for these.
                </p>
              )}
              <details className="mt-2 text-xs text-slate-500">
                <summary className="cursor-pointer font-semibold text-cerulean-700">See the raw JSON</summary>
                <pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-navy-900 p-3 text-[11px] text-cerulean-100">{JSON.stringify(extracted.rule, null, 2)}</pre>
              </details>
            </div>
            <div className="flex flex-col justify-end gap-3">
              {extracted.usable === false ? (
                <p className="rounded-xl bg-warning-50 p-3 text-sm font-medium text-warning-700">
                  There's no rate or threshold in this text, so there's nothing to run yet. Paste the paragraph that states the fee.
                </p>
              ) : (
                <p className="text-sm text-slate-600">Run this rule on your last 90 days to see what it would cost you.</p>
              )}
              <Btn variant="navy" size="lg" className="w-full" disabled={!!busy || extracted.usable === false} onClick={simulate}>
                {busy === 'simulate' ? 'Running on your payments' : 'Run it on my last 90 days'}
              </Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sim && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-2xl bg-cerulean-50 p-4">
            <div className="text-sm font-bold text-navy">Under this rule, your last 90 days:</div>
            <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
              <div><div className="text-[11px] font-semibold text-slate-500">Bills hit</div><div className="num text-2xl"><AnimatedText text={String(r.affected_transactions)} /></div></div>
              <div><div className="text-[11px] font-semibold text-slate-500">Fee plus GST</div><div className="num text-2xl"><AnimatedText text={inr(r.gross_cost)} /></div></div>
              <div><div className="text-[11px] font-semibold text-slate-500">After GST credit</div><div className="num text-2xl"><AnimatedText text={inr(r.net_cost_after_itc)} /></div></div>
              <div><div className="text-[11px] font-semibold text-slate-500">Next quarter</div><div className="num text-lg leading-8"><AnimatedText text={`${inr(f.net_low)} to ${inr(f.net_high)}`} /></div></div>
            </div>
            {baseline && (
              <p className="mt-3 text-sm text-slate-700">
                Today's rule costs you {inr(baseline.net_cost_after_itc)} after GST credit. This one is{' '}
                <b className={diff > 0 ? 'text-danger-700' : 'text-success-700'}>{inr(Math.abs(diff))} {diff > 0 ? 'more' : 'less'}</b> a quarter.
              </p>
            )}
            {sim.impact.small_merchant_exempt && <p className="mt-2 text-sm font-semibold text-success-700">You'd be exempt as a small merchant under this rule.</p>}
            {extracted?.rule?.summary && <p className="mt-2 text-xs text-slate-500">{plain(extracted.rule.summary)}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
