// 用途：验证教学场景按旁白ID绑定动作，拒绝缺失、错序及不完整输入。
// 运行：node --test tests/node/teaching_scenes.test.mjs。
// 依赖：Node.js；浏览器、音频和实际视频另做集成核验。
import test from 'node:test';import assert from 'node:assert/strict';
import {buildTeachingData,DEFAULT_CONTENT,BEAT_KEYS} from '../../examples/teaching-scenes/run.mjs';
const binding=Object.fromEntries(BEAT_KEYS.map((key,i)=>[key,'u'+i]));
function timing(){return {total:22.5,phrases:BEAT_KEYS.map((_,i)=>({id:'p'+i,start:i*2.5,end:(i+1)*2.5,text:'示例讲解'+i,subtitle_units:[{id:'u'+i,start:i*2.5,end:(i+1)*2.5,text:'示例讲解'+i}]}))};}
test('动作由指定旁白ID的真实时间决定，时长变化会移动后续动作',()=>{
 const a=timing(),first=buildTeachingData(a,binding,DEFAULT_CONTENT);assert.equal(first.beats.price.start,2.5);
 const b=timing();b.total+=1;for(let i=0;i<b.phrases.length;i++){const p=b.phrases[i],u=p.subtitle_units[0];if(i===0){p.end++;u.end++;}else{p.start++;p.end++;u.start++;u.end++;}}
 const changed=buildTeachingData(b,binding,DEFAULT_CONTENT);assert.equal(changed.beats.price.start,3.5);assert.equal(changed.beats.transfer.start,16);assert.equal(changed.duration,23.5);
 assert.deepEqual(changed.units.map(x=>x.id),first.units.map(x=>x.id));
});
test('缺少绑定、倒序旁白、重叠和额外未覆盖旁白不能准备',()=>{
 assert.throws(()=>buildTeachingData(timing(),{...binding,price:'missing'},DEFAULT_CONTENT),/旁白/);
 assert.throws(()=>buildTeachingData(timing(),{...binding,price:'u2',feedback:'u1'},DEFAULT_CONTENT),/顺序/);
 const overlap=timing();overlap.phrases[1].subtitle_units[0].start=1;assert.throws(()=>buildTeachingData(overlap,binding,DEFAULT_CONTENT),/重叠/);
 const extra=timing();extra.total=25;extra.phrases.push({id:'extra',start:22.5,end:25,text:'漏掉的讲解'});assert.throws(()=>buildTeachingData(extra,binding,DEFAULT_CONTENT),/覆盖/);
});
test('任务和对象名称有明确数量与长度边界',()=>{
 assert.throws(()=>buildTeachingData(timing(),binding,{...DEFAULT_CONTENT,roles:['一个']}),/三个/);
 assert.throws(()=>buildTeachingData(timing(),binding,{...DEFAULT_CONTENT,roles:['过长'.repeat(20),'二','三']}),/过长/);
 const data=buildTeachingData(timing(),binding,{...DEFAULT_CONTENT,roles:['成本调查','顾客需求','位置调查']});assert.equal(data.content.roles[0],'成本调查');
});
