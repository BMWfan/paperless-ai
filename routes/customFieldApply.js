'use strict';
const {validateReviewRequest}=require('../services/customFieldReview');
const {actorFor}=require('./learning');
function createCustomFieldApplyHandler(paperless,documentModel){
  if(typeof documentModel?.addProcessedDocument!=='function')throw new TypeError('Processed-document model is required');
  return async(req,res)=>{
    res.set('Cache-Control','no-store');
    let saved=false;
    try{
      const review=validateReviewRequest(req.body);
      const document=await paperless.updateDocument(review.documentId,{},
        {confirmedUser:true,actor:actorFor(req),customFieldReview:review});
      saved=true;
      if(!document)throw new Error('No document returned');
      if(!await documentModel.addProcessedDocument(review.documentId,document.title))throw new Error('Local manual-processing marker could not be saved');
      return res.json({document,requestedFieldIds:review.fields.map(row=>row.field)});
    }catch(error){
      const unknown=!!error.writeOutcomeUnknown||saved;
      const status=unknown?502:[400,409].includes(error.status)?error.status:502;
      return res.status(status).json({error:status===502?(unknown?
        'Save outcome is unknown. Reload the document before trying again.':'Saving is unavailable. No native write was attempted. Reload before trying again.'):error.message,
        outcome:unknown?'unknown':'not_written'});
    }
  };
}
module.exports={createCustomFieldApplyHandler};
