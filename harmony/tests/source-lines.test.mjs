import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const path = new URL('../app/entry/src/main/ets/model/SourceLines.ets', import.meta.url);
const model = existsSync(path) ? await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(readFileSync(path, 'utf8'))).toString('base64')) : {};

test('source display normalizes line endings and preserves empty and final lines', () => {
  assert.equal(typeof model.sourceText, 'function');
  assert.equal(model.sourceText('a\r\n\r中😀\n'), 'a\n\n中😀\n');
  assert.deepEqual(model.sourceLineStarts('a\n\n中😀\n'), [0, 2, 3, 7]);
  assert.deepEqual(model.sourceLineStarts(''), [0]);
});

test('line targets clamp to the last source line and reject invalid positions', () => {
  assert.equal(typeof model.sourceTargetLine, 'function');
  assert.equal(model.sourceTargetLine(120, 151), 120);
  assert.equal(model.sourceTargetLine(1000, 151), 151);
  assert.equal(model.sourceTargetLine(2, 1), 1);
  for (const value of [0, -1, NaN, Infinity, 1.5]) assert.equal(model.sourceTargetLine(value, 151), 0);
});

test('range geometry is restricted to nonempty basic text with the calibrated native font', () => {
  assert.equal(typeof model.sourceUsesBasicGlyphs, 'function');
  for (const source of ['const x = 42;\n', '\tvalue\n\n', ' ', '\n']) {
    assert.equal(model.sourceUsesBasicGlyphs(source), true, JSON.stringify(source));
  }
  for (const source of ['', '😀 emoji\n', '中 Chinese\n', 'العربية\n', 'हिन्दी\n', '\u0301 combining', '\u200b hidden', '\ufeff BOM', 'café', '\u0000']) {
    assert.equal(model.sourceUsesBasicGlyphs(source), false, JSON.stringify(source));
  }
});
