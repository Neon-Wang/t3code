import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(process.env.T3_INDEX_SOURCE??new URL('../app/entry/src/main/ets/pages/Index.ets',import.meta.url),'utf8');
const method=(name,next)=>source.slice(source.indexOf('  private '+name),source.indexOf('  private '+next)).replace('private ','');
let hooks;
globalThis.__connectionActions={get:()=>hooks};
const body=`
const h=()=>globalThis.__connectionActions.get();
const EnvironmentSession={current:null};class ShellState{}
const connectDirectEnvironment=async(url,token)=>{h().requests.push({method:'direct',url,token});return {descriptor:{environmentId:'new'},matchesSaved:()=>false};};
const connectEnvironment=async(target,packageSpec)=>{h().requests.push({method:'ssh',target,packageSpec});return {descriptor:{environmentId:'new'},matchesSaved:()=>false};};
const readBearer=async()=> 'saved-bearer';const readSshCredentials=async()=>({bearer:'saved-bearer',password:'saved-password'});
const restoreDirectEnvironment=async()=>{h().requests.push({method:'restore'});return {descriptor:{environmentId:'new'},matchesSaved:()=>false};};
const restoreSshEnvironment=restoreDirectEnvironment;
const loadEnvironments=async()=>[];const forgetEnvironment=async()=>{await h().deletion;};
const AlertDialog={show(dialog){h().dialogs.push(dialog);}};
class Fixture {
 connecting=false;status='';connected={matchesSaved:()=>false};direct=true;environmentUrl='http://intended.example';pairingToken='fixture-only';packageSpec='original-package';hostname='original-host';managingEnvironments=true;
 makeTarget(){return {hostname:this.hostname,pairingToken:this.pairingToken};}
 async disconnect(){await h().closing;this.connected=null;}
 async loadThreads(){} async remember(){}
 ${method('async connect()','async loadThreads()')}
 ${method('async restore(saved:','forget(saved:')}
 ${method('forget(saved:','makeTarget()')}
}
export default Fixture;
`;
const {default:Fixture}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(body)).toString('base64'));
function setup(){let release;hooks={requests:[],dialogs:[],closing:new Promise(r=>release=r),deletion:Promise.resolve()};return release;}
test('direct connection uses the URL, token and mode captured at click time while old connection closes',async()=>{
 const release=setup(),page=new Fixture();const pending=page.connect();
 page.environmentUrl='http://changed.example';page.pairingToken='changed-token';page.direct=false;
 release();await pending;
 assert.deepEqual(hooks.requests,[{method:'direct',url:'http://intended.example',token:'fixture-only'}]);
});
test('SSH connection freezes target and package before waiting for previous transport cleanup',async()=>{
 const release=setup(),page=new Fixture();page.direct=false;const pending=page.connect();
 page.hostname='changed-host';page.pairingToken='changed-token';page.packageSpec='changed-package';page.direct=true;
 release();await pending;
 assert.deepEqual(hooks.requests,[{method:'ssh',target:{hostname:'original-host',pairingToken:'fixture-only'},packageSpec:'original-package'}]);
});
test('pending credential deletion excludes connect, restore and another forget operation',async()=>{
 const close=setup();close();let release;hooks.deletion=new Promise(r=>release=r);
 const page=new Fixture(),saved={label:'fixture',environmentId:'env',httpBaseUrl:'http://fixture'};
 page.forget(saved);const deletion=hooks.dialogs[0].secondaryButton.action();
 await Promise.resolve();await page.connect();await page.restore(saved);page.forget(saved);
 assert.equal(hooks.dialogs.length,1);assert.deepEqual(hooks.requests,[]);
 release();await deletion;assert.equal(page.connecting,false);
});


test('restoring a saved environment clears transient credentials from a previous pairing form',async()=>{
 const release=setup();release();const page=new Fixture();page.password='previous-password';
 await page.restore({environmentId:'env',httpBaseUrl:'http://saved',label:'saved'});
 assert.equal(page.pairingToken,'');assert.equal(page.password,'');
});
