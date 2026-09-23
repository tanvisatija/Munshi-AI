import { useParams } from 'react-router-dom';
import { api, apiUrl, plain } from '../api';
import { useApp, useFetch } from '../AppContext';
import { Icon, IconTile } from '../components/icons';
import { Btn, CountUp, Rise, Skeleton, Stagger } from '../components/motion';
import { Card, ErrorNote, LockedButton, ModeChip } from '../components/ui';

const TYPE_TILE = { message: ['send', 'green'], document: ['doc', 'orange'], pricing: ['tag', 'navy'], setting: ['sliders', 'cyan'] };
const STATUS = {
  executed: ['Done', 'bg-success-50 text-success-700'],
  pending_confirmation: ['Waiting for you', 'bg-warning text-navy-900'],
  cancelled: ['Cancelled', 'bg-canvas text-slate-500'],
};
const AGENT = { regulatory: 'Regulatory Impact Agent', growth: 'Growth Opportunity Agent' };

export default function ActionsLog() {
  const { mid } = useParams();
  const { pro, toast, version, bump } = useApp();
  const { data, error } = useFetch(() => api.actions(mid), [mid, version]);

  async function decide(id, confirm) {
    try {
      await (confirm ? api.confirmAction(id) : api.cancelAction(id));
      toast(confirm ? 'Confirmed and recorded.' : 'Cancelled. Nothing changed.', confirm ? 'success' : 'info');
      bump();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  const list = data || [];
  const done = list.filter((a) => a.status === 'executed').length;
  const waiting = list.filter((a) => a.status === 'pending_confirmation').length;
  const auto = list.filter((a) => a.execution_mode === 'auto').length;
  // Latest copy of each downloadable file, for the side panel.
  const docs = [...new Map(list.flatMap((a) => a.payload?.downloads || []).map((d) => [d.url, d])).values()];

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <h1 className="text-xl font-bold sm:text-2xl">Munshi's ledger</h1>
      <p className="text-sm text-slate-500">Every message sent, file made and price decision taken for you. Price changes always wait for your OK.</p>

      <div className="mt-4 grid gap-4 lg:grid-cols-12 [&>*]:min-w-0">
      <aside className="space-y-4 lg:order-2 lg:col-span-4">
        <div className="rounded-card bg-navy p-5 text-white shadow-card">
          <div className="text-xs font-semibold text-cerulean-200">Done for you so far</div>
          <div className="font-heading text-5xl font-bold tabular-nums"><CountUp value={done} /></div>
          <div className="mt-1 text-sm text-cerulean-100">{auto} ran on {auto === 1 ? 'its' : 'their'} own, the rest you approved</div>
        </div>
        <div className={`rounded-card p-5 shadow-card ${waiting ? 'bg-warning text-navy-900' : 'bg-white'}`}>
          <div className={`text-xs font-semibold ${waiting ? 'text-navy-900' : 'text-slate-500'}`}>Waiting for your OK</div>
          <div className="font-heading text-3xl font-bold tabular-nums text-navy"><CountUp value={waiting} /></div>
          <div className={`text-sm ${waiting ? '' : 'text-slate-500'}`}>{waiting ? 'Confirm or cancel below. Nothing changes until you do.' : 'Nothing pending. You are all caught up.'}</div>
        </div>
        {docs.length > 0 && (
          <Card className="p-5">
            <div className="text-[15px] font-bold text-navy">Your files</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {docs.map((d) => (
                <Btn key={d.url} variant="soft" size="sm" href={apiUrl(d.url)} download>
                  <Icon name="download" className="h-3.5 w-3.5" /> {d.label}
                </Btn>
              ))}
            </div>
          </Card>
        )}
      </aside>

      <div className="lg:order-1 lg:col-span-8">
        <ErrorNote error={!data ? error : null} />
        {!data && !error && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-card" />)}
          </div>
        )}
        {data?.length === 0 && (
          <Card className="flex flex-col items-center p-8 text-center">
            <IconTile name="clipboard" color="navy" size="lg" />
            <div className="mt-3 font-bold text-navy">Nothing here yet</div>
            <p className="mt-1 max-w-sm text-sm text-slate-500">Open an alert and approve one of the fixes. It shows up here with who approved it and when.</p>
            {!pro && <LockedButton className="mt-4" label="Switch to Pro to approve fixes" />}
          </Card>
        )}
        {data?.length > 0 && (
          <Stagger className="space-y-3">
            {data.map((a) => {
              const [tile, color] = TYPE_TILE[a.action_type] || TYPE_TILE.setting;
              const [statusLabel, statusCls] = STATUS[a.status] || [a.status, 'bg-canvas'];
              return (
                <Rise key={a.id}>
                  <Card className={`p-4 ${a.status === 'pending_confirmation' ? 'ring-2 ring-warning' : ''}`}>
                    <div className="flex gap-3">
                      <IconTile name={tile} color={color} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`pill ${statusCls}`}>{statusLabel}</span>
                          <ModeChip mode={a.execution_mode} />
                        </div>
                        <div className="mt-1.5 text-[15px] font-bold leading-snug text-navy">{plain(a.title)}</div>
                        <p className="mt-1 text-sm text-slate-600">{plain(a.detail)}</p>
                        <div className="mt-1.5 text-[11px] text-slate-400">
                          {new Date(a.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · {AGENT[a.agent_id] || a.agent_id}
                        </div>
                        {a.payload?.downloads?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {a.payload.downloads.map((d) => (
                              <Btn key={d.url} variant="soft" size="sm" href={apiUrl(d.url)} download>
                                <Icon name="download" className="h-3.5 w-3.5" /> {d.label}
                              </Btn>
                            ))}
                          </div>
                        )}
                        {a.status === 'pending_confirmation' && (
                          <div className="mt-3 flex gap-2">
                            <Btn variant="ghost" size="sm" onClick={() => decide(a.id, false)}>Cancel</Btn>
                            <Btn variant="navy" size="sm" disabled={!pro} onClick={() => decide(a.id, true)}>Yes, I confirm</Btn>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                </Rise>
              );
            })}
          </Stagger>
        )}
      </div>
      </div>
    </main>
  );
}
