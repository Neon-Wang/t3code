import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const data=new Map();
globalThis.__newTaskDraftStore={open:async(dir,env,key)=>({load:async()=>data.get(JSON.stringify([dir,env,key]))??'',save:async text=>data.set(JSON.stringify([dir,env,key]),text)})};
const source=readFileSync(new URL('../app/entry/src/main/ets/connection/NewTaskDraftStore.ets',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
const {NewTaskDraftStore}=await import('data:text/javascript;base64,'+Buffer.from('const DraftStore=globalThis.__newTaskDraftStore;\n'+stripTypeScriptTypes(source)).toString('base64'));
const draft={projectId:'p',title:'标题',text:'未发送🙂',modelSelection:{instanceId:'omp',model:'cursor/default'},runtimeMode:'approval-required',interactionMode:'plan',createdThreadId:'already-created',turnCommand:{type:'thread.turn.start',threadId:'already-created',commandId:'stable-command',message:{messageId:'stable-message'}}};
test('restores the complete form and created thread identity, isolated by environment',async()=>{
 const first=await NewTaskDraftStore.open('/private','a');await first.save(draft);
 const reopened=await NewTaskDraftStore.open('/private','a');assert.deepEqual(await reopened.load(),draft);
 assert.equal(await(await NewTaskDraftStore.open('/private','b')).load(),null);
 await reopened.clear();assert.equal(await first.load(),null);
});
test('does not replace an invalid persisted draft with empty state',async()=>{
 const raw=await globalThis.__newTaskDraftStore.open('/private','bad','new-task');await raw.save('{"text":"keep me"}');
 const store=await NewTaskDraftStore.open('/private','bad');await assert.rejects(store.load(),/草稿/);assert.equal(await raw.load(),'{"text":"keep me"}');
});
test('preserves creation identity before acknowledgment and rejects a mismatched project',async()=>{
 const store=await NewTaskDraftStore.open('/private','create');
 const command={type:'thread.create',commandId:'stable-create',threadId:'new-thread',projectId:'p',title:'title',modelSelection:draft.modelSelection,runtimeMode:draft.runtimeMode,interactionMode:draft.interactionMode,branch:null,worktreePath:null,createdAt:'2026-09-07T00:00:00.000Z'};
 const pending={...draft,createdThreadId:'',turnCommand:null,createCommand:command};
 await store.save(pending);assert.deepEqual(await(await NewTaskDraftStore.open('/private','create')).load(),pending);
 await store.save({...pending,createCommand:{...command,projectId:'different'}});
 await assert.rejects(store.load(),/创建/);
});
test('all four runtime modes survive cold restoration and retain pending first-turn identity',async()=>{
 for(const runtimeMode of ['full-access','approval-required','auto-accept-edits','auto']) {
  const store=await NewTaskDraftStore.open('/private','runtime-'+runtimeMode);
  const saved={...draft,runtimeMode,turnCommand:{...draft.turnCommand,runtimeMode,interactionMode:'plan'}};
  await store.save(saved);assert.deepEqual(await(await NewTaskDraftStore.open('/private','runtime-'+runtimeMode)).load(),saved);
 }
});
test('unknown runtime mode remains invalid without erasing the draft',async()=>{
 const store=await NewTaskDraftStore.open('/private','unknown-runtime');
 const saved={...draft,runtimeMode:'future-permission'};await store.save(saved);
 await assert.rejects(store.load(),/草稿/);
 const raw=await globalThis.__newTaskDraftStore.open('/private','unknown-runtime','new-task');assert.deepEqual(JSON.parse(await raw.load()),saved);
});
test('model options including false and unknown stored values survive draft and creation recovery',async()=>{
 const selection={...draft.modelSelection,options:[{id:'reasoning',value:'low'},{id:'fast',value:false},{id:'external',value:'keep'}]};
 const saved={...draft,modelSelection:selection,createCommand:{type:'thread.create',commandId:'c',threadId:draft.createdThreadId,projectId:'p',modelSelection:selection}};
 const store=await NewTaskDraftStore.open('/private','options');await store.save(saved);assert.deepEqual(await(await NewTaskDraftStore.open('/private','options')).load(),saved);
});
