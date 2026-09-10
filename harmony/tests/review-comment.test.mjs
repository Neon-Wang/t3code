import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../app/entry/src/main/ets/model/ReviewComment.ets',import.meta.url),'utf8');
const {formatLineComment,appendComment,parseCommentMessage}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('review comment preserves deleted side, escapes attributes and fences code',()=>{
 const text=formatLineComment('working-tree','工作区变更','a"&.ts',2,{change:'delete',oldLineNumber:7,content:'```'},' fix it ');
 assert.match(text,/filePath="a&quot;&amp;.ts"/); assert.match(text,/rangeLabel="old line 7"/);
 assert.ok(text.includes('\nfix it\n````diff\n-```\n````\n</review_comment>'));
});
test('appending a review preserves existing draft text',()=>{
 assert.equal(appendComment('Existing draft','Review'),'Existing draft\n\nReview');
 assert.equal(appendComment('','Review'),'Review');
});
test('segments surrounding text and multiple comments without losing source content',()=>{
 const a=formatLineComment('working-tree','工作区','a"&.ts',0,{change:'add',newLineNumber:1,content:'hello'},'First');
 const b=formatLineComment('working-tree','工作区','b.ts',1,{change:'delete',oldLineNumber:2,content:'bye'},'Second');
 const parts=parseCommentMessage('Before\n'+a+'\nBetween\n'+b+'\nAfter');
 assert.deepEqual(parts.map(x=>x.kind),['text','comment','text','comment','text']);
 assert.equal(parts[1].filePath,'a"&.ts');assert.equal(parts[1].diff,'+hello');assert.equal(parts[3].text,'Second');
 assert.equal(parts[4].text,'\nAfter');
});
test('malformed or streaming partial comments stay readable as original text',()=>{
 for(const raw of ['Hello','<review_comment sectionId="x">unfinished','<review_comment filePath="x">bad</review_comment>']){
  assert.deepEqual(parseCommentMessage(raw),[{kind:'text',text:raw}]);
 }
});
