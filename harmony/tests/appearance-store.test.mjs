import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const moduleUrl=s=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(s)).toString('base64');
const metrics=moduleUrl(readFileSync(new URL('../app/entry/src/main/ets/model/TerminalMetrics.ets',import.meta.url),'utf8'));
const themes=moduleUrl(readFileSync(new URL('../app/entry/src/main/ets/model/ThemeSelection.ets',import.meta.url),'utf8'));
const typography=moduleUrl(readFileSync(new URL('../app/entry/src/main/ets/model/Typography.ets',import.meta.url),'utf8').replace("'./TerminalMetrics'",JSON.stringify(metrics)));
let cache=new Map(),disk=new Map(),fail=false,hold=null;
const api={async get(k,d){return cache.has(k)?cache.get(k):d;},async put(k,v){cache.set(k,v);},async delete(k){cache.delete(k);},async flush(){if(hold)await hold;if(fail)throw new Error('disk write failed');disk=new Map(cache);}};
globalThis.__appearancePreferences={async getPreferences(){return api;}};
const source=readFileSync(new URL('../app/entry/src/main/ets/connection/AppearanceStore.ets',import.meta.url),'utf8')
.replace("import preferences from '@ohos.data.preferences';",'const preferences=globalThis.__appearancePreferences;')
.replace("import common from '@ohos.app.ability.common';",'')
.replace("'../model/TerminalMetrics'",JSON.stringify(metrics))
.replace("'../model/ThemeSelection'",JSON.stringify(themes))
.replace("import { ThemeSelection,", "import {")
.replace("import { FontPreferences,", "import {")
.replace("'../model/Typography'",JSON.stringify(typography));
const {AppearanceStore}=await import(moduleUrl(source));
test('saved and reset terminal fonts survive a fresh preference cache',async()=>{
 const store=await AppearanceStore.open({});await store.saveTerminalFontSize(12);
 cache=new Map(disk);assert.equal(await (await AppearanceStore.open({})).terminalFontSize(),12);
 await store.saveTerminalFontSize(null);cache=new Map(disk);assert.equal(await store.terminalFontSize(),null);
});
test('failed persistence restores the previous cached value and a retry remains usable',async()=>{
 const store=await AppearanceStore.open({});await store.saveTerminalFontSize(11);
 fail=true;await assert.rejects(store.saveTerminalFontSize(14),/disk write failed/);fail=false;
 assert.equal(await (await AppearanceStore.open({})).terminalFontSize(),11);
 assert.equal(disk.get('terminalFontSize'),11);
 await store.saveTerminalFontSize(12);assert.equal(await store.terminalFontSize(),12);
 fail=true;await assert.rejects(store.saveTerminalFontSize(null),/disk write failed/);fail=false;
 assert.equal(await store.terminalFontSize(),12);
});
test('another page waits for the saving receipt before reading or replacing settings',async()=>{
 const first=await AppearanceStore.open({}),second=await AppearanceStore.open({});
 let release;hold=new Promise(resolve=>release=resolve);
 const saving=first.saveTerminalFontSize(13);let readDone=false;
 const reading=second.terminalFontSize().then(v=>{readDone=true;return v;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(readDone,false);
 release();await saving;hold=null;
 assert.equal(await reading,13);
 await second.saveTerminalFontSize(null);assert.equal(await first.terminalFontSize(),null);
});

test('the two theme choices and mode persist as one value and failed changes retain the previous selection',async()=>{
 const store=await AppearanceStore.open({});
 const selected={light:'grove',dark:'iris',mode:'system'};
 await store.saveThemeSelection(selected);cache=new Map(disk);
 assert.deepEqual(await (await AppearanceStore.open({})).themeSelection(),selected);
 fail=true;await assert.rejects(store.saveThemeSelection({light:'ocean',dark:'ember',mode:'dark'}),/disk write failed/);fail=false;
 assert.deepEqual(await store.themeSelection(),selected);
 await store.saveThemeSelection({light:'t3-code',dark:'t3-code',mode:'light'});
 assert.equal((await store.themeSelection()).mode,'light');
 assert.equal(await store.terminalFontSize(),null);
});

test('base and code font settings persist independently of the existing terminal override',async()=>{
 const store=await AppearanceStore.open({});await store.saveTerminalFontSize(11);
 await store.saveBaseFontSize(22);await store.saveCodeFontSize(18);cache=new Map(disk);
 assert.deepEqual(await store.fontPreferences(),{baseFontSize:22,codeFontSize:18,terminalFontSize:11,codeWordBreak:false});
 fail=true;await assert.rejects(store.saveCodeFontSize(8));fail=false;
 assert.equal((await store.fontPreferences()).codeFontSize,18);
 await store.saveCodeFontSize(null);await store.saveTerminalFontSize(null);
 assert.deepEqual(await store.fontPreferences(),{baseFontSize:22,codeFontSize:null,terminalFontSize:null,codeWordBreak:false});
 await store.saveBaseFontSize(16);cache=new Map(disk);
 assert.equal((await store.fontPreferences()).baseFontSize,16);
});

test('word break persists, rolls back failed writes, and does not alter font overrides',async()=>{
 const store=await AppearanceStore.open({});
 assert.equal((await store.fontPreferences()).codeWordBreak,false);
 await store.saveCodeWordBreak(true);cache=new Map(disk);
 assert.equal((await (await AppearanceStore.open({})).fontPreferences()).codeWordBreak,true);
 fail=true;await assert.rejects(store.saveCodeWordBreak(false));fail=false;
 assert.equal((await store.fontPreferences()).codeWordBreak,true);
 await store.saveBaseFontSize(20);assert.equal((await store.fontPreferences()).codeWordBreak,true);
 await store.saveCodeWordBreak(false);cache=new Map(disk);
 assert.equal((await store.fontPreferences()).codeWordBreak,false);
 assert.equal((await store.fontPreferences()).baseFontSize,20);
});

test('project grouping defaults to repository, persists and restores previous mode on failed save',async()=>{
 const store=await AppearanceStore.open({});assert.equal(await store.projectGroupingMode(),'repository');
 for(const mode of ['repository_path','separate','repository']){
  await store.saveProjectGroupingMode(mode);cache=new Map(disk);
  assert.equal(await (await AppearanceStore.open({})).projectGroupingMode(),mode);
 }
 fail=true;await assert.rejects(store.saveProjectGroupingMode('separate'));fail=false;
 assert.equal(await store.projectGroupingMode(),'repository');
 cache.set('projectGroupingMode','invalid');assert.equal(await store.projectGroupingMode(),'repository');
});
