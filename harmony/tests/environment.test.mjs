import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

let requests = [];
let tokenStatus = 200;
let tickets = 0;
globalThis.__harmonyHttp = {
  RequestMethod: { GET: 'GET', POST: 'POST' },
  createHttp() {
    return {
      destroy() {},
      request(url, options, callback) {
        requests.push({ url, ...options });
        let status = 200;
        let result = { environmentId: 'test-environment', label: 'test' };
        if (url.endsWith('/oauth/token')) {
          status = tokenStatus;
          result = { access_token: 'private-bearer' };
        }
        if (url.endsWith('/api/auth/websocket-ticket')) result = { ticket: `ticket-${++tickets}` };
        callback(null, { responseCode: status, result: JSON.stringify(result) });
      }
    };
  }
};
const source = readFileSync(new URL('../app/entry/src/main/ets/connection/Environment.ets', import.meta.url), 'utf8')
  .replace("import http from '@ohos.net.http';", 'const http = globalThis.__harmonyHttp;')
  .replace("import { RpcClient } from './Rpc';", 'class RpcClient { async connect(url) { this.url = url; } close() {} }')
  .replace("import { SshEnvironment, SshTarget } from './SshTunnel';", 'const SshEnvironment = {};');
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
