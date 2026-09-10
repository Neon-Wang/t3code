import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const themes=JSON.parse(readFileSync(new URL('../app/entry/src/main/resources/rawfile/theme-palettes.json',import.meta.url),'utf8'));
test('every iOS built-in theme supplies both appearances',()=>{
 assert.equal(themes.length,12);
 for(const id of ['t3-code','t3-chat','grove','ocean','ember','iris']){
  const pair=themes.filter(t=>t.id===id);assert.deepEqual(pair.map(t=>t.scheme),['light','dark']);
  assert.notEqual(pair[0].colors['--color-screen'],pair[1].colors['--color-screen']);
 }
});
test('all native UI and terminal colors are resolved without CSS-only syntax',()=>{
 const native=/^(#[\da-f]{6,8}|rgba?\([\d.,\s]+\)|transparent)$/i;
 for(const theme of themes){
  for(const key of ['--color-screen','--color-foreground','--color-card','--color-input','--color-border','--color-md-link','--color-md-code-text'])assert.ok(theme.colors[key],`${theme.id}: ${key}`);
  for(const [key,value] of Object.entries(theme.colors))assert.match(value,native,`${theme.id}: ${key}`);
  assert.equal(theme.terminal.palette.length,16);
  for(const color of [theme.terminal.background,theme.terminal.foreground,theme.terminal.cursorForeground,...theme.terminal.palette])assert.match(color,/^#[\da-f]{6}$/i);
 }
});
test('native diff palettes flatten alpha and preserve iOS addition/deletion semantics',()=>{
 for(const theme of themes){
  assert.ok(theme.diff,`${theme.id}-${theme.scheme} native diff palette missing`);
  assert.equal(Object.keys(theme.diff).length,13);
  for(const color of Object.values(theme.diff))assert.match(color,/^#[\da-f]{6}$/i);
  assert.equal(theme.diff.headerBackground,theme.diff.background);
  assert.equal(theme.diff.deleteBar,theme.terminal.palette[1]);
  assert.equal(theme.diff.addBackground,theme.scheme==='dark'?'#0d2f28':'#e5f8f5');
 }
 const light=themes.find(t=>t.id==='t3-code'&&t.scheme==='light').diff;
 assert.equal(light.background,'#f2f2f7');assert.equal(light.border,'#dfdfe3');
});
