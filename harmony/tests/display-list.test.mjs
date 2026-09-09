import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../app/entry/src/main/ets/bridge/SwiftFrame.ets', import.meta.url), 'utf8').split('@Component')[0];
const code = stripTypeScriptTypes(source + '\nexport { replayOp, colorCss };');
const { replayOp, colorCss } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
// Captured from the rebuilt Swift bridge on nova 12 Pro, not handwritten ArkTS data.
const frame = JSON.parse(readFileSync(new URL('./fixtures/swift-device-display-list.json', import.meta.url), 'utf8'));
test('replays device-encoded Swift paths and text into Canvas', () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get(_target, name) {
      return (...args) => {
        calls.push([name, ...args]);
        for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value));
        if (name === 'measureText') return { width: args[0].length * 7 };
      };
    },
  });
  for (const op of frame.ops) replayOp(ctx, op);
  assert.ok(calls.some(([name, x, y]) => name === 'moveTo' && x === 17.6 && y === 25.4));
  assert.ok(calls.some(([name]) => name === 'quadraticCurveTo'));
  assert.ok(calls.some(([name]) => name === 'closePath'));
  assert.ok(calls.some(([name, value]) => name === 'fillText' && value.includes('native-proof.swift')));
  assert.ok(calls.some(([name, value]) => name === 'fillText' && value.includes('nativeBridge')));
});

test('passes RGB and alpha separately using ArkUI-supported rgba colors', () => {
  assert.equal(colorCss({ red: 0, green: 0, blue: 0, alpha: 1 }), 'rgba(0, 0, 0, 1)');
  assert.equal(colorCss({ red: 1, green: 0.5, blue: 0, alpha: 0.25 }), 'rgba(255, 128, 0, 0.25)');
});
