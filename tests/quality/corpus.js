'use strict';
// Versioned synthetic data. Never modify this corpus after observing model results;
// new hypotheses require a new revision or the separate confirmation split.
const classes = [
  {kind:'invoice',type:'Invoice',en:'Electricity invoice',de:'Stromrechnung',purposeEn:'Electricity supplied. Payment due for consumption.',purposeDe:'Stromlieferung. Zahlung für den Verbrauch fällig.',idField:'invoice_number',labelEn:'Invoice number',labelDe:'Rechnungsnummer',dateField:'due_date'},
  {kind:'contract',type:'Contract',en:'Mobile service contract',de:'Mobilfunkvertrag',purposeEn:'Agreement for mobile telephone service. Contract ends on the specified date.',purposeDe:'Vereinbarung über Mobilfunkdienste. Der Vertrag endet am genannten Datum.',idField:'contract_number',labelEn:'Contract number',labelDe:'Vertragsnummer',dateField:'end_date'},
  {kind:'insurance',type:'Insurance policy',en:'Household insurance policy',de:'Hausratversicherung',purposeEn:'Coverage for household belongings. Annual insurance premium.',purposeDe:'Versicherungsschutz für Hausrat. Jährlicher Versicherungsbeitrag.',idField:'policy_number',labelEn:'Policy number',labelDe:'Versicherungsnummer',dateField:'end_date'},
  {kind:'letter',type:'Letter',en:'General correspondence',de:'Allgemeiner Brief',purposeEn:'Dear recipient, please note the change of office opening hours.',purposeDe:'Sehr geehrte Empfängerin, bitte beachten Sie die geänderten Bürozeiten.'},
  {kind:'payment',type:'Payment confirmation',en:'Payment confirmation',de:'Zahlungsbestätigung',purposeEn:'Payment received. This confirms receipt and is not a new invoice.',purposeDe:'Zahlung erhalten. Dies bestätigt den Eingang und ist keine neue Rechnung.'}
];
const fieldTypes={invoice_number:'string',contract_number:'string',policy_number:'string',amount:'monetary',due_date:'date',end_date:'date'};
function make(split,kind,language,variant) {
  const spec=classes.find(row=>row.kind===kind);
  const prefix={training:'TRAIN',evaluation:'EVAL',confirmation:'CHECK'}[split];
  const suffix=`${classes.indexOf(spec)+1}${language==='de'?2:1}${variant+1}`;
  const identifier=`${prefix}-${kind.toUpperCase()}-${suffix}`;
  const sender=`${prefix} ${kind} ${language} ${['Alpha','Beta','Gamma','Delta','Epsilon'][variant]} Company`;
  const year=split==='training'?2029:split==='evaluation'?2031:2033;
  const date=`${year}-0${variant+2}-18`;
  const amount=split==='training'?'987.65':split==='evaluation'?`${42+variant}.50`:`${63+variant}.25`;
  const missing=variant===1||variant===4;
  const values=Object.fromEntries(Object.keys(fieldTypes).map(key=>[key,null]));
  const lines=[sender,language==='de'?spec.de:spec.en,'SYNTHETIC TEST DOCUMENT',language==='de'?spec.purposeDe:spec.purposeEn];
  if(spec.idField) {
    if(!missing){values[spec.idField]=identifier;lines.push(`${language==='de'?spec.labelDe:spec.labelEn}: ${identifier}`);}
    else lines.push(language==='de'?'Die Dokumentnummer und das Datum sind nicht angegeben.':'The document number and date are not provided.');
    values.amount=`EUR${amount}`;lines.push(`${language==='de'?'Betrag':'Amount'}: EUR ${language==='de'?amount.replace('.',','):amount}`);
    if(!missing){values[spec.dateField]=date;lines.push(`${spec.dateField==='due_date'?(language==='de'?'Fällig am':'Due date'):(language==='de'?'Enddatum':'End date')}: ${date}`);}
    if(variant>=2&&!missing)lines.push(`${language==='de'?'Nur historische Referenz, nicht die aktuelle Nummer':'Historical reference only, not the current number'}: OLD-${kind.toUpperCase()}-777`);
  }
  return {split,id:`${split}-${kind}-${language}-${variant}`,kind,language,content:lines.join('\n'),
    expected:{document_type:spec.type,tags:[kind],correspondent:sender,language,custom_fields:values},
    forbiddenCurrentIdentifiers:variant>=2&&!missing&&spec.idField?[`OLD-${kind.toUpperCase()}-777`]:[]};
}
function corpus(split) {
  if(!['training','evaluation','confirmation'].includes(split))throw new Error('Unknown corpus split');
  const variants=split==='training'?[0]:split==='evaluation'?[0,1,2]:[3,4];
  return classes.flatMap(spec=>['en','de'].flatMap(language=>variants.map(variant=>make(split,spec.kind,language,variant))));
}
function references() {return corpus('training').map(row=>({id:row.id,metadata:row.expected,content_preview:row.content}));}
module.exports={corpus,references,fieldTypes,classes,revision:'quality-v1'};
