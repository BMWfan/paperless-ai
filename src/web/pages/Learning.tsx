import { useState } from 'react';
import { Link } from 'wouter';
import { Page } from '../components/Layout';
import { Alert, Button, Card, Input, PageHeader, Select } from '../components/ui';
import { errorMessage, get, post } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { useMetadata, type MetadataLookup } from '../lib/metadata';

type Settings = { mode: 'manual' | 'automatic' | 'hybrid' | 'disabled'; enabled: boolean; intervalMs: number; stabilizationMs: number };
type LearningEvent = { id: number; document_id: number; status: string; source: string; changes: Record<string, { before: unknown; after: unknown }> };
type Events = { events: LearningEvent[]; total: number; hasMore: boolean };
type Review = { id: number | null; document_id: number; source: string; decision: string; actor: string; created_at: string };
type LegacyPage = { examples: { document_id: number; metadata: Record<string, unknown> }[]; total: number; hasMore: boolean };
type HistoryPage = { history: Review[]; hasMore: boolean };
const labels: Record<string, string> = { title: 'Title', tags: 'Tags', correspondent: 'Correspondent', document_type: 'Document type', custom_fields: 'Custom fields' };
const sources: Record<string, string> = { confirmed_ui: 'Confirmed in Paperless-AI', unknown: 'External change; origin unverified', observed: 'Observed metadata', self_write: 'Automatic Paperless-AI change', legacy_user: 'Legacy user correction' };
const statusLabel = (status: string) => status === 'deleted' ? 'revoked' : status;
function valueLabel(field: string, value: unknown, meta: MetadataLookup): string {
  if (value === null || value === undefined || value === '') return 'Not set';
  if (field === 'tags' && Array.isArray(value)) return value.map(id => meta.tagName(Number(id))).join(', ') || 'None';
  if (field === 'correspondent') return meta.correspondentName(Number(value)) ?? `#${value}`;
  if (field === 'document_type') return meta.documentTypeName(Number(value)) ?? `#${value}`;
  if (field === 'custom_fields' && Array.isArray(value)) return value.map(row => {
    const name = meta.customFields.find(item => item.id === row.field)?.name ?? `Field #${row.field}`;
    return `${name}: ${typeof row.value === 'object' ? JSON.stringify(row.value) : String(row.value)}`;
  }).join('; ') || 'None';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
function ReviewHistory({ documentId, status }: { documentId: number; status: string }) {
  const [open, setOpen] = useState(false);
  const history = useAsync(signal => open ? get<{ history: Review[] }>(`/api/learning/history?documentId=${documentId}&limit=50`, signal) : Promise.resolve(null), [open, documentId, status]);
  return <details onToggle={e => setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer text-sm">Review history</summary>
    {history.error && <Alert tone="danger">{history.error}</Alert>}
    {open && history.loading && <p>Loading history…</p>}
    {history.data?.history.map((row, index) => <p key={row.id ?? index} className="mt-2 text-sm">
      {statusLabel(row.decision)} · {row.actor.startsWith('user:') ? `User #${row.actor.slice(5)}` : row.actor === 'api-key' ? 'API key' : row.actor} · {row.created_at}
    </p>)}
    {open && history.data?.history.length === 0 && <p className="mt-2 text-sm">No review decisions yet.</p>}
  </details>;
}
function TimingSettings({ settings, busy, save }: { settings: Settings; busy: boolean; save: (body: unknown) => Promise<void> }) {
  const [interval, setInterval] = useState(String(settings.intervalMs / 1000));
  const [stabilization, setStabilization] = useState(String(settings.stabilizationMs / 1000));
  const valid = /^\d+$/.test(interval) && Number(interval) >= 1 && Number(interval) <= 86400 && /^\d+$/.test(stabilization) && Number(stabilization) <= 3600;
  return <div className="flex flex-wrap items-end gap-3">
    <label>Scan interval (seconds)<Input type="number" min={1} max={86400} value={interval} onChange={e => setInterval(e.target.value)} disabled={busy} /></label>
    <label>Change stabilization (seconds)<Input type="number" min={0} max={3600} value={stabilization} onChange={e => setStabilization(e.target.value)} disabled={busy} /></label>
    <Button disabled={busy || !valid} onClick={() => void save({ intervalMs: Number(interval) * 1000, stabilizationMs: Number(stabilization) * 1000 })}>Save timing</Button>
  </div>;
}
export default function LearningPage() {
  const meta = useMetadata();
  const [status, setStatus] = useState('pending');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const data = useAsync(async signal => {
    const config = get<Settings>('/api/learning/settings', signal);
    if (status === 'legacy') {
      const [settings, legacy] = await Promise.all([config, get<LegacyPage>(`/api/learning/legacy?limit=25&offset=${offset}`, signal)]);
      return { config: settings, legacy, page: null, history: null };
    }
    if (status === 'history') {
      const [settings, history] = await Promise.all([config, get<HistoryPage>(`/api/learning/history?limit=25&offset=${offset}`, signal)]);
      return { config: settings, legacy: null, page: null, history };
    }
    const [settings, page] = await Promise.all([config, get<Events>(`/api/learning/events?status=${status}&limit=25&offset=${offset}`, signal)]);
    return { config: settings, page, legacy: null, history: null };
  }, [status, offset]);
  const settings = data.data?.config;
  const events = status !== 'legacy' && status !== 'history' ? data.data?.page : null;
  const legacy = status === 'legacy' ? data.data?.legacy : null;
  const history = status === 'history' ? data.data?.history : null;
  async function act(path: string, body: unknown = {}) {
    setBusy(true); setError('');
    try { await post(`/api/learning/${path}`, body); await data.reload(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <Page>
    <PageHeader title="Learning" description="Review corrections before they influence future suggestions. External changes remain unverified until confirmed." />
    {(error || data.error) && <Alert tone="danger">{error || data.error}</Alert>}
    {settings && <Card className="space-y-4 p-4">
      <label className="flex items-center gap-3">Learning mode
        <Select aria-label="Learning mode" value={settings.mode} disabled={busy} onChange={e => void act('settings', { mode: e.target.value })}>
          <option value="manual">Manual</option><option value="automatic">Automatic</option><option value="hybrid">Hybrid</option><option value="disabled">Disabled</option>
        </Select>
      </label>
      <label className="flex items-center gap-3"><input type="checkbox" checked={settings.enabled} disabled={busy} onChange={e => void act('settings', { enabled: e.target.checked })} />Monitor metadata changes</label>
      <p className="text-sm text-muted">Automatic learning applies only to authenticated corrections made in Paperless-AI. Changes made by Paperless workflows or other clients require review.</p>
      <TimingSettings key={`${settings.intervalMs}/${settings.stabilizationMs}`} settings={settings} busy={busy} save={body => act('settings', body)} />
      <Button disabled={busy || settings.mode === 'disabled'} onClick={() => void act('scan')}>Scan changes</Button>
    </Card>}
    <div className="my-4 flex items-center gap-3"><label htmlFor="learning-status">Status</label><Select id="learning-status" value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}>
      <option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="rejected">Rejected</option><option value="deleted">Revoked</option><option value="">All events</option><option value="legacy">Imported legacy corrections</option><option value="history">Review history</option>
    </Select><span>{events?.total ?? legacy?.total ?? history?.history.length ?? 0} {history ? 'decisions on this page' : 'records'}</span></div>
    {data.loading && <p>Loading learning events…</p>}
    <div className="space-y-3">{events?.events.map(event => <Card key={event.id} className="space-y-3 p-4">
      <h2 className="font-medium">Document #{event.document_id} · {statusLabel(event.status)}</h2>
      <p className="text-sm text-muted">Source: {sources[event.source] ?? 'Origin unverified'}</p>
      <dl className="space-y-3">{Object.entries(event.changes).map(([field, change]) => <div key={field}>
        <dt className="font-medium">{labels[field] ?? field}</dt>
        <dd className="break-words text-sm"><span className="text-muted">Before: </span>{valueLabel(field, change.before, meta)}</dd>
        <dd className="break-words text-sm"><span className="text-muted">After: </span>{valueLabel(field, change.after, meta)}</dd>
      </div>)}</dl>
      <Link className="text-sm underline" href={`/review?doc=${event.document_id}`}>Open document review</Link>
      <ReviewHistory documentId={event.document_id} status={event.status} />
      <div className="flex gap-2">{event.status === 'pending' && <><Button disabled={busy} onClick={() => void act(`events/${event.id}/review`, { decision: 'confirmed' })}>Confirm correction</Button><Button disabled={busy} onClick={() => void act(`events/${event.id}/review`, { decision: 'rejected' })}>Reject</Button></>}
      {event.status === 'confirmed' && <Button disabled={busy} onClick={() => void act(`events/${event.id}/review`, { decision: 'deleted' })}>Revoke learning</Button>}</div>
    </Card>)}{!data.loading && events?.events.length === 0 && <p>No events with this status.</p>}</div>
    {legacy && <div className="space-y-3">
      <p className="text-sm text-muted">These corrections were imported from the older learning system. Revoking removes their learning influence and automatic-write protection, without changing the native document or deleting audit history.</p>
      {legacy.examples.map((example, index) => <Card key={`${example.document_id}/${index}`} className="space-y-3 p-4">
        <h2 className="font-medium">Imported correction · document #{example.document_id}</h2>
        <p>{String(example.metadata.title || 'Untitled legacy correction')}</p>
        <p className="text-sm text-muted">Tags: {Array.isArray(example.metadata.tags) ? example.metadata.tags.map(tag => typeof tag === 'number' ? meta.tagName(tag) : String(tag)).join(', ') || 'None' : 'None'}</p>
        <p className="text-sm">Correspondent: {String(example.metadata.correspondent ?? 'Not set')} · Document type: {String(example.metadata.document_type ?? 'Not set')}</p>
        <ReviewHistory documentId={example.document_id} status="legacy" />
        {Number.isSafeInteger(example.document_id) && example.document_id > 0 && <Button disabled={busy} onClick={() => void act(`legacy/${example.document_id}/revoke`)}>Revoke legacy learning</Button>}
      </Card>)}
      {!legacy.examples.length && <p>No active imported corrections.</p>}
    </div>}
    {history && <div className="space-y-3">{history.history.map((row, index) => <Card key={`${row.id}/${row.document_id}/${index}`} className="space-y-2 p-4">
      <h2 className="font-medium">Document #{row.document_id} · {statusLabel(row.decision)}</h2>
      <p className="text-sm">{row.actor.startsWith('user:') ? `User #${row.actor.slice(5)}` : row.actor === 'api-key' ? 'API key' : row.actor} · {row.created_at}</p>
      <p className="text-sm text-muted">Source: {sources[row.source] ?? 'Origin unverified'}</p>
      <Link className="text-sm underline" href={`/review?doc=${row.document_id}`}>Open document review</Link>
    </Card>)}{!history.history.length && <p>No review decisions yet.</p>}</div>}
    <div className="my-4 flex gap-3"><Button disabled={!offset || busy || data.loading} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous</Button><Button disabled={!(events?.hasMore || legacy?.hasMore || history?.hasMore) || busy || data.loading} onClick={() => setOffset(offset + 25)}>Next</Button></div>
  </Page>;
}
