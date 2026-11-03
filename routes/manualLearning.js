'use strict';
const { actorFor } = require('./learning');
function createManualUpdateHandler(paperless, documentModel) {
  return async (req,res) => {
    try {
      const body = { ...req.body };
      // The existing Manual screen can send a selected {id,name} object.
      for (const field of ['correspondent','document_type']) {
        if (body[field] && typeof body[field] === 'object' && !Array.isArray(body[field])) body[field] = body[field].id;
      }
      const id = Number(body.documentId);
      const idOrName = value => value === null ||
        (typeof value === 'string' && value.trim() && (!Number.isFinite(Number(value)) || (Number.isSafeInteger(Number(value)) && Number(value)>0))) ||
        (Number.isSafeInteger(value) && value > 0);
      if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid document ID' });
      if ('title' in body && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 128)) return res.status(400).json({ error: 'Title must contain 1–128 characters' });
      if ('tags' in body && (!Array.isArray(body.tags) || body.tags.some(tag => tag === null || !idOrName(tag)))) return res.status(400).json({ error: 'Invalid tags' });
      for (const field of ['correspondent','document_type']) {
        if (field in body && !idOrName(body[field])) return res.status(400).json({ error: `Invalid ${field}` });
      }
      if ('custom_fields' in body && (!Array.isArray(body.custom_fields) || body.custom_fields.some(row => !row || !Number.isSafeInteger(Number(row.field)) || Number(row.field) <= 0 || !('value' in row)))) return res.status(400).json({ error: 'Invalid custom fields' });
      const updates = {};
      if ('title' in body) updates.title = body.title;
      if ('tags' in body) {
        const names = await Promise.all(body.tags.map(async tag => {
          const name = Number.isSafeInteger(Number(tag)) ? await paperless.getTagTextFromId(Number(tag)) : tag.trim();
          if (!name) throw new TypeError('Unknown tag');
          return name;
        }));
        const { tagIds, errors } = await paperless.processTags(names);
        if (errors.length) return res.status(400).json({ errors });
        updates.tags = tagIds;
      }
      for (const [field,method] of [['correspondent','getOrCreateCorrespondent'],['document_type','getOrCreateDocumentType']]) {
        if (!(field in body)) continue;
        const value = body[field];
        if (value === null) updates[field] = null;
        else if (Number.isSafeInteger(Number(value))) updates[field] = Number(value);
        else {
          const item = await paperless[method](value.trim());
          if (!item?.id) throw new TypeError(`Unable to resolve ${field}`);
          updates[field] = item.id;
        }
      }
      if ('custom_fields' in body) updates.custom_fields = body.custom_fields;
      if (!Object.keys(updates).length) return res.status(400).json({ error: 'No changes provided' });
      const document = await paperless.updateDocument(id,updates,{ confirmedUser: true, actor: actorFor(req) });
      await documentModel.addProcessedDocument(id,document.title);
      // v2 controls confirmation. A legacy write here would bypass manual mode.
      res.json(document);
    } catch(error) {
      res.status(error instanceof TypeError ? 400 : 502).json({ error: error.message });
    }
  };
}
module.exports = { createManualUpdateHandler };
