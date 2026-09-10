import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../app/entry/src/main/ets/model/ThemeSelection.ets',import.meta.url),'utf8');
const {readThemeSelection,normalizeThemeSelection,resolveThemeKey}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('light and dark selections remain independent while following the system',()=>{
 const selection={light:'grove',dark:'iris',mode:'system'};
 assert.equal(resolveThemeKey(selection,false),'grove-light');
 assert.equal(resolveThemeKey(selection,true),'iris-dark');
 assert.equal(resolveThemeKey({...selection,mode:'light'},true),'grove-light');
 assert.equal(resolveThemeKey({...selection,mode:'dark'},false),'iris-dark');
 assert.deepEqual(readThemeSelection(JSON.stringify(selection)),selection);
});
test('absent, malformed and unsupported stored selections fall back safely',()=>{
 const defaults={light:'t3-code',dark:'t3-code',mode:'system'};
 for(const input of ['', 'broken', 'null','[]','42'])assert.deepEqual(readThemeSelection(input),defaults);
 assert.deepEqual(normalizeThemeSelection({light:'unknown',dark:'ocean',mode:'bad'}),{...defaults,dark:'ocean'});
});
test('every selectable id and resolved appearance has generated native palette data',()=>{
 const palettes=JSON.parse(readFileSync(new URL('../app/entry/src/main/resources/rawfile/theme-palettes.json',import.meta.url),'utf8'));
 for(const id of ['t3-code','t3-chat','grove','ocean','ember','iris'])for(const dark of [false,true]){
  const key=resolveThemeKey({light:id,dark:id,mode:'system'},dark);
  assert.ok(palettes.some(p=>`${p.id}-${p.scheme}`===key));
 }
});
