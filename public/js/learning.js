'use strict';
(async () => {
  const $ = id => document.getElementById(id);
  async function api(path, body) {
    const response = await fetch('/api/learning' + path, body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || 'Request failed');
    return value;
  }
  const guarded = action => async () => { try { $('message').textContent = ''; await action(); } catch(error) { $('message').textContent = error.message; } };
  async function load() {
    const { events } = await api('/events?status=' + encodeURIComponent($('status').value) + '&q=' + encodeURIComponent($('query').value));
    $('events').replaceChildren();
    for (const event of events) {
      const article = document.createElement('article');
      const title = document.createElement('h3');
      title.textContent = `Document ${event.document_id}: ${event.status} (${event.source})`;
      const details = document.createElement('pre');
      details.textContent = JSON.stringify(event.changes, null, 2);
      const time = document.createElement('p'); time.textContent = event.created_at;
      article.append(title,time,details);
      for (const decision of event.status === 'pending' ? ['confirmed','rejected'] : event.status === 'confirmed' ? ['deleted'] : []) {
        const button = document.createElement('button');
        button.textContent = { confirmed: 'Confirm', rejected: 'Reject', deleted: 'Delete example' }[decision];
        button.onclick = guarded(async () => { await api(`/events/${event.id}/review`, { decision }); await load(); });
        article.append(button);
      }
      $('events').append(article);
    }
    if (!events.length) $('events').textContent = 'No events match this filter.';
  }
  const settings = await api('/settings');
  $('enabled').checked = settings.enabled; $('mode').value = settings.mode;
  $('interval').value = settings.intervalMs/1000; $('stabilization').value = settings.stabilizationMs/1000;
  $('save').onclick = guarded(async () => { await api('/settings', { enabled: $('enabled').checked, mode: $('mode').value,
    intervalMs: Number($('interval').value)*1000, stabilizationMs: Number($('stabilization').value)*1000 }); });
  $('scan').onclick = guarded(async () => { await api('/scan', {}); await load(); });
  $('refresh').onclick = guarded(load);
  await load();
})().catch(error => { document.getElementById('message').textContent = error.message; });
