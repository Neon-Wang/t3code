import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
const s=readFileSync(new URL('../app/entry/src/main/ets/pages/NewTask.ets',import.meta.url),'utf8');
const models=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(readFileSync(new URL('../app/entry/src/main/ets/model/Models.ets',import.meta.url),'utf8'))).toString('base64'));
globalThis.__newOptionsModels=models;
const body=`const {startTurnCommand}=globalThis.__newOptionsModels;export const commands=[];export const saved=[];
export const EnvironmentSession={current:{descriptor:{environmentId:'env'},rpc:{call:async(tag,c)=>commands.push(JSON.parse(JSON.stringify(c)))}}};
const WS={threadStartTurn:'dispatch'};let id=0;const util={generateRandomUUID:()=>String(++id)};const router={replaceUrl:()=>{}};class RpcRemoteError extends Error{}
export class Fixture {
 active=true;draftReady=true;finished=false;busy=false;draftTimer=-1;createdThreadId='';pendingCreate=null;pendingTurn=null;
 projects=[{id:'p',workspaceRoot:'/p'}];projectIndex=0;models=[{instanceId:'omp',model:'cursor/default'}];modelIndex=0;
 selectedOptions=[{id:'reasoning',value:'low'},{id:'fast',value:false}];title='own';draft='hello';runtimeMode='auto';interactionMode='default';
 onCreated=()=>{};draftStore={save:async d=>saved.push(JSON.parse(JSON.stringify(d))),clear:async()=>{}};cancelPaths(){}
 ${s.slice(s.indexOf('  private async persistDraft('),s.indexOf('  build()')).replaceAll('private ','')}
}`;
const m=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(body)).toString('base64'));
test('new task sends and journals the selected model options before first turn',async()=>{
 const page=new m.Fixture();await page.create();
 assert.equal(m.commands.length,2);assert.equal(m.commands[0].type,'thread.create');
 assert.deepEqual(m.commands[0].modelSelection.options,page.selectedOptions);
 assert.deepEqual(m.saved[0].modelSelection.options,page.selectedOptions);
 assert.deepEqual(m.saved.find(d=>d.createCommand)?.createCommand.modelSelection.options,page.selectedOptions);
 assert.equal(m.commands[1].type,'thread.turn.start');assert.equal(m.commands[1].runtimeMode,'auto');assert.equal(page.finished,true);
});
test('selected branch and existing worktree survive the journal and reach thread creation',async()=>{
 m.commands.length=0;m.saved.length=0;
 const page=new m.Fixture();page.branch='feature/ui';page.worktreePath='/p/ui';await page.create();
 const create=m.commands.find(c=>c.type==='thread.create');
 assert.equal(create.branch,'feature/ui');assert.equal(create.worktreePath,'/p/ui');
 assert.equal(m.saved[0].branch,'feature/ui');assert.equal(m.saved[0].worktreePath,'/p/ui');
});
test('a selected local branch is switched before creation',async()=>{
 m.commands.length=0;m.saved.length=0;
 const p=new m.Fixture();p.branch='selected-local';p.worktreePath=null;await p.create();
 assert.deepEqual(m.commands[0],{cwd:'/p',refName:'selected-local'});assert.equal(m.commands[1].type,'thread.create');assert.equal(m.commands[1].branch,'selected-local');
});

test('checkout failure preserves the selected draft and cannot create or send a task',async()=>{
 m.commands.length=0;m.saved.length=0;
 const call=m.EnvironmentSession.current.rpc.call;
 m.EnvironmentSession.current.rpc.call=async()=>{throw new Error('local changes would be overwritten')};
 try {
  const p=new m.Fixture();p.branch='other';p.worktreePath=null;await p.create();
  assert.equal(p.createdThreadId,'');assert.equal(p.pendingCreate,null);assert.equal(p.pendingTurn,null);
  assert.equal(p.finished,false);assert.match(p.error,/local changes/);assert.equal(m.commands.length,0);
  assert.equal(m.saved[0].branch,'other');
 } finally {m.EnvironmentSession.current.rpc.call=call;}
});

test('new worktree is created from the selected base before task creation without switching local checkout', async()=>{
 const call=m.EnvironmentSession.current.rpc.call;m.commands.length=0;m.saved.length=0;
 m.EnvironmentSession.current.rpc.call=async(tag,c)=>{
  m.commands.push({tag,...c});
  if(tag==='vcs.listRefs')return {refs:[],isRepo:true};
  if(tag==='vcs.createWorktree')return {worktree:{path:'/worktrees/new',refName:c.newRefName}};
 };
 try {const p=new m.Fixture();p.newWorktree=true;p.branch='main';await p.create();
  assert.equal(m.commands[1].tag,'vcs.createWorktree');assert.equal(m.commands[1].refName,'main');
  assert.ok(!m.commands.some(c=>c.tag==='vcs.switchRef'));
  const c=m.commands.find(c=>c.type==='thread.create');assert.equal(c.worktreePath,'/worktrees/new');
  assert.ok(m.saved.some(d=>d.worktreeRef));
 } finally {m.EnvironmentSession.current.rpc.call=call;}
});
test('lost worktree creation acknowledgment reuses the journaled branch on retry', async()=>{
 const call=m.EnvironmentSession.current.rpc.call;m.commands.length=0;m.saved.length=0;let createdName='';let creates=0;
 m.EnvironmentSession.current.rpc.call=async(tag,c)=>{
  m.commands.push({tag,...c});
  if(tag==='vcs.listRefs')return {isRepo:true,refs:createdName?[{name:createdName,worktreePath:'/worktrees/recovered'}]:[]};
  if(tag==='vcs.createWorktree'){creates++;createdName=c.newRefName;throw new Error('lost acknowledgment')}
 };
 try {const p=new m.Fixture();p.newWorktree=true;p.branch='main';await p.create();assert.equal(p.finished,false);
  assert.ok(!m.commands.some(c=>c.type==='thread.create'));await p.create();
  assert.equal(creates,1);assert.equal(p.finished,true);assert.equal(p.worktreePath,'/worktrees/recovered');
 } finally {m.EnvironmentSession.current.rpc.call=call;}
});
test('non-repository worktree attempt keeps text and allows changing execution mode', async()=>{
 const call=m.EnvironmentSession.current.rpc.call;m.commands.length=0;
 m.EnvironmentSession.current.rpc.call=async()=>({isRepo:false,refs:[]});
 try {const p=new m.Fixture();p.newWorktree=true;const text=p.draft;await p.create();
  assert.equal(p.finished,false);assert.equal(p.worktreeRef,'');assert.equal(p.draft,text);assert.match(p.error,/Git/);
 } finally {m.EnvironmentSession.current.rpc.call=call;}
});
