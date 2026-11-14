'use strict';
const {learnedFieldPreview}=require('../services/learnedFieldHints');
function createLearnedFieldPreviewHandler(paperless,getStore){
  return async(req,res)=>{
    res.set('Cache-Control','no-store');
    const {documentId,content}=req.body||{};
    if(!['number','string'].includes(typeof documentId)||!Number.isSafeInteger(Number(documentId))||Number(documentId)<=0||
      typeof content!=='string'||!content||content.length>50000)return res.status(400).json({error:'Document and at most50000 characters of current text are required'});
    try{return res.json(await learnedFieldPreview(paperless,getStore(),Number(documentId),content));}
    catch(error){return res.status(error.status===409?409:502).json({error:error.status===409?error.message:'Learned field suggestions are temporarily unavailable'});}
  };
}
module.exports={createLearnedFieldPreviewHandler};
