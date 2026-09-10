import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
let calls=[], stdout='', exitCode=0, connectArgs=[], disconnectGate=null, onDisconnect=null;
globalThis.__sshTest={ensure:()=>({
 async connect(...args){await Promise.resolve();connectArgs=args;calls.push('connect');},
 async exec(){await Promise.resolve();calls.push('exec');return {stdout,exitCode};},
 async openForward(){await Promise.resolve();calls.push('forward');},
 async disconnect(){onDisconnect?.();if(disconnectGate) await disconnectGate;await Promise.resolve();calls.push('disconnect');}
})};
globalThis.__sshCrypto={createMd:()=>{let data;return {
 async update(blob){data=blob.data;},async digest(){return {data:createHash('sha256').update(data).digest()};}
};}};
let source=readFileSync(new URL('../app/entry/src/main/ets/connection/SshTunnel.ets',import.meta.url),'utf8')
 .replace("import { SshBridge, SshExecResult } from '../bridge/NativeBridge';",'const SshBridge=globalThis.__sshTest;')
 .replace("import http from '@ohos.net.http';",'const http={createHttp:()=>({destroy(){},request(_url,callback){callback(new Error("unavailable"));}})};')
 .replace("import cryptoFramework from '@ohos.security.cryptoFramework';",'const cryptoFramework=globalThis.__sshCrypto;')
 .replace("import util from '@ohos.util';",'const util={TextEncoder:class {encodeInto(text){return new TextEncoder().encode(text);}}};');
const {SshEnvironment}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)+'\n//# sourceURL=ssh-environment-under-test.mjs').toString('base64'));
const target={hostname:'test.invalid',port:22,username:'test',password:'test-only',hostFingerprint:'SHA256:AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'};
test('disconnect closes the local SSH session without running remote commands',async()=>{
 calls=[];await SshEnvironment.disconnect(target);assert.deepEqual(calls,['disconnect']);
});
test('invalid launch results reject without forwarding and release the session',async()=>{
 for(const value of ['not JSON','{}','{"remotePort":0,"serverKind":"managed"}','{"remotePort":65536,"serverKind":"external"}','{"remotePort":22.5,"serverKind":"external"}','{"remotePort":"13773","serverKind":"external"}','{"remotePort":13773,"serverKind":"unknown"}']){
  calls=[];stdout=value;exitCode=0;
  await assert.rejects(SshEnvironment.ensure(target,'t3@latest',()=>{}),/启动结果/);
  assert.deepEqual(calls,['connect','exec','disconnect']);
 }
});
test('remote launch failure releases the session',async()=>{
 calls=[];stdout='';exitCode=1;
 await assert.rejects(SshEnvironment.ensure(target,'t3@latest',()=>{}),/远端启动失败/);
 assert.deepEqual(calls,['connect','exec','disconnect']);
});
test('a validated external port establishes a tunnel and can disconnect locally',async()=>{
 calls=[];stdout='login banner\n{"remotePort":13773,"serverKind":"external"}\n';exitCode=0;
 const result=await SshEnvironment.ensure(target,'t3@latest',()=>{});
 assert.deepEqual(connectArgs,[target.hostname,target.port,target.username,target.password,target.hostFingerprint]);
 assert.equal(result.remotePort,13773);assert.equal(result.serverKind,'external');
 assert.deepEqual(calls,['connect','exec','forward']);
 await SshEnvironment.disconnect(target);assert.equal(calls.at(-1),'disconnect');
});

test('pairing waits for the native command result',async()=>{
 stdout='{"credential":"test-pairing-token"}';exitCode=0;
 assert.equal(await SshEnvironment.issuePairingToken(),'test-pairing-token');
});

test('disconnect resolves only after native cleanup finishes',async()=>{
 let release, started;
 disconnectGate=new Promise(resolve=>{release=resolve;});
 const beginning=new Promise(resolve=>{started=resolve;});onDisconnect=started;
 let completed=false;
 const pending=SshEnvironment.disconnect(target).then(()=>{completed=true;});
 try {
  await beginning;await Promise.resolve();assert.equal(completed,false);
  release();await pending;assert.equal(completed,true);
 } finally {release();disconnectGate=null;onDisconnect=null;await pending;}
});
test('existing-server SSH uses the requested port without running remote commands',async()=>{
 calls=[];const existing={...target,serverPort:13773};
 const result=await SshEnvironment.ensure(existing,'t3@latest',()=>{});
 assert.equal(result.remotePort,13773);assert.equal(result.serverKind,'external');
 assert.deepEqual(calls,['connect','forward']);
 await SshEnvironment.disconnect(existing);
 for(const serverPort of [0,65536,1.5]){
  calls=[];await assert.rejects(SshEnvironment.ensure({...target,serverPort},'t3@latest',()=>{}),/服务端口/);
  assert.deepEqual(calls,[]);
 }
});
