/** Native metadata only. Configuration writes are local; documents and calendar are never written. */
import type { FastifyPluginAsync } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Services } from '../http/app.js';
import { HttpProblem } from '../http/helpers.js';
import { normalizeFieldValue } from '../learning/fields.js';
import { CONTRACT_ROLES, contractRoleTypes, type ContractCell, type ContractConfig, type ContractPage, type ContractRole, type ContractSettingsView } from '../../shared/contracts.js';
import type { PaperlessCustomField, PaperlessDocument } from '../paperless/types.js';

const id = z.number().int().positive();
const fieldId = id.nullable().default(null);
const selection = z.object({
  snapshotDigest: z.string().regex(/^[a-f0-9]{64}$/),
  documentTypeIds: z.array(id).max(50).refine(ids => new Set(ids).size === ids.length, 'Duplicate document types'),
  fields: z.object({ number: fieldId, party: fieldId, start: fieldId, end: fieldId, cancelBy: fieldId }).strict().prefault({}),
}).strict();
const emptyFields = () => Object.fromEntries(CONTRACT_ROLES.map(role => [role, null])) as ContractConfig['fields'];
const mappingDigest = (sourceUrl: string, types: { id: number; name: string }[], fields: PaperlessCustomField[]) => createHash('sha256')
  .update(JSON.stringify({ sourceUrl, types: types.map(({ id, name }) => ({ id, name })).sort((a, b) => a.id - b.id),
    fields: fields.map(({ id, name, data_type }) => ({ id, name, data_type })).sort((a, b) => a.id - b.id) })).digest('hex');
function cell(role: ContractRole, config: ContractConfig, definitions: PaperlessCustomField[], doc: PaperlessDocument): ContractCell {
  const binding = config.fields[role];
  if (!binding) return { state: 'not-mapped', value: null };
  const definition = definitions.find(f => f.id === binding.id);
  if (!definition || definition.name !== binding.name || definition.data_type !== binding.type || !contractRoleTypes(role).includes(definition.data_type)) return { state: 'definition-changed', value: null };
  if (!Array.isArray(doc.custom_fields)) return { state: 'invalid', value: null };
  const rows = doc.custom_fields.filter(row => row && typeof row === 'object' && row.field === binding.id);
  if (rows.length > 1) return { state: 'ambiguous', value: null };
  const raw = rows[0]?.value;
  if (raw === null || raw === undefined || raw === '' || (typeof raw === 'string' && !raw.trim())) return { state: 'missing', value: null };
  const value = normalizeFieldValue(raw, definition);
  if (typeof value !== 'string') return { state: 'invalid', value: null };
  return { state: 'value', value: value.slice(0, 1000), ...(value.length > 1000 ? { truncated: true } : {}) };
}

export const contractRoutes = ({ ctx }: Services): FastifyPluginAsync => async fastify => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.get('/api/contracts/settings', { config: { auth: 'session' } }, async (): Promise<ContractSettingsView> => {
    const sourceUrl = ctx.cfg.paperless.url, client = ctx.paperless();
    const [documentTypes, fields] = await Promise.all([client.documentTypes(), client.customFields()]);
    if (sourceUrl !== ctx.cfg.paperless.url || client !== ctx.paperless()) throw new HttpProblem(409, 'Paperless connection changed; reload the mappings');
    return { config: ctx.cfg.contracts, snapshotDigest: mappingDigest(sourceUrl, documentTypes, fields), documentTypes: documentTypes.map(({ id, name }) => ({ id, name })), fields: fields.map(({ id, name, data_type }) => ({ id, name, data_type })) };
  });
  app.put('/api/contracts/settings', { config: { auth: 'session' }, schema: { body: selection } }, async req => {
    if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(String(req.headers['sec-fetch-site']))) throw new HttpProblem(403, 'Cross-origin configuration changes forbidden');
    if (req.headers.origin && req.headers.origin !== `${req.protocol}://${req.headers.host}`) throw new HttpProblem(403, 'Cross-origin configuration changes forbidden');
    if (!req.body.documentTypeIds.length) {
      ctx.config.update({ contracts: { sourceUrl: '', documentTypes: [], fields: emptyFields() } });
      return { config: ctx.cfg.contracts };
    }
    const sourceUrl = ctx.cfg.paperless.url, client = ctx.paperless();
    const [types, definitions] = await Promise.all([client.documentTypes(), client.customFields()]);
    if (sourceUrl !== ctx.cfg.paperless.url || client !== ctx.paperless() || mappingDigest(sourceUrl, types, definitions) !== req.body.snapshotDigest) throw new HttpProblem(409, 'Native definitions changed; reload the mappings');
    const documentTypes = req.body.documentTypeIds.map(id => {
      const found = types.find(t => t.id === id);
      if (!found) throw new HttpProblem(400, 'Selected document type is unavailable');
      return { id: found.id, name: found.name };
    });
    const selected = CONTRACT_ROLES.flatMap(role => req.body.fields[role] === null ? [] : [req.body.fields[role]]);
    if (new Set(selected).size !== selected.length) throw new HttpProblem(400, 'Choose a distinct field for each role');
    const fields = emptyFields();
    for (const role of CONTRACT_ROLES) {
      const field = req.body.fields[role];
      if (field === null) continue;
      const definition = definitions.find(d => d.id === field);
      if (!definition || !contractRoleTypes(role).includes(definition.data_type)) throw new HttpProblem(400, 'Selected field is unavailable or incompatible with its role');
      fields[role] = { id: definition.id, name: definition.name, type: definition.data_type as 'date' | 'string' | 'longtext' };
    }
    ctx.config.update({ contracts: { sourceUrl, documentTypes, fields } });
    return { config: ctx.cfg.contracts };
  });
  app.get('/api/contracts', { config: { auth: 'session' }, schema: { querystring: z.object({ page: z.coerce.number().int().min(1).max(1_000_000).default(1) }).strict() } }, async (req): Promise<ContractPage> => {
    const config = ctx.cfg.contracts, page = req.query.page;
    const result: ContractPage = { configured: false, count: null, page, warnings: [], documents: [], calendarEnabled: ctx.cfg.processing.functions.events };
    if (!config.documentTypes.length) return result;
    if (config.sourceUrl !== ctx.cfg.paperless.url) return { ...result, warnings: ['Paperless connection changed; save the mappings again.'] };
    const client = ctx.paperless();
    const [types, definitions] = await Promise.all([client.documentTypes(), client.customFields()]);
    if (client !== ctx.paperless() || JSON.stringify(config) !== JSON.stringify(ctx.cfg.contracts)) throw new HttpProblem(409, 'Contract configuration changed; refresh');
    if (config.documentTypes.some(t => !types.some(current => current.id === t.id && current.name === t.name))) return { ...result, warnings: ['Document types changed; save the mappings again.'] };
    const ids = config.documentTypes.map(t => t.id);
    const docs = await client.searchDocuments({ page, pageSize: 25, ordering: 'id', fields: ['id', 'title', 'document_type', 'custom_fields'], filters: { document_type__id__in: ids.join(',') } });
    if (client !== ctx.paperless() || JSON.stringify(config) !== JSON.stringify(ctx.cfg.contracts)) throw new HttpProblem(409, 'Contract configuration changed; refresh');
    if (!Number.isSafeInteger(docs.count) || docs.count < 0 || !Array.isArray(docs.results) || docs.results.length > 25 ||
        docs.results.some(d => !Number.isSafeInteger(d.id) || d.id <= 0 || typeof d.title !== 'string' || !ids.includes(d.document_type ?? 0)) || new Set(docs.results.map(d => d.id)).size !== docs.results.length) throw new HttpProblem(502, 'Paperless returned an invalid contract page');
    return { ...result, configured: true, count: docs.count, documents: docs.results.map(doc => ({ id: doc.id, title: doc.title ?? '', url: ctx.documentLink(doc.id),
      fields: Object.fromEntries(CONTRACT_ROLES.map(role => [role, cell(role, config, definitions, doc)])) as Record<ContractRole, ContractCell> })) };
  });
};
