'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium, request } = require('playwright-core');
const origin = 'http://ai:3000';
const key = {'x-api-key':'isolated-test-api-key'};

test('learning dashboard supports real review actions, themes and mobile layout', {timeout:180000}, async () => {
  const env = fs.readFileSync('/fixture-data/.env','utf8');
  assert.match(env,/PAPERLESS_API_URL=http:\/\/paperless:8000\/api/);
  const token = env.match(/^PAPERLESS_API_TOKEN=(.+)$/m)[1];
  const paperless = await request.newContext({baseURL:'http://paperless:8000/api',extraHTTPHeaders:{Authorization:`Token ${token}`}});
  const learning = await request.newContext({baseURL:origin+'/api/learning',extraHTTPHeaders:key});
  async function post(path, data) {
    const response = await learning.post(origin+'/api/learning'+path,{data});
    assert.ok(response.ok(),`${path}: ${response.status()} ${await response.text()}`);
    return response.json();
  }
  const previous = await (await learning.get(origin+'/api/learning/settings')).json();
  const name = `browser-synthetic-${Date.now()}.txt`;
  const upload = await paperless.post('http://paperless:8000/api/documents/post_document/',{multipart:{document:{name,mimeType:'text/plain',buffer:Buffer.from('Fictional browser invoice. Synthetic data only. Amount EUR 42.')}}});
  assert.ok(upload.ok());
  let document;
  for (let attempt=0;attempt<90;attempt++) {
    const page = await (await paperless.get('http://paperless:8000/api/documents/?ordering=-id')).json();
    document = page.results.find(row=>row.original_file_name===name);
    if(document) break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.ok(document,'synthetic browser document consumed');
  await post('/settings',{mode:'manual',enabled:false,stabilizationMs:0});
  await post('/scan',{});
  const title = 'Reviewed browser invoice with a long descriptive synthetic title';
  assert.ok((await paperless.patch(`http://paperless:8000/api/documents/${document.id}/`,{data:{title}})).ok());
  await post('/scan',{});
  const browser = await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  const errors=[];
  try {
    const anonymous = await browser.newPage();
    await anonymous.goto(origin+'/learning');
    assert.match(new URL(anonymous.url()).pathname,/^\/(login|setup)$/,'anonymous access follows login/setup flow');
    await anonymous.close();
    const context = await browser.newContext({extraHTTPHeaders:key,viewport:{width:1440,height:1000}});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page = await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/learning');
    await page.locator('#page-info').filter({hasText:/corrections|of/}).waitFor();
    assert.equal(await page.locator('h1').textContent(),'Learning');
    await page.locator('#query').fill(String(document.id));
    await page.locator('#filter-form button').click();
    await page.getByRole('button',{name:'Confirm correction',exact:true}).waitFor();
    assert.match(await page.locator('#events').textContent(),/Human provenance unverified/);
    fs.mkdirSync('/artifacts',{recursive:true});
    await page.screenshot({path:'/artifacts/learning-desktop-light.png',fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'Confirm correction',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#events').textContent.includes(' · pending'));
    assert.ok((await page.locator('#examples').textContent()).includes(`Document ${document.id}`));
    const event = page.locator('#events article').filter({hasText:`Document ${document.id} · confirmed`});
    await event.getByRole('button',{name:'Show review history',exact:true}).click();
    await page.locator('#history').filter({hasText:`Document ${document.id} · confirmed`}).waitFor();
    await page.locator('#theme').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await page.screenshot({path:'/artifacts/learning-desktop-dark.png',fullPage:true,animations:'disabled'});
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await page.locator('#page-info').filter({hasText:/corrections|of/}).waitFor();
    await page.locator('#query').fill(String(document.id));
    await page.locator('#filter-form button').click();
    await page.locator('#history-document').fill(String(document.id));
    await page.locator('#history-form button').click();
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no mobile horizontal page overflow');
    assert.equal(await page.locator('.sidebar').evaluate(element=>Math.round(element.getBoundingClientRect().width)),390,'mobile navigation spans the viewport');
    assert.ok(await page.locator('#events tbody th').first().evaluate(element=>element.getBoundingClientRect().width>=100),'metadata field labels remain readable');
    assert.ok(await page.locator('.learning-table').evaluateAll(elements=>elements.every(element=>element.scrollWidth<=element.clientWidth)),'mobile metadata comparison is visible without horizontal scrolling');
    await page.screenshot({path:'/artifacts/learning-mobile-dark.png',fullPage:true,animations:'disabled'});
    await page.locator('#theme').click();
    await page.screenshot({path:'/artifacts/learning-mobile-light.png',fullPage:true,animations:'disabled'});
    await page.locator('#mode').selectOption('hybrid');
    await page.getByRole('button',{name:'Save settings',exact:true}).click();
    await page.locator('#message').filter({hasText:'Settings saved.'}).waitFor();
    assert.equal((await (await learning.get(origin+'/api/learning/settings')).json()).mode,'hybrid');
    await page.locator('#query').fill(String(document.id));
    await page.locator('#filter-form button').click();
    await event.getByRole('button',{name:'Revoke example',exact:true}).click();
    await page.waitForFunction(id=>!document.querySelector('#examples').textContent.includes(`Document ${id} ·`),document.id);
    assert.ok((await paperless.patch(`http://paperless:8000/api/documents/${document.id}/`,{data:{title:'Rejected browser correction'}})).ok());
    await page.getByRole('button',{name:'Scan now',exact:true}).click();
    await page.getByRole('button',{name:'Reject correction',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#events').textContent.includes(' · rejected'));
    assert.equal(await page.locator('#message').textContent(),'');
    assert.deepEqual(errors,[],'no uncaught browser errors');
  } finally {
    await browser.close();
    const ownEvents=await (await learning.get(origin+`/api/learning/events?q=${document.id}`)).json();
    for(const event of ownEvents.events.filter(row=>row.document_id===document.id)) {
      if(event.status==='pending') await post(`/events/${event.id}/review`,{decision:'rejected'});
      else if(event.status==='confirmed' && event.retainedExample) await post(`/events/${event.id}/review`,{decision:'deleted'});
    }
    await post('/settings',previous);
    await paperless.dispose();
    await learning.dispose();
  }
});

test('manual field preview shows native values safely and discards responses after document changes', {timeout:180000}, async()=>{
  const token=fs.readFileSync('/fixture-data/.env','utf8').match(/^PAPERLESS_API_TOKEN=(.+)$/m)[1];
  const native=await request.newContext({extraHTTPHeaders:{Authorization:`Token ${token}`}});
  const fieldName=`Browser preview ${Date.now()}`;
  const fieldResponse=await native.post('http://paperless:8000/api/custom_fields/',{data:{name:fieldName,data_type:'string'}});
  assert.ok(fieldResponse.ok());const field=await fieldResponse.json();
  const value='<img src=x onerror="window.previewExecuted=true">';
  const content=`Synthetic preview ${fieldName}\nReference value: ${value}\nHistorical reference: OLD-007`;
  const name=`browser-field-preview-${Date.now()}.txt`;
  assert.ok((await native.post('http://paperless:8000/api/documents/post_document/',{multipart:{document:{name,mimeType:'text/plain',buffer:Buffer.from(content)}}})).ok());
  let document;
  for(let attempt=0;attempt<90;attempt++){
    const page=await(await native.get('http://paperless:8000/api/documents/?ordering=-id')).json();
    document=page.results.find(row=>row.original_file_name===name);if(document)break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.ok(document);
  assert.ok((await native.patch(`http://paperless:8000/api/documents/${document.id}/`,{data:{custom_fields:[{field:field.id,value:'Existing value'}]}})).ok());
  const before=await(await native.get(`http://paperless:8000/api/documents/${document.id}/`)).json();
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    const context=await browser.newContext({extraHTTPHeaders:key,viewport:{width:1280,height:900}});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await context.route('**/manual/analyze',route=>route.fulfill({json:{document:{title:'Synthetic preview',tags:[],custom_fields:[{field_name:fieldName,value}]}}}));
    const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/manual');
    await page.locator(`#documentSelect option[value="${document.id}"]`).waitFor({state:'attached'});
    await page.locator('#documentSelect').selectOption(String(document.id));
    await page.waitForFunction(()=>!document.getElementById('analyzeBtn').disabled);
    await page.locator('#analyzeBtn').click();
    await page.locator('#customFieldPreview').filter({hasText:'Existing value'}).waitFor();
    assert.ok((await page.locator('#customFieldPreview').textContent()).includes(value));
    assert.equal(await page.locator('#customFieldPreview img').count(),0,'source/suggestion text cannot create HTML');
    assert.equal(await page.evaluate(()=>window.previewExecuted),undefined);
    assert.match(await page.locator('#customFieldPreview').textContent(),/Field meaning is unverified/);
    assert.match(await page.locator('#customFieldPreview').textContent(),/Text near line/);
    fs.mkdirSync('/artifacts',{recursive:true});
    await page.screenshot({path:'/artifacts/manual-custom-fields-desktop.png',fullPage:true,animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.locator('#customFieldPreview').evaluate(element=>element.scrollWidth<=element.clientWidth),'proposal text wraps on mobile');
    await page.screenshot({path:'/artifacts/manual-custom-fields-mobile.png',fullPage:true,animations:'disabled'});
    let release,started;
    const held=new Promise(resolve=>{release=resolve;});const reached=new Promise(resolve=>{started=resolve;});
    await page.route('**/manual/custom-field-preview',async route=>{const response=await route.fetch();started();await held;await route.fulfill({response});});
    const pending=page.evaluate(()=>window.handleAnalysis());
    await reached;
    await page.locator('#documentSelect').selectOption('');release();await pending;
    assert.match(await page.locator('#customFieldPreview').textContent(),/Analyze this document/);
    assert.ok(!(await page.locator('#customFieldPreview').textContent()).includes(value),'late response cannot populate another selection');
    assert.equal(await page.locator('#analyzeBtn').isDisabled(),true);
    assert.deepEqual(errors,[]);
    const after=await(await native.get(`http://paperless:8000/api/documents/${document.id}/`)).json();
    assert.deepEqual(after.custom_fields,before.custom_fields);assert.equal(after.modified,before.modified,'preview does not write metadata');
  }finally{await browser.close();await native.dispose();}
});
