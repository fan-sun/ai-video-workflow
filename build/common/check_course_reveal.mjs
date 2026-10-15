// 用途：在完整渲染前检查 data-reveal-at 元素入场前、入场后与倒退后的状态。
// 运行：node build/common/check_course_reveal.mjs 构建目录；可用 PUPPETEER_ROOT、CHROME_PATH 指定依赖。
// 依赖：Node.js、HyperFrames 已安装的 puppeteer-core、Chrome；无标注时明确记录未覆盖。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveChromeExecutable } from './check_course_cover.mjs';

export function inspectCourseReveals() {
  const timeline = window.__timelines?.main;
  if (!timeline) throw new Error('缺少 main 时间轴');
  const entries = [...document.querySelectorAll('[data-reveal-at]')];
  const failures = [];
  let checks = 0;
  const duration = Number(document.querySelector('[data-composition-id]')?.dataset.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('根合成时长无效');
  for (const el of entries) {
    const time = Number(el.dataset.revealAt);
    const label = el.id || el.outerHTML.slice(0, 100);
    if (!el.dataset.revealAt.trim() || !Number.isFinite(time) || time < 0 || time >= duration) {
      failures.push({element:label, check:'首次可见时间无效', time:el.dataset.revealAt});
      continue;
    }
    const before = Math.max(0, time - 1 / 30);
    const opacity = () => Number(getComputedStyle(el).opacity);
    if (time > 0) {
      timeline.seek(before, false);
      checks += 1;
      if (opacity() > .001) failures.push({element:label, check:'入场前已可见', time:before});
    }
    const after = Math.min(duration - .001, time + Number(el.dataset.revealDuration || .9));
    if (!Number.isFinite(after) || after <= time) throw new Error(`${label} 入场完成时间无效`);
    timeline.seek(after, false);
    checks += 1;
    if (opacity() < .95) failures.push({element:label, check:'入场后未显示', time:after});
    timeline.seek(duration - .001, false);
    if (time > 0) {
      timeline.seek(before, false);
      checks += 1;
      if (opacity() > .001) failures.push({element:label, check:'倒退后提前显示', time:before});
    }
  }
  return {status:failures.length ? 'failed' : entries.length ? 'passed' : 'not_applicable',
    first_reveal_elements:entries.length, checks, failures,
    limitation:'只核对已标注元素自身透明度；未标注元素、祖先遮挡和旁白语义仍须视觉复核。'};
}

function loadPuppeteer(buildDir) {
  const require = createRequire(import.meta.url);
  const roots = [buildDir];
  if (process.env.PUPPETEER_ROOT) roots.unshift(process.env.PUPPETEER_ROOT);
  const caches = [process.env.npm_config_cache,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'npm-cache'),
    path.join(os.homedir(), '.npm')].filter(Boolean);
  for (const cache of caches) {
    const npx = path.join(cache, '_npx');
    if (fs.existsSync(npx)) roots.push(...fs.readdirSync(npx).map(dir => path.join(npx, dir, 'node_modules')));
  }
  for (const root of roots) {
    let resolved;
    try { resolved = require.resolve('puppeteer-core', {paths:[root]}); }
    catch (error) { if (error.code === 'MODULE_NOT_FOUND') continue; throw error; }
    return require(resolved);
  }
  throw new Error('找不到 puppeteer-core，请先运行模板 check 或指定 PUPPETEER_ROOT');
}

export async function checkCourseReveals(buildDir) {
  const puppeteer = loadPuppeteer(buildDir);
  const executablePath = resolveChromeExecutable({env:{...process.env,
    COURSE_COVER_CHROME:process.env.CHROME_PATH || process.env.COURSE_COVER_CHROME}});
  const browser = await puppeteer.launch({executablePath, headless:true, args:['--allow-file-access-from-files']});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({width:1080, height:1440, deviceScaleFactor:1});
    await page.goto(pathToFileURL(path.join(buildDir, 'index.html')).href, {waitUntil:'networkidle0'});
    await page.waitForFunction(() => Boolean(window.__timelines?.main));
    await page.evaluate(() => document.fonts.ready);
    const report = await page.evaluate(inspectCourseReveals);
    if (errors.length) throw new Error(`浏览器错误：${errors.join('; ')}`);
    fs.writeFileSync(path.join(buildDir, 'first-reveal-report.json'), JSON.stringify(report, null, 2) + '\n', {encoding:'utf8'});
    return report;
  } finally { await browser.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('用法：node build/common/check_course_reveal.mjs 构建目录');
    const report = await checkCourseReveals(path.resolve(process.argv[2]));
    console.log(JSON.stringify(report, null, 2));
    if (report.status === 'failed') process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
