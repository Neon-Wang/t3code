import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../app/entry/src/main/ets/model/MarkdownLink.ets',import.meta.url),'utf8');
const {markdownFileLink}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('opens relative, absolute and encoded file URLs inside the active project',()=>{
 for(const href of ['src/a.ts','./src/a.ts','/repo/src/a.ts','file:///repo/src/a.ts','src/sub/../a.ts'])assert.equal(markdownFileLink(href,'/repo')?.path,'src/a.ts');
 assert.deepEqual(markdownFileLink('docs/hello%20world.md#L12','/repo'),{path:'docs/hello world.md',line:12});
 assert.deepEqual(markdownFileLink('/repo/src/a.ts:4:2','/repo'),{path:'src/a.ts',line:4});
});
test('retains positive source positions with suffix precedence and ignores non-line fragments',()=>{
 for(const href of ['a.ts#L120C3','a.ts#l120c3','a.ts#%4C120','a.ts:120:3#L8'])assert.deepEqual(markdownFileLink(href,'/repo'),{path:'a.ts',line:120});
 for(const href of ['a.ts#heading','a.ts#L0','a.ts:0','a.ts#L-2','a.ts#L2junk'])assert.deepEqual(markdownFileLink(href,'/repo'),{path:'a.ts'});
 assert.equal(markdownFileLink('../a.ts#L12','/repo'),null);
});
test('does not route schemes, project escapes or prefix-colliding directories as project files',()=>{
 for(const href of ['https://example.com/a','javascript:alert(1)','../secret','/repo-other/a','file://other/repo/a','%2e%2e/secret','#heading','bad%zz'])assert.equal(markdownFileLink(href,'/repo'),null);
});
test('resolves document links from their directory while keeping the project boundary',()=>{
 assert.deepEqual(markdownFileLink('next.md','/repo','docs'),{path:'docs/next.md'});
 assert.deepEqual(markdownFileLink('../README.md','/repo','docs'),{path:'README.md'});
 assert.deepEqual(markdownFileLink('/repo/root.md','/repo','docs'),{path:'root.md'});
 assert.equal(markdownFileLink('../../secret','/repo','docs'),null);
});
