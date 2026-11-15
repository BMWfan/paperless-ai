'use strict';
// Transport wrapper only: libmagic treats a leading From: as message/rfc822.
// Never use this wrapper for model input, selection, scoring or ground truth.
const wrapSyntheticText=content=>'Paperless-AI synthetic replay fixture.\n\n'+content;
module.exports={wrapSyntheticText};
