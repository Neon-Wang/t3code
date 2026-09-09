import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../app/entry/src/main/ets/model/FileEntries.ets',import.meta.url),'utf8');
const model=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));

test('directory listing synthesizes parents, deduplicates and orders folders before files',()=>{
 const entries=[{path:'src/lib/a.ts',kind:'file'},{path:'src',kind:'directory'},{path:'README.md',kind:'file'},{path:'src/b.ts',kind:'file'}];
 assert.deepEqual(model.directoryEntries(entries,'','').map(e=>[e.path,e.kind]),[['src','directory'],['README.md','file']]);
 assert.deepEqual(model.directoryEntries(entries,'src','').map(e=>e.path),['src/lib','src/b.ts']);
 assert.deepEqual(model.directoryEntries(entries,'','A.TS').map(e=>e.path),['src/lib/a.ts']);
});

test('remote paths remain confined to the workspace and empty folders remain visible',()=>{
 const entries=[{path:'../private',kind:'file'},{path:'/etc/passwd',kind:'file'},{path:'ok/../bad',kind:'file'},{path:'empty',kind:'directory'}];
 assert.deepEqual(model.directoryEntries(entries,'','').map(e=>e.path),['empty']);
 assert.deepEqual(model.directoryEntries(entries,'empty',''),[]);
});

test('file failures expose readable reasons without dumping server error envelopes',()=>{
 assert.equal(model.fileErrorText('RPC projects.readFile: [{"error":{"failure":"binary_file"}}]'),'此文件不是文本，无法在文本预览中打开。');
 assert.equal(model.fileErrorText('RPC connection closed'),'连接已断开，请刷新重试。');
 assert.equal(model.fileErrorText('RPC projects.readFile: failure'), '无法加载项目文件，请刷新重试。');
});

test('file search matches separate path tokens, camel case words and ordered abbreviations',()=>{
 const entries=[{path:'src/components/ChatHeader.tsx',kind:'file'},{path:'grouping-fixture.txt',kind:'file'},{path:'src/theme/colors.ts',kind:'file'}];
 for(const query of ['group fix','GRP FXTR','  fix   group  ','group.fix','grp/fxtr'])assert.deepEqual(model.directoryEntries(entries,'',query).map(e=>e.path),['grouping-fixture.txt']);
 for(const query of ['chat hea','cht hdr','src hdr'])assert.deepEqual(model.directoryEntries(entries,'',query).map(e=>e.path),['src/components/ChatHeader.tsx']);
 for(const query of ['group missing','pgr fix','srccmp'])assert.deepEqual(model.directoryEntries(entries,'',query),[]);
});
test('file search retains literal full paths and non-ASCII substring matches',()=>{
 const entries=[{path:'src/文档/说明.md',kind:'file'},{path:'../private-note',kind:'file'}];
 assert.deepEqual(model.directoryEntries(entries,'','src/文档').map(e=>e.path),['src/文档/说明.md']);
 assert.deepEqual(model.directoryEntries(entries,'','文档 说明').map(e=>e.path),['src/文档/说明.md']);
 assert.deepEqual(model.directoryEntries(entries,'','private'),[]);
});
test('separator-only search returns the normal directory view',()=>{
 const entries=[{path:'src/components/Chat.tsx',kind:'file'},{path:'README.md',kind:'file'}];
 assert.deepEqual(model.directoryEntries(entries,'','---'),model.directoryEntries(entries,'',''));
});
