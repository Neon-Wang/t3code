import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
const data=new Map();globalThis.__journalStore={open:async(dir,env,thread)=>{const key=JSON.stringify([dir,env,thread]);return{load:async()=>data.get(key)??'',save:async text=>data.set(key,text)};}};
const source=readFileSync(new URL('../app/entry/src/main/ets/connection/SendJournal.ets',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
const {SendJournal}=await import('data:text/javascript;base64,'+Buffer.from('const DraftStore=globalThis.__journalStore;\n'+stripTypeScriptTypes(source)).toString('base64'));
const command={type:'thread.turn.start',threadId:'t',commandId:'stable-command',message:{messageId:'stable-message',text:'hello',role:'user',attachments:[]},runtimeMode:'full-access',interactionMode:'default',createdAt:'2026-09-07T00:00:00.000Z'};
test('reopens exactly the same send identity and payload after losing the response',async()=>{
 const first=await SendJournal.open('/private','e','t');await first.save(command);
 const recovered=await SendJournal.open('/private','e','t');assert.deepEqual(recovered.pending,command);
 await assert.rejects(recovered.save({...command,commandId:'new-command'}),/待确认/);
 assert.equal((await SendJournal.open('/private','other','t')).pending,null);
 await recovered.clear();assert.equal((await SendJournal.open('/private','e','t')).pending,null);
});
