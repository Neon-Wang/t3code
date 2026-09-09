import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = readFileSync(new URL('../app/entry/src/main/ets/pages/ProjectIcon.ets', import.meta.url), 'utf8');
const method = source.slice(source.indexOf('  private async reload()'), source.indexOf('  build()')).replace('private ', '');
let sequence = 0;
async function fixture() {
  const code = `export const EnvironmentSession={current:null}; const projectAssets=new Map(); export class Icon { cwd='/workspace'; faviconPath=''; source=''; revision=0; ${method} } // ${++sequence}`;
  return import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(code)).toString('base64'));
}
test('project resource keeps explicit favicon and resolves signed URL against its environment', async () => {
  const m = await fixture(); let input;
  m.EnvironmentSession.current = { httpBaseUrl: 'http://host:123/', rpc: { call: async (tag, request) => { input={tag,request}; return { relativeUrl:'/api/assets/ticket/icon.png', expiresAt:Date.now()+60000 }; } } };
  const icon = new m.Icon(); icon.faviconPath='assets/logo.svg'; await icon.reload();
  assert.deepEqual(input,{tag:'assets.createUrl',request:{resource:{_tag:'project-favicon',cwd:'/workspace',path:'assets/logo.svg'}}});
  assert.equal(icon.source,'http://host:123/api/assets/ticket/icon.png');
});
test('same project shares a ticket while another environment gets its own', async () => {
  const m = await fixture(); let calls=0;
  const rpc={call:async()=>{calls++;return {relativeUrl:'/api/assets/icon.png',expiresAt:Date.now()+60000};}};
  m.EnvironmentSession.current={httpBaseUrl:'http://one',rpc};
  await new m.Icon().reload(); await new m.Icon().reload(); assert.equal(calls,1);
  m.EnvironmentSession.current={httpBaseUrl:'http://two',rpc}; await new m.Icon().reload(); assert.equal(calls,2);
});
test('a pending old environment cannot replace the current project image', async () => {
  const m=await fixture(); let finish;
  m.EnvironmentSession.current={httpBaseUrl:'http://one',rpc:{call:()=>new Promise(resolve=>{finish=resolve;})}};
  const icon=new m.Icon(); const pending=icon.reload();
  m.EnvironmentSession.current={httpBaseUrl:'http://two',rpc:{call:async()=>({relativeUrl:'/api/assets/current.png',expiresAt:Date.now()+60000})}};
  await icon.reload(); finish({relativeUrl:'/api/assets/old.png',expiresAt:Date.now()+60000}); await pending;
  assert.equal(icon.source,'http://two/api/assets/current.png');
});
test('missing icons and protocol-relative URLs keep the local fallback', async () => {
  for(const relativeUrl of ['/api/assets/project-favicon-missing','//unrelated.example/icon.png']) {
    const m=await fixture(); m.EnvironmentSession.current={httpBaseUrl:'http://host',rpc:{call:async()=>({relativeUrl,expiresAt:Date.now()+60000})}};
    const icon=new m.Icon(); await icon.reload(); assert.equal(icon.source,'');
  }
});
