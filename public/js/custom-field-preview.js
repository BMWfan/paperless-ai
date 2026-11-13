'use strict';
(() => {
  const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
  const display=value=>value===null||value===undefined?'—':typeof value==='object'?JSON.stringify(value):String(value);
  const notices={unknown_field:'No matching Paperless field.',ambiguous_field:'Field name is ambiguous.',
    unsupported_type:'This field type cannot be saved from these suggestions.',
    not_provided:'No value suggested.',invalid_value:'Invalid value for this field type.',
    no_exact_occurrence:'No exact occurrence in the submitted text.',multiple_occurrences:'Several occurrences; check the surrounding text.',
    multiple_proposals:'Several proposals target this field.'};
  const generations=new WeakMap();
  function next(container){const generation=(generations.get(container)||0)+1;generations.set(container,generation);return generation;}
  function message(container,text){next(container);container.replaceChildren(node('p',text));}
  function render(container,result,refreshRequest,notice='',originals=result.rows.map(row=>row.proposedValue)){
    const generation=next(container),current=()=>generations.get(container)===generation;
    const selected=new Map(),checkboxes=[],editors=[],drafts=result.rows.map(row=>({field_name:row.name,value:row.proposedValue}));
    container.replaceChildren();
    if(!result.rows.length)return message(container,'No custom field values were suggested.');
    const selectable=!!refreshRequest&&!!result.snapshotDigest&&Array.isArray(result.reviewFieldIds);
    const controls=node('div'),button=node('button','Save selected custom fields'),status=node('p',notice);
    const check=node('button','Check edited values');check.type='button';check.disabled=true;
    button.type='button';button.disabled=true;status.setAttribute('role','status');
    controls.className='custom-field-controls';controls.append(check,button,status);
    if(selectable)container.append(controls);
    let busy=false,dirty=false;
    function lock(){
      check.disabled=true;button.disabled=true;
      for(const control of [...checkboxes,...editors])control.disabled=true;
    }
    for(const [index,row] of result.rows.entries()){
      const article=node('article');article.className='custom-field-proposal';
      article.append(node('h3',row.name),node('p',row.type?`${row.type} · Field ${row.fieldId}`:'Field could not be resolved'));
      if(selectable){
        const label=node('label'),checkbox=node('input');checkbox.type='checkbox';
        checkbox.disabled=!row.canApply;checkbox.dataset.fieldId=row.fieldId??'';
        checkbox.setAttribute('aria-label',`Select ${row.name}`);
        checkbox.addEventListener('change',()=>{
          if(!current()||busy||dirty||!row.canApply)return;
          if(checkbox.checked)selected.set(row.fieldId,{field:row.fieldId,value:row.proposedValue});else selected.delete(row.fieldId);
          button.disabled=!selected.size;status.textContent=`${selected.size} fields selected.`;
        });
        checkboxes.push(checkbox);
        label.append(checkbox,document.createTextNode(' Select this value after checking its meaning.'));article.append(label);
      }
      const values=node('dl');
      for(const [label,value]of [['Current value',row.currentValue],['AI suggestion',originals[index]],['Reviewed proposal',row.proposedValue],['Typed value',row.normalizedValue]])values.append(node('dt',label),node('dd',display(value)));
      article.append(values,node('p','Field meaning is unverified. A text occurrence is not proof of the correct field.'));
      if(selectable&&row.canEdit){
        const label=node('label'),editor=node(row.type==='longtext'?'textarea':'input');
        if(row.type!=='longtext')editor.type='text';
        editor.value=row.proposedValue==null?'':typeof row.proposedValue==='object'?'':String(row.proposedValue);
        editor.setAttribute('aria-label',`Edit ${row.name}`);editor.className='custom-field-editor';
        editor.addEventListener('input',()=>{
          if(!current()||busy)return;
          drafts[index].value=editor.value;dirty=true;selected.clear();button.disabled=true;check.disabled=false;
          for(const checkbox of checkboxes){checkbox.checked=false;checkbox.disabled=true;}
          status.textContent='Values edited. Check edited values, then select the values to save.';
        });
        editors.push(editor);label.append(document.createTextNode('Correct this proposal'),editor);article.append(label);
        article.append(node('p','Dates: YYYY-MM-DD; booleans: true/false; selections: exact option label or ID. Empty values do not clear a field.'));
      }
      for(const flag of row.flags)article.append(node('p',notices[flag]||flag));
      for(const excerpt of row.evidence.excerpts){
        const quote=node('blockquote');quote.append(node('small',`Text near line ${excerpt.line}`),node('pre',excerpt.text));article.append(quote);
      }
      container.append(article);
    }
    check.addEventListener('click',async()=>{
      if(!current()||busy||!dirty)return;
      busy=true;lock();status.textContent='Checking edited values without saving…';
      const request={...refreshRequest,suggestions:drafts};
      try{
        const response=await fetch('/manual/custom-field-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
        const preview=await response.json();if(!current())return;
        if(!response.ok){message(container,preview.error||'Preview failed. Reload before saving.');return;}
        render(container,preview,request,'Edited values checked. Review their meaning and select values to save.',originals);
      }catch{if(current())message(container,'Edited values could not be checked. Nothing was saved. Reload before saving.');}
    });
    button.addEventListener('click',async()=>{
      if(!current()||busy||dirty||!selected.size)return;
      busy=true;lock();
      status.textContent='Saving selected fields…';
      let saved=false;
      try{
        const response=await fetch('/manual/custom-field-apply',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({documentId:result.documentId,snapshotDigest:result.snapshotDigest,
            reviewFieldIds:result.reviewFieldIds,fields:[...selected.values()]})});
        const body=await response.json();if(!current())return;
        if(!response.ok){
          message(container,body.outcome==='unknown'?'Save outcome is unknown. Reload the document before trying again.':body.error||'Save failed. Analyze again before saving.');return;
        }
        saved=true;
        const refreshed=await fetch('/manual/custom-field-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(refreshRequest)});
        const preview=await refreshed.json();if(!current())return;
        if(!refreshed.ok)throw new Error('Preview refresh failed');
        render(container,preview,refreshRequest,'Save completed. Review the current values below.',originals);
      }catch{
        if(!current())return;
        message(container,saved?'Save completed, but the preview could not refresh. Reload before another save.':
          'Save outcome is unknown. Reload the document before trying again.');
      }
    });
  }
  window.CustomFieldPreview={render,message};
})();
