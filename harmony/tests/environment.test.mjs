import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

let requests = [];
let tokenStatus = 200;
let tickets = 0;
let ticketStatus=200;
let holdDescriptor=false,pendingDescriptor=null;
let networkFailures=Infinity, holdSecondFailure=false, pendingNetworkFailure=null;
let unavailableBase=null, sshBase='http://127.0.0.1:23456', ensureWait=null;
let sshPairs=0, sshCloses=0, sshTargets=[], savedSsh=[];
globalThis.__saveSsh=async(...args)=>savedSsh.push(args);
globalThis.__environmentSsh={
 async ensure(target){sshTargets.push(target);if(ensureWait)await ensureWait;return {httpBaseUrl:sshBase,remotePort:13773,serverKind:'external'};},
 async issuePairingToken(){sshPairs++;return 'automatic-pair';},
 async disconnect(){sshCloses++;}
};
globalThis.__harmonyHttp = {
  RequestMethod: { GET: 'GET', POST: 'POST' },
  createHttp() {
    return {
      destroy() {},
      request(url, options, callback) {
        requests.push({ url, ...options });
        if(unavailableBase && url.startsWith(unavailableBase) && networkFailures-- > 0){if(holdSecondFailure && networkFailures===0){pendingNetworkFailure=()=>callback({code:1},null);return;}callback({code:1},null);return;}
        if(holdDescriptor && url.endsWith('/.well-known/t3/environment')){pendingDescriptor=()=>callback(null,{responseCode:200,result:JSON.stringify({environmentId:'wrong-environment'})});return;}
        let status = 200;
        let result = { environmentId: 'test-environment', label: 'test' };
        if (url.endsWith('/oauth/token')) {
          status = tokenStatus;
          result = { access_token: 'private-bearer' };
        }
        if (url.endsWith('/api/auth/websocket-ticket')) {status=ticketStatus;result = { ticket: `ticket-${++tickets}` };}
        callback(null, { responseCode: status, result: JSON.stringify(result) });
      }
    };
  }
};
const source = readFileSync(new URL('../app/entry/src/main/ets/connection/Environment.ets', import.meta.url), 'utf8')
  .replace(/import \{[^\n]+\} from '\.\/EnvironmentStore';/, 'const saveEnvironment = async () => {}; const saveSshEnvironment = globalThis.__saveSsh;')
  .replace("import util from '@ohos.util';", "const util={generateRandomUUID:()=> 'generated-route'};")
  .replace("import http from '@ohos.net.http';", 'const http = globalThis.__harmonyHttp;')
  .replace("import { RpcClient } from './Rpc';", 'class RpcClient { async connect(url) { this.url = url; } close() {} }')
  .replace("import { SshEnvironment, SshTarget } from './SshTunnel';", 'const SshEnvironment = globalThis.__environmentSsh;');
const env = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'));

test('direct tailnet connection uses the server OAuth form contract', async () => {
  requests = []; tokenStatus = 200;
  const connection = await env.connectDirectEnvironment('https://mint.example.ts.net/', 'pair+& token', () => {});
  const request = requests.find(r => r.url.endsWith('/oauth/token'));
  assert.equal(request.header['Content-Type'], 'application/x-www-form-urlencoded');
  const form = new URLSearchParams(request.extraData);
  assert.equal(form.get('subject_token'), 'pair+& token');
  assert.equal(form.get('requested_token_type'), 'urn:ietf:params:oauth:token-type:access_token');
  assert.equal(form.get('client_device_type'), 'mobile');
  assert.equal(connection.descriptor.environmentId, 'test-environment');
  assert.match(connection.socketUrl, /^wss:\/\/mint.example.ts.net\/ws\?/);
});

test('each additional page connection gets a fresh authenticated ticket', async () => {
  tokenStatus = 200;
  const connection = await env.connectDirectEnvironment('https://mint.example.ts.net', 'pair', () => {});
  const before = tickets;
  await connection.openRpc();
  await connection.openRpc();
  assert.equal(tickets, before + 2);
  const request = requests.at(-1);
  assert.equal(request.header.Authorization, 'Bearer private-bearer');
});

test('rejects HTTP failure even if the response looks like a success payload', async () => {
  tokenStatus = 401;
  await assert.rejects(env.connectDirectEnvironment('https://mint.example.ts.net', 'pair', () => {}), /401/);
});

test('restoring a saved connection verifies identity and never consumes a new pairing token', async()=>{
 requests=[];tokenStatus=200;
 const saved={httpBaseUrl:'https://mint.example.ts.net',environmentId:'test-environment',label:'test',updatedAt:'now'};
 const connection=await env.restoreDirectEnvironment(saved,'saved-private-bearer',()=>{});
 assert.equal(connection.descriptor.environmentId,'test-environment');
 assert.equal(requests.some(r=>r.url.endsWith('/oauth/token')),false);
 assert.equal(requests.at(-1).header.Authorization,'Bearer saved-private-bearer');
 requests=[];
 await assert.rejects(env.restoreDirectEnvironment({...saved,environmentId:'other'},'saved-private-bearer',()=>{}),/环境.*不匹配/);
 assert.equal(requests.some(r=>r.header.Authorization),false);
});

test('existing SSH service exchanges the supplied pairing token and cleans up a failed connection',async()=>{
 requests=[];tokenStatus=200;sshPairs=0;sshCloses=0;
 const target={serverPort:13773,pairingToken:'supplied-pair'};
 const connection=await env.connectEnvironment(target,'unused',()=>{});
 assert.equal(sshPairs,0);assert.match(connection.socketUrl,/connectionMethod=ssh/);
 const tokenRequest=requests.find(r=>r.url.endsWith('/oauth/token'));
 assert.equal(new URLSearchParams(tokenRequest.extraData).get('subject_token'),'supplied-pair');
 tokenStatus=401;
 await assert.rejects(env.connectEnvironment(target,'unused',()=>{}),/401/);
 assert.equal(sshCloses,1);assert.equal(sshPairs,0);tokenStatus=200;
});


test('SSH save excludes ephemeral address and pairing token; cold restore reuses bearer through a new tunnel',async()=>{
 requests=[];savedSsh=[];tokenStatus=200;
 const target={hostname:'ssh.example',port:22,username:'dev',password:'ssh-password',hostFingerprint:'SHA256:pin',serverPort:13773,pairingToken:'once-only'};
 const connection=await env.connectEnvironment(target,'unused',()=>{});
 await connection.save();
 assert.equal(savedSsh.length,1);
 const [saved,bearer,password]=savedSsh[0];
 assert.equal(saved.httpBaseUrl,'');assert.equal(saved.ssh.serverPort,13773);
 assert.doesNotMatch(JSON.stringify(saved),/once-only|ssh-password|private-bearer|23456/);
 assert.equal(bearer,'private-bearer');assert.equal(password,'ssh-password');
 requests=[];
 const restored=await env.restoreSshEnvironment(saved,{bearer,password},()=>{});
 assert.equal(restored.httpBaseUrl,'http://127.0.0.1:23456');
 assert.equal(sshTargets.at(-1).pairingToken,undefined);
 assert.equal(sshTargets.at(-1).password,'ssh-password');
 assert.equal(requests.some(r=>r.url.endsWith('/oauth/token')),false);
 assert.equal(requests.at(-1).header.Authorization,'Bearer private-bearer');
 await restored.save();assert.equal(savedSsh.at(-1)[0].connectionId,saved.connectionId);
});

test('SSH restore checks environment identity before sending bearer and closes a failed tunnel',async()=>{
 requests=[];const before=sshCloses;
 await assert.rejects(env.restoreSshEnvironment({environmentId:'wrong-id',connectionId:'route',httpBaseUrl:'',label:'test',updatedAt:'01',ssh:{hostname:'ssh.example',port:22,username:'dev',hostFingerprint:'SHA256:pin',serverPort:13773}},{bearer:'private-bearer',password:'password'},()=>{}),/ID/);
 assert.equal(requests.length,1);assert.equal(requests[0].header.Authorization,undefined);
 assert.equal(sshCloses,before+1);
});

test('disconnect belongs to the prepared connection and closes its own SSH transport',async()=>{
 tokenStatus=200;const before=sshCloses;
 const ssh=await env.connectEnvironment({hostname:'ssh',port:22,username:'u',password:'p',hostFingerprint:'SHA256:pin',serverPort:13773,pairingToken:'pair'},'',()=>{});
 await ssh.close();assert.equal(sshCloses,before+1);
 const direct=await env.connectDirectEnvironment('http://direct','pair',()=>{});
 await direct.close();assert.equal(sshCloses,before+1);
});


test('expired SSH bearer closes restored tunnel without issuing a replacement pairing token',async()=>{
 requests=[];ticketStatus=401;const closed=sshCloses,pairs=sshPairs;
 try {
  await assert.rejects(env.restoreSshEnvironment({environmentId:'test-environment',connectionId:'route',httpBaseUrl:'',label:'test',updatedAt:'01',ssh:{hostname:'ssh.example',port:22,username:'dev',hostFingerprint:'SHA256:pin',serverPort:13773}},{bearer:'expired',password:'password'},()=>{}),/HTTP 401/);
  assert.equal(sshCloses,closed+1);assert.equal(sshPairs,pairs);
  assert.equal(requests.some(r=>r.url.endsWith('/oauth/token')),false);
 } finally {ticketStatus=200;}
});


test('concurrent readers rebuild one broken SSH tunnel and obtain fresh tickets without pairing again',async()=>{
 const target={hostname:'ssh',port:22,username:'u',password:'p',hostFingerprint:'SHA256:pin',serverPort:13773};
 const connection=new env.PreparedConnection('http://127.0.0.1:23456',{environmentId:'test-environment'},'bearer','ssh',target);
 const before=sshTargets.length,pairs=sshPairs;
 unavailableBase=connection.httpBaseUrl;sshBase='http://127.0.0.1:24567';
 try {
  const clients=await Promise.all([connection.openRpc(),connection.openRpc()]);
  assert.equal(sshTargets.length,before+1);assert.equal(sshPairs,pairs);
  assert.equal(connection.httpBaseUrl,sshBase);
  for(const client of clients)assert.ok(client.url.startsWith('ws://127.0.0.1:24567/'));
 }finally{unavailableBase=null;sshBase='http://127.0.0.1:23456';}
});

test('closing while SSH recovery is pending prevents a resurrected connection',async()=>{
 const connection=new env.PreparedConnection('http://127.0.0.1:23456',{environmentId:'test-environment'},'bearer','ssh',{hostname:'ssh',port:22,username:'u',password:'p',hostFingerprint:'SHA256:pin',serverPort:13773});
 let release;ensureWait=new Promise(r=>release=r);unavailableBase=connection.httpBaseUrl;sshBase='http://127.0.0.1:24567';
 try {
  const opened=connection.openRpc();const rejected=assert.rejects(opened,/关闭/);
  await new Promise(resolve=>setImmediate(resolve));
  const closed=connection.close();release();await closed;await rejected;
  await assert.rejects(connection.openRpc(),/关闭/);
 }finally{ensureWait=null;unavailableBase=null;sshBase='http://127.0.0.1:23456';}
});


test('concurrent failures share recovery even when the replacement reuses the local port',async()=>{
 const connection=new env.PreparedConnection(sshBase,{environmentId:'test-environment'},'bearer','ssh',{hostname:'ssh',port:22,username:'u',password:'p',hostFingerprint:'SHA256:pin',serverPort:13773});
 const before=sshTargets.length;unavailableBase=sshBase;networkFailures=2;
 try {await Promise.all([connection.openRpc(),connection.openRpc()]);assert.equal(sshTargets.length,before+1);}
 finally{unavailableBase=null;networkFailures=Infinity;}
});


test('a late failure from the old transport does not rebuild an already recovered reused port',async()=>{
 const connection=new env.PreparedConnection(sshBase,{environmentId:'test-environment'},'bearer','ssh',{hostname:'ssh',port:22,username:'u',password:'p',hostFingerprint:'SHA256:pin',serverPort:13773});
 const before=sshTargets.length;unavailableBase=sshBase;networkFailures=2;holdSecondFailure=true;
 try {const first=connection.openRpc(),second=connection.openRpc();await first;pendingNetworkFailure();await second;assert.equal(sshTargets.length,before+1);}
 finally{unavailableBase=null;networkFailures=Infinity;holdSecondFailure=false;pendingNetworkFailure=null;}
});


test('new readers wait for in-flight SSH identity verification before transmitting bearer',async()=>{
 requests=[];const connection=new env.PreparedConnection(sshBase,{environmentId:'test-environment'},'bearer','ssh',{hostname:'ssh',port:22,username:'u',password:'p',hostFingerprint:'SHA256:pin',serverPort:13773});
 unavailableBase=sshBase;networkFailures=1;holdDescriptor=true;
 const first=connection.openRpc();const firstCheck=assert.rejects(first,/ID/);
 await new Promise(resolve=>setImmediate(resolve));
 const before=requests.length;const second=connection.openRpc();const secondCheck=assert.rejects(second,/ID/);
 await new Promise(resolve=>setImmediate(resolve));
 const during=requests.length;
 pendingDescriptor();
 try {await Promise.all([firstCheck,secondCheck]);assert.equal(during,before);}
 finally {holdDescriptor=false;pendingDescriptor=null;unavailableBase=null;networkFailures=Infinity;}
});

test('connection manager distinguishes saved direct and SSH routes for the same environment',()=>{
 const direct=new env.PreparedConnection('http://one',{environmentId:'env'},'secret','direct');
 const target={hostname:'host',port:22,username:'user',password:'private',hostFingerprint:'SHA256:test',serverPort:3773};
 const ssh=new env.PreparedConnection('http://127.0.0.1:1234',{environmentId:'env'},'secret','ssh',target,'route-a');
 const saved={environmentId:'env',httpBaseUrl:'http://one',label:'one',updatedAt:''};
 assert.equal(direct.matchesSaved(saved),true);assert.equal(ssh.matchesSaved(saved),false);
 const sshSaved={...saved,connectionId:'route-a',ssh:{hostname:'host',port:22,username:'user',hostFingerprint:'SHA256:test',serverPort:3773}};
 assert.equal(ssh.matchesSaved(sshSaved),true);assert.equal(direct.matchesSaved(sshSaved),false);
 assert.equal(ssh.matchesSaved({...sshSaved,connectionId:'route-b'}),false);
 assert.equal(direct.matchesSaved({...saved,environmentId:'other'}),false);
});
