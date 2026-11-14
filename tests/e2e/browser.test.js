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
    const correction = status => page.locator('#events article').filter({has:page.getByRole('heading',{name:`Document ${document.id} · ${status}`,exact:true})}).filter({hasText:title});
    await correction('pending').getByRole('button',{name:'Confirm correction',exact:true}).waitFor();
    assert.match(await correction('pending').textContent(),/Human provenance unverified/);
    fs.mkdirSync('/artifacts',{recursive:true});
    await page.screenshot({path:'/artifacts/learning-desktop-light.png',fullPage:true,animations:'disabled'});
    await correction('pending').getByRole('button',{name:'Confirm correction',exact:true}).click();
    await correction('confirmed').waitFor();
    assert.ok((await page.locator('#examples').textContent()).includes(`Document ${document.id}`));
    const event = correction('confirmed');
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
    const rejected = status => page.locator('#events article').filter({has:page.getByRole('heading',{name:`Document ${document.id} · ${status}`,exact:true})}).filter({hasText:'Rejected browser correction'});
    await rejected('pending').getByRole('button',{name:'Reject correction',exact:true}).click();
    await rejected('rejected').waitFor();
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
    await page.locator('#themeToggle').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
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
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark','manual theme persists without dashboard initialization');
    assert.deepEqual(errors,[]);
    const after=await(await native.get(`http://paperless:8000/api/documents/${document.id}/`)).json();
    assert.deepEqual(after.custom_fields,before.custom_fields);assert.equal(after.modified,before.modified,'preview does not write metadata');
  }finally{await browser.close();await native.dispose();}
});

test('manual reviewed saves require selection, reject stale snapshots and never retry lost responses', {timeout:180000},async()=>{
  const token=fs.readFileSync('/fixture-data/.env','utf8').match(/^PAPERLESS_API_TOKEN=(.+)$/m)[1];
  const native=await request.newContext({extraHTTPHeaders:{Authorization:`Token ${token}`}});
  const app=await request.newContext({extraHTTPHeaders:key});
  const previous=await(await app.get(origin+'/api/learning/settings')).json();
  const stamp=Date.now(),fieldName=`Browser reviewed number ${stamp}`,invalidName=`Browser reviewed date ${stamp}`;
  const create=async(name,type)=>{
    const response=await native.post('http://paperless:8000/api/custom_fields/',{data:{name,data_type:type}});assert.ok(response.ok());return response.json();
  };
  const field=await create(fieldName,'string'),invalid=await create(invalidName,'date'),kept=await create(`Browser kept ${stamp}`,'string');
  const name=`browser-reviewed-save-${stamp}.txt`,content=`Synthetic ${stamp}\nNumbers NEW-42, NEW-FINAL and NEW-LAST.\nHistorical reference OLD-007.`;
  assert.ok((await native.post('http://paperless:8000/api/documents/post_document/',{multipart:{document:{name,mimeType:'text/plain',buffer:Buffer.from(content)}}})).ok());
  let document;
  for(let attempt=0;attempt<90;attempt++){
    document=(await(await native.get('http://paperless:8000/api/documents/?ordering=-id')).json()).results.find(row=>row.original_file_name===name);
    if(document)break;await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.ok(document);
  assert.ok((await native.patch(`http://paperless:8000/api/documents/${document.id}/`,{data:{custom_fields:[{field:field.id,value:'OLD'},{field:kept.id,value:'Keep native metadata'}]}})).ok());
  assert.ok((await app.post(origin+'/api/learning/settings',{data:{mode:'manual',enabled:false,stabilizationMs:0}})).ok());
  assert.ok((await app.post(origin+'/api/learning/scan',{data:{}})).ok());
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    const context=await browser.newContext({extraHTTPHeaders:key,viewport:{width:1280,height:900}});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    let proposed='OLD-007';
    await context.route('**/manual/analyze',route=>route.fulfill({json:{document:{title:'Synthetic review',tags:[],custom_fields:[
      {field_name:fieldName,value:proposed},{field_name:invalidName,value:'2031-02-30'}]}}}));
    const page=await context.newPage(),errors=[];let saves=0;
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',r=>{if(new URL(r.url()).pathname==='/manual/custom-field-apply')saves++;});
    await page.goto(origin+'/manual');
    await page.locator(`#documentSelect option[value="${document.id}"]`).waitFor({state:'attached'});
    await page.locator('#documentSelect').selectOption(String(document.id));
    await page.waitForFunction(()=>!document.getElementById('analyzeBtn').disabled);
    const analyze=async()=>{await page.locator('#analyzeBtn').click();await page.getByRole('checkbox',{name:`Select ${fieldName}`,exact:true}).waitFor();};
    const select=()=>page.getByRole('checkbox',{name:`Select ${fieldName}`,exact:true});
    const save=()=>page.getByRole('button',{name:'Save selected custom fields',exact:true});
    const edit=()=>page.getByRole('textbox',{name:`Edit ${fieldName}`,exact:true});
    const editDate=()=>page.getByRole('textbox',{name:`Edit ${invalidName}`,exact:true});
    const check=()=>page.getByRole('button',{name:'Check edited values',exact:true});
    await analyze();assert.equal(await save().isDisabled(),true);assert.equal(await select().isChecked(),false);
    assert.equal(await page.getByRole('checkbox',{name:`Select ${invalidName}`,exact:true}).isDisabled(),true);
    const beforeEdit=await(await native.get(`http://paperless:8000/api/documents/${document.id}/`)).json();
    await select().check();await edit().fill('NEW-42');
    assert.equal(await select().isChecked(),false);assert.equal(await select().isDisabled(),true);assert.equal(await save().isDisabled(),true);
    await editDate().fill('not-a-date');
    await check().click();await page.locator('#customFieldPreview [role="status"]').filter({hasText:'Edited values checked'}).waitFor();
    assert.equal(await select().isChecked(),false);assert.equal(await select().isDisabled(),false);
    assert.equal(await page.getByRole('checkbox',{name:`Select ${invalidName}`,exact:true}).isDisabled(),true,'invalid correction cannot be selected');
    await editDate().fill('2032-02-29');await check().click();
    await page.locator('#customFieldPreview [role="status"]').filter({hasText:'Edited values checked'}).waitFor();
    const numberRow=page.locator('#customFieldPreview article').filter({has:page.getByRole('heading',{name:fieldName,exact:true})});
    assert.match(await numberRow.textContent(),/AI suggestionOLD-007/,'original AI proposal stays visible after repeated checks');
    const afterCheck=await(await native.get(`http://paperless:8000/api/documents/${document.id}/`)).json();
    assert.equal(afterCheck.modified,beforeEdit.modified);assert.deepEqual(afterCheck.custom_fields,beforeEdit.custom_fields);assert.equal(saves,0);
    await select().check();await page.getByRole('checkbox',{name:`Select ${invalidName}`,exact:true}).check();await save().dblclick();
    await page.locator('#customFieldPreview [role="status"]').filter({hasText:'Save completed'}).waitFor();
    assert.equal(saves,1,'double click does not issue a second save');assert.equal(await select().isChecked(),false);assert.equal(await save().isDisabled(),true);
    let current=await(await native.get(`http://paperless:8000/api/documents/${document.id}/`)).json();
    assert.equal(current.custom_fields.find(row=>row.field===field.id).value,'NEW-42');assert.equal(current.custom_fields.find(row=>row.field===kept.id).value,'Keep native metadata');
    assert.equal(current.custom_fields.find(row=>row.field===invalid.id).value,'2032-02-29');
    const events=(await(await app.get(origin+`/api/learning/events?q=${document.id}&limit=200`)).json()).events.filter(row=>row.document_id===document.id);
    assert.ok(events.some(row=>row.source==='confirmed_ui'&&row.status==='pending'),'manual mode still requires learning review');
    fs.mkdirSync('/artifacts',{recursive:true});await page.screenshot({path:'/artifacts/manual-reviewed-fields-desktop.png',fullPage:true,animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.locator('#customFieldPreview').evaluate(e=>e.scrollWidth<=e.clientWidth));
    await page.screenshot({path:'/artifacts/manual-reviewed-fields-mobile.png',fullPage:true,animations:'disabled'});
    await select().check();
    assert.ok((await native.patch(`http://paperless:8000/api/documents/${document.id}/`,{data:{title:'External change after preview'}})).ok());
    await save().click();await page.locator('#customFieldPreview').filter({hasText:'changed'}).waitFor();
    assert.equal(await page.locator('#customFieldPreview input[type=checkbox]').count(),0);assert.equal(saves,2);
    proposed='NEW-FINAL';await analyze();await select().check();
    await page.route('**/manual/custom-field-apply',async route=>{const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed');});
    await save().click();await page.locator('#customFieldPreview').filter({hasText:'Save outcome is unknown'}).waitFor();
    await page.waitForLoadState('networkidle');assert.equal(saves,3,'ambiguous outcome is never retried automatically');
    current=await(await native.get(`http://paperless:8000/api/documents/${document.id}/`)).json();
    assert.equal(current.custom_fields.find(row=>row.field===field.id).value,'NEW-FINAL','server applied the request whose browser response was lost');
    await page.unroute('**/manual/custom-field-apply');
    proposed='NEW-LAST';await analyze();await select().check();
    let release,reached;const hold=new Promise(resolve=>{release=resolve;});const started=new Promise(resolve=>{reached=resolve;});
    await page.route('**/manual/custom-field-apply',async route=>{const response=await route.fetch();reached();await hold;await route.fulfill({response});});
    await save().click();await started;assert.equal(await edit().isDisabled(),true);assert.equal(await check().isDisabled(),true);
    await page.locator('#documentSelect').selectOption('');release();
    await page.waitForLoadState('networkidle');
    assert.match(await page.locator('#customFieldPreview').textContent(),/Analyze this document/);assert.equal(saves,4);
    await page.unroute('**/manual/custom-field-apply');
    await page.locator('#documentSelect').selectOption(String(document.id));
    await page.waitForFunction(()=>!document.getElementById('analyzeBtn').disabled);await analyze();
    await edit().fill('DO-NOT-SAVE');
    let releaseCheck,reachedCheck;const holdCheck=new Promise(resolve=>{releaseCheck=resolve;});const checking=new Promise(resolve=>{reachedCheck=resolve;});
    await page.route('**/manual/custom-field-preview',async route=>{const response=await route.fetch();reachedCheck();await holdCheck;await route.fulfill({response});});
    await check().click();await checking;assert.equal(await edit().isDisabled(),true);
    await page.locator('#documentSelect').selectOption('');releaseCheck();await page.waitForLoadState('networkidle');
    assert.match(await page.locator('#customFieldPreview').textContent(),/Analyze this document/);assert.equal(saves,4,'late correction check never writes or populates another document');
    await page.unroute('**/manual/custom-field-preview');
    await page.locator('#documentSelect').selectOption(String(document.id));
    await page.waitForFunction(()=>!document.getElementById('analyzeBtn').disabled);await analyze();await edit().fill('DO-NOT-SAVE');
    await page.route('**/manual/custom-field-preview',route=>route.fulfill({status:502,json:{error:'Synthetic preview unavailable'}}));
    await check().click();await page.getByText('Synthetic preview unavailable',{exact:true}).waitFor();
    assert.equal(await page.locator('#customFieldPreview input').count(),0);assert.equal(saves,4,'failed read-only check cannot send a save');
    assert.deepEqual(errors,[]);
  }finally{
    await browser.close();await app.post(origin+'/api/learning/settings',{data:previous});await app.dispose();await native.dispose();
  }
});

test('learned field suggestions preserve provenance through editing and require explicit save', {timeout:180000},async()=>{
  const token=fs.readFileSync('/fixture-data/.env','utf8').match(/^PAPERLESS_API_TOKEN=(.+)$/m)[1];
  const native=await request.newContext({extraHTTPHeaders:{Authorization:`Token ${token}`}}),app=await request.newContext({extraHTTPHeaders:key});
  const post=async(path,data)=>{const response=await app.post(origin+'/api/learning'+path,{data});assert.ok(response.ok());return response.json();};
  const previous=await(await app.get(origin+'/api/learning/settings')).json(),stamp=Date.now();
  const create=async(resource,data)=>{const response=await native.post(`http://paperless:8000/api/${resource}/`,{data});assert.ok(response.ok());return response.json();};
  const field=await create('custom_fields',{name:`Browser learned reference ${stamp}`,data_type:'string'});
  const sender=await create('correspondents',{name:`Browser learned sender ${stamp}`}),type=await create('document_types',{name:`Browser learned type ${stamp}`});
  const documents=[];
  for(const value of ['TRAIN-001','NEW-007']){
    const name=`browser-learned-${stamp}-${value}.txt`;
    assert.ok((await native.post('http://paperless:8000/api/documents/post_document/',{multipart:{document:{name,mimeType:'text/plain',buffer:Buffer.from(`Synthetic ${stamp}\nInvoice reference: ${value}\nAlternative current identifier NEW-008`)}}})).ok());
    let document;
    for(let attempt=0;attempt<90;attempt++){
      document=(await(await native.get('http://paperless:8000/api/documents/?ordering=-id')).json()).results.find(row=>row.original_file_name===name);
      if(document)break;await new Promise(resolve=>setTimeout(resolve,1000));
    }
    assert.ok(document);assert.ok((await native.patch(`http://paperless:8000/api/documents/${document.id}/`,{data:{correspondent:sender.id,document_type:type.id,custom_fields:[{field:field.id,value:'Previous'}]}})).ok());documents.push(document);
  }
  const [source,target]=documents;let browser;
  try{
    await post('/settings',{mode:'manual',enabled:false,stabilizationMs:0});await post('/scan',{});
    assert.ok((await native.patch(`http://paperless:8000/api/documents/${source.id}/`,{data:{custom_fields:[{field:field.id,value:'TRAIN-001'}]}})).ok());await post('/scan',{});
    const event=(await(await app.get(origin+`/api/learning/events?q=${source.id}&limit=200`)).json()).events.find(row=>row.document_id===source.id&&row.status==='pending');assert.ok(event);
    await post(`/events/${event.id}/review`,{decision:'confirmed'});
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
    const context=await browser.newContext({extraHTTPHeaders:key,viewport:{width:1280,height:900}});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage(),errors=[];let models=0,saves=0;
    page.on('pageerror',error=>errors.push(error.message));page.on('request',r=>{if(r.url().endsWith('/manual/analyze'))models++;if(r.url().endsWith('/manual/custom-field-apply'))saves++;});
    await page.goto(origin+'/manual');await page.locator(`#documentSelect option[value="${target.id}"]`).waitFor({state:'attached'});
    await page.locator('#documentSelect').selectOption(String(target.id));
    const find=()=>page.getByRole('button',{name:'Find learned field suggestions',exact:true});
    await page.waitForFunction(()=>!document.getElementById('learnedFieldsBtn').disabled);
    const before=await(await native.get(`http://paperless:8000/api/documents/${target.id}/`)).json();await find().click();
    const row=page.locator('#customFieldPreview article').filter({has:page.getByRole('heading',{name:field.name,exact:true})});
    await row.waitFor();assert.match(await row.textContent(),/Original learned suggestionNEW-007/);assert.match(await row.textContent(),new RegExp(`Source document ${source.id} · confirmed learning event ${event.id}`));
    assert.ok(!(await row.textContent()).includes('TRAIN-001'));assert.equal(models,0);assert.equal(saves,0);
    assert.equal((await(await native.get(`http://paperless:8000/api/documents/${target.id}/`)).json()).modified,before.modified);
    const select=()=>page.getByRole('checkbox',{name:`Select ${field.name}`,exact:true}),save=()=>page.getByRole('button',{name:'Save selected custom fields',exact:true});
    assert.equal(await select().isChecked(),false);await page.getByRole('textbox',{name:`Edit ${field.name}`,exact:true}).fill('NEW-008');assert.equal(await save().isDisabled(),true);
    await page.getByRole('button',{name:'Check edited values',exact:true}).click();await page.getByRole('status').filter({hasText:'Edited values checked'}).waitFor();
    assert.match(await row.textContent(),/Original learned suggestionNEW-007/);assert.match(await row.textContent(),/confirmed learning event/);
    fs.mkdirSync('/artifacts',{recursive:true});await row.screenshot({path:'/artifacts/learned-field-editor-desktop.png',animations:'disabled'});
    await page.setViewportSize({width:390,height:844});assert.ok(await row.evaluate(e=>e.scrollWidth<=e.clientWidth));
    await row.screenshot({path:'/artifacts/learned-field-editor-mobile.png',animations:'disabled'});
    await select().check();await save().click();await page.getByRole('status').filter({hasText:'Save completed'}).waitFor();assert.equal(saves,1);assert.equal(models,0);
    assert.equal((await(await native.get(`http://paperless:8000/api/documents/${target.id}/`)).json()).custom_fields.find(item=>item.field===field.id).value,'NEW-008');
    let release,reached;const hold=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{reached=resolve;});
    await page.route('**/manual/learned-field-preview',async route=>{const response=await route.fetch();reached();await hold;await route.fulfill({response});});
    await find().click();await started;await page.locator('#documentSelect').selectOption('');release();await page.waitForLoadState('networkidle');
    assert.match(await page.locator('#customFieldPreview').textContent(),/Analyze this document/);
    await page.unroute('**/manual/learned-field-preview');await page.locator('#documentSelect').selectOption(String(target.id));await page.waitForFunction(()=>!document.getElementById('learnedFieldsBtn').disabled);
    await page.route('**/manual/learned-field-preview',route=>route.fulfill({status:502,json:{error:'Synthetic learned lookup unavailable'}}));
    await find().click();await page.getByText('Synthetic learned lookup unavailable',{exact:true}).waitFor();assert.equal(await page.locator('#customFieldPreview input').count(),0);assert.equal(saves,1);
    await page.unroute('**/manual/learned-field-preview');await post(`/events/${event.id}/review`,{decision:'deleted'});
    await find().click();await page.getByText('No learned field suggestions.',{exact:false}).waitFor();assert.equal(models,0);assert.equal(saves,1);assert.deepEqual(errors,[]);
  }finally{
    if(browser)await browser.close();await app.post(origin+'/api/learning/settings',{data:previous});await app.dispose();await native.dispose();
  }
});
