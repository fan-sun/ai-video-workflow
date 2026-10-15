import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as courseAudio from "../../build/teaching/course_audio.mjs";

import {
  allocateSubtitleUnitTimings,
  buildTimingMetadata,
  findExistingFinalOutputs,
  main,
  parseArgs,
  resolveOutputPaths,
  resolveSubtitleUnits,
  roundHalfUp2,
  splitSubtitleText,
} from "../../build/teaching/course_audio.mjs";

const formalAct1Path = new URL("../fixtures/formal_act.json", import.meta.url);

test("正式 act1 的 g14 锁定显示、朗读和字幕单元契约", () => {
  const formalAct1 = JSON.parse(readFileSync(formalAct1Path, "utf8"));
  assert.equal(formalAct1.segments.length, 19);
  const g14 = formalAct1.segments.find(({ id }) => id === "g14");
  assert.equal(g14.id, "g14");
  assert.equal(g14.pause_after, 0.15);
  assert.equal(g14.text, "2026 年 6 月，一位叫 Peter Steinberger 的开发者发了句话：");
  assert.equal(g14.tts_text, "二零二六年六月，一位叫 Peter Steinberger 的开发者发了句话：");
  assert.deepEqual(g14.subtitle_units, [
    { id: "g14.u01", text: "2026 年 6 月，", tts_text: "二零二六年六月，" },
    { id: "g14.u02", text: "一位叫 Peter Steinberger 的开发者发了句话：" },
  ]);
  assert.deepEqual(resolveSubtitleUnits(g14), g14.subtitle_units);
  assert.deepEqual(
    formalAct1.segments.filter((segment) => segment.id !== "g14"
      && ("tts_text" in segment || "subtitle_units" in segment)),
    [],
  );
});

test("字幕只在指定中文标点后切分并保留标点", () => {
  assert.deepEqual(splitSubtitleText("甲乙丙丁，戊己庚辛；壬癸子丑：寅卯辰巳。午未申酉？戌亥天地！"), [
    "甲乙丙丁，", "戊己庚辛；", "壬癸子丑：", "寅卯辰巳。", "午未申酉？", "戌亥天地！",
  ]);
});

test("字幕不在顿号、破折号和英文句点处切分", () => {
  assert.deepEqual(splitSubtitleText("甲乙、丙丁——戊己.庚辛。"), ["甲乙、丙丁——戊己.庚辛。"]);
});

test("短碎片去除前导空白和星号后并入前一单元", () => {
  assert.deepEqual(splitSubtitleText("第一部分完整。  **短。 后续内容足够长。"), [
    "第一部分完整。短。",
    "后续内容足够长。",
  ]);
  assert.deepEqual(splitSubtitleText("  **短。"), ["短。"]) ;
});

test("短碎片去除所有 Unicode 空白和星号后计算可读长度", () => {
  assert.deepEqual(splitSubtitleText("第一部分完整。短 * * * *。后续内容足够长。"), [
    "第一部分完整。短 * * * *。",
    "后续内容足够长。",
  ]);
});

test("自动字幕单元生成稳定 id", () => {
  assert.deepEqual(resolveSubtitleUnits({ id: "g14", text: "第一部分完整。第二部分也完整。" }), [
    { id: "g14.u01", text: "第一部分完整。" },
    { id: "g14.u02", text: "第二部分也完整。" },
  ]);
});

test("显式字幕单元完全覆盖自动切分并保留有效 tts_text", () => {
  const segment = {
    id: "g14",
    text: "显示甲。显示乙。",
    tts_text: "朗读甲，朗读乙。",
    subtitle_units: [
      { id: "a", text: "显示甲。", tts_text: "朗读甲，" },
      { id: "b", text: "显示乙。", tts_text: "朗读乙。" },
    ],
  };
  assert.deepEqual(resolveSubtitleUnits(segment), segment.subtitle_units);
});

for (const [name, segment, pattern] of [
  ["非空数组", { id: "g14", text: "正文", subtitle_units: [] }, /g14.*非空数组/],
  ["每项对象", { id: "g14", text: "正文", subtitle_units: [null] }, /g14.*unit\[0\].*对象/],
  ["非空 id", { id: "g14", text: "正文", subtitle_units: [{ id: " ", text: "正文" }] }, /g14.*unit\[0\].*id/],
  ["唯一 id", { id: "g14", text: "正文正文", subtitle_units: [{ id: "u", text: "正文" }, { id: "u", text: "正文" }] }, /g14.*unit\[1\].*重复/],
  ["非空 text", { id: "g14", text: "正文", subtitle_units: [{ id: "u", text: " " }] }, /g14.*unit\[0\].*text/],
  ["显式 tts_text 非空", { id: "g14", text: "正文", subtitle_units: [{ id: "u", text: "正文", tts_text: " " }] }, /g14.*unit\[0\].*tts_text/],
  ["显示拼接相等", { id: "g14", text: "正文", subtitle_units: [{ id: "u", text: "别字" }] }, /g14.*显示文本拼接/],
  ["朗读拼接相等", { id: "g14", text: "正文", tts_text: "朗读", subtitle_units: [{ id: "u", text: "正文", tts_text: "错读" }] }, /g14.*朗读文本拼接/],
]) {
  test(`显式字幕单元校验${name}`, () => {
    assert.throws(() => resolveSubtitleUnits(segment), pattern);
  });
}

test("父朗读文本仅整体首尾空白不同且自动产生多个字幕单元时接受", () => {
  assert.deepEqual(
    resolveSubtitleUnits({ id: "g14", text: "显示第一句。显示第二句。", tts_text: "  显示第一句。显示第二句。\n" }),
    [
      { id: "g14.u01", text: "显示第一句。" },
      { id: "g14.u02", text: "显示第二句。" },
    ],
  );
});

test("父朗读文本不同且自动产生多个字幕单元时拒绝隐式映射", () => {
  assert.throws(
    () => resolveSubtitleUnits({ id: "g14", text: "显示第一句。显示第二句。", tts_text: "朗读第一句，朗读第二句。" }),
    /g14.*隐式映射/,
  );
});

for (const [field, value] of [
  ["text", 123], ["text", " \t\n"], ["tts_text", 123], ["tts_text", " \t\n"],
]) {
  test(`resolveSubtitleUnits 拒绝父 ${field}=${JSON.stringify(value)}`, () => {
    const segment = { id: "g14", text: "正文" };
    segment[field] = value;
    assert.throws(() => resolveSubtitleUnits(segment), new RegExp(`segment g14.*${field}`));
  });
}

test("buildTimingMetadata 独立调用拒绝非法父 text", () => {
  assert.throws(
    () => buildTimingMetadata([{ id: "g14", text: 123, gap: 0, d: 1 }], "act1"),
    /segment g14.*text/,
  );
});

test("buildTimingMetadata 独立调用拒绝非法显式父 tts_text", () => {
  assert.throws(
    () => buildTimingMetadata([{ id: "g14", text: "正文", tts_text: " ", gap: 0, d: 1 }], "act1"),
    /segment g14.*tts_text/,
  );
});

test("字幕时间按 g14 型朗读文本的 Unicode 非空白字符数分配", () => {
  const units = [
    { id: "u1", text: "显示一", tts_text: "甲 乙" },
    { id: "u2", text: "显示二", tts_text: "丙\n丁 戊 己" },
  ];
  assert.deepEqual(allocateSubtitleUnitTimings(units, 10, 16), [
    { id: "u1", text: "显示一", start: 10, end: 12, dur: 2 },
    { id: "u2", text: "显示二", start: 12, end: 16, dur: 4 },
  ]);
});

test("Node 两位半入只接受三位毫秒时间", () => {
  assert.equal(roundHalfUp2(0.005), 0.01);
  assert.equal(roundHalfUp2(0.001), 0);
  assert.throws(() => roundHalfUp2(0.00499999999), /毫秒|三位/);
});

test("两位量化为零的字幕 unit 时长被拒绝", () => {
  assert.throws(
    () => allocateSubtitleUnitTimings([{ id: "u1", text: "甲" }], 0, 0.001),
    /两位.*正时长|正时长.*两位/,
  );
});

test("父时长在 1ms 精度下不足以分配每个字幕单元时拒绝", () => {
  assert.throws(
    () => allocateSubtitleUnitTimings([
      { id: "u1", text: "甲" }, { id: "u2", text: "乙" }, { id: "u3", text: "丙" },
    ], 1, 1.001),
    /1ms.*3.*正时长|3.*1ms.*正时长/,
  );
});

test("字幕时间首尾贴合父级且相邻连续", () => {
  const result = allocateSubtitleUnitTimings([
    { id: "u1", text: "甲" }, { id: "u2", text: "乙乙" }, { id: "u3", text: "丙丙丙" },
  ], 1.1111, 2.3456);
  assert.equal(result[0].start, 1.111);
  assert.equal(result.at(-1).end, 2.346);
  assert.equal(result[0].end, result[1].start);
  assert.equal(result[1].end, result[2].start);
});

test("旧 segment 生成兼容 phrase，新增字幕元数据并让 gap 只影响下一父 start", () => {
  const meta = buildTimingMetadata([
    { id: "g01", text: "第一句。", gap: 0.5, d: 2 },
    { id: "g02", text: "第二句。", gap: 0, d: 1 },
  ], "act1");
  assert.deepEqual(meta, {
    out: "act1.wav",
    total: 3.5,
    count: 2,
    phrases: [
      {
        id: "g01", text: "第一句。", start: 0, end: 2, dur: 2, gap: 0.5,
        subtitle_units: [{ id: "g01.u01", text: "第一句。", start: 0, end: 2, dur: 2 }],
      },
      {
        id: "g02", text: "第二句。", start: 2.5, end: 3.5, dur: 1, gap: 0,
        subtitle_units: [{ id: "g02.u01", text: "第二句。", start: 2.5, end: 3.5, dur: 1 }],
      },
    ],
    caption_timing: {
      version: 1,
      parent_boundary: "trimmed_wav_ffprobe",
      unit_boundary: "tts_character_weight_ratio",
      accuracy: "semantic_estimate",
    },
  });
});

test("buildTimingMetadata 拒绝跨父 segment 的重复 unit id", () => {
  assert.throws(
    () => buildTimingMetadata([
      { id: "g01", text: "第一句。", gap: 0, d: 1, subtitle_units: [{ id: "shared", text: "第一句。" }] },
      { id: "g02", text: "第二句。", gap: 0, d: 1, subtitle_units: [{ id: "shared", text: "第二句。" }] },
    ], "act1"),
    /unit id shared.*segment g01.*segment g02|segment g01.*unit id shared.*segment g02/,
  );
});

test("buildTimingMetadata 在自动 unit id 冲突前先拒绝重复 segment id", () => {
  assert.throws(
    () => buildTimingMetadata([
      { id: "g01", text: "第一句。", gap: 0, d: 1 },
      { id: "g01", text: "第二句。", gap: 0, d: 1 },
    ], "act1"),
    /segment g01.*segment\[0\].*segment\[1\]|segment\[0\].*segment g01.*segment\[1\]/,
  );
});

test("有效父 tts_text 写入 phrase 并用于显式字幕权重", () => {
  const meta = buildTimingMetadata([{
    id: "g14", text: "显示甲显示乙", tts_text: "甲乙甲乙甲乙", gap: 0, d: 6,
    subtitle_units: [
      { id: "u1", text: "显示甲", tts_text: "甲乙" },
      { id: "u2", text: "显示乙", tts_text: "甲乙甲乙" },
    ],
  }], "act1");
  assert.equal(meta.phrases[0].tts_text, "甲乙甲乙甲乙");
  assert.deepEqual(meta.phrases[0].subtitle_units, [
    { id: "u1", text: "显示甲", start: 0, end: 2, dur: 2 },
    { id: "u2", text: "显示乙", start: 2, end: 6, dur: 4 },
  ]);
});

test("旧三个位置参数保持兼容且 force 默认关闭", () => {
  assert.deepEqual(parseArgs(["script.json", "audio", "act1"]), {
    scriptPath: "script.json", audioDir: "audio", outName: "act1", outDir: undefined, force: false, speed: 1.15,
  });
});

test("CLI 支持 out-dir、force 和显式语速", () => {
  assert.deepEqual(parseArgs([
    "script.json", "audio", "act1", "--out-dir", "result", "--force", "--speed", "1.1",
  ]), {
    scriptPath: "script.json", audioDir: "audio", outName: "act1", outDir: "result", force: true, speed: 1.1,
  });
  assert.throws(() => parseArgs(["script.json", "audio", "act1", "--speed", "0"]), /--speed/);
  assert.throws(() => parseArgs(["script.json", "audio", "act1", "--speed", "不是数字"]), /--speed/);
});

test("按变速后实际 WAV 时长同比缩放父级、间隔和字幕时间", () => {
  assert.equal(typeof courseAudio.scaleTimingMetadata, "function");
  const source = buildTimingMetadata([
    { id: "g01", text: "第一句话。", gap: 0.3, d: 2 },
    { id: "g02", text: "第二句话。", gap: 0, d: 1.7 },
  ], "act1");

  const scaled = courseAudio.scaleTimingMetadata(source, 3.478, 1.15);

  assert.equal(scaled.total, 3.478);
  assert.equal(scaled.speed, 1.15);
  assert.deepEqual(
    scaled.phrases.map(({ start, end, dur, gap }) => ({ start, end, dur, gap })),
    [
      { start: 0, end: 1.739, dur: 1.739, gap: 0.261 },
      { start: 2, end: 3.478, dur: 1.478, gap: 0 },
    ],
  );
  assert.equal(scaled.phrases[0].subtitle_units[0].end, 1.739);
});

test("变速缩放后拒绝在两位时间精度下坍缩的字幕单元", () => {
  assert.throws(
    () => courseAudio.scaleTimingMetadata({
      out: "act1.wav",
      total: 0.016,
      count: 1,
      phrases: [{
        id: "g01",
        text: "甲乙",
        start: 0,
        end: 0.016,
        dur: 0.016,
        gap: 0,
        subtitle_units: [
          { id: "g01.u01", text: "甲", start: 0, end: 0.006, dur: 0.006 },
          { id: "g01.u02", text: "乙", start: 0.006, end: 0.016, dur: 0.01 },
        ],
      }],
    }, 0.014, 1.15),
    /变速后.*两位时间精度/,
  );
});

test("输出路径默认位于 audio_dir，指定 out-dir 后全部迁移", () => {
  const defaults = resolveOutputPaths({ audioDir: "audio", outName: "act1" });
  assert.equal(defaults.trimDir, path.join("audio", "trim"));
  assert.equal(defaults.outWav, path.join("audio", "act1.wav"));
  assert.equal(defaults.timingsPath, path.join("audio", "act1_timings.json"));

  const redirected = resolveOutputPaths({ audioDir: "audio", outName: "act1", outDir: "result" });
  assert.equal(redirected.trimDir, path.join("result", "trim"));
  assert.equal(redirected.outWav, path.join("result", "act1.wav"));
  assert.equal(redirected.timingsPath, path.join("result", "act1_timings.json"));
});

test("最终输出冲突检测同时检查整轨和 timings", () => {
  const paths = { outWav: "/out/act.wav", timingsPath: "/out/act_timings.json" };
  assert.deepEqual(findExistingFinalOutputs(paths, (file) => file.endsWith(".wav")), ["/out/act.wav"]);
  assert.deepEqual(findExistingFinalOutputs(paths, () => true), ["/out/act.wav", "/out/act_timings.json"]);
});


test("Windows 路径比较键忽略大小写并归一分隔符", () => {
  assert.equal(
    courseAudio.pathComparisonKey("C:/Audio/g14.wav", "win32"),
    courseAudio.pathComparisonKey("c:/audio/G14.wav", "win32"),
  );
});

test("POSIX 路径比较键保留大小写差异", () => {
  assert.notEqual(
    courseAudio.pathComparisonKey("/Audio/g14.wav", "linux"),
    courseAudio.pathComparisonKey("/audio/G14.wav", "linux"),
  );
});

test("即使 force 开启，最终 WAV 仍不得覆盖任一原始 segment 音频", () => {
  const audioDir = path.join("audio", "raw");
  assert.throws(
    () => main(["script.json", audioDir, "g14", "--force"], {
      readFileSync: () => JSON.stringify({ segments: [{ id: "g14", text: "正文" }] }),
      existsSync: () => false,
      mkdirSync: () => assert.fail("冲突预检后不应 mkdir"),
      execSync: () => assert.fail("冲突预检后不应 exec"),
      writeFileSync: () => assert.fail("冲突预检后不应 write"),
    }),
    (error) => error.message.includes("segment g14")
      && error.message.includes(path.join(audioDir, "g14.wav")),
  );
});

test("输出冲突预检发生在 mkdir、exec 和 write 之前", () => {
  const sideEffects = [];
  assert.throws(
    () => main(["script.json", "audio", "g14", "--force"], {
      readFileSync: () => JSON.stringify({ segments: [{ id: "g14", text: "正文" }] }),
      existsSync: () => false,
      mkdirSync: () => sideEffects.push("mkdir"),
      execSync: () => sideEffects.push("exec"),
      writeFileSync: () => sideEffects.push("write"),
    }),
    /segment g14.*g14\.wav/,
  );
  assert.deepEqual(sideEffects, []);
});

test("即使 force 开启，裁切目标仍不得覆盖原始 segment 音频且预检无副作用", () => {
  for (const [audioDir, outDir] of [
    ["E:/audio/trim", "E:/audio"],
    ["e:\\AUDIO\\TRIM", "E:/audio"],
  ]) {
    const sideEffects = [];
    const raw = path.join(audioDir, "g14.wav");
    const trimmed = path.join(outDir, "trim", "g14.wav");
    assert.throws(
      () => main(["script.json", audioDir, "act1", "--out-dir", outDir, "--force"], {
        readFileSync: () => JSON.stringify({ segments: [{ id: "g14", text: "正文" }] }),
        existsSync: () => false,
        mkdirSync: () => sideEffects.push("mkdir"),
        execSync: () => sideEffects.push("exec"),
        writeFileSync: () => sideEffects.push("write"),
      }),
      (error) => error.message.includes("segment g14")
        && error.message.includes(raw)
        && error.message.includes(trimmed),
    );
    assert.deepEqual(sideEffects, []);
  }
});

test("CLI 完整流程的写入和命令均使用注入依赖", () => {
  const commands = [];
  const writes = [];
  main(["script.json", "audio", "act1", "--out-dir", "result"], {
    readFileSync: () => JSON.stringify({
      segments: [
        { id: "g01", text: "第一句。", pause_after: 0.5 },
        { id: "g02", text: "第二句。", pause_after: 0 },
      ],
    }),
    existsSync: (file) => file === path.join("audio", "g01.wav") || file === path.join("audio", "g02.wav"),
    mkdirSync: () => {},
    writeFileSync: (...args) => writes.push(args),
    runCommand: (program, args) => {
      commands.push({ program, args });
      return program === "ffprobe" ? "2.000\n" : "";
    },
  });

  const trimCommands = commands.filter(({ program, args }) => program === "ffmpeg"
    && args.includes("-af") && !args.includes("concat"));
  assert.equal(trimCommands.length, 2);
  assert.equal(trimCommands.every(({ args }) => args[args.indexOf("-ar") + 1] === "48000"), true);
  assert.equal(commands.filter(({ args }) => args.includes("anullsrc=r=48000:cl=mono") && args.includes("0.5")).length, 1);
  assert.equal(commands.filter(({ program, args }) => program === "ffmpeg" && args.includes("concat")).length, 1);
  assert.equal(writes.filter(([file]) => file === path.join("result", "trim", "concat.txt")).length, 1);
  assert.equal(writes.filter(([file]) => file === path.join("result", "act1_timings.json")).length, 1);
});

test("正式整轨默认执行 1.15 倍速并按成品时长写 timings", () => {
  const commands = [];
  const writes = [];
  main(["script.json", "audio", "act1", "--out-dir", "result"], {
    readFileSync: () => JSON.stringify({ segments: [{ id: "g01", text: "第一句话。", pause_after: 0 }] }),
    existsSync: (file) => file === path.join("audio", "g01.wav"),
    mkdirSync: () => {},
    writeFileSync: (...args) => writes.push(args),
    runCommand: (program, args) => {
      commands.push({ program, args });
      if (program !== "ffprobe") return "";
      return args.includes(path.join("result", "act1.wav")) ? "2.000\n" : "2.300\n";
    },
  });

  const concat = commands.find(({ program, args }) => program === "ffmpeg" && args.includes("concat"));
  assert.equal(concat.args[concat.args.indexOf("-af") + 1], "atempo=1.15");
  assert.equal(concat.args[concat.args.indexOf("-c:a") + 1], "pcm_s16le");
  const timingWrite = writes.find(([file]) => file === path.join("result", "act1_timings.json"));
  const timing = JSON.parse(timingWrite[1]);
  assert.equal(timing.speed, 1.15);
  assert.equal(timing.total, 2);
  assert.equal(timing.phrases[0].end, 2);
});

test("末 segment 的 pause_after 不生成未参与 concat 的静音文件", () => {
  const commands = [];
  main(["script.json", "audio", "act1", "--out-dir", "result"], {
    readFileSync: () => JSON.stringify({ segments: [{ id: "g01", text: "正文", pause_after: 0.5 }] }),
    existsSync: (file) => file === path.join("audio", "g01.wav"),
    mkdirSync: () => {},
    writeFileSync: () => {},
    runCommand: (program, args) => {
      commands.push({ program, args });
      return program === "ffprobe" ? "2.000\n" : "";
    },
  });
  assert.equal(commands.filter(({ args }) => args.includes("anullsrc=r=48000:cl=mono")).length, 0);
});

for (const invalidDuration of ["NaN", "Infinity", "0", "-1"]) {
  test(`ffprobe 时长 ${invalidDuration} 时错误包含 segment id`, () => {
    assert.throws(
      () => main(["script.json", "audio", "act1"], {
        readFileSync: () => JSON.stringify({ segments: [{ id: "g14", text: "正文", pause_after: 0 }] }),
        existsSync: (file) => file === path.join("audio", "g14.wav"),
        mkdirSync: () => {},
        writeFileSync: () => {},
        runCommand: (program) => program === "ffprobe" ? invalidDuration : "",
      }),
      /segment g14.*duration|duration.*segment g14/,
    );
  });
}

for (const invalidGap of [NaN, Infinity]) {
  test(`gap ${String(invalidGap)} 非法时错误包含 segment id`, () => {
    assert.throws(
      () => buildTimingMetadata([{ id: "g14", text: "正文", gap: invalidGap, d: 2 }], "act1"),
      /segment g14.*gap|gap.*segment g14/,
    );
  });
}

for (const invalidGap of [-0.1, "不是数字"]) {
  test(`pause_after ${String(invalidGap)} 非法时错误包含 segment id`, () => {
    assert.throws(
      () => main(["script.json", "audio", "act1"], {
        readFileSync: () => JSON.stringify({ segments: [{ id: "g14", text: "正文", pause_after: invalidGap }] }),
        existsSync: (file) => file === path.join("audio", "g14.wav"),
        mkdirSync: () => {},
        writeFileSync: () => {},
        execSync: () => "2.000",
      }),
      /segment g14.*pause_after|pause_after.*segment g14/,
    );
  });
}

for (const invalidDuration of [NaN, Infinity, 0, -1]) {
  test(`buildTimingMetadata 拒绝 segment 时长 ${String(invalidDuration)}`, () => {
    assert.throws(
      () => buildTimingMetadata([{ id: "g14", text: "正文", gap: 0, d: invalidDuration }], "act1"),
      /segment g14.*duration|duration.*segment g14/,
    );
  });
}

for (const [start, end] of [[NaN, 1], [0, Infinity], [1, 1], [2, 1]]) {
  test(`字幕父边界 start=${String(start)}, end=${String(end)} 非法时明确拒绝`, () => {
    assert.throws(
      () => allocateSubtitleUnitTimings([{ id: "u1", text: "正文" }], start, end),
      /start.*end.*有限.*end > start|有限.*end > start/,
    );
  });
}

test("Windows 路径比较使用 win32 语义统一盘符大小写和混合分隔符", () => {
  assert.equal(
    courseAudio.pathComparisonKey("C:\\Audio\\sub\\..\\g14.wav", "win32"),
    courseAudio.pathComparisonKey("c:/audio/G14.wav", "win32"),
  );
});

test("Windows 路径比较保留 UNC 根并识别等价路径", () => {
  const key = courseAudio.pathComparisonKey("\\\\Server\\Share\\audio\\..\\g14.wav", "win32");
  assert.equal(key, courseAudio.pathComparisonKey("//server/share/g14.wav", "win32"));
  assert.match(key, /^\\\\server\\share\\/);
});

test("outName 不能通过路径覆盖裁切目标且预检无副作用", () => {
  const sideEffects = [];
  assert.throws(
    () => main(["script.json", "audio", "trim/g14", "--force"], {
      readFileSync: () => JSON.stringify({ segments: [{ id: "g14", text: "正文" }] }),
      existsSync: () => false,
      mkdirSync: () => sideEffects.push("mkdir"),
      runCommand: () => sideEffects.push("runCommand"),
      writeFileSync: () => sideEffects.push("write"),
    }),
    /outName/,
  );
  assert.deepEqual(sideEffects, []);
});

function assertCliPreflightHasNoSideEffects(script, existsSync, pattern) {
  const sideEffects = [];
  assert.throws(
    () => main(["script.json", "audio", "act1", "--out-dir", "result", "--force"], {
      readFileSync: () => JSON.stringify(script),
      existsSync,
      mkdirSync: () => sideEffects.push("mkdir"),
      execSync: () => sideEffects.push("exec"),
      writeFileSync: () => sideEffects.push("write"),
    }),
    pattern,
  );
  assert.deepEqual(sideEffects, []);
}

test("CLI 在处理第一段媒体前预检出第二段缺少原始 WAV", () => {
  assertCliPreflightHasNoSideEffects(
    { segments: [{ id: "g01", text: "第一句。" }, { id: "g02", text: "第二句。" }] },
    (file) => file === path.join("audio", "g01.wav"),
    /缺音频.*g02\.wav/,
  );
});

test("CLI 在处理第一段媒体前预检出第二段负 pause_after", () => {
  assertCliPreflightHasNoSideEffects(
    { segments: [{ id: "g01", text: "第一句。" }, { id: "g02", text: "第二句。", pause_after: -0.1 }] },
    (file) => [path.join("audio", "g01.wav"), path.join("audio", "g02.wav")].includes(file),
    /segment g02.*pause_after/,
  );
});

test("CLI 在处理第一段媒体前预检出第二段坏 subtitle_units", () => {
  assertCliPreflightHasNoSideEffects(
    {
      segments: [
        { id: "g01", text: "第一句。" },
        { id: "g02", text: "第二句。", subtitle_units: [] },
      ],
    },
    (file) => [path.join("audio", "g01.wav"), path.join("audio", "g02.wav")].includes(file),
    /segment g02.*subtitle_units.*非空数组/,
  );
});

test("CLI 在任何副作用前拒绝非数组 segments", () => {
  assertCliPreflightHasNoSideEffects({ segments: {} }, () => false, /segments.*数组/);
});

for (const [field, value] of [
  ["text", 123], ["text", " \t\n"], ["tts_text", 123], ["tts_text", " \t\n"],
]) {
  test(`CLI 在任何媒体副作用前拒绝父 ${field}=${JSON.stringify(value)}`, () => {
    const segment = { id: "g14", text: "正文" };
    segment[field] = value;
    assertCliPreflightHasNoSideEffects(
      { segments: [segment] },
      () => true,
      new RegExp(`segment g14.*${field}`),
    );
  });
}

test("全局预检捕获含 .. ID 导致的跨 segment 原始音频与裁切目标碰撞", () => {
  const firstId = "../result/trim/g02";
  assertCliPreflightHasNoSideEffects(
    { segments: [{ id: firstId, text: "第一句。" }, { id: "g02", text: "第二句。" }] },
    () => true,
    (error) => error.message.includes(`segment ${firstId}`)
      && error.message.includes("原始音频")
      && error.message.includes("segment g02")
      && error.message.includes("裁切目标"),
  );
});

test("全局预检拒绝重复 segment id 且错误包含两个 segment 角色", () => {
  assertCliPreflightHasNoSideEffects(
    { segments: [{ id: "g01", text: "第一句。" }, { id: "g01", text: "第二句。" }] },
    () => true,
    /segment g01.*segment\[0\].*segment\[1\]|segment\[0\].*segment g01.*segment\[1\]/,
  );
});

test("CLI 在任何副作用前拒绝跨父 segment 的重复 unit id", () => {
  assertCliPreflightHasNoSideEffects(
    {
      segments: [
        { id: "g01", text: "第一句。", subtitle_units: [{ id: "shared", text: "第一句。" }] },
        { id: "g02", text: "第二句。", subtitle_units: [{ id: "shared", text: "第二句。" }] },
      ],
    },
    () => true,
    /unit id shared.*segment g01.*segment g02|segment g01.*unit id shared.*segment g02/,
  );
});

test("全局预检捕获实际需要的静音写目标与裁切目标碰撞", () => {
  assertCliPreflightHasNoSideEffects(
    {
      segments: [
        { id: "g01", text: "第一句。", pause_after: 0.5 },
        { id: "_sil_0.5", text: "第二句。" },
      ],
    },
    () => true,
    (error) => error.message.includes("静音目标")
      && error.message.includes("segment g01")
      && error.message.includes("裁切目标")
      && error.message.includes("segment _sil_0.5")
      && error.message.includes("_sil_0.5.wav"),
  );
});

test("空白父 text 在 mkdir 和 ffmpeg 前按父文本契约拒绝", () => {
  assertCliPreflightHasNoSideEffects(
    { segments: [{ id: "g01", text: " \n\t " }] },
    () => true,
    /segment g01.*text.*非空字符串/,
  );
});

test("outName 路径分隔符在任何副作用前拒绝", () => {
  const sideEffects = [];
  assert.throws(
    () => main(["script.json", "audio", "trim/g14", "--force"], {
      readFileSync: () => JSON.stringify({ segments: [{ id: "g14", text: "正文" }] }),
      existsSync: () => true,
      mkdirSync: () => sideEffects.push("mkdir"),
      runCommand: () => sideEffects.push("runCommand"),
      writeFileSync: () => sideEffects.push("write"),
    }),
    /outName/,
  );
  assert.deepEqual(sideEffects, []);
});

test("全局预检捕获最终 WAV 与 timings JSON 写目标碰撞", () => {
  assert.throws(
    () => courseAudio.assertOutputDoesNotOverwriteSegmentAudio(
      { audioDir: "audio" },
      [],
      { trimDir: "result/trim", outWav: "result/shared", timingsPath: "result/shared" },
    ),
    /timings JSON.*最终 WAV.*shared|最终 WAV.*timings JSON.*shared/,
  );
});

test("全局预检捕获 timings JSON 与 concat.txt 写目标碰撞", () => {
  const concatPath = path.join("result", "trim", "concat.txt");
  assert.throws(
    () => courseAudio.assertOutputDoesNotOverwriteSegmentAudio(
      { audioDir: "audio" },
      [],
      { trimDir: path.join("result", "trim"), outWav: "result/act.wav", timingsPath: concatPath },
    ),
    /concat\.txt.*timings JSON.*concat\.txt|timings JSON.*concat\.txt.*concat\.txt/,
  );
});

test("全局预检拒绝 timings JSON 覆盖只读 script 输入", () => {
  assert.throws(
    () => courseAudio.assertOutputDoesNotOverwriteSegmentAudio(
      { scriptPath: "result/act1_timings.json", audioDir: "audio" },
      [],
      { trimDir: "result/trim", outWav: "result/act1.wav", timingsPath: "result/act1_timings.json" },
    ),
    /timings JSON.*script 输入|script 输入.*timings JSON/,
  );
});

test("全局预检按 Windows 大小写不敏感语义拒绝写目标覆盖 script", () => {
  assert.throws(
    () => courseAudio.assertOutputDoesNotOverwriteSegmentAudio(
      { scriptPath: "C:/Result/ACT1_TIMINGS.JSON", audioDir: "audio" },
      [],
      { trimDir: "result/trim", outWav: "result/act1.wav", timingsPath: "c:/result/act1_timings.json" },
    ),
    /timings JSON.*script 输入|script 输入.*timings JSON/,
  );
});

test("CLI 在任何副作用前拒绝 timings JSON 覆盖 script", () => {
  const sideEffects = [];
  const scriptPath = path.join("result", "act1_timings.json");
  assert.throws(
    () => main([scriptPath, "audio", "act1", "--out-dir", "result", "--force"], {
      readFileSync: () => JSON.stringify({ segments: [] }),
      existsSync: () => false,
      mkdirSync: () => sideEffects.push("mkdir"),
      execSync: () => sideEffects.push("exec"),
      writeFileSync: () => sideEffects.push("write"),
    }),
    /timings JSON.*script 输入|script 输入.*timings JSON/,
  );
  assert.deepEqual(sideEffects, []);
});

test("父 phrase 的三位 dur 严格等于三位 end 减 start", () => {
  const phrase = buildTimingMetadata([
    { id: "g01", text: "第一句。", gap: 0.0005, d: 0.102 },
    { id: "g02", text: "第二句。", gap: 0, d: 0.1025 },
  ], "act1").phrases[1];
  assert.equal(phrase.start, 0.102);
  assert.equal(phrase.end, 0.205);
  assert.equal(phrase.dur, 0.103);
  assert.equal(phrase.dur, +(phrase.end - phrase.start).toFixed(3));
});

for (const [field, value, pattern] of [
  ["outName", "", /outName/],
  ["outName", "../act1", /outName/],
  ["outName", "act 1", /outName/],
  ["outName", "act'1", /outName/],
  ["segment id", "..", /segment.*id/],
  ["segment id", "g/01", /segment.*id/],
  ["segment id", "g\\01", /segment.*id/],
  ["segment id", "g01;rm", /segment.*id/],
  ["segment id", "g01\nnext", /segment.*id/],
]) {
  test(`安全标识符拒绝 ${field}=${JSON.stringify(value)}`, () => {
    assert.throws(() => courseAudio.assertSafeIdentifier(value, field), pattern);
  });
}

test("安全标识符接受现有 s0、g01、g14 和 act1", () => {
  for (const value of ["s0", "g01", "g14", "act1"]) {
    assert.equal(courseAudio.assertSafeIdentifier(value, "segment id"), value);
  }
});

test("目录包含性在 POSIX 与 Windows 下拒绝 ../ 逃逸", () => {
  assert.throws(
    () => courseAudio.assertPathInsideDirectory("/audio/../outside/g01.wav", "/audio", "raw", "linux"),
    /raw.*audio/,
  );
  assert.throws(
    () => courseAudio.assertPathInsideDirectory("C:\\audio\\..\\outside\\g01.wav", "C:\\audio", "trim", "win32"),
    /trim.*audio/i,
  );
  assert.equal(
    courseAudio.assertPathInsideDirectory("C:\\audio\\trim\\g01.wav", "C:\\audio\\trim", "trim", "win32"),
    undefined,
  );
});

test("ffconcat 清单行转义单引号和反斜杠并拒绝换行", () => {
  assert.equal(
    courseAudio.ffconcatFileLine("C:\\Audio\\John's.wav"),
    "file 'C:\\\\Audio\\\\John'\\''s.wav'",
  );
  assert.throws(() => courseAudio.ffconcatFileLine("safe\nnext.wav"), /换行|回车/);
  assert.throws(() => courseAudio.ffconcatFileLine("safe\rnext.wav"), /换行|回车/);
});

test("命令执行器以独立参数传递恶意音频路径且 shell 为 false", () => {
  const commands = [];
  const maliciousAudioDir = "audio; touch PWNED";
  main(["script.json", maliciousAudioDir, "act1", "--out-dir", "result"], {
    readFileSync: () => JSON.stringify({ segments: [{ id: "g01", text: "正文" }] }),
    existsSync: (file) => file === path.join(maliciousAudioDir, "g01.wav"),
    mkdirSync: () => {},
    writeFileSync: () => {},
    runCommand: (program, args, options) => {
      commands.push({ program, args, options });
      return program === "ffprobe" ? "2.000\n" : "";
    },
  });

  const trim = commands.find(({ program, args }) => program === "ffmpeg" && args.includes("-af"));
  assert.equal(trim.program, "ffmpeg");
  assert.ok(trim.args.includes(path.join(maliciousAudioDir, "g01.wav")));
  assert.equal(trim.options.shell, false);
  assert.ok(commands.every(({ program }) => !program.includes(";")));
  assert.ok(commands.every(({ args }) => args.every((arg) => !arg.includes("ffmpeg "))));
});
