'use strict';
// Execute only checksum-verified historical repository source, never model text.
const fs=require('node:fs');const path=require('node:path');const {createHash}=require('node:crypto');const vm=require('node:vm');const assert=require('node:assert/strict');
function beforeWriter(){
  // External report directories must never select executable source.
  const directory=path.join(__dirname,'baseline');
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
  const reference=manifest.writerBefore;assert.ok(reference);assert.equal(path.basename(reference.file),reference.file);
  const source=fs.readFileSync(path.join(directory,reference.file),'utf8');
  assert.equal(createHash('sha256').update(source).digest('hex'),reference.sha256);
  const normalize=vm.runInNewContext(source+'\nnormalizeValue;', {module:{exports:{}},console},{timeout:1000});
  assert.equal(typeof normalize,'function');return normalize;
}
module.exports={beforeWriter};
