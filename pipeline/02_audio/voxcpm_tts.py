# 用途：用 VoxCPM 逐句合成课程旁白，四幕批量任务只加载一次模型。
# 运行：npm run voiceover -- --job <正式脚本JSON> <原始音频目录>，可重复指定四幕。
# 依赖：VoxCPM 环境、模型、配对参考音与文本；详细配置见 course/docs/setup.md。
# -*- coding: utf-8 -*-
"""
输入正式 JSON 的 segments，输出 <音频目录>/<id>.wav。
后续由 build/course_audio.mjs 裁切、拼接、变速并生成同步 timings。

单幕示例（在仓库根目录执行，NN-slug 替换为本期目录）：
  npm run voiceover -- --script pipeline/01_script/NN-slug/course_epNN_act1.json --out pipeline/02_audio/NN-slug/course_epNN_act1_voxcpm_raw

四幕批量模式重复传入 --job <JSON> <音频目录>，模型只加载一次。
正式配音前应用术语读音映射：
  npm run voiceover -- --apply-mappings-only --script pipeline/01_script/NN-slug/course_epNN_actN.json

音频后处理：
  node --env-file-if-exists=.env build/course_audio.mjs <JSON> <原始音频目录> actN --out-dir <正式音频目录> --speed 1.15
"""
import sys
# 避开 GBK 终端的编码坑：输出强制 UTF-8
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import os
import argparse
import json
import re
import faulthandler
import math
import time
import traceback
from contextlib import contextmanager

DEFAULT_TIMEOUT_SECONDS = 180

# 模型及源码由环境变量或命令参数指定，默认使用已安装的 voxcpm 包。
VOXCPM_SRC = os.environ.get("VOXCPM_SRC", "")
MODEL = os.environ.get("VOXCPM_MODEL", "models/VoxCPM2")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
NUMBA_CACHE_DIR = os.path.join(ROOT, ".cache", "numba")
DEFAULT_TTS_MAPPINGS_FILE = os.path.join(ROOT, "pipeline", "02_audio", "tts_mappings.json")
DEFAULT_REF_WAV = os.environ.get("VOXCPM_REF_WAV", os.path.join(ROOT, "voices", "reference.wav"))
DEFAULT_REF_TEXT_FILE = os.environ.get("VOXCPM_REF_TEXT_FILE", os.path.join(ROOT, "voices", "reference.txt"))


def configure_numba_cache(cache_dir=NUMBA_CACHE_DIR):
    """把 Numba 缓存固定到项目内可写目录，兼容受限沙箱账户。"""
    cache_dir = os.path.abspath(os.fspath(cache_dir))
    os.makedirs(cache_dir, exist_ok=True)
    os.environ["NUMBA_CACHE_DIR"] = cache_dir
    return cache_dir


def get_execution_user():
    """读取操作系统的真实进程账户，不信任可被继承或改写的 USERNAME。"""
    if os.name == "nt":
        import ctypes
        from ctypes import wintypes

        buffer = ctypes.create_unicode_buffer(257)
        size = wintypes.DWORD(len(buffer))
        api = ctypes.WinDLL("advapi32", use_last_error=True).GetUserNameW
        api.argtypes = [wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
        api.restype = wintypes.BOOL
        if not api(buffer, ctypes.byref(size)):
            raise ctypes.WinError(ctypes.get_last_error())
        return buffer.value
    import pwd
    return pwd.getpwuid(os.geteuid()).pw_name


@contextmanager
def timed_stage(label, timeout, log_path):
    """使用本机看门狗：即使底层调用持有 GIL，超时也打印堆栈并退出进程。"""
    if not math.isfinite(timeout) or timeout <= 0:
        raise ValueError("超时秒数必须为有限正数")
    started = time.monotonic()
    with open(log_path, "a", encoding="utf-8") as log:
        message = "%s PID=%s 开始 %s；上限 %ss" % (
            time.strftime("%Y-%m-%d %H:%M:%S"), os.getpid(), label, timeout
        )
        print(message + "；诊断日志：" + str(log_path), flush=True)
        print(message, file=log, flush=True)
        print("超时将记录调用栈并退出；请检查运行账户与本阶段，勿盲目重试或复用失败句的 WAV。", file=log, flush=True)
        faulthandler.dump_traceback_later(timeout, file=log, exit=True)
        try:
            yield
        except BaseException:
            traceback.print_exc(file=log)
            raise
        finally:
            faulthandler.cancel_dump_traceback_later()
        print("完成 %s；耗时 %.3fs" % (label, time.monotonic() - started), file=log, flush=True)


def validate_segment_id(segment_id):
    """校验仅可安全用于音频文件名的 segment id。"""
    if not isinstance(segment_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", segment_id):
        raise ValueError("segment id %r 的 id 必须匹配 [A-Za-z0-9_-]+" % segment_id)
    return segment_id


def normalize_english_letters(text):
    """提取英文字符并忽略大小写、连字符和朗读空格。"""
    return "".join(char.lower() for char in text if char.isascii() and char.isalpha())


def load_tts_mappings(path=DEFAULT_TTS_MAPPINGS_FILE):
    """读取并校验显示文本到朗读文本的确定性映射。"""
    with open(path, "r", encoding="utf-8") as file:
        mappings = json.load(file)
    if not isinstance(mappings, dict) or any(
        not isinstance(source, str) or not source
        or not isinstance(target, str) or not target
        for source, target in mappings.items()
    ):
        raise ValueError("TTS 映射表必须是非空字符串到非空字符串的 JSON 对象")
    return mappings


def _mapping_pattern(source):
    """生成完整术语匹配表达式，避免误伤 QLoRA、AdaLoRA 等复合名称。"""
    left = r"(?<![A-Za-z0-9_-])" if source[0].isascii() and source[0].isalnum() else ""
    right = r"(?![A-Za-z0-9_-])" if source[-1].isascii() and source[-1].isalnum() else ""
    return re.compile(left + re.escape(source) + right)


def apply_tts_mappings(text, mappings):
    """按长度优先应用完整术语映射。"""
    result = text
    for source, target in sorted(mappings.items(), key=lambda item: len(item[0]), reverse=True):
        result = _mapping_pattern(source).sub(target, result)
    return result


def apply_tts_mappings_to_script(script, mappings):
    """把映射结果显式写入父句和字幕单元，返回修改字段数量。"""
    segments = script.get("segments")
    if not isinstance(segments, list) or not segments:
        raise ValueError("正式脚本必须包含非空 segments")
    changed = 0
    for segment in segments:
        records = [segment, *segment.get("subtitle_units", [])]
        for record in records:
            base_text = record.get("tts_text", record.get("text"))
            if not isinstance(base_text, str):
                continue
            mapped_text = apply_tts_mappings(base_text, mappings)
            if mapped_text != base_text:
                record["tts_text"] = mapped_text
                changed += 1
    return changed


def apply_tts_mappings_to_file(script_path, mappings):
    """以 UTF-8 读取、更新并写回一份正式脚本。"""
    with open(script_path, "r", encoding="utf-8") as file:
        script = json.load(file)
    changed = apply_tts_mappings_to_script(script, mappings)
    if changed:
        with open(script_path, "w", encoding="utf-8", newline="\n") as file:
            json.dump(script, file, ensure_ascii=False, indent=2)
            file.write("\n")
    return changed


def validate_english_preserved(segment_id, text, tts_text, mappings=None):
    """保证朗读映射不删除、翻译或替换显示文本中的英文内容。"""
    mappings = load_tts_mappings() if mappings is None else mappings
    expected_text = apply_tts_mappings(text, mappings)
    if apply_tts_mappings(tts_text, mappings) != tts_text:
        raise ValueError("segment %s 的 tts_text 尚未应用已确认的 TTS 映射" % segment_id)
    display_english = normalize_english_letters(expected_text)
    spoken_english = normalize_english_letters(tts_text)
    if display_english != spoken_english:
        raise ValueError(
            "segment %s 的英文内容必须在 tts_text 中原样保留；"
            "只允许调整大小写、连字符和字母间空格" % segment_id
        )


def resolve_tts_text(segment, mappings=None):
    """解析单段朗读文本，并校验父显示/朗读文本类型契约。"""
    text = segment["text"]
    if not isinstance(text, str) or not text.strip():
        raise ValueError("segment %s 的 text 必须是非空字符串" % segment["id"])
    if "tts_text" not in segment:
        if any(mark in text for mark in ('“', '”', '"')):
            raise ValueError(
                "segment %s 的显示文本含双引号，必须显式提供无引号 tts_text"
                % segment["id"]
            )
        return text
    tts_text = segment["tts_text"]
    if not isinstance(tts_text, str) or not tts_text.strip():
        raise ValueError("segment %s 的 tts_text 必须是非空字符串" % segment["id"])
    if any(mark in tts_text for mark in ('“', '”', '"')):
        raise ValueError("segment %s 的 tts_text 不能包含双引号" % segment["id"])
    validate_english_preserved(segment["id"], text, tts_text, mappings)
    return tts_text


def validate_segments(segments, mappings=None):
    """在所有输出和模型副作用前校验整份脚本的父段数据。"""
    seen_ids = set()
    for segment in segments:
        segment_id = validate_segment_id(segment["id"])
        if segment_id in seen_ids:
            raise ValueError("segment %s 的 id 重复" % segment_id)
        seen_ids.add(segment_id)
        resolve_tts_text(segment, mappings)


def resolve_out_wav(out_dir, segment_id):
    """生成并确认位于输出目录内的 WAV 路径。"""
    out_dir = os.path.abspath(out_dir)
    out_wav = os.path.abspath(os.path.join(out_dir, "%s.wav" % segment_id))
    if os.path.commonpath((out_dir, out_wav)) != out_dir:
        raise ValueError("segment %s 的 id 生成了输出目录外的路径" % segment_id)
    return out_wav


def load_jobs(job_specs, mappings=None):
    """读取并预检全部任务，确保模型加载前即可发现脚本错误。"""
    jobs = []
    for script_path, out_dir in job_specs:
        with open(script_path, "r", encoding="utf-8") as f:
            script = json.load(f)
        segments = script.get("segments", [])
        if not segments:
            print("script 里没有 segments，退出：", script_path)
            sys.exit(1)
        validate_segments(segments, mappings)
        out_dir = os.path.abspath(out_dir)
        for segment in segments:
            resolve_out_wav(out_dir, segment["id"])
        jobs.append(
            {"script_path": script_path, "out_dir": out_dir, "segments": segments}
        )
    return jobs


def main():
    ap = argparse.ArgumentParser(description="VoxCPM 逐句克隆合成")
    ap.add_argument("--script", help="单幕 script.json（segments: id/text）")
    ap.add_argument("--out", help="单幕输出音频目录（每句一个 <id>.wav）")
    ap.add_argument(
        "--job",
        action="append",
        nargs=2,
        metavar=("SCRIPT", "OUT"),
        help="批量任务，可重复传入；模型只加载一次",
    )
    ap.add_argument("--model", default=MODEL, help="本地 VoxCPM2 权重目录，也可设置 VOXCPM_MODEL")
    ap.add_argument("--voxcpm-src", default=VOXCPM_SRC, help="可选的 VoxCPM src 目录；默认使用安装包")
    ap.add_argument("--ref", default=DEFAULT_REF_WAV, help="参考 WAV；默认 voices/reference.wav")
    ap.add_argument("--ref-text-file", default=DEFAULT_REF_TEXT_FILE, help="与参考 WAV 精确配对的 UTF-8 文本；默认 voices/reference.txt")
    ap.add_argument("--mappings", default=DEFAULT_TTS_MAPPINGS_FILE,
                    help="TTS 映射表（默认 pipeline/02_audio/tts_mappings.json）")
    ap.add_argument("--apply-mappings-only", action="store_true",
                    help="只把映射写回 --script 后退出，不加载模型")
    ap.add_argument("--skip-existing", action="store_true", help="已存在的 <id>.wav 跳过（崩溃后续跑用）")
    ap.add_argument("--timeout-seconds", type=float, default=DEFAULT_TIMEOUT_SECONDS,
                    help="依赖导入、模型加载及每句合成各自的超时上限（默认 180 秒）")
    args = ap.parse_args()
    if not math.isfinite(args.timeout_seconds) or args.timeout_seconds <= 0:
        ap.error("--timeout-seconds 必须为有限正数")

    mappings = load_tts_mappings(args.mappings)

    if args.apply_mappings_only:
        if not args.script or args.out or args.job:
            ap.error("--apply-mappings-only 必须只配合 --script 使用")
        changed = apply_tts_mappings_to_file(args.script, mappings)
        print("TTS 映射完成：%s，修改 %d 个字段" % (args.script, changed))
        return

    user = get_execution_user()

    if args.job:
        if args.script or args.out:
            ap.error("--job 不能与 --script/--out 同时使用")
        job_specs = args.job
    else:
        if not args.script or not args.out:
            ap.error("单幕模式必须同时提供 --script 和 --out")
        job_specs = [(args.script, args.out)]

    jobs = load_jobs(job_specs, mappings)

    ref_wav = os.path.abspath(args.ref)
    if not os.path.exists(ref_wav):
        print("参考音频不存在:", ref_wav)
        sys.exit(1)
    if not os.path.isfile(args.ref_text_file):
        ap.error("参考文本不存在：%s；请用 --ref-text-file 提供与 WAV 精确配对的文本" % args.ref_text_file)
    with open(args.ref_text_file, "r", encoding="utf-8") as f:
        ref_text = f.read().strip()
    if not ref_text:
        ap.error("参考文本不能为空")

    for job in jobs:
        os.makedirs(job["out_dir"], exist_ok=True)

    log_path = os.path.join(jobs[0]["out_dir"], "voxcpm_run.log")
    numba_cache_dir = configure_numba_cache()
    print("Numba 缓存目录:", numba_cache_dir, flush=True)
    # 坑3：必须先 import torch，再 import numpy/librosa（在 import voxcpm 之前）
    if args.voxcpm_src:
        if not os.path.isdir(args.voxcpm_src):
            ap.error("VoxCPM 源码目录不存在：%s" % args.voxcpm_src)
        sys.path.insert(0, os.path.abspath(args.voxcpm_src))
    with timed_stage("导入依赖 user=%s python=%s" % (user, sys.executable), args.timeout_seconds, log_path):
        import torch  # noqa: F401  —— 先于 numpy/soundfile/librosa
        from voxcpm import VoxCPM
        import soundfile as sf

    print("[1/2] 加载模型（首次加载吃内存，峰值约 10-14GB，约十几秒）...", flush=True)
    with timed_stage("加载模型 %s torch=%s" % (args.model, getattr(torch, "__version__", "unknown")),
                     args.timeout_seconds, log_path):
        model = VoxCPM.from_pretrained(hf_model_id=args.model, load_denoiser=False, optimize=False)
    sr = model.tts_model.sample_rate
    print("      模型就绪，采样率 =", sr, "| 参考:", os.path.basename(ref_wav), flush=True)

    total = sum(len(job["segments"]) for job in jobs)
    print("[2/2] 批量逐句克隆，共 %d 幕、%d 句" % (len(jobs), total), flush=True)
    done = 0
    for job_index, job in enumerate(jobs, 1):
        segments = job["segments"]
        out_dir = job["out_dir"]
        print("  [幕 %d/%d] → %s" % (job_index, len(jobs), out_dir), flush=True)
        for i, s in enumerate(segments, 1):
            sid = s["id"]
            text = s["text"]
            tts_text = resolve_tts_text(s)
            out_wav = resolve_out_wav(out_dir, sid)
            if args.skip_existing and os.path.exists(out_wav):
                print("    [%d/%d] %s 跳过(已存在)" % (i, len(segments), sid), flush=True)
                continue
            if text == tts_text:
                print("    [%d/%d] %s : %s" % (i, len(segments), sid, text), flush=True)
            else:
                print("    [%d/%d] %s display: %s | TTS: %s" % (i, len(segments), sid, text, tts_text), flush=True)
            with timed_stage("合成 %s/%s ref=%s" % (job["script_path"], sid, ref_wav),
                             args.timeout_seconds, log_path):
                wav = model.generate(
                    text=tts_text,
                    reference_wav_path=ref_wav,   # 坑2：克隆主入口
                    prompt_wav_path=ref_wav,      # 叠加 prompt 走「极致克隆」
                    prompt_text=ref_text,
                    cfg_value=2.0,                # 指南锁定，勿改
                    inference_timesteps=10,       # 同上
                    normalize=True,
                )
                sf.write(out_wav, wav, sr)
            done += 1

    print("完成：本次合成 %d 句（共 %d）。" % (done, total), flush=True)
    print("下一步（阶段2，需 ffmpeg）:", flush=True)
    for job in jobs:
        print(
            "  node build/course_audio.mjs %s %s <out_name> --speed 1.15"
            % (job["script_path"], job["out_dir"]),
            flush=True,
        )


if __name__ == "__main__":
    main()
