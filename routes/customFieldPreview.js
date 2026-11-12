'use strict';
const {previewCustomFields}=require('../services/customFieldPreview');
function createCustomFieldPreviewHandler(paperless){
  return async(req,res)=>{
    const {documentId,content,suggestions}=req.body||{};
    if(!['string','number'].includes(typeof documentId)||!Number.isSafeInteger(Number(documentId))||Number(documentId)<=0||typeof content!=='string'||!content||content.length>50000||
      !suggestions||typeof suggestions!=='object'||Object.values(suggestions).length>50){
      return res.status(400).json({error:'Document, submitted text and at most 50 field suggestions are required'});
    }
    try{
      res.set('Cache-Control','no-store');
      return res.json(await previewCustomFields(paperless,Number(documentId),content,suggestions));
    }catch(error){
      return res.status(error.status===409?409:502).json({error:error.status===409?error.message:'Custom field preview is temporarily unavailable'});
    }
  };
}
module.exports={createCustomFieldPreviewHandler};
