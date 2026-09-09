import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = readFileSync(new URL('../app/entry/src/main/ets/pages/NewTask.ets', import.meta.url), 'utf8');
function fixture() {
  const start = source.indexOf('  private async dismiss(');
  assert.ok(start >= 0, 'new task sheet needs a draft-preserving dismiss action');
  const end = source.indexOf('  private async persistDraft(', start);
  return import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(`export class Fixture {
    busy=false; draftReady=true; error=''; closed=0;
    persistDraft=async()=>{}; onClose=()=>{this.closed++};
    ${source.slice(start,end).replaceAll('private ', '')}
  }`)).toString('base64'));
}
test('sheet waits for the draft write before closing', async () => {
  const {Fixture} = await fixture(); const page = new Fixture(); let finish;
  page.persistDraft = () => new Promise(resolve => { finish=resolve; });
  const closing=page.dismiss(); assert.equal(page.closed,0); finish(); await closing; assert.equal(page.closed,1);
});
test('failed draft write keeps the sheet open with an actionable error', async () => {
  const {Fixture} = await fixture(); const page = new Fixture();
  page.persistDraft=async()=>{throw new Error('disk full')}; await page.dismiss();
  assert.equal(page.closed,0); assert.equal(page.error,'disk full');
});
test('creating task cannot be dismissed; an unloaded untouched sheet can close', async () => {
  const {Fixture} = await fixture(); const page = new Fixture(); page.busy=true;
  await page.dismiss(); assert.equal(page.closed,0); page.busy=false; page.draftReady=false;
  page.persistDraft=async()=>{throw new Error('not loaded')}; await page.dismiss(); assert.equal(page.closed,1);
});
