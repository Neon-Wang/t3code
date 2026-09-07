import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
let initialized = 0;
globalThis.__t3Native = { initialize() { initialized++; }, setEventSink() {} };
let source = readFileSync(new URL('../app/entry/src/main/ets/bridge/NativeBridge.ets',import.meta.url),'utf8');
source = source.replace(/import t3bridge from 'libt3bridge.so';/, 'const t3bridge = globalThis.__t3Native;');
source = source.replace(/import type.*?;\n/g, '');
source += '\n';
const code = stripTypeScriptTypes(source);
globalThis.requireNapi = () => globalThis.__t3Native;
const {SwiftBridge} = await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('loads the direct NAPI export object and initializes only once',()=>{
 assert.equal(SwiftBridge.ensure(),globalThis.__t3Native);
 assert.equal(SwiftBridge.ensure(),globalThis.__t3Native);
 assert.equal(initialized,1);
});
