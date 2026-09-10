import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
const files=new Map([['gallery-uri',Buffer.from('owned image')]]),metadata=new Map();let next=0;
const fs={OpenMode:{READ_ONLY:0},accessSync:p=>files.has(p),mkdirSync:p=>files.set(p,null),open:async p=>({fd:p}),close:async()=>{},stat:async p=>({size:files.get(p).length}),copyFile:async(from,to)=>files.set(to,Buffer.from(files.get(from))),unlink:async p=>files.delete(p)};
const DraftStore={open:async(dir,env,thread)=>{const key=JSON.stringify([dir,env,thread]);return{load:async()=>metadata.get(key)??'',save:async text=>metadata.set(key,text)};}};
globalThis.__attachmentMocks={fs,DraftStore,prepareImage:async(fd,uri,name)=>{await fs.copyFile(fd,uri);return name;},util:{generateRandomUUID:()=>String(++next).padStart(36,'0')}};
const source=readFileSync(new URL('../app/entry/src/main/ets/connection/AttachmentDraftStore.ets',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
const {AttachmentDraftStore}=await import('data:text/javascript;base64,'+Buffer.from('const {fs,DraftStore,util,prepareImage}=globalThis.__attachmentMocks;\n'+stripTypeScriptTypes(source)).toString('base64'));
test('copies selected bytes privately, reloads per task and removes only owned copies',async()=>{
 const store=await AttachmentDraftStore.open('/private','env','thread');const row=await store.add('gallery-uri');
 assert.notEqual(row.uri,'gallery-uri');assert.ok(files.has('gallery-uri'));
 const restored=await AttachmentDraftStore.open('/private','env','thread');assert.equal(restored.images.length,1);
 assert.equal((await AttachmentDraftStore.open('/private','other','thread')).images.length,0);
 await restored.remove(row.uri);assert.equal((await AttachmentDraftStore.open('/private','env','thread')).images.length,0);
 assert.ok(files.has('gallery-uri'));assert.equal(files.has(row.uri),false);
});
test('uploaded reference survives reopening and clearing leaves gallery untouched',async()=>{
 const store=await AttachmentDraftStore.open('/private','env','second');const row=await store.add('gallery-uri');
 await store.setUploaded(row.uri,{type:'image',id:'pending-id',name:'image.jpg',mimeType:'image/jpeg',sizeBytes:11});
 const restored=await AttachmentDraftStore.open('/private','env','second');assert.equal(restored.images[0].uploaded.id,'pending-id');
 await restored.clear();assert.equal(restored.images.length,0);assert.ok(files.has('gallery-uri'));
});
test('refuses a persisted path outside owned image storage without deleting it',async()=>{
 metadata.set(JSON.stringify(['/private','env','images:bad']),JSON.stringify([{uri:'gallery-uri'}]));
 await assert.rejects(AttachmentDraftStore.open('/private','env','bad'),/路径无效/);
 assert.ok(files.has('gallery-uri'));
});
test('failed private copy leaves no orphan or draft reference',async()=>{
 const store=await AttachmentDraftStore.open('/private','env','copy-failure');
 const before=[...files.keys()];const copy=fs.copyFile;
 fs.copyFile=async(from,to)=>{files.set(to,Buffer.from('partial'));throw new Error('disk full');};
 try { await assert.rejects(store.add('gallery-uri'),/disk full/); } finally {fs.copyFile=copy;}
 assert.deepEqual([...files.keys()],before);assert.deepEqual(store.images,[]);
});
test('original image name survives private copying, upload metadata updates and reopening',async()=>{
 const store=await AttachmentDraftStore.open('/private','env','named');
 const row=await store.add('gallery-uri','验证图片 01.png');assert.equal(row.name,'验证图片 01.png');
 await store.setUploaded(row.uri,{type:'image',id:'named-upload',name:row.name,mimeType:'image/png',sizeBytes:11});
 const restored=await AttachmentDraftStore.open('/private','env','named');
 assert.equal(restored.images[0].name,'验证图片 01.png');assert.equal(restored.images[0].uploaded.name,'验证图片 01.png');
});
test('an oversized converted output is removed without publishing a draft',async()=>{
 const store=await AttachmentDraftStore.open('/private','env','converted-too-large');const before=[...files.keys()];const copy=fs.copyFile;
 fs.copyFile=async(from,to)=>files.set(to,Buffer.alloc(10*1024*1024+1));
 try{await assert.rejects(store.add('gallery-uri','photo.heic'),/转换后.*10 MB/);assert.deepEqual(store.images,[]);assert.deepEqual([...files.keys()],before);}
 finally{fs.copyFile=copy;}
});

test('eight-image limit survives reopening and removing one frees exactly one slot',async()=>{
 const store=await AttachmentDraftStore.open('/private','env','eight-boundary');
 for(let i=0;i<8;i++)await store.add('gallery-uri',`image-${i}.png`);
 const restored=await AttachmentDraftStore.open('/private','env','eight-boundary');
 assert.deepEqual(restored.images.map(image=>image.name),Array.from({length:8},(_,i)=>`image-${i}.png`));
 const before=[...files.keys()];
 await assert.rejects(restored.add('gallery-uri','ninth.png'),/最多 8 张/);
 assert.deepEqual([...files.keys()],before);
 const retained=restored.images.slice(1).map(image=>image.uri);
 await restored.remove(restored.images[0].uri);
 await restored.add('gallery-uri','replacement.png');
 const final=await AttachmentDraftStore.open('/private','env','eight-boundary');
 assert.equal(final.images.length,8);assert.deepEqual(final.images.slice(0,7).map(image=>image.uri),retained);
 assert.equal(final.images[7].name,'replacement.png');
 await final.clear();assert.ok(files.has('gallery-uri'));
});
