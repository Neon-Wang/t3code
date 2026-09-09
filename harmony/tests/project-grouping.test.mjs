import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source=readFileSync(new URL('../app/entry/src/main/ets/model/ProjectGrouping.ets',import.meta.url),'utf8').replace("import { ProjectShell } from './Models';",'');
const {groupProjects}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const p=(id,root,relative='',extra={})=>({id,title:id,workspaceRoot:root+relative,repositoryIdentity:{canonicalKey:'github:team/repo',rootPath:root,name:'repo',displayName:'team/repo'},...extra});
test('repository and repository_path group matching clones while keeping monorepo paths separate',()=>{
 const projects=[p('a','/repo','/app'),p('b','/clone','/app'),p('c','/repo','/server')];
 assert.deepEqual(groupProjects(projects,'env','repository').map(g=>g.projectIds),[['a','b','c']]);
 const paths=groupProjects(projects,'env','repository_path');
 assert.deepEqual(paths.map(g=>g.projectIds),[['a','b'],['c']]);
 assert.equal(paths[0].label,'team/repo');assert.equal(paths[1].label,'c');
 assert.equal(groupProjects(projects,'env','separate').length,3);
});
test('same physical path keeps every task target but chooses the newest metadata and latest available identity',()=>{
 const projects=[p('a','/repo','',{updatedAt:'2026-09-01'}),p('b','/repo/','',{updatedAt:'2026-09-02',repositoryIdentity:null}),p('c','/clone')];
 const groups=groupProjects(projects,'env','repository');assert.equal(groups.length,1);
 assert.deepEqual(groups[0].projectIds,['a','b','c']);assert.equal(groups[0].representativeId,'b');
 assert.equal(groupProjects(projects,'env','separate').length,2);
});
test('unidentified projects never merge by name and stale roots use repository fallback',()=>{
 const a=p('a','/one','',{repositoryIdentity:null,title:'same'}),b=p('b','/two','',{repositoryIdentity:null,title:'same'});
 assert.equal(groupProjects([a,b],'env','repository').length,2);
 const stale=p('c','/repo');stale.workspaceRoot='/unrelated';
 assert.equal(groupProjects([stale,p('d','/clone')],'env','repository_path').length,1);
 assert.notEqual(groupProjects([a],'env','separate')[0].key,groupProjects([a],'other','separate')[0].key);
});
test('Windows paths compare case and separators while POSIX preserves case',()=>{
 assert.equal(groupProjects([p('a','C:\\Repo','\\app'),p('b','d:/clone','/APP')],'env','repository_path').length,1);
 assert.equal(groupProjects([p('a','/repo','/App'),p('b','/clone','/app')],'env','repository_path').length,2);
});
