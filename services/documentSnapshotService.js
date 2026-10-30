'use strict';

/**
 * Normalize Paperless metadata before comparing snapshots.
 * A difference alone does not prove a human edit: provenance must be tracked separately.
 */
function normalizeDocumentMetadata(document) {
  if (!document || typeof document !== 'object') {
    throw new TypeError('Document metadata must be an object');
  }
  const tags = [...new Set((Array.isArray(document.tags) ? document.tags : [])
    .map(value => Number(value))
    .filter(Number.isSafeInteger))].sort((a, b) => a - b);
  const customFields = (Array.isArray(document.custom_fields) ? document.custom_fields : [])
    .filter(item => item && Number.isSafeInteger(Number(item.field)))
    .map(item => ({
      field: Number(item.field),
      value: item.value == null ? null : item.value
    }))
    .sort((a, b) => a.field - b.field);
  return {
    title: document.title == null ? '' : String(document.title),
    correspondent: document.correspondent == null ? null : Number(document.correspondent),
    document_type: document.document_type == null ? null : Number(document.document_type),
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
