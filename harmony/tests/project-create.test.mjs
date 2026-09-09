import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../app/entry/src/main/ets/model/ProjectCreation.ets',import.meta.url),'utf8');
const {projectPath,projectCreateCommand,readProjectCreateCommand}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('normalizes absolute environment paths without allowing implicit local paths',()=>{
 assert.equal(projectPath(' /home/me/a/../项目// '),'/home/me/项目');
 assert.equal(projectPath('/'),'/');
 for(const value of ['', 'relative', '../repo', 'C:\\repo', '/bad\0path'])assert.throws(()=>projectPath(value));
});
test('creates a named project and requests the server to create its directory',()=>{
 const command=projectCreateCommand('/home/me/项目/', 'command-1', 'project-1', '2026-09-07T00:00:00Z');
 assert.deepEqual(command,{type:'project.create',commandId:'command-1',projectId:'project-1',title:'项目',workspaceRoot:'/home/me/项目',createWorkspaceRootIfMissing:true,createdAt:'2026-09-07T00:00:00Z'});
 assert.deepEqual(readProjectCreateCommand(JSON.stringify(command)),command);
 assert.equal(readProjectCreateCommand(''),null);
});
test('rejects damaged pending commands instead of losing retry identity',()=>{
 for(const value of ['null','{}','{"type":"thread.create"}',JSON.stringify({type:'project.create',commandId:'c',projectId:'p',title:'repo',workspaceRoot:'relative',createWorkspaceRootIfMissing:true,createdAt:'invalid'})])assert.throws(()=>readProjectCreateCommand(value));
});

test('expands tilde only from the connected environment home',()=>{
 assert.equal(projectPath('~', '/home/remote'), '/home/remote');
 assert.equal(projectPath(' ~/项目/../repo/ ', '/home/remote'), '/home/remote/repo');
 assert.equal(projectPath('~/repo', '/'), '/repo');
 assert.equal(projectPath('/absolute/repo', '/home/remote'), '/absolute/repo');
 for(const path of ['~', '~/repo', '~other/repo'])assert.throws(()=>projectPath(path));
 assert.throws(()=>projectPath('~/repo', 'relative-home'));
});
