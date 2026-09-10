import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(process.env.T3_NEW_TASK_SOURCE??new URL('../app/entry/src/main/ets/pages/NewTask.ets',import.meta.url),'utf8');
const model=readFileSync(new URL('../app/entry/src/main/ets/model/ComposerPath.ets',import.meta.url),'utf8');
const start=source.indexOf('  private cancelPaths('),end=source.indexOf('  private async restoreDraft(');
assert.ok(start>=0 && end>start,'NewTask must implement project-aware file completion');
const body=`${model}
let timers=new Map(),timerId=0;
function setTimeout(callback){timers.set(++timerId,callback);return timerId;}
function clearTimeout(id){timers.delete(id);}
export function flush(){const pending=[...timers.values()];timers.clear();for(const callback of pending)callback();}
export const EnvironmentSession={current:null};
function preferredModelIndex(){return 0;}
class Fixture {
 active=true;draftReady=true;busy=false;pendingTurn=null;finished=false;draft='@file';pathRevision=0;pathTimer=-1;pathEntries=[];pathStatus='';pathStart=5;pathEnd=5;pathTrigger=null;pathConnection=null;
 projectIndex=0;projects=[{id:'one',workspaceRoot:'/one'},{id:'two',workspaceRoot:'/two'}];models=[];modelIndex=0;
 composerController={caretPosition(){}};queueSave(){}
 ${source.slice(start,end).replaceAll('private ','')}
}
export default Fixture;
`;
const {default:Fixture,flush,EnvironmentSession}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(body)).toString('base64'));
const tick=()=>new Promise(resolve=>queueMicrotask(resolve));
function setup(){const requests=[];EnvironmentSession.current={rpc:{call:(tag,payload)=>new Promise((resolve,reject)=>requests.push({tag,payload,resolve,reject}))}};return {page:new Fixture(),requests};}
test('switching projects invalidates old response and searches the new directory',async()=>{
 const {page,requests}=setup();page.updatePathSearch(5,5);flush();
 page.chooseProject(1);flush();
 assert.deepEqual(requests.map(r=>r.payload.cwd),['/one','/two']);
 requests[1].resolve({entries:[{path:'two.txt',kind:'file'}],truncated:false});await tick();
 requests[0].resolve({entries:[{path:'one.txt',kind:'file'}],truncated:false});await tick();
 assert.deepEqual(page.pathEntries,[{path:'two.txt',kind:'file'}]);
});
test('switching environments before a response cannot publish old suggestions',async()=>{
 const {page,requests}=setup();page.updatePathSearch(5,5);flush();EnvironmentSession.current={rpc:{}};
 requests[0].resolve({entries:[{path:'one.txt',kind:'file'}],truncated:false});await tick();assert.deepEqual(page.pathEntries,[]);
});
test('a pending first turn cannot change its text through a file suggestion',()=>{
 const {page}=setup();page.updatePathSearch(5,5);page.pathEntries=[{path:'one.txt',kind:'file'}];page.pendingTurn={};page.selectPath({path:'one.txt',kind:'file'});assert.equal(page.draft,'@file');
});
test('project change clears candidates and a stale click cannot change the draft',()=>{
 const {page}=setup();page.updatePathSearch(5,5);page.chooseProject(1);page.selectPath({path:'one.txt',kind:'file'});assert.equal(page.draft,'@file');assert.deepEqual(page.pathEntries,[]);
});
test('new task insertion preserves multiline draft text and exact relative path',()=>{
 const {page}=setup();page.draft='Review\n@file\nkeep this';page.updatePathSearch(12,12);page.pathEntries=[{path:'docs/a b.md',kind:'file'}];page.selectPath(page.pathEntries[0]);
 assert.equal(page.draft,'Review\n[a b.md](docs/a%20b.md) \nkeep this');
});
test('project change alone clears visible results and rejects in-flight results without typing again',async()=>{
 const {page,requests}=setup();page.updatePathSearch(5,5);flush();page.pathEntries=[{path:'one.txt',kind:'file'}];
 page.chooseProject(1);assert.deepEqual(page.pathEntries,[]);
 requests[0].resolve({entries:[{path:'late-one.txt',kind:'file'}],truncated:false});await tick();assert.deepEqual(page.pathEntries,[]);
});
test('a saved candidate cannot be inserted after the global connection changes',()=>{
 const {page}=setup();page.updatePathSearch(5,5);page.pathEntries=[{path:'old-env.txt',kind:'file'}];EnvironmentSession.current={rpc:{}};
 page.selectPath({path:'old-env.txt',kind:'file'});assert.equal(page.draft,'@file');
});
