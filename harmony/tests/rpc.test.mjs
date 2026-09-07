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
  connect(_url, callback) { callback(null); this.handlers.get('open')?.(); }
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
