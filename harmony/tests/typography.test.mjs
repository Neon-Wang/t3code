import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const url=s=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(s)).toString('base64');
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const terminal=url(read('../app/entry/src/main/ets/model/TerminalMetrics.ets'));
const source=read('../app/entry/src/main/ets/model/Typography.ets').replace("'./TerminalMetrics'",JSON.stringify(terminal));
const native=await import(url(source));
const typography=url(read('../../apps/mobile/src/lib/typography.ts'));
const terminalPreferences=url(read('../../apps/mobile/src/features/terminal/terminalPreferences.ts'));
const mobile=await import(url(read('../../apps/mobile/src/lib/appearancePreferences.ts').replace('"./typography"',JSON.stringify(typography)).replace('"../features/terminal/terminalPreferences"',JSON.stringify(terminalPreferences))));
test('automatic font derivation matches iOS across the complete base-size range',()=>{
 for(let base=11;base<=22;base++){
  const expected=mobile.resolveAppearance(mobile.resolveAppearancePreferences({baseFontSize:base}));
  assert.deepEqual(native.resolveTypography(base,null,null),expected);
  assert.deepEqual(native.markdownMetrics(base),mobile.resolveMarkdownFontSizes(base));
 }
});
test('custom code and terminal sizes stay independent, and reset resumes base-size derivation',()=>{
 for(const base of [11,16,22])for(const code of [8,12,18])for(const terminal of [6,10.5,14]){
  const actual=native.resolveTypography(base,code,terminal);
  assert.equal(actual.codeFontSize,code);assert.equal(actual.terminalFontSize,terminal);
  assert.equal(actual.isCodeFontSizeCustom,true);assert.equal(actual.isTerminalFontSizeCustom,true);
 }
 assert.equal(native.resolveTypography(22,null,null).codeFontSize,17);
 assert.equal(native.resolveTypography(22,null,null).terminalFontSize,14);
});
test('code geometry and input normalization match iOS boundaries',()=>{
 for(const value of [NaN,Infinity,-100,0,8,8.5,11,12,16,18,100]){
  assert.equal(native.normalizeBaseFontSize(value),mobile.normalizeBaseFontSize(value));
  assert.equal(native.normalizeCodeFontSize(value),mobile.normalizeCodeFontSize(value));
  assert.deepEqual(native.codeMetrics(value),mobile.resolveMobileCodeSurface(value));
 }
});

test('word break follows the iOS preference independently of font sizes',()=>{
 for(const codeWordBreak of [true,false]){
  const expected=mobile.resolveAppearance(mobile.resolveAppearancePreferences({baseFontSize:22,codeWordBreak}));
  assert.deepEqual(native.resolveTypography(22,null,null,codeWordBreak),expected);
 }
});
