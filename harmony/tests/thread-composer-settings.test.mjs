import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const src=readFileSync(new URL('../app/entry/src/main/ets/pages/Thread.ets',import.meta.url),'utf8');
const start=src.indexOf('  private async updateComposerSetting(');
const end=src.indexOf('  private async copyMessage(',start);
const methods=start<0?'':src.slice(start,end).replaceAll('private ','');
const body=`const WS={threadStartTurn:'dispatch'};const util={generateRandomUUID:()=> 'id'};
export const EnvironmentSession={current:{descriptor:{environmentId:'env'}}};
export class Fixture {active=true;loaded=true;settingsBusy=false;sending=false;hasPendingSend=false;running=false;
 params={environmentId:'env',threadId:'t'};state={thread:{modelSelection:{instanceId:'p',model:'m',options:[{id:'effort',value:'high'},{id:'fast',value:false}]},runtimeMode:'full-access',interactionMode:'default'}};
 models=[{instanceId:'p',model:'m'},{instanceId:'p',model:'other'}];calls=[];restarts=0;rpc={call:async(tag,c)=>this.calls.push(c)};connection={start:()=>this.restarts++};threadStatus='';settingsError='';
 ${methods}
}`;
const {Fixture,EnvironmentSession}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(body)).toString('base64'));
test('composer permission changes send only runtime metadata, never a message',async()=>{
 const p=new Fixture();assert.equal(typeof p.updateComposerSetting,'function');await p.updateComposerSetting('runtime','approval-required');
 assert.equal(p.calls.length,1);assert.equal(p.calls[0].type,'thread.runtime-mode.set');assert.equal(p.calls[0].runtimeMode,'approval-required');assert.equal(p.restarts,1);
 assert.equal(p.state.thread.runtimeMode,'full-access');
});
test('composer model switch resets model-specific options but selecting the current model preserves them',async()=>{
 const p=new Fixture();assert.equal(typeof p.updateComposerSetting,'function');await p.updateComposerSetting('model','',p.state.thread.modelSelection);assert.equal(p.calls.length,0);
 await p.updateComposerSetting('model','',{instanceId:'p',model:'other'});assert.deepEqual(p.calls[0].modelSelection,{instanceId:'p',model:'other'});
});
test('composer rejects unknown models, invalid modes, and changes from a stale environment',async()=>{
 const p=new Fixture();assert.equal(typeof p.updateComposerSetting,'function');await p.updateComposerSetting('runtime','oops');await p.updateComposerSetting('model','',{instanceId:'gone',model:'x'});
 EnvironmentSession.current.descriptor.environmentId='elsewhere';await p.updateComposerSetting('runtime','auto');EnvironmentSession.current.descriptor.environmentId='env';assert.equal(p.calls.length,0);
});
test('failed metadata save exposes error, refreshes authoritative state and does not send the draft',async()=>{
 const p=new Fixture();assert.equal(typeof p.updateComposerSetting,'function');p.rpc.call=async()=>{throw new Error('offline')};await p.updateComposerSetting('runtime','auto');assert.match(p.settingsError,/offline/);assert.equal(p.settingsBusy,false);assert.equal(p.restarts,1);
});
