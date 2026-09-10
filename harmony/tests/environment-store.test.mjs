import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
let stored=[];let queries=[];
const Tag={SECRET:1,ALIAS:2,ACCESSIBILITY:3,RETURN_TYPE:4,CONFLICT_RESOLUTION:5,DATA_LABEL_NORMAL_1:6,DATA_LABEL_NORMAL_2:7,SYNC_TYPE:8};
const equal=(a,b)=>a instanceof Uint8Array&&b instanceof Uint8Array ? Buffer.from(a).equals(Buffer.from(b)):a===b;
globalThis.__asset={Tag,SyncType:{NEVER:0},Accessibility:{DEVICE_UNLOCKED:2},ReturnType:{ALL:0,ATTRIBUTES:1},ConflictResolution:{OVERWRITE:0},ErrorCode:{NOT_FOUND:24000002},
 async add(map){stored=stored.filter(m=>!equal(m.get(Tag.ALIAS),map.get(Tag.ALIAS)));stored.push(new Map(map));},
 async query(map){queries.push(map);const matches=stored.filter(m=>[Tag.ALIAS,Tag.DATA_LABEL_NORMAL_2].every(k=>!map.has(k)||equal(map.get(k),m.get(k))));if(!matches.length)throw {code:24000002};return matches.map(m=>{const result=new Map(m);if(map.get(Tag.RETURN_TYPE)===1)result.delete(Tag.SECRET);return result;});},
 async remove(map){stored=stored.filter(m=>!equal(m.get(Tag.ALIAS),map.get(Tag.ALIAS)));}
};
globalThis.__util={TextEncoder:class{encodeInto(text){return new TextEncoder().encode(text);}},TextDecoder:{create(){return {decodeToString(bytes){return new TextDecoder().decode(bytes);}};}}};
const source=readFileSync(new URL('../app/entry/src/main/ets/connection/EnvironmentStore.ets',import.meta.url),'utf8')
 .replace("import asset from '@ohos.security.asset';",'const asset=globalThis.__asset;')
 .replace("import util from '@ohos.util';",'const util=globalThis.__util;')
 .replace("import { BusinessError } from '@ohos.base';",'');
const store=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));

test('saved environments list only metadata, securely recover credentials and forget independently',async()=>{
 const first={environmentId:'one',httpBaseUrl:'https://one',label:'One',updatedAt:'01'};
 const second={environmentId:'two',httpBaseUrl:'https://two',label:'Two',updatedAt:'02'};
 assert.deepEqual(await store.loadEnvironments(),[]);
 await store.saveEnvironment(first,'secret-one');await store.saveEnvironment(second,'secret-two');
 const list=await store.loadEnvironments();assert.deepEqual(list,[second,first]);
 assert.equal(queries.at(-1).get(Tag.RETURN_TYPE),1);
 assert.equal(JSON.stringify(list).includes('secret'),false);
 assert.equal(await store.readBearer('one'),'secret-one');
 assert.equal(stored[0].get(Tag.ACCESSIBILITY),2);
 assert.equal(stored[0].get(Tag.SYNC_TYPE),0);
 await store.saveEnvironment({...first,label:'Updated'},'replacement');
 assert.equal(stored.length,2);assert.equal(await store.readBearer('one'),'replacement');
 await store.forgetEnvironment('one');assert.deepEqual(await store.loadEnvironments(),[second]);
 await assert.rejects(store.readBearer('one'));
});

test('SSH credentials stay encrypted and coexist with direct access to the same environment',async()=>{
 stored=[];queries=[];
 const direct={environmentId:'shared',httpBaseUrl:'https://direct',label:'Direct',updatedAt:'01'};
 const ssh={environmentId:'shared',connectionId:'route-one',httpBaseUrl:'',label:'SSH',updatedAt:'02',ssh:{hostname:'ssh.example',port:22,username:'dev',hostFingerprint:'SHA256:pin',serverPort:13773}};
 await store.saveEnvironment(direct,'direct-bearer');
 await store.saveSshEnvironment(ssh,'ssh-bearer','ssh-password');
 assert.deepEqual(await store.loadEnvironments(),[ssh,direct]);
 assert.equal(await store.readBearer('shared'),'direct-bearer');
 assert.deepEqual(await store.readSshCredentials('route-one'),{bearer:'ssh-bearer',password:'ssh-password'});
 for(const item of stored){
   const metadata=new TextDecoder().decode(item.get(Tag.DATA_LABEL_NORMAL_1));
   assert.doesNotMatch(metadata,/ssh-bearer|ssh-password/);
   assert.equal(item.get(Tag.ACCESSIBILITY),2);assert.equal(item.get(Tag.SYNC_TYPE),0);
 }
 await store.saveSshEnvironment({...ssh,updatedAt:'03'},'new-bearer','new-password');
 assert.equal(stored.length,2);
 assert.deepEqual(await store.readSshCredentials('route-one'),{bearer:'new-bearer',password:'new-password'});
 await store.forgetEnvironment('route-one',true);
 assert.deepEqual(await store.loadEnvironments(),[direct]);
 assert.equal(await store.readBearer('shared'),'direct-bearer');
 await assert.rejects(store.readSshCredentials('route-one'));
});
