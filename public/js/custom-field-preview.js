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
  function render(container,result,refreshRequest,notice=''){
    const generation=next(container),current=()=>generations.get(container)===generation;
    const selected=new Map(),checkboxes=[];
    container.replaceChildren();
    if(!result.rows.length)return message(container,'No custom field values were suggested.');
    const selectable=!!refreshRequest&&!!result.snapshotDigest&&Array.isArray(result.reviewFieldIds);
    const controls=node('div'),button=node('button','Save selected custom fields'),status=node('p',notice);
    button.type='button';button.disabled=true;status.setAttribute('role','status');
    controls.className='custom-field-controls';controls.append(button,status);
    if(selectable)container.append(controls);
    let busy=false;
    for(const row of result.rows){
      const article=node('article');article.className='custom-field-proposal';
      article.append(node('h3',row.name),node('p',row.type?`${row.type} · Field ${row.fieldId}`:'Field could not be resolved'));
      if(selectable){
        const label=node('label'),checkbox=node('input');checkbox.type='checkbox';
        checkbox.disabled=!row.canApply;checkbox.dataset.fieldId=row.fieldId??'';
        checkbox.setAttribute('aria-label',`Select ${row.name}`);
        checkbox.addEventListener('change',()=>{
          if(!current()||busy)return;
          if(checkbox.checked)selected.set(row.fieldId,{field:row.fieldId,value:row.proposedValue});else selected.delete(row.fieldId);
          button.disabled=!selected.size;status.textContent=`${selected.size} fields selected.`;
        });
        checkboxes.push(checkbox);
        label.append(checkbox,document.createTextNode(' Select this value after checking its meaning.'));article.append(label);
      }
      const values=node('dl');
      for(const [label,value]of [['Current value',row.currentValue],['AI suggestion',row.proposedValue],['Typed value',row.normalizedValue]])values.append(node('dt',label),node('dd',display(value)));
      article.append(values,node('p','Field meaning is unverified. A text occurrence is not proof of the correct field.'));
      for(const flag of row.flags)article.append(node('p',notices[flag]||flag));
      for(const excerpt of row.evidence.excerpts){
        const quote=node('blockquote');quote.append(node('small',`Text near line ${excerpt.line}`),node('pre',excerpt.text));article.append(quote);
      }
      container.append(article);
    }
    button.addEventListener('click',async()=>{
      if(!current()||busy||!selected.size)return;
      busy=true;button.disabled=true;for(const checkbox of checkboxes)checkbox.disabled=true;
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
        render(container,preview,refreshRequest,'Save completed. Review the current values below.');
      }catch{
        if(!current())return;
        message(container,saved?'Save completed, but the preview could not refresh. Reload before another save.':
          'Save outcome is unknown. Reload the document before trying again.');
      }
    });
  }
  window.CustomFieldPreview={render,message};
})();
