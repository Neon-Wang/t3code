import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../app/entry/src/main/ets/model/RequestDrafts.ets',import.meta.url),'utf8').replace("import { AnswerDraft } from './Models';",'');
const {RequestDrafts}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));

test('pending answers survive page recreation and are isolated by environment, thread, and request',()=>{
 const answer=[{questionId:'q',selected:['Red','Blue'],custom:''}];
 RequestDrafts.save('environment','thread','request',answer);
 assert.deepEqual(RequestDrafts.read('environment','thread','request'),answer);
 assert.deepEqual(RequestDrafts.read('other','thread','request'),[]);
 assert.deepEqual(RequestDrafts.read('environment','other','request'),[]);
 assert.deepEqual(RequestDrafts.read('environment','thread','other'),[]);
 RequestDrafts.save('environment','thread','request',[{questionId:'q',selected:[],custom:'custom'}]);
 assert.equal(RequestDrafts.read('environment','thread','request')[0].custom,'custom');
});

test('resolved requests release their answers while other pending requests remain',()=>{
 const answer=[{questionId:'q',selected:['Green'],custom:''}];
 RequestDrafts.save('e','t','resolved',answer);RequestDrafts.save('e','t','pending',answer);
 RequestDrafts.save('e','other','resolved',answer);
 RequestDrafts.retain('e','t',['pending']);
 assert.deepEqual(RequestDrafts.read('e','t','resolved'),[]);
 assert.deepEqual(RequestDrafts.read('e','t','pending'),answer);
 assert.deepEqual(RequestDrafts.read('e','other','resolved'),answer);
 RequestDrafts.retain('e','t',[]);assert.deepEqual(RequestDrafts.read('e','t','pending'),[]);
});
