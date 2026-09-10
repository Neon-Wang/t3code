import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../app/entry/src/main/ets/model/TerminalMetrics.ets',import.meta.url),'utf8');
const {terminalMetrics,normalizeTerminalFontSize}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('font size defaults and boundaries match the iOS terminal preference',()=>{
 assert.equal(normalizeTerminalFontSize(NaN),10.5);
 assert.equal(normalizeTerminalFontSize(1),6);
 assert.equal(normalizeTerminalFontSize(20),14);
 assert.equal(normalizeTerminalFontSize(10.5),10.5);
});
test('drawing, cursor and viewport sizing share the same cell dimensions',()=>{
 const old=terminalMetrics(13);assert.deepEqual(old,{fontSize:13,width:8,height:18,baseline:14});
 const small=terminalMetrics(6),large=terminalMetrics(14);
 assert.ok(small.width<large.width);assert.ok(small.height<large.height);
 for(let size=6;size<=14;size+=0.5){
  const m=terminalMetrics(size);
  assert.ok(m.baseline<m.height);assert.ok(m.width>=m.fontSize*0.6);
  const cols=Math.floor(320/m.width),rows=Math.floor(480/m.height);
  assert.ok(cols*m.width<=320);assert.ok((cols+1)*m.width>320);
  assert.ok(rows*m.height<=480);assert.ok((rows+1)*m.height>480);
 }
});
