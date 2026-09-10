#!/usr/bin/env node
// Reuse the mobile client's palette conversion; ArkUI cannot interpret OKLCH.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=path=>readFileSync(resolve(root,path),'utf8');
function moduleUrl(path,imports={}){
 let source=stripTypeScriptTypes(read(path));
 for(const [name,url] of Object.entries(imports)){
  source=source.replaceAll(JSON.stringify(name),JSON.stringify(url));
 }
 return 'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
}
const palettesUrl=moduleUrl('packages/shared/src/themePalettes.ts');
const previewUrl=moduleUrl('packages/shared/src/themePreview.ts');
const mobileUrl=moduleUrl('apps/mobile/src/lib/mobileTheme.ts',{
 '@t3tools/shared/themePalettes':palettesUrl,
 '@t3tools/shared/themePreview':previewUrl,
});
const terminalUrl=moduleUrl('apps/mobile/src/features/terminal/terminalTheme.ts',{
 '@t3tools/shared/themePalettes':palettesUrl,
 '../../lib/mobileTheme':mobileUrl,
});
const mobile=await import(mobileUrl);
const {getMobileTerminalTheme}=await import(terminalUrl);
const defaults=JSON.parse(read('apps/mobile/generated-uniwind-default-theme-variables.json'));
// Load only the pure theme declarations; the rest of the adapter depends on
// review parsing and Effect, which are not part of palette generation.
const diffSource=read('apps/mobile/src/features/review/nativeReviewDiffAdapter.ts');
function diffSection(start,end){
 const from=diffSource.indexOf(start),to=diffSource.indexOf(end,from);
 if(from<0||to<0)throw new Error('Native diff theme declarations moved; update the palette source boundaries');
 return diffSource.slice(from,to);
}
const diffThemeModule=[
 `import {getMobileTerminalTheme} from ${JSON.stringify(terminalUrl)};`,
 diffSection('const NATIVE_HEX_COLOR =','export const NATIVE_REVIEW_DIFF_ROW_HEIGHT'),
 diffSection('function opaqueNativeHexColor(','export function createNativeReviewDiffStyle('),
 diffSection('export function createNativeReviewDiffTheme(','function mapChangeType('),
].join('\n');
const {createNativeReviewDiffTheme}=await import('data:text/javascript;base64,'+
 Buffer.from(stripTypeScriptTypes(diffThemeModule)).toString('base64'));
const themes=[];
for(const {id,label} of mobile.MOBILE_THEME_OPTIONS){
 for(const scheme of ['light','dark']){
  const colors=id==='t3-code'?defaults[scheme]:mobile.getMobileThemeVariables(id,scheme);
  themes.push({id,label,scheme,colors,terminal:getMobileTerminalTheme(id,scheme),diff:createNativeReviewDiffTheme(scheme,id,colors)});
 }
}
const output=resolve(root,'harmony/app/entry/src/main/resources/rawfile/theme-palettes.json');
const content=JSON.stringify(themes,null,2)+'\n';
if(process.argv.includes('--check')){
 if(readFileSync(output,'utf8')!==content)throw new Error('Harmony theme palettes differ from the mobile source; run harmony/scripts/sync-theme-palettes.mjs');
 console.log('Harmony palettes match all 12 mobile theme appearances');
}else{
 mkdirSync(dirname(output),{recursive:true});writeFileSync(output,content);
 console.log('Wrote all 12 mobile theme appearances for Harmony');
}
