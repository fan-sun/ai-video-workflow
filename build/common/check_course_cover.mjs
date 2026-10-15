#!/usr/bin/env node
// 用途：真实渲染课程封面候选，并阻断文字越界、标题偏心和未授权的语义元素重叠。
// 运行：node build/common/check_course_cover.mjs <候选 HTML...> --out <质检目录>
// 依赖：Node.js；真实渲染阶段使用配置的 Chrome、本机浏览器或 HyperFrames 浏览器缓存。

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";


function intersects(first, second) {
  const width = Math.min(first.x + first.width, second.x + second.width)
    - Math.max(first.x, second.x);
  const height = Math.min(first.y + first.height, second.y + second.height)
    - Math.max(first.y, second.y);
  return width > 2 && height > 2;
}

function collisionPair(first, second) {
  const firstArea = first.width * first.height;
  const secondArea = second.width * second.height;
  if (firstArea <= secondArea) {
    return { first: first.id, second: second.id };
  }
  return { first: second.id, second: first.id };
}

export function detectCoverLayoutIssues({ width, height, topic, elements, boxes = [] }) {
  const visibleElements = elements.filter((element) => !element.overlapOk);
  const topicBox = { id: "cover-topic", ...topic };
  const semanticBoxes = [topicBox, ...boxes];
  const overflows = [...elements, ...semanticBoxes]
    .filter((element) => !element.overflowOk)
    .filter((element) => element.x < 0
      || element.y < 0
      || element.x + element.width > width
      || element.y + element.height > height)
    .map((element) => element.id);
  const collisions = [];
  for (const box of semanticBoxes.filter((element) => !element.overlapOk)) {
    for (const element of visibleElements) {
      const insideBox = box.id === "cover-topic"
        ? element.insideTopic
        : element.boxId === box.id || element.boxAncestors?.includes(box.id);
      if (!insideBox && intersects(box, element)) {
        collisions.push(collisionPair(box, element));
      }
    }
  }
  const visibleBoxes = semanticBoxes.filter((box) => !box.overlapOk);
  for (let firstIndex = 0; firstIndex < visibleBoxes.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < visibleBoxes.length; secondIndex += 1) {
      const first = visibleBoxes[firstIndex];
      const second = visibleBoxes[secondIndex];
      const nested = first.id === "cover-topic"
        ? second.insideTopic
        : second.id === "cover-topic"
          ? first.insideTopic
          : first.boxAncestors?.includes(second.id) || second.boxAncestors?.includes(first.id);
      if (!nested && intersects(first, second)) {
        collisions.push(collisionPair(first, second));
      }
    }
  }
  for (let firstIndex = 0; firstIndex < visibleElements.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < visibleElements.length; secondIndex += 1) {
      const first = visibleElements[firstIndex];
      const second = visibleElements[secondIndex];
      if (first.ancestors?.includes(second.id) || second.ancestors?.includes(first.id)) {
        continue;
      }
      if (intersects(first, second)) {
        collisions.push(collisionPair(first, second));
      }
    }
  }
  collisions.sort((left, right) => left.first.localeCompare(right.first)
    || left.second.localeCompare(right.second));
  const topicCenterX = topic.x + topic.width / 2;
  const topicCenterY = topic.y + topic.height / 2;
  const topicCentered = Math.abs(topicCenterX - width / 2) <= 80
    && topicCenterY >= height * 0.35
    && topicCenterY <= height * 0.65;
  return { collisions, overflows, topicCentered };
}

function findChromeInDirectory(directory, existsSync, readdirSync) {
  if (!existsSync(directory)) return null;
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === "chrome-headless-shell.exe") return candidate;
    if (entry.isDirectory()) {
      const nested = findChromeInDirectory(candidate, existsSync, readdirSync);
      if (nested) return nested;
    }
  }
  return null;
}

export function resolveChromeExecutable({
  env = process.env,
  homeDir = os.homedir(),
  existsSync = fs.existsSync,
  readdirSync = fs.readdirSync,
} = {}) {
  const configured = env.COURSE_COVER_CHROME || env.CHROME_PATH;
  if (configured) {
    if (!existsSync(configured)) {
      throw new Error(`封面真实渲染浏览器不存在：${configured}`);
    }
    return path.resolve(configured);
  }
  const cacheRoot = path.join(
    homeDir,
    ".cache/hyperframes/chrome/chrome-headless-shell",
  );
  const detected = findChromeInDirectory(cacheRoot, existsSync, readdirSync);
  if (detected) return detected;
  const installed = [
    path.join(env.PROGRAMFILES || "C:/Program Files", "Google/Chrome/Application/chrome.exe"),
    "/usr/bin/google-chrome", "/usr/bin/chromium",
  ].find((candidate) => existsSync(candidate));
  if (installed) return installed;
  throw new Error("封面真实渲染浏览器不存在；请设置 CHROME_PATH 或 COURSE_COVER_CHROME，禁止跳过截图门禁");
}

export function buildAuditHtml(source) {
  const auditScript = `<script>
(async function(){
  await Promise.all([...document.fonts].map((font)=>font.load()));
  await document.fonts.ready;
  const directTextElements=[...document.querySelectorAll("body *")].filter((element)=>{
    const direct=[...element.childNodes].some((node)=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim());
    if(!direct)return false;
    const style=getComputedStyle(element);
    const rect=element.getBoundingClientRect();
    return style.display!=="none"&&style.visibility!=="hidden"&&Number(style.opacity)>0.01&&rect.width>3&&rect.height>3;
  });
  const ids=new Map(directTextElements.map((element,index)=>[element,element.id||element.tagName.toLowerCase()+"."+[...element.classList].join(".")+"#"+index]));
  const boxElements=[...document.querySelectorAll("[data-audit-box]")].filter((element)=>!element.matches("[data-role=cover-topic]"));
  const boxIds=new Map(boxElements.map((element,index)=>[element,element.id||"audit-box#"+index]));
  const elements=directTextElements.map((element)=>{
    const rect=element.getBoundingClientRect();
    const ancestors=[];
    for(let parent=element.parentElement;parent;parent=parent.parentElement){if(ids.has(parent))ancestors.push(ids.get(parent));}
    const boxAncestors=[];
    for(let parent=element.parentElement;parent;parent=parent.parentElement){if(boxIds.has(parent))boxAncestors.push(boxIds.get(parent));}
    return {id:ids.get(element),text:element.textContent.trim().slice(0,80),x:rect.x,y:rect.y,width:rect.width,height:rect.height,ancestors,boxId:boxIds.get(element)||null,boxAncestors,insideTopic:Boolean(element.closest("[data-role=cover-topic]")),overlapOk:Boolean(element.closest("[data-overlap-ok]")),overflowOk:Boolean(element.closest("[data-overflow-ok]"))};
  });
  const boxes=boxElements.map((element)=>{const rect=element.getBoundingClientRect();const boxAncestors=[];for(let parent=element.parentElement;parent;parent=parent.parentElement){if(boxIds.has(parent))boxAncestors.push(boxIds.get(parent));}return {id:boxIds.get(element),x:rect.x,y:rect.y,width:rect.width,height:rect.height,boxAncestors,insideTopic:Boolean(element.closest("[data-role=cover-topic]")),overlapOk:Boolean(element.closest("[data-overlap-ok]")),overflowOk:Boolean(element.closest("[data-overflow-ok]"))};});
  const topicElement=document.querySelector("[data-role=cover-topic]");
  const topicRect=topicElement?.getBoundingClientRect();
  const fonts=[...document.fonts].map((font)=>({family:font.family,status:font.status}));
  const payload={width:innerWidth,height:innerHeight,fontReady:document.fonts.status==="loaded"&&fonts.every((font)=>font.status==="loaded"),fonts,topic:topicRect?{x:topicRect.x,y:topicRect.y,width:topicRect.width,height:topicRect.height}:null,elements,boxes};
  document.documentElement.setAttribute("data-cover-audit",encodeURIComponent(JSON.stringify(payload)));
})();
</script>`;
  if (!source.includes("</body>")) {
    throw new Error("封面 HTML 缺少 </body>");
  }
  return source.replace("</body>", `${auditScript}</body>`);
}

export function parseAuditPayload(dumpDom) {
  const match = dumpDom.match(/data-cover-audit=(?:"([^"]+)"|'([^']+)')/u);
  if (!match) {
    throw new Error("浏览器未返回封面布局指标；禁止跳过真实渲染门禁");
  }
  return JSON.parse(decodeURIComponent(match[1] ?? match[2]));
}

export function readPngDimensions(file) {
  const png = fs.readFileSync(file);
  if (png.length < 24 || png.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error(`封面截图不是有效 PNG：${file}`);
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

export function assertCoverRenderDimensions({ metrics, png }) {
  if (Number(metrics?.width) !== 1080 || Number(metrics?.height) !== 1440) {
    throw new Error(`封面页面必须为 1080×1440，当前为 ${metrics?.width}×${metrics?.height}`);
  }
  if (Number(png?.width) !== 1080 || Number(png?.height) !== 1440) {
    throw new Error(`封面 PNG 必须为 1080×1440，当前为 ${png?.width}×${png?.height}`);
  }
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  const outputDir = outIndex === -1 ? "build/course-cover-qc" : argv[outIndex + 1];
  const files = outIndex === -1 ? argv : argv.slice(0, outIndex);
  if (!files.length || !outputDir || (outIndex !== -1 && outIndex !== argv.length - 2)) {
    throw new Error("用法：node build/common/check_course_cover.mjs <候选 HTML...> --out <质检目录>");
  }
  return { files, outputDir };
}

function runChrome(chrome, args) {
  const result = spawnSync(chrome, args, {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || "Chrome 执行失败").trim());
  }
  return String(result.stdout ?? "");
}

function auditCoverFile(file, outputDir, chrome) {
  const absoluteFile = path.resolve(file);
  if (!fs.existsSync(absoluteFile) || fs.statSync(absoluteFile).size === 0) {
    throw new Error(`封面候选不存在或为空：${file}`);
  }
  fs.mkdirSync(outputDir, { recursive: true });
  const source = fs.readFileSync(absoluteFile, { encoding: "utf8" });
  const tempFile = path.join(
    path.dirname(absoluteFile),
    `.cover-audit-${process.pid}-${path.basename(file)}`,
  );
  const stem = path.basename(file, path.extname(file));
  const screenshotFile = path.resolve(outputDir, `${stem}.png`);
  const reportFile = path.resolve(outputDir, `${stem}.json`);
  fs.writeFileSync(tempFile, buildAuditHtml(source), { encoding: "utf8" });
  try {
    const url = pathToFileURL(tempFile).href;
    const common = [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-sandbox",
      "--force-device-scale-factor=1",
      "--window-size=1080,1440",
      "--virtual-time-budget=3000",
    ];
    const dumpDom = runChrome(chrome, [...common, "--dump-dom", url]);
    const metrics = parseAuditPayload(dumpDom);
    if (!metrics.fontReady) {
      throw new Error(`${file} 字体未完成加载`);
    }
    if (!metrics.topic) {
      throw new Error(`${file} 缺少 data-role="cover-topic"`);
    }
    runChrome(chrome, [...common, `--screenshot=${screenshotFile}`, url]);
    if (!fs.existsSync(screenshotFile) || fs.statSync(screenshotFile).size === 0) {
      throw new Error(`${file} 真实截图未生成`);
    }
    assertCoverRenderDimensions({
      metrics,
      png: readPngDimensions(screenshotFile),
    });
    const issues = detectCoverLayoutIssues(metrics);
    const passed = issues.collisions.length === 0
      && issues.overflows.length === 0
      && issues.topicCentered;
    const report = {
      status: passed ? "passed" : "failed",
      source: absoluteFile,
      screenshot: screenshotFile,
      metrics,
      issues,
    };
    fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8" });
    return report;
  } finally {
    fs.rmSync(tempFile, { force: true });
  }
}


const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const chrome = resolveChromeExecutable();
    let failed = false;
    for (const file of args.files) {
      const report = auditCoverFile(file, path.resolve(args.outputDir), chrome);
      const issueCount = report.issues.collisions.length + report.issues.overflows.length
        + (report.issues.topicCentered ? 0 : 1);
      console.log(`${report.status === "passed" ? "通过" : "失败"}：${file}（问题 ${issueCount}）`);
      failed ||= report.status !== "passed";
    }
    if (failed) {
      throw new Error("封面真实渲染门禁未通过");
    }
    console.log(`封面真实渲染门禁通过：${path.resolve(args.outputDir)}`);
  } catch (error) {
    console.error(`封面检查失败：${error.message}`);
    process.exitCode = 1;
  }
}
