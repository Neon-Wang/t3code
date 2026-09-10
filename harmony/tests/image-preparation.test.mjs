import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
let mime='image/heic',inputSize=20*1024*1024,calls=[],failPack=false;
globalThis.__prepare={fs:{OpenMode:{CREATE:1,READ_WRITE:2,TRUNC:4},stat:async()=>({size:inputSize}),copyFile:async(...a)=>calls.push(['copy',...a]),open:async()=>({fd:2}),close:async()=>calls.push(['close'])},image:{createImageSource:()=>({getImageInfo:async()=>({mimeType:mime}),release:async()=>calls.push(['release-source'])}),createImagePacker:()=>({packToFile:async(source,fd,options)=>{calls.push(['pack',options]);if(failPack)throw new Error('decode failure');},release:async()=>calls.push(['release-packer'])})}};
const source=readFileSync(new URL('../app/entry/src/main/ets/connection/ImagePreparation.ets',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
const {prepareImage}=await import('data:text/javascript;base64,'+Buffer.from('const {fs,image}=globalThis.__prepare;\n'+stripTypeScriptTypes(source)).toString('base64'));
test('HEIC is converted to JPEG with a matching name and preserved image properties',async()=>{
 calls=[];mime='image/heic';inputSize=20*1024*1024;
 assert.equal(await prepareImage(1,'private','照片.HEIC'),'照片.jpg');
 assert.equal(calls.some(c=>c[0]==='copy'),false);const options=calls.find(c=>c[0]==='pack')[1];assert.equal(options.format,'image/jpeg');assert.equal(options.needsPackProperties,true);
 assert.deepEqual(calls.filter(c=>c[0].startsWith('release')).map(c=>c[0]).sort(),['release-packer','release-source']);
});
test('supported originals retain bytes and names, including GIF animation and PNG transparency',async()=>{
 for(const type of ['image/jpeg','image/png','image/gif','image/webp']){calls=[];mime=type;inputSize=512;assert.equal(await prepareImage(1,'private','original'),'original');assert.equal(calls.filter(c=>c[0]==='copy').length,1);assert.equal(calls.some(c=>c[0]==='pack'),false);}
});
test('conversion failure releases native objects and the destination file handle',async()=>{
 mime='image/heif';failPack=true;calls=[];
 try{await assert.rejects(prepareImage(1,'private','photo.heif'),/decode failure/);assert.ok(calls.some(c=>c[0]==='close'));assert.ok(calls.some(c=>c[0]==='release-packer'));assert.ok(calls.some(c=>c[0]==='release-source'));}finally{failPack=false;}
});
test('oversized supported originals and unsupported formats fail before copying',async()=>{
 calls=[];mime='image/png';inputSize=11*1024*1024;await assert.rejects(prepareImage(1,'private','huge.png'),/10 MB/);
 mime='image/bmp';await assert.rejects(prepareImage(1,'private','unsupported.bmp'),/支持/);assert.equal(calls.some(c=>c[0]==='copy'),false);
});
