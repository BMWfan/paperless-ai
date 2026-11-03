'use strict';

/**
 * Normalize Paperless metadata before comparing snapshots.
 * A difference alone does not prove a human edit: provenance must be tracked separately.
 */
function normalizeDocumentMetadata(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new TypeError('Document metadata must be an object');
  }
  const tags = [...new Set((Array.isArray(document.tags) ? document.tags : [])
    .map(value => Number(value))
    .filter(value => Number.isSafeInteger(value) && value > 0))].sort((a, b) => a - b);
  const identifier = value => value == null || value === '' || !Number.isSafeInteger(Number(value)) || Number(value)<=0 ? null : Number(value);
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ?
    Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;
  const customFields = (Array.isArray(document.custom_fields) ? document.custom_fields : [])
    .filter(item => item && identifier(item.field) !== null)
    .map(item => ({
      field: Number(item.field),
      value: item.value == null ? null : canonical(item.value)
    }))
    .sort((a, b) => a.field - b.field);
  return {
    title: document.title == null ? '' : String(document.title),
    correspondent: identifier(document.correspondent),
    document_type: identifier(document.document_type),
    tags,
    custom_fields: customFields
  };
}

function compareDocumentMetadata(previous, current) {
  const before = normalizeDocumentMetadata(previous);
  const after = normalizeDocumentMetadata(current);
  const changes = {};
  for (const field of Object.keys(before)) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
      changes[field] = { before: before[field], after: after[field] };
    }
  }
  return changes;
}

module.exports = { normalizeDocumentMetadata, compareDocumentMetadata };
