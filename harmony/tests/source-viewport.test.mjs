import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const path = new URL('../app/entry/src/main/ets/model/SourceViewport.ets', import.meta.url);
const source = existsSync(path) ? readFileSync(path, 'utf8').replace(/import[^;]+;/g, '') : '';
const base = readFileSync(new URL('../app/entry/src/main/ets/model/SourceLines.ets', import.meta.url), 'utf8');
const model = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(base + '\n' + source)).toString('base64'));

test('far viewport reads logarithmic plus visible metrics and reuses cached native results', async () => {
  assert.equal(typeof model.SourceViewport, 'function');
  let calls = 0;
  const reader = new model.SourceViewport(10001, i => { calls++; return { startIndex: i * 81, baseline: i * 20 + 15, bottom: i * 20 + 20 }; }, async () => {});
  const starts = Array.from({ length: 10001 }, (_, i) => i * 81);
  const labels = await reader.labels(starts, 160000, 100, 15);
  assert(labels.some(x => x.number === 8001 && x.baseline === 160015));
  assert(calls < 40, `native calls: ${calls}`);
  const first = calls;
  assert.deepEqual(await reader.labels(starts, 160000, 100, 15), labels);
  assert.equal(calls, first);
  const target = await reader.target(starts, 9999, 15);
  assert.deepEqual(target, { baseline: 199975, range: { top: 199960, height: 20 } });
  assert(calls < 70);
});

test('wrapped continuations have no extra number and the last target covers all visual rows', async () => {
  assert.equal(typeof model.SourceViewport, 'function');
  const metrics = [
    { startIndex: 0, baseline: 15, bottom: 20 },
    { startIndex: 4, baseline: 35, bottom: 40 },
    { startIndex: 8, baseline: 55, bottom: 60 },
    { startIndex: 12, baseline: 75, bottom: 80 },
  ];
  const reader = new model.SourceViewport(metrics.length, i => metrics[i], async () => {});
  assert.deepEqual(await reader.labels([0, 4], 0, 200, 15), [{ number: 1, baseline: 15 }, { number: 2, baseline: 35 }]);
  assert.deepEqual(await reader.target([0, 4], 99, 15), { baseline: 35, range: { top: 20, height: 60 } });
});

test('terminal empty line maps the native preceding-newline index and can be targeted', async () => {
  assert.equal(typeof model.SourceViewport, 'function');
  const metrics = [{ startIndex: 0, baseline: 15, bottom: 20 }, { startIndex: 3, baseline: 35, bottom: 40 }];
  const reader = new model.SourceViewport(2, i => metrics[i], async () => {});
  assert.deepEqual(await reader.labels([0, 4], 0, 100, 15), [{ number: 1, baseline: 15 }, { number: 2, baseline: 35 }]);
  assert.deepEqual(await reader.target([0, 4], 2, 15), { baseline: 35, range: { top: 20, height: 20 } });
  assert.equal(await reader.target([0, 4], 0, 15), null);
  const empty = new model.SourceViewport(0, () => { throw Error('must not query absent layout'); }, async () => {});
  assert.deepEqual(await empty.labels([0], 0, 100, 15), []);
  assert.equal(await empty.target([0], 1, 15), null);
});

test('consecutive trailing blank lines keep distinct numbers despite duplicate native indices', async () => {
  const metrics = [0, 2, 2].map((startIndex, i) => ({ startIndex, baseline: i * 20 + 15, bottom: i * 20 + 20 }));
  const reader = new model.SourceViewport(3, i => metrics[i], async () => {});
  assert.deepEqual((await reader.labels([0, 2, 3], 0, 100, 15)).map(x => x.number), [1, 2, 3]);
  assert.deepEqual(await reader.target([0, 2, 3], 3, 15), { baseline: 55, range: { top: 40, height: 20 } });
});
