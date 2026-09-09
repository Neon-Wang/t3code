import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
const files=new Map(),handles=new Map();let nextFd=1;
globalThis.__draftFs={OpenMode:{CREATE:1,WRITE_ONLY:2,TRUNC:4},accessSync:path=>files.has(path),mkdirSync:path=>files.set(path,''),
 async open(path){const fd=nextFd++;handles.set(fd,path);files.set(path,Buffer.alloc(0));return {fd};},
 async write(fd,bytes){const path=handles.get(fd);const input=Buffer.from(bytes);const chunk=input.subarray(0,Math.min(4096,input.length));files.set(path,Buffer.concat([files.get(path),chunk]));return chunk.length;},
 async close(file){handles.delete(typeof file==='number'?file:file.fd);},
 async rename(from,to){files.set(to,files.get(from));files.delete(from);},
 async readText(path){return files.get(path).toString();},async unlink(path){files.delete(path);}
};
globalThis.__draftCrypto={createMd(){const hash=createHash('sha256');return {async update(blob){hash.update(blob.data);},async digest(){return {data:new Uint8Array(hash.digest())};}};}};
globalThis.__draftUtil={TextEncoder:class{encodeInto(s){return new TextEncoder().encode(s);}}};
const source=readFileSync(new URL('../app/entry/src/main/ets/connection/DraftStore.ets',import.meta.url),'utf8')
.replace("import fs from '@ohos.file.fs';",'const fs=globalThis.__draftFs;')
.replace("import cryptoFramework from '@ohos.security.cryptoFramework';",'const cryptoFramework=globalThis.__draftCrypto;')
.replace("import util from '@ohos.util';",'const util=globalThis.__draftUtil;');
const {DraftStore}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('drafts preserve long Unicode text, isolate environments and serialize replacement and clearing',async()=>{
 const first=await DraftStore.open('/private','a','t'),other=await DraftStore.open('/private','b','t');
 const text='长草稿🙂'.repeat(6000);
 await first.save(text);assert.equal(await first.load(),text);assert.equal(await other.load(),'');
 const replacement=await DraftStore.open('/private','a','t');
 const old=first.save('older');const newest=replacement.save('newest');await Promise.all([old,newest]);
 assert.equal(await first.load(),'newest');
 await replacement.save('');assert.equal(await first.load(),'');
 assert.equal([...files.keys()].some(k=>k.endsWith('.tmp')),false);
});
