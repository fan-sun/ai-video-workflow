// 用途：复现视觉证据缺失、过期和混用用户确认时的错误放行。
// 运行：node --test tests/node/course_visual_review.test.mjs
// 依赖：Node.js 内置测试框架；文件为隔离的临时测试素材。
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createCourseVideoPlan, verifyCourseVideoInputs } from "../../build/common/course_video.mjs";
import { checkCourseRelease } from "../../build/common/check_course_release.mjs";

function fixture(t) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-visual-review-"));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  const write = (file, value) => {
    const target = path.join(rootDir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof value === "string" ? value : JSON.stringify(value), { encoding: "utf8" });
  };
  const index = { episode: "ep07", slug: "fixture", topic: "测试", current_version: "v1",
    production_contract: "current", timeline_summary: "timeline.json", chapter_titles: ["一", "二", "三", "四"],
    visual_plan: "plan.md", review_output: "review.mp4", cover_output: "cover.png",
    acts: [1, 2, 3, 4].map(act => ({ act, script: "script" + act + ".json",
      audio: "audio" + act + ".wav", timings: "timings" + act + ".json",
      visual_source: "act" + act + ".html", subtitle_highlights: [], allowed_warnings: {} })) };
  write("timeline.json", { total_s: 40, acts: index.acts.map(({act}) => ({ act, start_s: (act-1)*10, end_s: act*10 })) });
  for (const act of index.acts) {
    write(act.visual_source, '<body><div id="opening" data-duration="2"></div></body>');
    write(act.timings, { total: 10, phrases: [{ id: "g01", start: 0, end: 9, gap: 1 }] });
    write(act.script, { text: "旁白" });
    write(act.audio, "audio");
  }
  write("plan.md", "独立编排：正文填槽、生成、解析；失败后带意见返回，改短真实摘要。");
  write("review.mp4", "review-video");
  write("cover.png", "cover");
  for (const file of COURSE_VISUAL_RENDER_INPUTS) write(file, "render input fixture");
  return { rootDir, index, write };
}

test("技术小样允许没有视觉复核，但进入制作前必须有独立编排", t => {
  const {rootDir,index} = fixture(t);
  assert.doesNotThrow(() => createCourseVideoPlan(index, "review", {rootDir, act: 2}));
  delete index.visual_plan;
  assert.throws(() => verifyCourseVideoInputs({index, rootDir, requiredInputs: [], partial: true,
    acts: [{act:2, source:path.join(rootDir,"act2.html")}]}), /visual_plan|独立编排/);
});

test("教学 publish 缺少助手视觉证据与用户确认时不能进入渲染", t => {
  const {rootDir,index} = fixture(t);
  assert.throws(() => createCourseVideoPlan(index,"publish",{rootDir}), /视觉复核/);
});

test("直接运行发布检查也不能绕过教学视觉门禁", t => {
  const {rootDir,index,write} = fixture(t);
  write("index.json", index);
  assert.throws(() => checkCourseRelease(path.join(rootDir,"index.json"),{rootDir}), /视觉复核/);
});

import { captureCourseVisualInputs, visualArtifact, inspectCourseVisualReview, assertCourseVisualReady,
  refreshCourseVisualStatus, COURSE_VISUAL_RENDER_INPUTS } from "../../build/common/check_course_visual_review.mjs";

function addEvidence(f) {
  const {index, rootDir, write} = f;
  write("clip.mp4","continuous clip");
  for (const name of ["before.png","during.png","after.png"]) write(name,name);
  const playback = duration => ({start_s:0,end_s:duration,method:"continuous_playback",
    playback_rate:1,result:"passed",observation:"完整观看：正文进入槽位，再以同一内容生成结果，无空白或文字遮挡。"});
  const evidence = { inputs:captureCourseVisualInputs(index,{rootDir}), media:visualArtifact(rootDir,index.review_output),
    acts:index.acts.map(act => {
      const mediaPath = "pipeline/build/course_ep07_act" + act.act + "_v1_review/act" + act.act + "_final_standard.mp4";
      write(mediaPath,"act video " + act.act);
      return {act:act.act,media:visualArtifact(rootDir,mediaPath),full_review:playback(10),
        segments:[{start_s:0,end_s:9,narration_ids:["g01"],plan_ref:"编排第一节",
          expected:"正文填入模板，再生成三条摘要",observed_before:"模板正文槽为空",
          observed_change:"正文逐段进入槽位，随后同样内容成为三条摘要",observed_after:"三条内容独立排列",
          fix_and_recheck:"初次检查未发现失败",method:"continuous_playback",playback_rate:1,result:"passed",
          clip:visualArtifact(rootDir,"clip.mp4"),
          frames:["before","during","after"].map((phase,i)=>({...visualArtifact(rootDir,phase+".png"),phase,time_s:i*4}))}]};
    }), full_review:playback(40) };
  index.visual_review = "visual-review.json";
  index.review_approval = {confirmed:true,version:"v1",sha256:visualArtifact(rootDir,index.review_output).sha256};
  const save = () => write(index.visual_review,evidence);
  save();
  return {evidence,save};
}

test("完整证据能通过；视觉复核与用户确认分别检查", t => {
  const f=fixture(t);addEvidence(f);
  assert.equal(inspectCourseVisualReview(f.index,{rootDir:f.rootDir}).status,"passed");
  assert.doesNotThrow(()=>assertCourseVisualReady(f.index,{rootDir:f.rootDir}));
  f.index.review_approval=null;
  assert.equal(inspectCourseVisualReview(f.index,{rootDir:f.rootDir}).status,"passed");
  assert.throws(()=>assertCourseVisualReady(f.index,{rootDir:f.rootDir}),/用户确认/);
});

for (const changed of ["plan.md","act2.html","audio2.wav","timings2.json","script2.json","timeline.json","review.mp4"]) {
  test("修改 " + changed + " 后旧证据失效，手写 passed 不能放行", t => {
    const f=fixture(t);addEvidence(f);
    f.write(changed,"changed");
    f.index.visual_review_status={status:"passed"};
    assert.equal(inspectCourseVisualReview(f.index,{rootDir:f.rootDir}).status,"stale");
    assert.throws(()=>assertCourseVisualReady(f.index,{rootDir:f.rootDir}),/视觉复核/);
    refreshCourseVisualStatus(f.index,{rootDir:f.rootDir});
    assert.equal(f.index.review_approval,null);
    assert.ok(f.index.acts.every(act=>act.visual_status==="pending_visual_review"));
  });
}

for (const type of ["missing_phrase","missing_motion","missing_frame","failed","incomplete_playback","missing_playback_end","unknown_id","wrong_version","configuration","user_sha","act_media"]) {
  test("拒绝复核缺陷：" + type, t => {
    const f=fixture(t);const {evidence,save}=addEvidence(f);
    const segment=evidence.acts[0].segments[0];
    if(type==="missing_phrase") segment.narration_ids=[];
    if(type==="unknown_id") segment.narration_ids=["g99"];
    if(type==="missing_motion") segment.observed_change="";
    if(type==="missing_frame") segment.frames.pop();
    if(type==="failed") segment.result="failed";
    if(type==="incomplete_playback") evidence.full_review.method="screenshots";
    if(type==="missing_playback_end") delete evidence.full_review.end_s;
    if(type==="wrong_version") f.index.current_version="v2";
    if(type==="configuration") f.index.acts[0].subtitle_highlights=["新重点"];
    if(type==="user_sha") f.index.review_approval.sha256="old";
    if(type==="act_media") evidence.acts[0].media=visualArtifact(f.rootDir,"review.mp4");
    save();
    assert.throws(()=>assertCourseVisualReady(f.index,{rootDir:f.rootDir}),/视觉复核|用户确认/);
  });
}

test("技术输出登记只记录解码事实，不能沿用手写视觉通过或用户确认", async t => {
  const f=fixture(t);
  const {executeCourseStep}=await import("../../build/common/course_video.mjs");
  f.index.__indexPath="index.json";
  f.index.review_approval={confirmed:true,version:"v1",sha256:"old"};
  f.index.acts.forEach(act=>{act.visual_status="sampled_visual_passed";});
  f.write("index.json",f.index);
  f.write("course/episodes.json",{episodes:[{ep:7,slug:f.index.slug,topic:f.index.topic}]});
  const plan={index:f.index,rootDir:f.rootDir,mode:"review",finalOutput:path.join(f.rootDir,f.index.review_output)};
  executeCourseStep({type:"record-output"},plan,{spawnSyncImpl:()=>({status:0,stdout:JSON.stringify({format:{duration:"40"}})})});
  const stored=JSON.parse(fs.readFileSync(path.join(f.rootDir,"index.json"),{encoding:"utf8"}));
  assert.equal(stored.review_technical_status.status,"generated_and_decoded");
  assert.equal(stored.visual_review_status.status,"pending");
  assert.equal(stored.review_approval,null);
  assert.ok(stored.acts.every(act=>act.visual_status==="pending_visual_review"));
});

test("六幕当前教学同样要求视觉证据；技术示例不冒充用户确认", t => {
  const {index,rootDir}=fixture(t);
  index.acts.push({...index.acts[0],act:5},{...index.acts[0],act:6});
  assert.throws(()=>assertCourseVisualReady(index,{rootDir}),/视觉复核/);
  index.example=true;
  assert.doesNotThrow(()=>assertCourseVisualReady(index,{rootDir}));
  assert.equal(inspectCourseVisualReview(index,{rootDir}).status,"not_required");
});

test("构建工具改变后，旧视觉复核不能授权用新工具发布", t => {
  const f=fixture(t);
  const toolFile="build/common/inject_course_subs.py";
  f.write(toolFile,"original subtitle injection");
  addEvidence(f);
  f.write(toolFile,"different subtitle injection");
  assert.equal(inspectCourseVisualReview(f.index,{rootDir:f.rootDir}).status,"stale");
});

test("撤销旧状态时同时撤销旧助手标签，不让互相矛盾的字段继续显示通过", t => {
  const f=fixture(t);
  f.index.review_visual_check={status:"sampled_visual_passed"};
  f.index.acts[0].assistant_visual_review={status:"sampled_visual_passed",report:"old.json"};
  refreshCourseVisualStatus(f.index,{rootDir:f.rootDir});
  assert.equal(f.index.review_visual_check.status,"pending_visual_review");
  assert.equal(f.index.acts[0].assistant_visual_review.status,"pending_visual_review");
  assert.equal(f.index.acts[0].prior_assistant_visual_review.status,"sampled_visual_passed");
});

test("助手已复核新视频时，也不能沿用用户对旧视频的确认", t => {
  const f=fixture(t);addEvidence(f);
  f.index.review_approval.sha256="old-video";
  refreshCourseVisualStatus(f.index,{rootDir:f.rootDir});
  assert.equal(f.index.visual_review_status.status,"passed");
  assert.equal(f.index.review_approval,null);
});

test("缺少助手复核记录时仍保留用户对当前视频的有效确认", t => {
  const f=fixture(t);
  f.index.review_approval={confirmed:true,version:"v1",sha256:visualArtifact(f.rootDir,f.index.review_output).sha256};
  refreshCourseVisualStatus(f.index,{rootDir:f.rootDir});
  assert.equal(f.index.review_approval?.confirmed,true);
  assert.equal(f.index.review_visual_check.user_review,"confirmed");
  assert.equal(f.index.acts[0].assistant_visual_review.status,"pending_visual_review");
  assert.throws(()=>assertCourseVisualReady(f.index,{rootDir:f.rootDir}),/视觉复核/);
});

function acceptVisualQuality(f) {
  f.index.review_approval={confirmed:true,reviewer:"user",version:f.index.current_version,
    sha256:visualArtifact(f.rootDir,f.index.review_output).sha256,visual_quality_accepted:true,
    source:"用户明确说明：没问题，进行下一步说明我已经审查通过了；知悉助手连续审看缺项后授权继续发布包制作。",
    inputs:captureCourseVisualInputs(f.index,{rootDir:f.rootDir})};
}

test("用户明确接受当前整片视觉质量后可继续，助手未做的检查不能改成通过", t => {
  const f=fixture(t);acceptVisualQuality(f);
  assert.equal(inspectCourseVisualReview(f.index,{rootDir:f.rootDir}).status,"accepted_by_user");
  assert.doesNotThrow(()=>assertCourseVisualReady(f.index,{rootDir:f.rootDir}));
  refreshCourseVisualStatus(f.index,{rootDir:f.rootDir});
  assert.equal(f.index.review_approval.confirmed,true);
  assert.equal(f.index.review_visual_check.user_review,"confirmed");
  assert.equal(f.index.review_visual_check.full_normal_speed_review,"not_recorded_by_assistant");
  assert.ok(f.index.acts.every(act=>act.visual_status==="accepted_by_user"
    && act.assistant_visual_review.status==="pending_visual_review"));
});

for(const changed of ["plan.md","act2.html","audio2.wav","review.mp4"]) {
  test("用户视觉接受只适用于已确认输入，修改 "+changed+" 后阻断发布",t=>{
    const f=fixture(t);acceptVisualQuality(f);f.write(changed,"changed");
    assert.throws(()=>assertCourseVisualReady(f.index,{rootDir:f.rootDir}),/视觉复核/);
  });
}

for(const missing of ["inputs","source","reviewer","sha256","confirmed"]) {
  test("用户视觉接受缺少 "+missing+" 不能代替实际确认",t=>{
    const f=fixture(t);acceptVisualQuality(f);delete f.index.review_approval[missing];
    assert.throws(()=>assertCourseVisualReady(f.index,{rootDir:f.rootDir}),/视觉复核|用户确认/);
  });
}

test("用户最终接受仍不能覆盖已存在的助手失败证据",t=>{
  const f=fixture(t);const {evidence,save}=addEvidence(f);acceptVisualQuality(f);
  evidence.acts[0].segments[0].result="failed";save();
  assert.throws(()=>assertCourseVisualReady(f.index,{rootDir:f.rootDir}),/视觉复核/);
});

test("用户最终接受绑定构建配置，配置变更后失效",t=>{
  const f=fixture(t);acceptVisualQuality(f);
  f.index.acts[0].subtitle_highlights=[{unit_id:"g01.u01",text:"新重点"}];
  assert.equal(inspectCourseVisualReview(f.index,{rootDir:f.rootDir}).status,"stale");
});

test("用户视觉接受标记必须是布尔true，字符串false不能放行",t=>{
  const f=fixture(t);acceptVisualQuality(f);f.index.review_approval.visual_quality_accepted="false";
  assert.throws(()=>assertCourseVisualReady(f.index,{rootDir:f.rootDir}),/视觉复核/);
});

test("助手证据通过后仍须布尔true用户确认，其他值不得放行或登记已确认",t=>{
  const f=fixture(t);addEvidence(f);
  const approval={...f.index.review_approval};
  for(const confirmed of [false,"false","true",1]){
    f.index.review_approval={...approval,confirmed};
    assert.throws(()=>assertCourseVisualReady(f.index,{rootDir:f.rootDir}),/用户确认/);
    refreshCourseVisualStatus(f.index,{rootDir:f.rootDir});
    assert.equal(f.index.review_visual_check.user_review,"pending");
    assert.equal(f.index.review_approval,null);
  }
  f.index.review_approval=approval;
  assert.doesNotThrow(()=>assertCourseVisualReady(f.index,{rootDir:f.rootDir}));
  refreshCourseVisualStatus(f.index,{rootDir:f.rootDir});
  assert.equal(f.index.review_visual_check.user_review,"confirmed");
});
