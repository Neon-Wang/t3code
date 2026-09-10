import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source=readFileSync(new URL('../app/entry/src/main/ets/model/TerminalTextKey.ets',import.meta.url),'utf8');
const {terminalTextKey,terminalControlKey}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('layout-provided Unicode wins over a physical US key name',()=>{
 assert.equal(terminalTextKey('KEYCODE_Q',0x00e4,false,false),'ä');
 assert.equal(terminalTextKey('KEYCODE_A',0x1f642,false,false),'🙂');
});
test('keycode-only letters respect Shift and Caps Lock independently',()=>{
 assert.equal(terminalTextKey('KEYCODE_B',0,false,false),'b');
 assert.equal(terminalTextKey('KEYCODE_B',0,true,false),'B');
 assert.equal(terminalTextKey('KEYCODE_B',0,false,true),'B');
 assert.equal(terminalTextKey('KEYCODE_B',0,true,true),'b');
});
test('keycode-only numbers and shell punctuation preserve shifted symbols',()=>{
 assert.equal(terminalTextKey('KEYCODE_1',0,false,false),'1');
 assert.equal(terminalTextKey('KEYCODE_1',0,true,false),'!');
 assert.equal(terminalTextKey('KEYCODE_SEMICOLON',0,true,false),':');
 assert.equal(terminalTextKey('KEYCODE_BACKSLASH',0,true,false),'|');
 assert.equal(terminalTextKey('KEYCODE_APOSTROPHE',0,false,false),"'");
 assert.equal(terminalTextKey('KEYCODE_SPACE',0,false,false),' ');
});
test('non-text keys and invalid or control Unicode never become terminal text',()=>{
 for(const code of [0,13,127,0x80,0xd800,0x110000,NaN])assert.equal(terminalTextKey('KEYCODE_UNKNOWN',code,false,false),'');
 assert.equal(terminalTextKey('KEYCODE_SHIFT_LEFT',0,false,false),'');
 assert.equal(terminalTextKey('KEYCODE_ENTER',0,false,false),'');
});

test('Ctrl letter commands cover the alphabet while leaving Ctrl+V to clipboard handling',()=>{
 for(let i=0;i<26;i++){
  const name='KEYCODE_'+String.fromCharCode(65+i);
  const expected=i===21?'':String.fromCharCode(i+1);
  assert.equal(terminalControlKey(name,false),expected);
  assert.equal(terminalControlKey(name,true),expected);
 }
});
test('Ctrl punctuation emits terminal control bytes including NUL',()=>{
 for(const [name,shift,expected] of [
  ['SPACE',false,'\x00'],['2',true,'\x00'],['LEFT_BRACKET',false,'\x1b'],
  ['BACKSLASH',false,'\x1c'],['RIGHT_BRACKET',false,'\x1d'],['6',true,'\x1e'],
  ['MINUS',false,'\x1f'],['MINUS',true,'\x1f'],['SLASH',true,'\x7f']
 ])assert.equal(terminalControlKey('KEYCODE_'+name,shift),expected);
 assert.equal(terminalControlKey('KEYCODE_1',false),'');
 assert.equal(terminalControlKey('KEYCODE_UNKNOWN',false),'');
});
