import { useState } from 'react';
import type { DocumentDetail } from '@shared/api';
import { Alert, Button, Card, Input } from './ui';
import { errorMessage, post } from '../lib/api';
interface Row {
  fieldId: number | null; name: string; type: string | null;
  normalizedValue: unknown; proposedValue: unknown; flags: string[]; canEdit: boolean;
  evidence: { excerpts: { line: number; text: string }[] };
}
interface Preview { snapshotDigest: string; reviewFieldIds: number[]; rows: Row[] }
export function LearningFields({ document, suggestions, onSaved }: { document: DocumentDetail; suggestions: { field_name: string; value: string }[]; onSaved: () => Promise<void> }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [values, setValues] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function inspect(learned: boolean) {
    setBusy(true); setError(''); setPreview(null); setSelected(new Set());
    try {
      const body = { content: document.content.slice(0, 50000), ...(learned ? {} : { suggestions }) };
      const result = await post<Preview>(`/api/documents/${document.id}/fields/${learned ? 'hints' : 'preview'}`, body);
      setPreview(result);
      setValues(Object.fromEntries(result.rows.filter(r => r.fieldId !== null).map(r => [r.fieldId, String(r.normalizedValue ?? r.proposedValue ?? '')])));
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!preview || !selected.size) return;
    setBusy(true); setError('');
    try {
      await post(`/api/documents/${document.id}/fields/apply`, { snapshotDigest: preview.snapshotDigest, reviewFieldIds: preview.reviewFieldIds,
        fields: [...selected].map(field => ({ field, value: values[field] })) });
      setPreview(null); setSelected(new Set()); await onSaved();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <Card className="mt-4 space-y-4 p-4">
    <h2 className="font-medium">Review extracted fields</h2>
    <p className="text-sm text-muted">Suggestions are unverified. Check which value belongs to this document before selecting it. Learned patterns read values from this document; they do not reuse old field values.</p>
    <div className="flex flex-wrap gap-2"><Button disabled={busy || !suggestions.length} onClick={() => void inspect(false)}>Preview AI fields</Button><Button disabled={busy} onClick={() => void inspect(true)}>Find learned patterns</Button></div>
    {error && <Alert tone="danger">{error}</Alert>}
    {preview && <>{!preview.rows.length && <p>No eligible suggestions found.</p>}{preview.rows.map((row, index) => <div key={index} className="space-y-2 border-t border-border pt-3">
      <label className="flex items-center gap-2"><input type="checkbox" disabled={busy || !row.canEdit || row.fieldId === null} checked={row.fieldId !== null && selected.has(row.fieldId)} onChange={e => {
        const checked = e.target.checked; setSelected(previous => { const next = new Set(previous); if (row.fieldId !== null) { if (checked) next.add(row.fieldId); else next.delete(row.fieldId); } return next; });
      }} />{row.name} ({row.type ?? 'unknown field'})</label>
      {row.fieldId !== null && <Input aria-label={`Value for ${row.name}`} disabled={busy || !row.canEdit} value={values[row.fieldId] ?? ''} onChange={e => setValues(previous => ({ ...previous, [row.fieldId!]: e.target.value }))} />}
      {row.flags.length > 0 && <p className="text-sm text-muted">Needs review: {row.flags.map(flag => flag.replaceAll('_', ' ')).join(', ')}</p>}
      {row.evidence.excerpts.map((excerpt, i) => <blockquote key={i} className="border-l-2 border-border pl-3 text-sm">Line {excerpt.line}: {excerpt.text}</blockquote>)}
    </div>)}<Button disabled={busy || !selected.size} onClick={() => void save()}>Save selected fields</Button></>}
  </Card>;
}
