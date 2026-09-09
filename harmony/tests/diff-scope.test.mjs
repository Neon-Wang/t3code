import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source=readFileSync(new URL('../app/entry/src/main/ets/model/DiffScope.ets',import.meta.url),'utf8');
const {diffScopes,checkpointRequest}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('lists only ready checkpoints newest first, plus cumulative and working tree',()=>{
 assert.deepEqual(diffScopes([{checkpointTurnCount:2,status:'ready'},{checkpointTurnCount:3,status:'pending'},{checkpointTurnCount:1,status:'ready'}]).map(x=>x.id),['all','turn:2','turn:1','workspace']);
 assert.deepEqual(diffScopes([]).map(x=>x.id),['workspace']);
});
test('turn diff compares to previous checkpoint and first turn uses full diff',()=>{
 assert.deepEqual(checkpointRequest('t',2,false),{method:'orchestration.getTurnDiff',payload:{threadId:'t',fromTurnCount:1,toTurnCount:2,ignoreWhitespace:false}});
 assert.deepEqual(checkpointRequest('t',1,false),{method:'orchestration.getFullThreadDiff',payload:{threadId:'t',toTurnCount:1,ignoreWhitespace:false}});
 assert.equal(checkpointRequest('t',8,true).method,'orchestration.getFullThreadDiff');
});
