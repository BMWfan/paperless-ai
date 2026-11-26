import { useState } from 'react';
import { Link } from 'wouter';
import { CONTRACT_LABELS, CONTRACT_ROLES, contractRoleTypes, type ContractPage, type ContractSettingsView, type ContractRole } from '@shared/contracts';
import { get, put, errorMessage } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { Page } from '../components/Layout';
import { Alert, Button, Card, PageHeader, Select } from '../components/ui';

function MappingForm({ data, onSaved, onCancel }: { data: ContractSettingsView; onSaved: () => Promise<void>; onCancel: () => void }) {
  const [types, setTypes] = useState(data.config.documentTypes.map(t => t.id));
  const [fields, setFields] = useState(Object.fromEntries(CONTRACT_ROLES.map(role => [role, data.config.fields[role]?.id ?? null])) as Record<ContractRole, number | null>);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try {
      await put('/api/contracts/settings', { snapshotDigest: data.snapshotDigest, documentTypeIds: types, fields });
      await onSaved();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <Card className="space-y-4 p-4">
    <h2 className="font-semibold">Contract mappings</h2>
    <p>Choose the native document types and fields to display. This only changes this app's configuration. No Paperless document is changed.</p>
    <fieldset disabled={busy} className="space-y-2"><legend className="font-medium">Document types</legend>
      {data.documentTypes.map(type => <label key={type.id} className="flex items-center gap-2"><input type="checkbox" checked={types.includes(type.id)} onChange={e => setTypes(previous => e.target.checked ? [...previous, type.id] : previous.filter(id => id !== type.id))} />{type.name}</label>)}
      {!data.documentTypes.length && <p>No native document types available.</p>}
      {data.config.documentTypes.filter(t => !data.documentTypes.some(current => current.id === t.id)).map(t => <label key={t.id} className="flex items-center gap-2"><input type="checkbox" checked={types.includes(t.id)} onChange={() => setTypes(previous => previous.filter(id => id !== t.id))} />Unavailable type #{t.id} — remove this selection</label>)}
    </fieldset>
    {CONTRACT_ROLES.map(role => <label key={role} className="block">{CONTRACT_LABELS[role]}
      <Select aria-label={CONTRACT_LABELS[role]} disabled={busy} value={fields[role] ?? ''} onChange={e => setFields(previous => ({ ...previous, [role]: e.target.value ? Number(e.target.value) : null }))}>
        <option value="">Not mapped</option>
        {data.fields.filter(f => contractRoleTypes(role).includes(f.data_type)).map(field => <option key={field.id} value={field.id}>{field.name} ({field.data_type})</option>)}
        {fields[role] !== null && !data.fields.some(f => f.id === fields[role] && contractRoleTypes(role).includes(f.data_type)) && <option value={fields[role]!}>Unavailable field — choose another or clear</option>}
      </Select>
    </label>)}
    <p className="text-sm text-muted">Saving with no document types disables the overview and clears its mappings. Changed definitions require reloading before saving.</p>
    {error && <Alert tone="danger">{error}</Alert>}
    <div className="flex gap-2"><Button disabled={busy} onClick={() => void save()}>Save mappings</Button><Button disabled={busy} onClick={onCancel}>Cancel</Button></div>
  </Card>;
}

const states = { 'not-mapped': 'Not mapped', missing: 'Not set', 'definition-changed': 'Unknown — definition changed', invalid: 'Unknown — invalid native value', ambiguous: 'Unknown — multiple values' };
export default function ContractsPage() {
  const [page, setPage] = useState(1), [configure, setConfigure] = useState(false);
  const list = useAsync(signal => get<ContractPage>(`/api/contracts?page=${page}`, signal), [page]);
  const settings = useAsync(signal => configure ? get<ContractSettingsView>('/api/contracts/settings', signal) : Promise.resolve(null), [configure]);
  async function saved() { setConfigure(false); if (page !== 1) setPage(1); else await list.reload(); }
  return <Page>
    <PageHeader title="Contracts" description="Read-only native metadata for your private archive. Values are not automatically verified human corrections." />
    <div className="mb-4 flex gap-2"><Button disabled={list.loading} onClick={() => void list.reload()}>Refresh contracts</Button><Button disabled={configure} onClick={() => setConfigure(true)}>Configure mappings</Button>
      {list.data?.calendarEnabled && <Link href="/calendar" className="self-center underline">Open existing calendar</Link>}
    </div>
    {configure && <>{settings.loading && <p role="status">Loading native definitions…</p>}{settings.error && <Alert tone="danger">{settings.error}<Button onClick={() => void settings.reload()}>Reload mappings</Button><Button onClick={() => setConfigure(false)}>Cancel</Button></Alert>}
      {!settings.loading && !settings.error && settings.data && <MappingForm key={settings.data.snapshotDigest} data={settings.data} onSaved={saved} onCancel={() => setConfigure(false)} />}
      {!settings.loading && !settings.error && settings.data && <Button className="my-2" onClick={() => void settings.reload()}>Reload native definitions</Button>}
    </>}
    {list.loading ? <p role="status">Loading contracts…</p> : list.error ? <Alert tone="danger">Contracts unavailable. {list.error}</Alert> : <>
      {list.data?.warnings.map(warning => <Alert key={warning}>{warning}</Alert>)}
      {!list.data?.configured ? <Card className="p-4">Choose native document types to enable this overview. No document scan or model request is started automatically.</Card> : <>
        <p className="my-3">{list.data.count} contracts · Page {page}</p>
        <div className="space-y-3">{list.data.documents.map(doc => <Card key={doc.id} className="space-y-3 p-4">
          <a className="break-words font-semibold underline" href={doc.url} target="_blank" rel="noreferrer">{doc.title || `Document #${doc.id}`}</a>
          <p className="text-sm text-muted">Source: Paperless-ngx metadata · verification not established</p>
          <dl className="grid gap-3 sm:grid-cols-2">{CONTRACT_ROLES.map(role => { const field = doc.fields[role]; return <div key={role}><dt className="font-medium">{CONTRACT_LABELS[role]}</dt><dd className="break-words">{field.state === 'value' ? <>{field.value}{field.truncated && '… (open source for full value)'}</> : states[field.state]}</dd></div>; })}</dl>
        </Card>)}</div>
        {!list.data.documents.length && <p>No contracts on this page.</p>}
        <div className="my-4 flex gap-2"><Button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous contracts</Button><Button disabled={page * 25 >= (list.data.count ?? 0)} onClick={() => setPage(page + 1)}>Next contracts</Button></div>
      </>}
    </>}
  </Page>;
}
