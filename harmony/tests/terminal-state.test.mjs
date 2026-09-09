import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../app/entry/src/main/ets/model/TerminalState.ets',import.meta.url),'utf8');
const {TerminalState,terminalAttach,terminalWrite,terminalResize,terminalClose,terminalRestart,TerminalClosures}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('terminal snapshots replace history and output preserves control bytes',()=>{
 const state=new TerminalState('t','term-1');
 assert.deepEqual(state.apply({type:'snapshot',snapshot:{threadId:'t',terminalId:'term-1',history:'prompt',status:'running'}}),{reset:true,data:'prompt'});
 assert.equal(state.apply({type:'output',threadId:'other',terminalId:'term-1',data:'wrong'}),null);
 assert.deepEqual(state.apply({type:'output',threadId:'t',terminalId:'term-1',data:'\r\n\u001b[31m红色\u001b[0m'}),{reset:false,data:'\r\n\u001b[31m红色\u001b[0m'});
 assert.deepEqual(state.apply({type:'snapshot',snapshot:{threadId:'t',terminalId:'term-1',history:'replacement',status:'running'}}),{reset:true,data:'replacement'});
 state.apply({type:'exited',threadId:'t',terminalId:'term-1',exitCode:7});assert.equal(state.status,'exited');assert.equal(state.exitCode,7);
 state.apply({type:'restarted',snapshot:{threadId:'t',terminalId:'term-1',history:'new',status:'running'}});assert.equal(state.exitCode,null);
 assert.deepEqual(state.apply({type:'cleared',threadId:'t',terminalId:'term-1'}),{reset:true,data:''});
 state.apply({type:'error',threadId:'t',terminalId:'term-1',message:'unavailable'});assert.equal(state.error,'unavailable');
});
test('PTY requests always identify thread and terminal, preserve input and clamp dimensions',()=>{
 assert.deepEqual(terminalAttach('t','term-1','/project',80,24),{threadId:'t',terminalId:'term-1',cwd:'/project',cols:80,rows:24,restartIfNotRunning:false});
 assert.deepEqual(terminalWrite('t','term-1','\u0003'),{threadId:'t',terminalId:'term-1',data:'\u0003'});
 assert.deepEqual(terminalResize('t','term-1',0,900),{threadId:'t',terminalId:'term-1',cols:1,rows:500});
});

test('closing targets one terminal and keeps history; restart retains its cwd and size',()=>{
 assert.deepEqual(terminalClose('t','term-2'),{threadId:'t',terminalId:'term-2',deleteHistory:false});
 assert.deepEqual(terminalRestart('t','term-2','/project',80,24),{threadId:'t',terminalId:'term-2',cwd:'/project',cols:80,rows:24});
});

test('explicit closure survives page instances and remains isolated by environment and terminal',()=>{
 TerminalClosures.set('a','t','term-1',true);
 assert.equal(TerminalClosures.has('a','t','term-1'),true);
 assert.equal(TerminalClosures.has('b','t','term-1'),false);
 assert.equal(TerminalClosures.has('a','t','term-2'),false);
 TerminalClosures.set('a','t','term-1',false);
 assert.equal(TerminalClosures.has('a','t','term-1'),false);
});
