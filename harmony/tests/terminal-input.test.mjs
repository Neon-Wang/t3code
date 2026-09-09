import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../app/entry/src/main/ets/connection/TerminalInput.ets',import.meta.url),'utf8');
const {TerminalInput}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('fast terminal input preserves byte order while acknowledgements are pending',async()=>{
 const sent=[];let release;
 const queue=new TerminalInput(async data=>{sent.push(data);if(data==='a') await new Promise(r=>release=r);});
 const a=queue.write('a'),b=queue.write('中'),c=queue.write('\r');
 await Promise.resolve();assert.deepEqual(sent,['a']);release();await Promise.all([a,b,c]);assert.deepEqual(sent,['a','中','\r']);
});
test('disconnect cancels unsent input, and a failed write is never retried',async()=>{
 const sent=[];let release;
 const queue=new TerminalInput(async data=>{sent.push(data);await new Promise(r=>release=r);});
 const a=queue.write('a'),b=queue.write('b');const rejected=assert.rejects(b,/closed/);
 await Promise.resolve();queue.close();release();await a;await rejected;assert.deepEqual(sent,['a']);
 let calls=0;const failed=new TerminalInput(async()=>{calls++;throw new Error('network');});
 await assert.rejects(failed.write('x'),/network/);await assert.rejects(failed.write('y'),/closed/);assert.equal(calls,1);
});

test('clipboard reads stay ordered before subsequent keys',async()=>{
 const sent=[];let release;
 const queue=new TerminalInput(async data=>{sent.push(data);});
 const paste=queue.paste(()=>new Promise(r=>release=r));
 const key=queue.write('x');
 await Promise.resolve();assert.deepEqual(sent,[]);
 release('中文\n🙂\n');await Promise.all([paste,key]);
 assert.deepEqual(sent,['中文\n🙂\n','x']);
});
test('closing during a clipboard read prevents late input',async()=>{
 const sent=[];let release;
 const queue=new TerminalInput(async data=>{sent.push(data);});
 const paste=queue.paste(()=>new Promise(r=>release=r));
 const rejected=assert.rejects(paste,/closed/);
 await Promise.resolve();queue.close();release('must not send');await rejected;
 assert.deepEqual(sent,[]);
});
test('clipboard read failure or empty text does not break later typing',async()=>{
 const sent=[];const queue=new TerminalInput(async data=>{sent.push(data);});
 await assert.rejects(queue.paste(async()=>{throw new Error('clipboard denied');}),/clipboard denied/);
 await queue.paste(async()=> '');await queue.write('still works');
 assert.deepEqual(sent,['still works']);
});

test('long Unicode input fits the RPC limit without splitting surrogate pairs or interleaving keys',async()=>{
 const sent=[];let release;
 const queue=new TerminalInput(async data=>{sent.push(data);if(sent.length===1)await new Promise(r=>release=r);});
 const text='a'.repeat(65535)+'🙂中'+'b'.repeat(65536)+'尾';
 const writing=queue.write(text),key=queue.write('NEXT');
 await new Promise(r=>setImmediate(r));assert.equal(sent.length,1);release();
 await Promise.all([writing,key]);
 assert.equal(sent.slice(0,-1).join(''),text);assert.equal(sent.at(-1),'NEXT');
 for(const part of sent){assert.ok(part.length<=65536);assert.ok(!/[\uD800-\uDBFF]$/.test(part));assert.ok(!/^[\uDC00-\uDFFF]/.test(part));}
});
test('closing or a failed middle chunk stops all remaining long input without replay',async()=>{
 let release;const sent=[];
 const queue=new TerminalInput(async data=>{sent.push(data);await new Promise(r=>release=r);});
 const writing=queue.write('x'.repeat(140000));const rejected=assert.rejects(writing,/closed/);
 await new Promise(r=>setImmediate(r));queue.close();release();await rejected;assert.equal(sent.length,1);
 let calls=0;const failed=new TerminalInput(async()=>{if(++calls===2)throw Error('lost ack');});
 await assert.rejects(failed.write('x'.repeat(140000)),/lost ack/);
 await assert.rejects(failed.write('later'),/closed/);assert.equal(calls,2);
});
