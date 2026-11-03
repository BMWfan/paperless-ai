'use strict';
(async () => {
  const $ = id => document.getElementById(id);
  const node = (tag,text) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; return element; };
  const theme = localStorage.getItem('theme') || 'light';
  document.documentElement.dataset.theme = theme;
  $('theme').onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; localStorage.setItem('theme',next);
  };
  let offset = 0, historyOffset = 0, vocabulary = {};
  async function api(path,body) {
    const response = await fetch('/api/learning' + path,body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || value.message || 'Request failed');
    return value;
  }
  const guarded = action => async event => {
    event?.preventDefault();
    try { $('message').textContent = ''; await action(); }
    catch(error) { $('message').textContent = error.message; }
  };
  const display = (field,value) => {
    if (value === null || value === undefined || value === '') return '—';
    const resource = {tags:'tags',correspondent:'correspondents',document_type:'document_types'}[field];
    if (Array.isArray(value)) return value.length ? value.map(item => display(field,item)).join(', ') : 'None';
    if (resource && Number.isInteger(Number(value))) return vocabulary[resource]?.[value] ? `${vocabulary[resource][value]} (#${value})` : `#${value}`;
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  };
  function metadataTable(changes) {
    const wrap = node('div'); wrap.className = 'learning-table';
    const table = node('table'), header = node('tr');
    for (const label of ['Field','Before','After']) header.append(node('th',label));
    const head = node('thead'); head.append(header); table.append(head);
    const body = node('tbody');
    for (const [field,change] of Object.entries(changes)) {
      const row = node('tr'); row.append(node('th',field.replaceAll('_',' ')),node('td',display(field,change.before)),node('td',display(field,change.after))); body.append(row);
    }
    table.append(body); wrap.append(table); return wrap;
  }
  function actionButton(label,action) { const button = node('button',label); button.type = 'button'; button.onclick = guarded(action); return button; }
  async function loadExamples() {
    const {examples,legacy} = await api('/examples');
    $('examples').replaceChildren();
    for (const example of [...examples,...legacy]) {
      const article = node('article'); article.append(node('h3',`Document ${example.document_id}${example.legacy ? ' · Legacy confirmed' : example.active ? ' · Confirmed' : ' · Outdated confirmed example'}`));
      if (!example.legacy && !example.active) article.append(node('p','Not used in learning context because the document changed. Metadata protection remains until you revoke this example.'));
      article.append(metadataTable(Object.fromEntries(Object.entries(example.metadata).map(([field,value]) => [field,{before:null,after:value}]))));
      article.append(actionButton('Revoke example',async () => {
        await api(example.legacy ? `/legacy/${example.document_id}/revoke` : `/events/${example.event_id}/review`,example.legacy ? {} : {decision:'deleted'}); await load();
      })); $('examples').append(article);
    }
    if (!examples.length && !legacy.length) $('examples').textContent = 'No active confirmed examples.';
  }
  async function loadEvents() {
    const page = await api(`/events?limit=25&offset=${offset}&status=${encodeURIComponent($('status').value)}&q=${encodeURIComponent($('query').value)}`);
    $('events').replaceChildren();
    for (const event of page.events) {
      const inactive = event.status === 'confirmed' && !event.activeExample;
      const article = node('article'); article.append(node('h3',`Document ${event.document_id} · ${event.status}${inactive ? ' · Inactive or superseded' : ''}`));
      article.append(node('p',`${event.created_at} · Source: ${event.source}${event.source === 'unknown' ? ' · Human provenance unverified' : ''}`),metadataTable(event.changes));
      const actions = node('div'); actions.className = 'learning-actions';
      for (const decision of event.status === 'pending' ? ['confirmed','rejected'] : event.retainedExample ? ['deleted'] : []) {
        actions.append(actionButton({confirmed:'Confirm correction',rejected:'Reject correction',deleted:'Revoke example'}[decision],async () => { await api(`/events/${event.id}/review`,{decision}); await load(); }));
      }
      actions.append(actionButton('Show review history',async () => { $('history-document').value = event.document_id; historyOffset = 0; await loadHistory(); $('history').scrollIntoView({behavior:'smooth'}); }));
      article.append(actions); $('events').append(article);
    }
    if (!page.events.length) $('events').textContent = 'No corrections match this filter.';
    $('previous').disabled = offset === 0; $('next').disabled = !page.hasMore;
    $('page-info').textContent = page.total ? `${offset+1}–${offset+page.events.length} of ${page.total}` : '0 corrections';
  }
  async function loadHistory() {
    const {history} = await api(`/history?limit=50&offset=${historyOffset}&documentId=${encodeURIComponent($('history-document').value)}`);
    $('history').replaceChildren();
    for (const review of history) $('history').append(node('p',`${review.created_at} · Document ${review.document_id} · ${review.decision} · ${review.actor} · ${review.source}`));
    if (!history.length) $('history').textContent = 'No review history for this filter.';
    $('history-previous').disabled = historyOffset === 0; $('history-next').disabled = history.length < 50;
    $('history-page').textContent = `Page ${1+historyOffset/50}`;
  }
  async function loadSummary() {
    const summary = await api('/summary'); $('summary').replaceChildren();
    for (const [label,value] of [['Pending',summary.pending || 0],['Active examples',summary.activeExamples],['Legacy examples',summary.legacyExamples],['Rejected',summary.rejected || 0]]) {
      const card = node('div'); card.append(node('strong',value),node('span',label)); $('summary').append(card);
    }
    $('monitor-status').textContent = summary.monitor?.lastError ? `Last detection failed: ${summary.monitor.lastError}. The next scheduled scan will retry.` : summary.monitor?.lastFinished ? `Last scan: ${summary.monitor.lastFinished}` : 'No scan has run in this application session.';
  }
  async function load() { await loadExamples(); await Promise.all([loadEvents(),loadHistory(),loadSummary()]); }
  try { vocabulary = await api('/vocabulary'); } catch { vocabulary = {}; }
  const settings = await api('/settings');
  $('enabled').checked = settings.enabled; $('mode').value = settings.mode;
  $('interval').value = settings.intervalMs/1000; $('stabilization').value = settings.stabilizationMs/1000;
  $('settings-form').onsubmit = guarded(async () => {
    await api('/settings',{enabled:$('enabled').checked,mode:$('mode').value,intervalMs:Number($('interval').value)*1000,stabilizationMs:Number($('stabilization').value)*1000});
    await load(); $('message').textContent = 'Settings saved.';
  });
  $('filter-form').onsubmit = guarded(async () => { offset = 0; await loadEvents(); });
  $('history-form').onsubmit = guarded(async () => { historyOffset = 0; await loadHistory(); });
  $('scan').onclick = guarded(async () => { await api('/scan',{}); await load(); });
  $('previous').onclick = guarded(async () => { offset = Math.max(0,offset-25); await loadEvents(); });
  $('next').onclick = guarded(async () => { offset += 25; await loadEvents(); });
  $('history-previous').onclick = guarded(async () => { historyOffset = Math.max(0,historyOffset-50); await loadHistory(); });
  $('history-next').onclick = guarded(async () => { historyOffset += 50; await loadHistory(); });
  await load();
})().catch(error => { document.getElementById('message').textContent = error.message; });
