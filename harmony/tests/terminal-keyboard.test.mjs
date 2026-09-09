import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const handlers=new Map();let release=null,stall=false,attached=false,shown=0;
const controller={async attach(){if(stall)await new Promise(r=>release=r);attached=true;},async detach(){attached=false;},async showTextInput(){shown++;},on(type,fn){handlers.set(type,fn);},off(type,fn){if(handlers.get(type)===fn)handlers.delete(type);}};
globalThis.__ime={getInputMethodController:()=>controller,TextInputType:{TEXT:0},EnterKeyType:{NEWLINE:8},Direction:{CURSOR_UP:1,CURSOR_DOWN:2,CURSOR_LEFT:3,CURSOR_RIGHT:4}};
const source=readFileSync(new URL('../app/entry/src/main/ets/connection/TerminalKeyboard.ets',import.meta.url),'utf8').replace("import inputMethod from '@ohos.inputMethod';",'const inputMethod=globalThis.__ime;');
const {TerminalKeyboard}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('IME committed text and editing keys preserve terminal bytes and detach cleanly',async()=>{
 const bytes=[];const keyboard=new TerminalKeyboard(s=>bytes.push(s),s=>bytes.push(s));await keyboard.show();
 handlers.get('insertText')(`echo '中文'`);handlers.get('deleteLeft')(2);handlers.get('deleteRight')(1);handlers.get('moveCursor')(3);handlers.get('sendFunctionKey')({enterKeyType:8});
 assert.deepEqual(bytes,[`echo '中文'`,'\x7f\x7f','\x1b[3~','\x1b[D','\r']);
 await keyboard.close();assert.equal(attached,false);assert.equal(handlers.size,0);
});
test('leaving during attachment prevents a late keyboard from taking input',async()=>{
 stall=true;const before=shown;const keyboard=new TerminalKeyboard(()=>{},()=>{});const pending=keyboard.show();await Promise.resolve();await keyboard.close();release();await pending;
 assert.equal(attached,false);assert.equal(handlers.size,0);assert.equal(shown,before);stall=false;
});

test('multiline IME commits use paste encoding while Enter remains a control key',async()=>{
 const bytes=[];
 const keyboard=new TerminalKeyboard(s=>bytes.push(s),s=>bytes.push(`\x1b[200~${s}\x1b[201~`));
 await keyboard.show();
 handlers.get('insertText')('T3_IME_A\nT3_IME_B');
 handlers.get('insertText')('\n');
 handlers.get('insertText')('a\rb');
 handlers.get('insertText')('中文😀');
 handlers.get('sendFunctionKey')({enterKeyType:8});
 assert.deepEqual(bytes,['\x1b[200~T3_IME_A\nT3_IME_B\x1b[201~','\x1b[200~\n\x1b[201~','\x1b[200~a\rb\x1b[201~','中文😀','\r']);
 await keyboard.close();
});
