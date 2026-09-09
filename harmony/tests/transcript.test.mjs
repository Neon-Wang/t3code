import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const model = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(readFileSync(new URL('../app/entry/src/main/ets/model/Models.ets', import.meta.url), 'utf8'))).toString('base64'));
const msg=(id,role,text,time,turnId=null)=>({id,role,text,createdAt:`2026-09-08T00:00:${time}Z`,updatedAt:`2026-09-08T00:00:${time}Z`,turnId,streaming:false});
const tool=(id,time)=>({id,kind:'tool.completed',summary:id,turnId:'t',createdAt:`2026-09-08T00:00:${time}Z`,payload:{toolCallId:id,status:'completed',detail:'output '+id}});
const messages=[msg('u','user','date','00'),msg('a','assistant','Checking time','01','t'),msg('f','assistant','It is noon','12','t')];
const activities=[tool('one','02'),tool('two','03')];
const render=(m=messages,a=activities,session={status:'ready'},expanded=[])=>model.transcriptRows(m,a,session,null,expanded);
test('completed run hides process, preserves final attachments, and reports elapsed time',()=>{
 const rows=render([...messages.slice(0,2),{...messages[2],attachments:[{id:'file',type:'file',name:'result.md'}]}]);
 assert.deepEqual(rows.map(r=>r.kind),['message','turn','message']);
 assert.equal(rows[1].text,'运行了 12s');
 assert.equal(rows[2].attachments[0].name,'result.md');
});
test('run and tool segment expand independently, individual tools keep their output',()=>{
 let rows=render(undefined,undefined,undefined,['turn:t']);
 assert.deepEqual(rows.map(r=>r.kind),['message','turn','message','tools','message']);
 const group=rows.find(r=>r.kind==='tools');
 rows=render(undefined,undefined,undefined,['turn:t',group.id]);
 assert.deepEqual(rows.filter(r=>r.kind==='tool').map(r=>r.detail),['output one','output two']);
});
test('active process remains visible then collapses after completion',()=>{
 assert.equal(render(messages,activities,{status:'running',activeTurnId:'t'}).some(r=>r.kind==='turn'),false);
 assert.equal(render().some(r=>r.kind==='turn'),true);
 assert.equal(render(messages,activities,{status:'starting'}).some(r=>r.kind==='turn'),false);
});
test('each historical turn keeps its final answer, error runs stay visible',()=>{
 const more=[...messages,msg('u2','user','again','20'),msg('a2','assistant','checking','21','t2'),msg('f2','assistant','done','25','t2')];
 assert.deepEqual(render(more).filter(r=>r.role==='assistant').map(r=>r.id),['f','f2']);
 const rows=model.transcriptRows(messages,activities,{status:'error'},{turnId:'t',state:'error'},[]);
 assert.ok(rows.some(r=>r.id==='a'));
});
test('nonconsecutive tools remain separate groups and unordered updates merge chronologically',()=>{
 const rows=render([...messages.slice(0,2),msg('mid','assistant','next','02','t'),messages[2]], [tool('one','01'),tool('two','03')],{status:'running',activeTurnId:'t'});
 assert.equal(rows.filter(r=>r.kind==='tools').length,2);
 const start={...tool('one','01'),payload:{toolCallId:'one',status:'inProgress',detail:'starting'}};
 assert.equal(model.threadTimeline([], [tool('one','03'),start],null)[0].detail,'output one');
});
test('stream updates retain turn identity and record the final timestamp',()=>{
 const state=new model.ThreadState();
 state.apply({kind:'snapshot',snapshot:{snapshotSequence:1,thread:{id:'thread',messages:[messages[1]]}}});
 state.apply({kind:'event',event:{sequence:2,type:'thread.message-sent',occurredAt:'later',payload:{threadId:'thread',messageId:'a',text:' done',streaming:true}}});
 assert.equal(state.messages[0].turnId,'t');
 assert.equal(state.messages[0].updatedAt,'later');
});
test('latest turn timing wins, fractional seconds match desktop rounding',()=>{
 const rows=model.transcriptRows(messages,activities,{status:'ready'},{turnId:'t',state:'completed',startedAt:'2026-09-08T00:00:01Z',completedAt:'2026-09-08T00:00:12.7Z',assistantMessageId:'f'},[]);
 assert.equal(rows.find(r=>r.kind==='turn').text,'运行了 12s');
});
test('answer-only turn has no empty disclosure',()=>{
 assert.deepEqual(render([messages[0],messages[2]],[]).map(r=>r.kind),['message','message']);
});
test('shell running state prevents premature folding before session update',()=>{
 const rows=model.transcriptRows(messages,activities,{status:'ready'},{turnId:'t',state:'running'},[]);
 assert.equal(rows.some(r=>r.kind==='turn'),false);
});
