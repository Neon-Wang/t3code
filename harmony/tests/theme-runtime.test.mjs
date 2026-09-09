import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const url=s=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(s)).toString('base64');
const read=p=>readFileSync(new URL('../app/entry/src/main/ets/'+p,import.meta.url),'utf8');
const selection=url(read('model/ThemeSelection.ets'));
let failRead=false;
let saved={light:'grove',dark:'iris',mode:'system'},fail=false,release=null;
const store={async themeSelection(){if(failRead)throw Error("read failed");return saved;},async saveThemeSelection(value){if(release)await release;if(fail)throw Error('save failed');saved=value;}};
globalThis.__themeStore={async open(){return store;}};
globalThis.AppStorage={values:new Map(),SetOrCreate(k,v){this.values.set(k,v);}};
const palettes=JSON.parse(readFileSync(new URL('../app/entry/src/main/resources/rawfile/theme-palettes.json',import.meta.url)));
let nativeMode;
const context={config:{colorMode:1},resourceManager:{getRawFileContentSync(){return new TextEncoder().encode(JSON.stringify(palettes));}},getApplicationContext(){return {setColorMode(v){nativeMode=v;}};}};
const source=read('connection/ThemeRuntime.ets')
.replace("import window from '@ohos.window';",'')
.replace("import common from '@ohos.app.ability.common';",'')
.replace("import util from '@ohos.util';",'const util={TextDecoder:{create(){return {decodeToString(v){return new TextDecoder().decode(v);}};}}};')
.replace("import ConfigurationConstant from '@ohos.app.ability.ConfigurationConstant';",'const ConfigurationConstant={ColorMode:{COLOR_MODE_DARK:0,COLOR_MODE_LIGHT:1,COLOR_MODE_NOT_SET:-1}};')
.replace("import { AppearanceStore } from './AppearanceStore';",'const AppearanceStore=globalThis.__themeStore;')
.replace("import { ThemeSelection,",'import {')
.replace("'../model/ThemeSelection'",JSON.stringify(selection));
const {ThemeRuntime}=await import(url(source));
test('cold startup loads the saved palette; configuration changes preserve independent choices',async()=>{
 await ThemeRuntime.initialize(context);
 assert.equal(AppStorage.values.get('themeKey'),'grove-light');assert.equal(nativeMode,-1);
 assert.equal(ThemeRuntime.color('grove-light','screen'),palettes.find(p=>p.id==='grove'&&p.scheme==='light').colors['--color-screen']);
 ThemeRuntime.configurationChanged(0);assert.equal(AppStorage.values.get('themeKey'),'iris-dark');
 ThemeRuntime.configurationChanged(undefined);assert.equal(AppStorage.values.get('themeKey'),'iris-dark');
});
test('saving publishes only after persistence and a failed change keeps the visible theme',async()=>{
 let finish;release=new Promise(r=>finish=r);
 const saving=ThemeRuntime.save({light:'ocean',dark:'ember',mode:'light'});
 await new Promise(r=>setImmediate(r));assert.equal(AppStorage.values.get('themeKey'),'iris-dark');
 finish();await saving;release=null;
 assert.equal(AppStorage.values.get('themeKey'),'ocean-light');assert.equal(nativeMode,1);
 ThemeRuntime.configurationChanged(0);assert.equal(AppStorage.values.get('themeKey'),'ocean-light');
 fail=true;await assert.rejects(ThemeRuntime.save({light:'t3-code',dark:'t3-code',mode:'dark'}));fail=false;
 assert.equal(AppStorage.values.get('themeKey'),'ocean-light');assert.equal(nativeMode,1);
 await ThemeRuntime.initialize(context);assert.equal(AppStorage.values.get('themeKey'),'ocean-light');
});

test('a failed startup read can be retried without writing over the saved selection',async()=>{
 failRead=true;await ThemeRuntime.initialize(context);
 assert.match(AppStorage.values.get('themeError'),/读取失败/);
 failRead=false;saved={light:'ember',dark:'ocean',mode:'light'};
 assert.deepEqual(await ThemeRuntime.reload(),saved);
 assert.equal(AppStorage.values.get('themeKey'),'ember-light');
 assert.equal(AppStorage.values.get('themeError'),'');
});

test('window background and system bars follow the saved palette on startup and theme changes',async()=>{
 const backgrounds=[],bars=[];
 const nativeWindow={setWindowBackgroundColor:v=>backgrounds.push(v),setWindowSystemBarProperties:async v=>bars.push(v)};
 await ThemeRuntime.attachWindow(nativeWindow);
 assert.equal(backgrounds.at(-1),ThemeRuntime.color(AppStorage.values.get('themeKey'),'screen'));
 assert.equal(bars.at(-1).statusBarColor,'#00000000');
 assert.equal(bars.at(-1).navigationBarColor,'#00000000');
 await ThemeRuntime.save({light:'t3-code',dark:'t3-code',mode:'dark'});await ThemeRuntime.syncWindow();
 assert.equal(backgrounds.at(-1),ThemeRuntime.color('t3-code-dark','screen'));
 assert.equal(bars.at(-1).statusBarContentColor,'#FFFFFFFF');
 await ThemeRuntime.save({light:'t3-code',dark:'t3-code',mode:'light'});await ThemeRuntime.syncWindow();
 assert.equal(bars.at(-1).statusBarContentColor,'#FF191919');
 ThemeRuntime.detachWindow();
});
test('a failed system-bar update does not prevent the next theme from applying',async()=>{
 let fail=true;const backgrounds=[];
 const nativeWindow={setWindowBackgroundColor:v=>backgrounds.push(v),setWindowSystemBarProperties:async()=>{if(fail)throw Error('window update failed')}};
 await ThemeRuntime.attachWindow(nativeWindow);assert.match(AppStorage.values.get('windowError'),/系统栏/);
 fail=false;await ThemeRuntime.syncWindow();assert.equal(AppStorage.values.get('windowError'),'');
 ThemeRuntime.detachWindow();const count=backgrounds.length;await ThemeRuntime.syncWindow();assert.equal(backgrounds.length,count);
});
