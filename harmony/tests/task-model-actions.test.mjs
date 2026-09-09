import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../app/entry/src/main/ets/pages/TaskModel.ets',import.meta.url),'utf8');
const models=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(readFileSync(new URL('../app/entry/src/main/ets/model/Models.ets',import.meta.url),'utf8'))).toString('base64'));
globalThis.__taskShellState=models.ShellState;
const optionsSource=readFileSync(new URL('../app/entry/src/main/ets/model/ModelOptions.ets',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
globalThis.__taskOptions=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(optionsSource)).toString('base64'));
const start=source.indexOf('  private async selectModel('),end=source.indexOf('  build()',start);
assert.ok(start>=0&&end>start);
let hooks;
globalThis.__taskModel=()=>hooks;
const loadStart=source.indexOf('  private async load(');
const body=`class EmptyPayload{}
const {withModelOption,modelOptionValue}=globalThis.__taskOptions;const ShellState=globalThis.__taskShellState;
const availableModels=()=>[];
const h=()=>globalThis.__taskModel();const router={back:()=>h().backs++};const util={generateRandomUUID:()=> 'command-id'};const WS={threadStartTurn:'orchestration.dispatchCommand',threadsList:'orchestration.subscribeShell'};
export const EnvironmentSession={current:null};
class Fixture {
 active=true;busy=false;loaded=true;loading=false;loadRevision=0;runtimeMode='full-access';interactionMode='default';error='';threadId='t';current={instanceId:'omp',model:'old',options:{reasoning:'high'}};
 choices=[{instanceId:'omp',model:'old',label:'Old'},{instanceId:'omp',model:'new',label:'New'}];rpc=null;environment=null;
 ${source.slice(loadStart,start).replaceAll('private ','')}
 ${source.slice(start,end).replaceAll('private ','')}
}
export default Fixture;`;
const {default:Fixture,EnvironmentSession}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(body)).toString('base64'));
function setup(){hooks={backs:0,commands:[]};const page=new Fixture();page.environment={openRpc:()=>new Promise(()=>{})};EnvironmentSession.current=page.environment;page.rpc={close:()=>{},call:async(tag,command)=>{hooks.commands.push(command);}};return page;}
test('choosing current model closes without discarding provider options',async()=>{
 const page=setup();await page.selectModel(page.choices[0]);assert.equal(hooks.commands.length,0);assert.equal(hooks.backs,1);assert.deepEqual(page.current.options,{reasoning:'high'});
});
test('model change updates only selected provider/model and waits for acknowledgment',async()=>{
 const page=setup();let release;page.rpc.call=async(tag,command)=>{hooks.commands.push(command);await new Promise(r=>release=r);};
 const pending=page.selectModel(page.choices[1]);assert.equal(page.busy,true);assert.equal(hooks.backs,0);release();await pending;
 assert.deepEqual(hooks.commands,[{type:'thread.meta.update',commandId:'command-id',threadId:'t',modelSelection:{instanceId:'omp',model:'new'}}]);assert.equal(hooks.backs,1);
});
test('stale environment or removed catalog choice cannot change a thread',async()=>{
 const page=setup();await page.selectModel({instanceId:'missing',model:'x',label:'X'});EnvironmentSession.current={};await page.selectModel(page.choices[1]);assert.equal(hooks.commands.length,0);
});
test('a failed update remains open and retryable without claiming success',async()=>{
 const page=setup();page.rpc.call=async()=>{throw new Error('offline');};await page.selectModel(page.choices[1]);assert.equal(hooks.backs,0);assert.equal(page.busy,false);assert.match(page.error,/offline/);
});


test('an obsolete openRpc completion cannot replace a newer visible page connection',async()=>{
 const page=setup();page.rpc=null;const open=[];page.environment.openRpc=()=>new Promise(resolve=>open.push(resolve));
 const old=page.load();page.active=false;page.loading=false;page.loaded=false;page.loadRevision++;page.active=true;
 const newer=page.load();
 const makeRpc=model=>({closed:false,close(){this.closed=true;},async call(){return {providers:[]};},async callStream(tag,payload,callback){assert.equal(tag,'orchestration.subscribeShell');callback([{kind:'snapshot',snapshot:{snapshotSequence:1,threads:[{id:'t',modelSelection:{instanceId:'omp',model}}]}}]);}});
 const newerRpc=makeRpc('newer');open[1](newerRpc);await newer;
 const oldRpc=makeRpc('obsolete');open[0](oldRpc);await old;
 assert.equal(page.rpc,newerRpc);assert.equal(oldRpc.closed,true);assert.equal(newerRpc.closed,false);assert.equal(page.current.model,'newer');
});


test('runtime change dispatches only runtime mode and waits without optimistic state',async()=>{
 const page=setup();assert.equal(typeof page.setMode,'function');let release;
 page.rpc.call=async(tag,command)=>{hooks.commands.push(command);await new Promise(r=>release=r);};
 const pending=page.setMode('runtime','approval-required');
 assert.equal(page.busy,true);assert.equal(page.runtimeMode,'full-access');assert.equal(hooks.backs,0);
 assert.equal(hooks.commands.length,1);const {createdAt,...command}=hooks.commands[0];assert.ok(Number.isFinite(Date.parse(createdAt)));
 assert.deepEqual(command,{type:'thread.runtime-mode.set',commandId:'command-id',threadId:'t',runtimeMode:'approval-required'});
 await page.setMode('interaction','plan');assert.equal(hooks.commands.length,1);
 release();await pending;assert.equal(page.busy,false);assert.equal(hooks.backs,0);
});
test('interaction change is independent of runtime, model options, and message delivery',async()=>{
 const page=setup();assert.equal(typeof page.setMode,'function');await page.setMode('interaction','plan');
 const {createdAt,...command}=hooks.commands[0];assert.ok(Number.isFinite(Date.parse(createdAt)));
 assert.deepEqual(command,{type:'thread.interaction-mode.set',commandId:'command-id',threadId:'t',interactionMode:'plan'});
 assert.equal(page.runtimeMode,'full-access');assert.deepEqual(page.current.options,{reasoning:'high'});
});
test('same, invalid, unloaded, hidden, or changed-environment modes never dispatch',async()=>{
 const page=setup();assert.equal(typeof page.setMode,'function');
 await page.setMode('runtime','full-access');await page.setMode('interaction','default');
 await page.setMode('runtime','plan');await page.setMode('interaction','full-access');await page.setMode('unknown','plan');
 page.loaded=false;await page.setMode('runtime','approval-required');page.loaded=true;
 page.active=false;await page.setMode('runtime','approval-required');page.active=true;
 EnvironmentSession.current={};await page.setMode('runtime','approval-required');assert.deepEqual(hooks.commands,[]);
});
test('rejected runtime change keeps authoritative state and exposes retryable error',async()=>{
 const page=setup();assert.equal(typeof page.setMode,'function');page.rpc.call=async()=>{throw new Error('offline');};
 await page.setMode('runtime','approval-required');assert.equal(page.runtimeMode,'full-access');assert.equal(page.busy,false);assert.match(page.error,/offline/);
});
test('settings read runtime and interaction from live snapshots, including reverse changes',async()=>{
 const page=setup();let deliver;page.rpc=null;
 page.environment.openRpc=async()=>({close(){},async call(){return {providers:[]}},async callStream(tag,payload,callback){deliver=callback;assert.equal(tag,'orchestration.subscribeShell');callback([{kind:'snapshot',snapshot:{snapshotSequence:1,threads:[{id:'t',modelSelection:page.current,runtimeMode:'approval-required',interactionMode:'plan'}]}}]);}});
 await page.load();assert.equal(page.runtimeMode,'approval-required');assert.equal(page.interactionMode,'plan');
 deliver([{kind:'thread-upserted',sequence:2,thread:{id:'t',modelSelection:page.current,runtimeMode:'full-access',interactionMode:'default'}}]);
 assert.equal(page.runtimeMode,'full-access');assert.equal(page.interactionMode,'default');
});

test('all four protocol runtime modes can be selected, including returning to full access',async()=>{
 const page=setup();
 for(const mode of ['approval-required','auto-accept-edits','auto','full-access']) {
  page.runtimeMode=mode==='full-access'?'approval-required':'full-access';
  await page.setMode('runtime',mode);
  assert.equal(hooks.commands.at(-1)?.runtimeMode,mode);
 }
 assert.equal(hooks.commands.length,4);
});
test('option edit preserves unrelated canonical values and sends only model metadata',async()=>{
 const page=setup();assert.equal(typeof page.setOption,'function');
 page.current={instanceId:'omp',model:'old',options:[{id:'fast',value:true}]};
 page.choices[0].optionDescriptors=[{id:'reasoning',label:'Thinking',type:'select',options:[{id:'low',label:'Low'}]}];
 await page.setOption('reasoning','low');
 assert.deepEqual(hooks.commands,[{type:'thread.meta.update',commandId:'command-id',threadId:'t',modelSelection:{instanceId:'omp',model:'old',options:[{id:'fast',value:true},{id:'reasoning',value:'low'}]}}]);assert.equal(hooks.backs,0);
 EnvironmentSession.current={};await page.setOption('reasoning','low');assert.equal(hooks.commands.length,1);
});
test('ack before feed cannot permit a second option edit based on stale selections',async()=>{
 const page=setup();page.current={instanceId:'omp',model:'old',options:[{id:'fast',value:false},{id:'reasoning',value:'high'}]};
 page.choices[0].optionDescriptors=[{id:'fast',label:'Fast',type:'boolean'},{id:'reasoning',label:'Thinking',type:'select',options:[{id:'low',label:'Low'}]}];
 page.rpc.close=()=>{};page.environment.openRpc=()=>new Promise(()=>{});
 await page.setOption('fast',true);await page.setOption('reasoning','low');
 assert.equal(hooks.commands.length,1);assert.equal(page.loaded,false);
});
