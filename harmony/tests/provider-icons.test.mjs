import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = readFileSync(new URL('../app/entry/src/main/ets/model/Models.ets', import.meta.url), 'utf8');
const { availableModels } = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('provider identity follows the driver rather than a custom instance name or model vendor', () => {
  const result = availableModels([{ instanceId: 'personal', driver: 'cursor', displayName: 'Work Cursor', enabled: true, installed: true, models: [{ slug: 'gpt-6', name: 'GPT-6' }] }]);
  assert.equal(result[0].driver, 'cursor');
  assert.equal(result[0].providerLabel, 'Work Cursor');
  assert.equal(result[0].instanceId, 'personal');
});
test('unknown providers retain their own identity for the initials fallback', () => {
  const result = availableModels([{ instanceId: 'custom', driver: 'my-harness', enabled: true, installed: true, models: [{ slug: 'auto', name: 'Auto' }] }]);
  assert.equal(result[0].driver, 'my-harness');
  assert.equal(result[0].providerLabel, 'custom');
});
