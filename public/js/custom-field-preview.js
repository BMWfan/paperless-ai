'use strict';
(() => {
  const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
  const display=value=>value===null||value===undefined?'—':typeof value==='object'?JSON.stringify(value):String(value);
  const notices={unknown_field:'No matching Paperless field.',ambiguous_field:'Field name is ambiguous.',
    not_provided:'No value suggested.',invalid_value:'Invalid value for this field type.',
    no_exact_occurrence:'No exact occurrence in the submitted text.',multiple_occurrences:'Several occurrences; check the surrounding text.',
    multiple_proposals:'Several proposals target this field.'};
  function message(container,text){container.replaceChildren(node('p',text));}
  function render(container,result){
    container.replaceChildren();
    if(!result.rows.length)return message(container,'No custom field values were suggested.');
    for(const row of result.rows){
      const article=node('article');article.className='custom-field-proposal';
      article.append(node('h3',row.name),node('p',row.type?`${row.type} · Field ${row.fieldId}`:'Field could not be resolved'));
      const values=node('dl');
      for(const [label,value]of [['Current value',row.currentValue],['AI suggestion',row.proposedValue],['Typed value',row.normalizedValue]])values.append(node('dt',label),node('dd',display(value)));
      article.append(values,node('p','Field meaning is unverified. A text occurrence is not proof of the correct field.'));
      for(const flag of row.flags)article.append(node('p',notices[flag]||flag));
      for(const excerpt of row.evidence.excerpts){
        const quote=node('blockquote');quote.append(node('small',`Text near line ${excerpt.line}`),node('pre',excerpt.text));article.append(quote);
      }
      container.append(article);
    }
  }
  window.CustomFieldPreview={render,message};
})();
