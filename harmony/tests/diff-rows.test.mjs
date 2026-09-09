import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source=readFileSync(new URL('../app/entry/src/main/ets/model/DiffRows.ets',import.meta.url),'utf8');
const {parseDiffRows}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('maps unified diff to native rows with correct line numbers and change types',()=>{
 const rows=parseDiffRows('diff --git a/foo.ts b/foo.ts\n--- a/foo.ts\n+++ b/foo.ts\n@@ -5,2 +5,3 @@\n context\n-old\n+new\n+more\n');
 assert.equal(rows[0].filePath,'foo.ts');
 assert.equal(rows[0].additions,2);assert.equal(rows[0].deletions,1);
 const lines=rows.filter(r=>r.kind==='line');
 assert.deepEqual(lines.map(r=>[r.change,r.oldLineNumber,r.newLineNumber]),[['context',5,5],['delete',6,undefined],['add',undefined,6],['add',undefined,7]]);
 assert.equal(lines.at(-1).content,'more');
 assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
});
test('retains deleted file paths and handles an empty diff',()=>{
 assert.deepEqual(parseDiffRows(''),[]);
 const rows=parseDiffRows('diff --git a/old.txt b/old.txt\ndeleted file mode 100644\n--- a/old.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-gone\n');
 assert.equal(rows[0].filePath,'old.txt');assert.equal(rows[0].changeType,'deleted');
});
test('binary and empty-file changes retain names without hunk headers',()=>{
 const rows=parseDiffRows('diff --git a/empty.txt b/empty.txt\nnew file mode 100644\nindex 0000000..e69de29\ndiff --git a/image.bin b/image.bin\nBinary files a/image.bin and b/image.bin differ\n');
 assert.deepEqual(rows.filter(r=>r.kind==='file').map(r=>r.filePath),['empty.txt','image.bin']);
 assert.equal(rows.at(-1).kind,'notice');
});
test('decodes Git octal UTF-8 paths and preserves literal directory prefixes on rename',()=>{
 const rows=parseDiffRows('diff --git "a/\\344\\270\\255.txt" "b/\\344\\270\\255.txt"\n--- "a/\\344\\270\\255.txt"\n+++ "b/\\344\\270\\255.txt"\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/old b/b/new name\nsimilarity index 100%\nrename from old\nrename to b/new name\n');
 assert.deepEqual(rows.filter(r=>r.kind==='file').map(r=>r.filePath),['中.txt','b/new name']);
 assert.equal(rows.filter(r=>r.kind==='file')[1].changeType,'renamed');
});
