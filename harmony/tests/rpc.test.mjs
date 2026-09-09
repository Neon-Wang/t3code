import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

// Only the platform transport is replaced. Requests, dispatch and lifecycle
// execute the same ArkTS source shipped in the HAP.
class Socket {
  handlers = new Map();
  sent = [];
  reply = null;
  on(event, callback) { this.handlers.set(event, callback); }
  off(event) { this.handlers.delete(event); }
  connect(_url, callback) { callback(null); if (!globalThis.__stallSocket) this.handlers.get('open')?.(); }
  send(text) {
    const frame = JSON.parse(text);
    this.sent.push(frame);
    this.reply?.(frame);
    return Promise.resolve(true);
  }
  receive(frame) { this.handlers.get('message')?.(null, JSON.stringify(frame)); }
  close() { this.handlers.get('close')?.(); return Promise.resolve(true); }
}
let socket;
globalThis.__harmonySocket = { createWebSocket() { socket = new Socket(); return socket; } };
const source = readFileSync(new URL('../app/entry/src/main/ets/connection/Rpc.ets', import.meta.url), 'utf8')
  .replace("import webSocket from '@ohos.net.webSocket';", 'const webSocket = globalThis.__harmonySocket;');
const { RpcClient } = await import('data:text/javascript;base64,' +
  Buffer.from(stripTypeScriptTypes(source)).toString('base64'));

async function withClient(run) {
  const client = new RpcClient();
  await client.connect('ws://test.invalid/ws');
  try { await run(client, socket); } finally { client.close(); }
}
async function settled(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('request did not settle')), 300);
    })]);
  } finally { clearTimeout(timer); }
}

test('uses Effect header tuples and resolves a void response', () => withClient(async (client, peer) => {
  const result = client.call('terminal.write', { terminalId: 'term', data: 'x' });
  assert.deepEqual(peer.sent[0].headers, []);
  peer.receive({ _tag: 'Exit', requestId: peer.sent[0].id, exit: { _tag: 'Success' } });
  assert.equal(await settled(result), undefined);
}));

test('registers the request before a transport can return a response', () => withClient(async (client, peer) => {
  peer.reply = frame => {
    if (frame._tag === 'Request') peer.receive({ _tag: 'Exit', requestId: frame.id,
      exit: { _tag: 'Success', value: { ok: true } } });
  };
  assert.deepEqual(await settled(client.call('server.probe', {})), { ok: true });
}));

test('acknowledges each processed stream chunk so the server can continue', () => withClient(async (client, peer) => {
  const values = [];
  const done = client.callStream('orchestration.subscribeThread', {}, chunk => values.push(...chunk));
  const id = peer.sent[0].id;
  peer.receive({ _tag: 'Chunk', requestId: id, values: [{ sequence: 1 }] });
  assert.deepEqual(values, [{ sequence: 1 }]);
  assert.deepEqual(peer.sent[1], { _tag: 'Ack', requestId: id });
  peer.receive({ _tag: 'Exit', requestId: id, exit: { _tag: 'Success' } });
  await settled(done);
}));

test('rejects in-flight work when the socket closes', () => withClient(async (client, peer) => {
  const result = client.call('server.probe', {});
  peer.close();
  await assert.rejects(settled(result), /closed|disconnect/i);
}));

test('rejects calls made without an open connection', async () => {
  const client = new RpcClient();
  await assert.rejects(settled(client.call('server.probe', {})), /connected|closed/i);
});

test('connection timeout and explicit cancellation settle stalled handshakes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.__stallSocket = true;
  const client = new RpcClient();
  try {
    const opening = client.connect('ws://test.invalid/ws');
    const timedOut = assert.rejects(opening, /closed|timeout/i);
    t.mock.timers.tick(10000);
    await timedOut;
    const second = client.connect('ws://test.invalid/ws');
    client.close();
    await assert.rejects(second, /closed/i);
  } finally { globalThis.__stallSocket = false; client.close(); }
});

test('preserves a definitive command rejection separately from unknown delivery failures', () => withClient(async (client, peer) => {
  for (const [tag, name, definitive] of [
    ['OrchestrationDispatchCommandError', 'OrchestrationCommandInvariantError', true],
    ['OrchestrationDispatchCommandError', 'OrchestrationCommandPreviouslyRejectedError', true],
    ['EnvironmentAuthorizationError', '', true],
    ['OrchestrationDispatchCommandError', 'DatabaseError', false],
    ['AssetAttachmentNotFoundError', '', false],
  ]) {
    const result = client.call('orchestration.dispatchCommand', {});
    const id = peer.sent.at(-1).id;
    peer.receive({_tag:'Exit',requestId:id,exit:{_tag:'Failure',cause:[{_tag:'Fail',error:{_tag:tag,message:'Rejected fixture',cause:{name}}}]}});
    await assert.rejects(result, error => error.remoteTag === tag && error.message.includes(tag) && error.definitivelyRejected === definitive);
  }
  const pending = client.call('orchestration.dispatchCommand', {});
  peer.close();
  await assert.rejects(pending, error => error.definitivelyRejected !== true);
}));

test('restores attachments explicitly rejected before command dispatch', () => withClient(async (client, peer) => {
  for (const [message, definitive] of [
    ["Attachment 'image.jpg' cannot be sent: attachment not found.", true],
    ["Attachment 'image.jpg' cannot be sent: attachment not found (removed or expired).", true],
    ["Attachment 'image.jpg' cannot be sent: stored size does not match.", true],
    ["Attachment 'image.jpg' cannot be sent: attachment type does not match the upload.", true],
    ['Failed to dispatch orchestration command', false],
  ]) {
    const result = client.call('orchestration.dispatchCommand', {});
    peer.receive({_tag:'Exit',requestId:peer.sent.at(-1).id,exit:{_tag:'Failure',cause:[{_tag:'Fail',error:{_tag:'OrchestrationDispatchCommandError',message,cause:{name:'SystemError'}}}]}});
    await assert.rejects(result, error => error.definitivelyRejected === definitive);
  }
}));


test('allows correcting workspace paths rejected by pre-dispatch normalization', () => withClient(async (client, peer) => {
  for (const [message, definitive] of [
    ['Workspace root is not a directory: /fixture/file.txt', true],
    ['Workspace root does not exist: /fixture/missing', true],
    ['Failed to create workspace root: /fixture/denied', true],
    ["Failed to stat workspace root '/fixture/path' during 'validate-existing'.", true],
    ["Failed to stat workspace root '/fixture/path' during 'verify-created'.", true],
    ["Failed to stat workspace root '/fixture/path' during 'validate-created'.", false],
    ['Failed to dispatch orchestration command', false],
    ["Failed to stat workspace root '/fixture/path' during 'commit'.", false],
  ]) {
    const result = client.call('orchestration.dispatchCommand', { type: 'project.create' });
    peer.receive({_tag:'Exit',requestId:peer.sent.at(-1).id,exit:{_tag:'Failure',cause:[{_tag:'Fail',error:{_tag:'OrchestrationDispatchCommandError',message}}]}});
    await assert.rejects(result, error => error.definitivelyRejected === definitive);
  }
}));
