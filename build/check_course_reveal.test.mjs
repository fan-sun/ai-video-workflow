// 用途：验证首现检查能发现提前显示、倒退错误和无标注，不把未检查写成通过。
// 运行：node --test build/check_course_reveal.test.mjs
// 依赖：Node.js；用可控页面状态覆盖浏览器检查函数的失败分支。
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {inspectCourseReveals, checkCourseReveals} from './check_course_reveal.mjs';

function inspect({early=false, backward=false, entries=true, at='80'}={}) {
  let time=0, visitedEnd=false;
  const element={id:'expert',dataset:{revealAt:at}};
  return vm.runInNewContext(`(${inspectCourseReveals.toString()})()`,{
    window:{__timelines:{main:{seek(value){time=value;if(value>99)visitedEnd=true;}}}},
    document:{querySelector:()=>({dataset:{duration:'100'}}),querySelectorAll:()=>entries?[element]:[]},
    getComputedStyle:()=>({opacity:String(early || (backward && visitedEnd) || time>=80 ? 1 : 0)}),
  });
}
test('用实际片尾检查长幕的倒退状态',()=>{
  assert.equal(inspect().status,'passed');
  assert.equal(inspect().checks,3);
  assert.equal(inspect({backward:true}).failures[0].check,'倒退后提前显示');
});
test('提前可见和无效标注必须失败；没有标注不冒充检查通过',()=>{
  assert.equal(inspect({early:true}).status,'failed');
  assert.equal(inspect({at:'wrong'}).status,'failed');
  assert.equal(inspect({entries:false}).status,'not_applicable');
});

test('仅安装 HyperFrames 浏览器缓存也能执行首次可见检查', async (t)=>{
  const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'course-reveal-browser-'));
  const originalExists=fs.existsSync;
  const originalEnv={CHROME_PATH:process.env.CHROME_PATH,COURSE_COVER_CHROME:process.env.COURSE_COVER_CHROME};
  fs.writeFileSync(path.join(tempDir,'index.html'),`<!doctype html><html><body>
<main data-composition-id="main" data-duration="3">
<div id="point" data-reveal-at="1" data-reveal-duration="0.1" style="opacity:0">知识点</div></main>
<script>window.__timelines={main:{seek(t){document.getElementById('point').style.opacity=t>=1?'1':'0';}}};</script>
</body></html>`,{encoding:'utf8'});
  delete process.env.CHROME_PATH;
  delete process.env.COURSE_COVER_CHROME;
  t.mock.method(fs,'existsSync',(file)=>String(file).replaceAll('\\','/').includes('/Google/Chrome/')
    || ['/usr/bin/google-chrome','/usr/bin/chromium'].includes(file) ? false : originalExists(file));
  try {
    const report=await checkCourseReveals(tempDir);
    assert.equal(report.status,'passed');
    assert.equal(report.checks,3);
  } finally {
    t.mock.restoreAll();
    for (const [key,value] of Object.entries(originalEnv)) {
      if (value===undefined) delete process.env[key]; else process.env[key]=value;
    }
    fs.rmSync(tempDir,{recursive:true,force:true});
  }
});
