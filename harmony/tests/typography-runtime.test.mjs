import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const url=s=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(s)).toString('base64');
const read=p=>readFileSync(new URL('../app/entry/src/main/ets/'+p,import.meta.url),'utf8');
const metrics=url(read('model/TerminalMetrics.ets'));
const typography=url(read('model/Typography.ets').replace("'./TerminalMetrics'",JSON.stringify(metrics)));
let stored={baseFontSize:16,codeFontSize:null,terminalFontSize:11},hold=null,fail=false,failRead=false;
async function save(key,value){if(hold)await hold;if(fail)throw Error('save failed');stored={...stored,[key]:value};}
globalThis.__fontStore={async open(){return {async fontPreferences(){if(failRead)throw Error('read failed');return stored;},saveCodeWordBreak:v=>save('codeWordBreak',v),saveBaseFontSize:v=>save('baseFontSize',v),saveCodeFontSize:v=>save('codeFontSize',v),saveTerminalFontSize:v=>save('terminalFontSize',v)};}};
globalThis.AppStorage={values:new Map(),SetOrCreate(k,v){this.values.set(k,v);}};
const source=read('connection/TypographyRuntime.ets').replace("import common from '@ohos.app.ability.common';",'')
.replace("import { AppearanceStore } from './AppearanceStore';",'const AppearanceStore=globalThis.__fontStore;')
.replace("'../model/Typography'",JSON.stringify(typography)).replace('import { Typography,','import {');
const {TypographyRuntime:runtime}=await import(url(source));
test('base changes publish after persistence, preserving independent overrides and reset derivation',async()=>{
 await runtime.initialize({});assert.equal(AppStorage.values.get('textSizes').terminalFontSize,11);
 let release;hold=new Promise(r=>release=r);const pending=runtime.saveBase(22);
 await new Promise(r=>setImmediate(r));assert.equal(AppStorage.values.get('textSizes').baseFontSize,16);
 release();await pending;hold=null;
 assert.equal(AppStorage.values.get('textSizes').codeFontSize,17);assert.equal(AppStorage.values.get('textSizes').terminalFontSize,11);
 await runtime.saveCode(8);await runtime.saveTerminal(null);
 assert.equal(AppStorage.values.get('textSizes').codeFontSize,8);assert.equal(AppStorage.values.get('textSizes').terminalFontSize,14);
 await runtime.saveCode(null);assert.equal(AppStorage.values.get('textSizes').codeFontSize,17);
});
test('failed saves retain displayed fonts; failed reads can recover without replacing preferences',async()=>{
 fail=true;await assert.rejects(runtime.saveBase(11));fail=false;
 assert.equal(AppStorage.values.get('textSizes').baseFontSize,22);
 failRead=true;await runtime.initialize({});assert.match(AppStorage.values.get('fontError'),/读取失败/);
 assert.equal(stored.baseFontSize,22);failRead=false;await runtime.reload();
 assert.equal(AppStorage.values.get('textSizes').baseFontSize,22);assert.equal(AppStorage.values.get('fontError'),'');
});

test('word break changes only after a successful save and survives a runtime reload',async()=>{
 await runtime.reload();assert.equal(AppStorage.values.get('textSizes').codeWordBreak,false);
 let release;hold=new Promise(r=>release=r);const pending=runtime.saveWordBreak(true);
 await new Promise(r=>setImmediate(r));assert.equal(AppStorage.values.get('textSizes').codeWordBreak,false);
 release();await pending;hold=null;
 assert.equal(AppStorage.values.get('textSizes').codeWordBreak,true);
 fail=true;await assert.rejects(runtime.saveWordBreak(false));fail=false;
 assert.equal(AppStorage.values.get('textSizes').codeWordBreak,true);
 await runtime.initialize({});assert.equal(AppStorage.values.get('textSizes').codeWordBreak,true);
 await runtime.saveWordBreak(false);assert.equal(AppStorage.values.get('textSizes').baseFontSize,22);
});
