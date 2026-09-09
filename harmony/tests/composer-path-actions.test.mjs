import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(process.env.T3_THREAD_SOURCE??new URL('../app/entry/src/main/ets/pages/Thread.ets',import.meta.url),'utf8');
const model=readFileSync(new URL('../app/entry/src/main/ets/model/ComposerPath.ets',import.meta.url),'utf8');
const start=source.indexOf('  private cancelPaths('),end=source.indexOf('  private async loadDraft(');
assert.ok(start>=0 && end>start,'Thread must implement cursor-aware remote path completion');
const body=`${model}
let timers=new Map(),timerId=0;
function setTimeout(callback){timers.set(++timerId,callback);return timerId;}
function clearTimeout(id){timers.delete(id);}
export function flush(){const pending=[...timers.values()];timers.clear();for(const callback of pending)callback();}
class Fixture {
 active=true;loaded=true;draftReady=true;hasPendingSend=false;sending=false;cwd='/own';draft='@old';pathRevision=0;pathTimer=-1;pathEntries=[];pathStatus='';pathStart=4;pathEnd=4;pathTrigger=null;
 rpc=null;composerController={caretPosition(){}};
 editDraft(text){this.draft=text;}
 ${source.slice(start,end).replaceAll('private ','')}
}
export default Fixture;
`;
const {default:Fixture,flush}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(body)).toString('base64'));
const tick=()=>new Promise(resolve=>queueMicrotask(resolve));
function setup(){const requests=[];const page=new Fixture();page.rpc={call:(tag,payload)=>new Promise((resolve,reject)=>requests.push({tag,payload,resolve,reject}))};return {page,requests};}
test('new query wins when older server response arrives last',async()=>{
 const {page,requests}=setup();page.updatePathSearch(4,4);flush();
 page.draft='@new';page.updatePathSearch(4,4);flush();
 assert.equal(requests.length,2);assert.equal(requests[1].payload.query,'new');
 requests[1].resolve({entries:[{path:'new.txt',kind:'file'}],truncated:false});await tick();
 requests[0].resolve({entries:[{path:'old.txt',kind:'file'}],truncated:false});await tick();
 assert.deepEqual(page.pathEntries,[{path:'new.txt',kind:'file'}]);
});
test('leaving the page clears suggestions and invalidates in-flight results',async()=>{
 const {page,requests}=setup();page.updatePathSearch(4,4);flush();page.cancelPaths();
 requests[0].resolve({entries:[{path:'old.txt',kind:'file'}],truncated:false});await tick();
 assert.deepEqual(page.pathEntries,[]);assert.equal(page.pathStatus,'');
});
test('invalid, empty and selected queries never reach the server',()=>{
 const {page,requests}=setup();
 for(const text of ['@','email@host','@'+'a'.repeat(257)]){page.draft=text;page.updatePathSearch(text.length,text.length);flush();}
 page.draft='@file';page.updatePathSearch(0,5);flush();assert.equal(requests.length,0);
});
test('selection cannot replace a newer draft with a stale suggestion',()=>{
 const {page}=setup();page.updatePathSearch(4,4);page.pathEntries=[{path:'old.txt',kind:'file'}];page.draft='keep this';page.selectPath({path:'old.txt',kind:'file'});assert.equal(page.draft,'keep this');
});
test('selection inserts the actual path and keeps the suffix',()=>{
 const {page}=setup();page.draft='Read @src then explain';page.updatePathSearch(9,9);
 page.pathEntries=[{path:'src/a b.txt',kind:'file'}];page.selectPath(page.pathEntries[0]);assert.equal(page.draft,'Read [a b.txt](src/a%20b.txt)  then explain');assert.deepEqual(page.pathEntries,[]);
});
