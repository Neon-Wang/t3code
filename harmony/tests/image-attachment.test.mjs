import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
let bytes=Uint8Array.from([137,80,78,71,13,10,26,10]);let calls=[];let responseCode=201;let sizeOverride;
const fs={OpenMode:{READ_ONLY:0},open:async()=>({fd:1}),stat:async()=>({size:sizeOverride??bytes.length}),close:async()=>{},read:async(fd,buffer,{offset})=>{const count=Math.min(3,bytes.length-offset);new Uint8Array(buffer).set(bytes.slice(offset,offset+count));return count;}};
const http={RequestMethod:{POST:'POST'},createHttp:()=>({request:async(url,options)=>{calls.push({url,options});return{responseCode};},destroy:()=>{}})};
globalThis.__imageMocks={fs,http};
const source=readFileSync(new URL('../app/entry/src/main/ets/connection/ImageAttachment.ets',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
const {imageMime,uploadImage,imageUploadExists,deleteImageUpload}=await import('data:text/javascript;base64,'+Buffer.from('const {fs,http}=globalThis.__imageMocks;\n'+stripTypeScriptTypes(source)).toString('base64'));
const rpc={call:async(method,payload)=>{calls.push({method,payload});return{attachmentId:'owned-image',relativeUrl:'/api/attachments/upload/test?token=fixture'};}};
test('uploads exact bytes after partial file reads and returns a wire image reference',async()=>{
 calls=[];const result=await uploadImage(rpc,'http://fixture','picked-uri');
 assert.equal(result.type,'image');assert.equal(result.id,'owned-image');assert.equal(result.sizeBytes,8);
 const transfer=calls.find(x=>x.url);assert.deepEqual(new Uint8Array(transfer.options.extraData),bytes);
 assert.equal(transfer.options.method,'POST');assert.equal(transfer.options.header['Content-Type'],'image/png');
});
test('rejects unsupported or oversized files before minting and cleans a failed upload',async()=>{
 assert.throws(()=>imageMime(new Uint8Array([1,2,3])),/请选择/);
 sizeOverride=10*1024*1024+1;calls=[];await assert.rejects(uploadImage(rpc,'http://fixture','picked-uri'),/10 MB/);assert.equal(calls.length,0);sizeOverride=undefined;
 responseCode=500;calls=[];await assert.rejects(uploadImage(rpc,'http://fixture','picked-uri'),/500/);
 assert.deepEqual(calls.at(-1),{method:'attachments.delete',payload:{attachmentId:'owned-image'}});responseCode=201;
});

test('expired uploads can be replaced, while network failures preserve references',async()=>{
 assert.equal(await imageUploadExists(rpc,'pending'),true);
 const missing={call:async()=>{throw new Error('AssetAttachmentNotFoundError');}};
 assert.equal(await imageUploadExists(missing,'pending'),false);await deleteImageUpload(missing,'pending');
 const offline={call:async()=>{throw new Error('RPC connection closed');}};
 await assert.rejects(imageUploadExists(offline,'pending'),/connection closed/);
 await assert.rejects(deleteImageUpload(offline,'pending'),/connection closed/);
});
test('upload keeps a selected original filename while legacy drafts retain the MIME fallback',async()=>{
 calls=[];const named=await uploadImage(rpc,'http://fixture','picked-uri','验证图片 01.png');
 assert.equal(named.name,'验证图片 01.png');
 assert.equal(calls.find(c=>c.method==='attachments.createUploadUrl').payload.name,named.name);
 const legacy=await uploadImage(rpc,'http://fixture','picked-uri');assert.equal(legacy.name,'image.png');
});
test('filename fallback respects the upload contract for blank and overlong names',async()=>{
 for(const name of ['   ','x'.repeat(256)]){
  const result=await uploadImage(rpc,'http://fixture','picked-uri',name);assert.equal(result.name,'image.png');
 }
});
