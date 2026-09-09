import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../app/entry/src/main/ets/model/ComposerPath.ets',import.meta.url),'utf8');
const model=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const sharedSource=readFileSync(new URL('../../packages/shared/src/composerTrigger.ts',import.meta.url),'utf8');
const shared=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(sharedSource)).toString('base64'));
test('path completion follows shared cursor boundaries and ignores selected text and email addresses',()=>{
 for(const text of ['Inspect @src','你好 @分组','email@host','@','first\n@two','@src suffix','x @a\t@b']){
  for(let cursor=0;cursor<=text.length;cursor++){
   const expected=shared.detectComposerTrigger(text,cursor);
   assert.deepEqual(model.composerPathTrigger(text,cursor,cursor),expected?.kind==='path'?{query:expected.query,start:expected.rangeStart,end:expected.rangeEnd}:null);
  }
 }
 assert.equal(model.composerPathTrigger('@file',0,5),null);
});
test('inserted file links match iOS serialization and preserve text after the cursor',()=>{
 for(const path of ['src/main.ts','docs/a b[1](x)#?.md','目录/中文.md','src/a\\b.txt']){
  const text='Read @src then explain',trigger=model.composerPathTrigger(text,9,9);
  assert.deepEqual(model.insertComposerPath(text,trigger,path),shared.replaceTextRange(text,5,9,shared.serializeComposerFileLink(path)+' '));
 }
});
