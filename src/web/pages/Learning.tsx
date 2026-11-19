import { useCallback, useEffect, useState } from 'react';
import { Page } from '../components/Layout';
import { Alert, Button, Card, PageHeader, Select } from '../components/ui';
import { errorMessage, get, post } from '../lib/api';

type Settings = { mode: 'manual' | 'automatic' | 'hybrid' | 'disabled'; enabled: boolean; intervalMs: number; stabilizationMs: number };
type Event = { id: number; document_id: number; status: string; source: string; changes: Record<string, unknown> };
type Events = { events: Event[]; total: number; hasMore: boolean };
export default function LearningPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [events, setEvents] = useState<Events>({ events: [], total: 0, hasMore: false });
  const [status, setStatus] = useState('pending');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [config, page] = await Promise.all([get<Settings>('/api/learning/settings'), get<Events>(`/api/learning/events?status=${status}&limit=25&offset=${offset}`)]);
    setSettings(config); setEvents(page);
  }, [status, offset]);
  useEffect(() => { let active = true; load().catch(e => { if (active) setError(errorMessage(e)); }); return () => { active = false; }; }, [load]);
  async function act(path: string, body: unknown = {}) {
    setBusy(true); setError('');
    try { await post(`/api/learning/${path}`, body); await load(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <Page>
    <PageHeader title="Learning" description="Review corrections before they influence future suggestions. External changes remain unverified until confirmed." />
    {error && <Alert tone="danger">{error}</Alert>}
    {settings && <Card className="space-y-4 p-4">
      <label className="flex items-center gap-3">Learning mode
        <Select aria-label="Learning mode" value={settings.mode} disabled={busy} onChange={e => void act('settings', { mode: e.target.value })}>
          <option value="manual">Manual</option><option value="automatic">Automatic</option><option value="hybrid">Hybrid</option><option value="disabled">Disabled</option>
        </Select>
      </label>
      <label className="flex items-center gap-3"><input type="checkbox" checked={settings.enabled} disabled={busy} onChange={e => void act('settings', { enabled: e.target.checked })} />Monitor metadata changes</label>
      <p className="text-sm text-muted">Automatic learning applies only to authenticated corrections made in Paperless-AI. Changes made by Paperless workflows or other clients require review.</p>
      <Button disabled={busy || settings.mode === 'disabled'} onClick={() => void act('scan')}>Scan changes</Button>
    </Card>}
    <div className="my-4 flex items-center gap-3"><label htmlFor="learning-status">Status</label><Select id="learning-status" value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}>
      <option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="rejected">Rejected</option><option value="deleted">Revoked</option><option value="">All</option>
    </Select><span>{events.total} events</span></div>
    <div className="space-y-3">{events.events.map(event => <Card key={event.id} className="space-y-3 p-4">
      <h2 className="font-medium">Document #{event.document_id} · {event.status}</h2>
      <p className="text-sm text-muted">Source: {event.source}</p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(event.changes, null, 2)}</pre>
      <div className="flex gap-2">{event.status === 'pending' && <><Button disabled={busy} onClick={() => void act(`events/${event.id}/review`, { decision: 'confirmed' })}>Confirm correction</Button><Button disabled={busy} onClick={() => void act(`events/${event.id}/review`, { decision: 'rejected' })}>Reject</Button></>}
      {event.status === 'confirmed' && <Button disabled={busy} onClick={() => void act(`events/${event.id}/review`, { decision: 'deleted' })}>Revoke learning</Button>}</div>
    </Card>)}{!events.events.length && <p>No events with this status.</p>}</div>
    <div className="my-4 flex gap-3"><Button disabled={!offset || busy} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous</Button><Button disabled={!events.hasMore || busy} onClick={() => setOffset(offset + 25)}>Next</Button></div>
  </Page>;
}
