import { useState } from 'react';
import type { DocumentDetail } from '@shared/api';
import { Alert, Button, Card, Input, Select, Textarea, useConfirm, useToast } from './ui';
import { errorMessage, post } from '../lib/api';
interface Row {
  fieldId: number | null; name: string; type: string | null;
  currentValue: unknown; options: { id: string; label: string }[];
  normalizedValue: unknown; proposedValue: unknown; flags: string[]; canEdit: boolean;
  evidence: { excerpts: { line: number; text: string }[] };
}
interface Preview { snapshotDigest: string; reviewFieldIds: number[]; rows: Row[]; suggestionSource?: string; offset?: number; totalFields?: number; hasMoreFields?: boolean }
export function LearningFields({ document, suggestions, onSaved }: { document: DocumentDetail; suggestions: { field_name: string; value: string }[]; onSaved: () => Promise<void> }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [values, setValues] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function inspect(mode: 'preview' | 'hints' | 'current', offset = 0) {
    setBusy(true); setError(''); setPreview(null); setSelected(new Set());
    try {
      const body = { content: document.content.slice(0, 50000), ...(mode === 'preview' ? { suggestions } : mode === 'current' ? { offset } : {}) };
      const result = await post<Preview>(`/api/documents/${document.id}/fields/${mode}`, body);
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
      setPreview(null); setSelected(new Set()); toast.success('Selected field values saved'); await onSaved();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function clearSelected() {
    if (!preview || !selected.size || !(await confirm({ title: 'Clear selected field values?', message: 'The selected values will be cleared.', confirmLabel: 'Clear values', danger: true }))) return;
    setBusy(true); setError('');
    try {
      await post(`/api/documents/${document.id}/fields/clear`, { snapshotDigest: preview.snapshotDigest, reviewFieldIds: preview.reviewFieldIds, fields: [...selected] });
      setPreview(null); setSelected(new Set()); toast.success('Selected field values cleared'); await onSaved();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  const canClear = [...selected].every(id => preview?.rows.some(row => row.fieldId === id && row.canEdit && row.currentValue !== null && row.currentValue !== undefined));
  const current = preview?.suggestionSource === 'current_native_values';
  return <Card className="mt-4 space-y-4 p-4">
    <h2 className="font-medium">Review extracted fields</h2>
    <p className="text-sm text-muted">{current ? 'Choose current native values to edit or clear.' : 'Suggestions are unverified. Check which value belongs to this document before selecting it. Learned patterns read values from this document; they do not reuse old field values.'}</p>
    <div className="flex flex-wrap gap-2"><Button disabled={busy || !document.custom_fields.length} onClick={() => void inspect('current')}>Review current fields</Button><Button disabled={busy || !suggestions.length} onClick={() => void inspect('preview')}>Preview AI fields</Button><Button disabled={busy} onClick={() => void inspect('hints')}>Find learned patterns</Button></div>
    {error && <Alert tone="danger">{error}</Alert>}
    {preview && <>{!preview.rows.length && <p>No eligible suggestions found.</p>}{preview.rows.map((row, index) => <div key={index} className="space-y-2 border-t border-border pt-3">
      <label className="flex items-center gap-2"><input type="checkbox" disabled={busy || !row.canEdit || row.fieldId === null} checked={row.fieldId !== null && selected.has(row.fieldId)} onChange={e => {
        const checked = e.target.checked; setSelected(previous => { const next = new Set(previous); if (row.fieldId !== null) { if (checked) next.add(row.fieldId); else next.delete(row.fieldId); } return next; });
      }} />{row.name} ({row.type ?? 'unknown field'})</label>
      {row.fieldId !== null && (row.type === 'boolean' || (row.type === 'select' && row.options?.length) ?
        <Select aria-label={`Value for ${row.name}`} disabled={busy || !row.canEdit} value={values[row.fieldId] ?? ''} onChange={e => setValues(previous => ({ ...previous, [row.fieldId!]: e.target.value }))}>
          <option value="">Choose a value</option>{row.type === 'boolean' ? <><option value="true">True</option><option value="false">False</option></> : row.options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </Select> : row.type === 'longtext' ?
        <Textarea aria-label={`Value for ${row.name}`} disabled={busy || !row.canEdit} value={values[row.fieldId] ?? ''} onChange={e => setValues(previous => ({ ...previous, [row.fieldId!]: e.target.value }))} /> :
        <Input aria-label={`Value for ${row.name}`} type={row.type === 'date' ? 'date' : 'text'} disabled={busy || !row.canEdit} value={values[row.fieldId] ?? ''} onChange={e => setValues(previous => ({ ...previous, [row.fieldId!]: e.target.value }))} />)}
      {row.flags.length > 0 && <p className="text-sm text-muted">Needs review: {row.flags.map(flag => flag.replaceAll('_', ' ')).join(', ')}</p>}
      {!current && row.evidence.excerpts.map((excerpt, i) => <blockquote key={i} className="border-l-2 border-border pl-3 text-sm">Line {excerpt.line}: {excerpt.text}</blockquote>)}
    </div>)}<div className="flex flex-wrap gap-2"><Button disabled={busy || !selected.size} onClick={() => void save()}>Save selected fields</Button><Button disabled={busy || !selected.size || !canClear} onClick={() => void clearSelected()}>Clear selected values</Button></div>
      {current && <div className="flex gap-2"><Button disabled={busy || !preview.offset} onClick={() => void inspect('current', Math.max(0, (preview.offset ?? 0) - 50))}>Previous fields</Button><Button disabled={busy || !preview.hasMoreFields} onClick={() => void inspect('current', (preview.offset ?? 0) + 50)}>Next fields</Button></div>}
    </>}
  </Card>;
}
