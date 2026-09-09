import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
const path=new URL('../app/entry/src/main/ets/model/ModelOptions.ets',import.meta.url);
const source=readFileSync(path,'utf8').replace(/^import .*;$/gm,'');
const m=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const descriptor={id:'reasoning',type:'select',label:'Thinking',currentValue:'xhigh',options:[{id:'low',label:'Low'},{id:'xhigh',label:'Extra high',isDefault:true},{id:'ultrathink',label:'Ultra'},{id:'ultracode',label:'Code'}],promptInjectedValues:['ultrathink']};
const current={instanceId:'omp',model:'cursor/default',options:[{id:'fast',value:false},{id:'reasoning',value:'xhigh'}]};
test('select option replaces only its own canonical selection without mutating source',()=>{
 const changed=m.withModelOption(current,descriptor,'low');assert.deepEqual(changed,{...current,options:[{id:'fast',value:false},{id:'reasoning',value:'low'}]});assert.equal(current.options[1].value,'xhigh');
});
test('reset removes only explicit selection and resolves provider default',()=>{
 const changed=m.withModelOption(current,descriptor,null);assert.deepEqual(changed.options,[{id:'fast',value:false}]);assert.equal(m.modelOptionValue(changed,descriptor),'xhigh');
});
test('unsupported values and prompt-injected workflows cannot be selected',()=>{
 for(const v of ['missing','ultrathink','ultracode',true])assert.equal(m.withModelOption(current,descriptor,v),null);
 assert.deepEqual(m.modelOptionChoices(descriptor).map(c=>c.id),['low','xhigh']);
});
test('boolean false remains explicit and unknown stored selection remains visible',()=>{
 const toggle={id:'fast',type:'boolean',label:'Fast',currentValue:true};assert.equal(m.modelOptionValue(current,toggle),false);
 assert.equal(m.withModelOption(current,toggle,'false'),null);assert.equal(m.withModelOption(current,toggle,true).options.at(-1).value,true);
 assert.equal(m.modelOptionValue({...current,options:[{id:'reasoning',value:'external-value'}]},descriptor),'external-value');
});
