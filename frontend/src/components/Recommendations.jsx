import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api, apiUrl, inr, plain } from '../api';
import { useApp } from '../AppContext';
import { Icon, IconTile } from './icons';
import { AnimatedText, Btn, Celebrate } from './motion';
import { Card, LockedButton, Modal, ModeChip } from './ui';

const TYPE_TILE = { message: ['send', 'green'], document: ['doc', 'orange'], pricing: ['tag', 'navy'], setting: ['sliders', 'cyan'] };

function Recipients({ list }) {
  const shown = list.slice(0, 8);
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((r) => (
        <span key={r} className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-slate-600">{r}</span>
      ))}
      {list.length > shown.length && <span className="rounded-full bg-cerulean-50 px-2.5 py-1 text-xs font-bold text-cerulean-700">+{list.length - shown.length} more</span>}
    </div>
  );
}

function successCopy(a, entry) {
  if (a.type === 'message') return ['Sent', `${a.recipients.length > 1 ? `${a.recipients.length} customers` : a.recipients[0]} will get it on WhatsApp (simulated).`];
  if (a.type === 'document') return ['Your GST credit summary is ready', 'Download it below or find it in your Actions log.'];
  if (a.type === 'pricing') return ['Decision recorded', entry?.detail ? plain(entry.detail) : ''];
  return ['Done', 'Saved to your Actions log.'];
}

function ActionModal({ open, onClose, merchantId, signalId, rec }) {
  const { toast, bump } = useApp();
  const a = rec.action;
  const [message, setMessage] = useState(a.preview || '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [celebrate, setCelebrate] = useState(false);

  function reward(entry) {
    setResult(entry);
    setCelebrate(true);
    bump();
  }

  async function run() {
    setBusy(true);
    try {
      const entry = await api.runAction(merchantId, signalId, rec.id, a.type === 'message' ? message : undefined);
      if (entry.status === 'pending_confirmation') {
        setResult(entry);
        bump();
        toast('One more tap. Confirm the pricing decision to record it.', 'info');
      } else {
        reward(entry);
        toast(a.type === 'message' ? `Sent to ${a.recipients.length} ${a.recipients.length === 1 ? 'person' : 'customers'} on WhatsApp (simulated).` : 'Done. Saved to your Actions log.');
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function decide(confirm) {
    setBusy(true);
    try {
      const entry = confirm ? await api.confirmAction(result.id) : await api.cancelAction(result.id);
      if (confirm) {
        reward(entry);
        toast('Confirmed and recorded.');
      } else {
        setResult(entry);
        bump();
        toast('Cancelled. Nothing changed.', 'info');
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setResult(null);
    setCelebrate(false);
    setMessage(a.preview || '');
    onClose();
  }

  const [doneTitle, doneSub] = successCopy(a, result);
  const pending = result?.status === 'pending_confirmation';

  return (
    <Modal open={open} onClose={close} title={plain(rec.title)} wide={a.type === 'message'}>
      {celebrate ? (
          <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <Celebrate label={doneTitle} sub={doneSub} />
            {a.type === 'document' && (
              <div className="flex flex-wrap justify-center gap-2">
                {a.downloads.map((d) => (
                  <Btn key={d.url} variant="ghost" href={apiUrl(d.url)} download>
                    <Icon name="download" className="h-4 w-4" /> {d.label}
                  </Btn>
                ))}
              </div>
            )}
            <div className="flex justify-center gap-2 pt-1">
              <Btn variant="ghost" to={`/m/${merchantId}/actions`} onClick={close}>Open Actions log</Btn>
              <Btn onClick={close}>Close</Btn>
            </div>
          </motion.div>
        ) : (
          <div key="form" className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <ModeChip mode={a.type === 'pricing' ? 'approval' : a.execution_mode} />
              {a.channel && <span className="pill bg-canvas text-slate-600">{a.channel}</span>}
            </div>

            {a.type === 'message' && (
              <>
                <div>
                  <div className="label mb-1.5">To ({a.recipients.length})</div>
                  <Recipients list={a.recipients} />
                </div>
                <div>
                  <div className="label mb-1.5">Message. Edit it before sending if you like.</div>
                  <div className="rounded-2xl rounded-tl-sm bg-success-50 p-3">
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={4}
                      disabled={!!result}
                      className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-navy-900 outline-none"
                    />
                    <div className="text-right text-[10px] font-medium text-slate-500">Simulated. No real WhatsApp message goes out.</div>
                  </div>
                </div>
              </>
            )}

            {a.type !== 'message' && <div className="rounded-2xl bg-canvas p-3.5 text-slate-700">{plain(a.preview)}</div>}

            {a.type === 'pricing' && (
              <div className="flex gap-2.5 rounded-2xl bg-warning-50 p-3.5 text-warning-700">
                <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="font-medium">Munshi never changes your prices on its own. You confirm here, then update your price list yourself.</span>
              </div>
            )}

            {result && !celebrate && (
              <div className={`rounded-2xl p-3.5 ${pending ? 'bg-cerulean-50 text-navy' : 'bg-canvas text-slate-600'}`}>
                <div className="font-bold">{pending ? 'Waiting for you to confirm' : 'Cancelled'}</div>
                <div className="mt-0.5">{plain(result.detail)}</div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              {!result && (
                <>
                  <Btn variant="ghost" onClick={close}>Not now</Btn>
                  <Btn disabled={busy || (a.type === 'message' && !message.trim())} onClick={run}>
                    <Icon name={a.type === 'message' ? 'send' : 'check'} className="h-4 w-4" /> {a.label}
                  </Btn>
                </>
              )}
              {pending && (
                <>
                  <Btn variant="ghost" disabled={busy} onClick={() => decide(false)}>Cancel</Btn>
                  <Btn variant="navy" disabled={busy} onClick={() => decide(true)}>Yes, I confirm</Btn>
                </>
              )}
              {result?.status === 'cancelled' && <Btn onClick={close}>Close</Btn>}
            </div>
          </div>
        )}
    </Modal>
  );
}

export function RecommendationCard({ rec, index, merchantId, signalId }) {
  const { pro } = useApp();
  const [open, setOpen] = useState(false);
  const [showData, setShowData] = useState(false);
  const [tile, color] = TYPE_TILE[rec.action.type] || TYPE_TILE.setting;
  const customers = rec.data?.customers;
  return (
    <Card className="flex scroll-mt-24 flex-col p-5" id={rec.id}>
      <div className="flex items-start gap-3">
        <div className="relative">
          <IconTile name={tile} color={color} />
          <span className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-navy text-[10px] font-bold text-white ring-2 ring-white">{index}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-[15px] font-bold leading-snug">{plain(rec.title)}</h4>
          <div className="num mt-1 text-xl text-cerulean-700"><AnimatedText text={plain(rec.impact_label)} /></div>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{plain(rec.description)}</p>
      {rec.notes?.map((n) => (
        <p key={n} className="mt-2 rounded-xl bg-canvas px-3 py-2 text-xs text-slate-500">{plain(n)}</p>
      ))}
      {customers?.length > 0 && (
        <button onClick={() => setShowData(!showData)} className="mt-2 self-start text-xs font-bold text-cerulean-700 hover:underline">
          {showData ? 'Hide' : 'Show'} the {customers.length} customers
        </button>
      )}
      <AnimatePresence>
        {showData && customers && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-2 max-h-52 overflow-auto rounded-xl bg-canvas">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-navy-50 text-left text-slate-600">
                  <tr><th className="px-2.5 py-2">Customer</th><th className="px-2">Months paid</th><th className="px-2">Usual bill</th><th className="px-2">Fee, 6 mo</th></tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.customer} className="odd:bg-white/60">
                      <td className="px-2.5 py-1.5 font-medium text-navy">{c.customer}</td>
                      <td className="px-2">{c.months_paid}</td>
                      <td className="px-2">{inr(c.avg_amount)}</td>
                      <td className="px-2">{inr(c.mdr_6m)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="min-h-4 flex-1" />
      <div className="-mx-5 -mb-5 flex flex-wrap items-center justify-between gap-2 rounded-b-card bg-canvas px-5 py-3.5">
        <ModeChip mode={rec.action.type === 'pricing' ? 'approval' : rec.action.execution_mode} />
        {pro ? (
          <Btn onClick={() => setOpen(true)}>
            <Icon name={rec.action.type === 'message' ? 'send' : 'check'} className="h-4 w-4" /> {rec.action.label}
          </Btn>
        ) : (
          <LockedButton label={`${rec.action.label} with Pro`} />
        )}
      </div>
      {pro && <ActionModal open={open} onClose={() => setOpen(false)} merchantId={merchantId} signalId={signalId} rec={rec} />}
    </Card>
  );
}
