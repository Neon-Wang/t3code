import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const path = new URL('../app/entry/src/main/ets/model/Models.ets', import.meta.url);
const model = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(readFileSync(path, 'utf8'))).toString('base64'));

test('shell subscription replaces snapshots and applies upserts/removals', () => {
  const state = new model.ShellState();
  state.apply({ kind: 'snapshot', snapshot: { snapshotSequence: 3, projects: [], threads: [{id:'t',title:'old'}] } });
  state.apply({ kind: 'thread-upserted', sequence: 4, thread: {id:'t',title:'new'} });
  state.apply({ kind: 'thread-upserted', sequence: 2, thread: {id:'t',title:'stale'} });
  assert.equal(state.threads[0].title, 'new');
  state.apply({ kind: 'thread-removed', sequence: 5, threadId:'t' });
  assert.deepEqual(state.threads, []);
});

test('thread snapshot and streaming deltas are deduplicated by sequence', () => {
  const state = new model.ThreadState();
  state.apply({kind:'snapshot',snapshot:{snapshotSequence:2,thread:{id:'t',messages:[{id:'m',role:'assistant',text:'hello',streaming:true}]}}});
  const event = {kind:'event',event:{sequence:3,type:'thread.message-sent',payload:{threadId:'t',messageId:'m',role:'assistant',text:' world',streaming:true}}};
  state.apply(event); state.apply(event);
  assert.equal(state.messages[0].text, 'hello world');
  state.apply({kind:'event',event:{sequence:4,type:'thread.message-sent',payload:{threadId:'t',messageId:'m',role:'assistant',text:'',streaming:false}}});
  assert.equal(state.messages[0].text, 'hello world');
  assert.equal(state.messages[0].streaming, false);
});

test('turn submission uses existing thread modes and server command shape', () => {
  const thread = {id:'t',runtimeMode:'approval-required',interactionMode:'plan'};
  const cmd = model.startTurnCommand(thread, 'hello', 'cmd-id', 'message-id', '2026-09-07T00:00:00.000Z');
  assert.equal(cmd.type, 'thread.turn.start');
  assert.equal(cmd.threadId, 't');
  assert.deepEqual(cmd.message, {messageId:'message-id',role:'user',text:'hello',attachments:[]});
  assert.equal(cmd.runtimeMode, 'approval-required');
  assert.equal(cmd.interactionMode, 'plan');
});

test('tracks ready checkpoints for the full-thread diff request',()=>{
 const state=new model.ThreadState();
 state.apply({kind:'snapshot',snapshot:{snapshotSequence:1,thread:{id:'t',messages:[],checkpoints:[{checkpointTurnCount:2,status:'ready'}]}}});
 assert.equal(state.checkpointCount,2);
 state.apply({kind:'event',event:{sequence:2,type:'thread.turn-diff-completed',payload:{threadId:'t',checkpointTurnCount:3,status:'ready'}}});
 assert.equal(state.checkpointCount,3);
});
