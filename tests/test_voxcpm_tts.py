# -*- coding: utf-8 -*-
import importlib.util
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import types
import unittest
from unittest import mock


MODULE_PATH = (
    pathlib.Path(__file__).resolve().parents[1]
    / "pipeline"
    / "02_audio"
    / "voxcpm_tts.py"
)
SPEC = importlib.util.spec_from_file_location("voxcpm_tts", MODULE_PATH)
voxcpm_tts = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(voxcpm_tts)


class DefaultReferenceTests(unittest.TestCase):
    def test_默认参考音使用仓库内用户配置目录(self):
        self.assertEqual(
            pathlib.Path(voxcpm_tts.DEFAULT_REF_WAV).name,
            "reference.wav",
        )


class NumbaCacheTests(unittest.TestCase):
    def test_缓存强制落到显式可写目录并覆盖继承的外部目录(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache_dir = pathlib.Path(tmp) / "numba-cache"
            with mock.patch.dict(os.environ, {"NUMBA_CACHE_DIR": "Z:/不可写缓存"}):
                result = voxcpm_tts.configure_numba_cache(cache_dir)

                self.assertEqual(pathlib.Path(os.environ["NUMBA_CACHE_DIR"]), cache_dir)
                self.assertEqual(pathlib.Path(result), cache_dir)
                self.assertTrue(cache_dir.is_dir())


class RuntimeProtectionTests(unittest.TestCase):

    def test_环境变量不能冒充真实运行账户(self):
        with mock.patch.dict("os.environ", {"USERNAME": "CodexSandboxFake", "LOGNAME": "CodexSandboxFake"}):
            self.assertNotEqual(voxcpm_tts.get_execution_user(), "CodexSandboxFake")

    def run_stage(self, folder, body, timeout=0.2):
        log_path = pathlib.Path(folder) / "runtime.log"
        code = (
            "import importlib.util, time, ctypes, os\n"
            f"spec = importlib.util.spec_from_file_location('tts', {str(MODULE_PATH)!r})\n"
            "tts = importlib.util.module_from_spec(spec)\n"
            "spec.loader.exec_module(tts)\n"
            f"with tts.timed_stage('act1/g01', {timeout!r}, {str(log_path)!r}):\n"
            + body + "\n"
        )
        result = subprocess.run([sys.executable, "-c", code], capture_output=True, timeout=10)
        log = log_path.read_text(encoding="utf-8") if log_path.exists() else ""
        return result, log

    def test_阻塞的本机调用超时后进程退出并留下阶段与堆栈(self):
        with tempfile.TemporaryDirectory() as tmp:
            result, log = self.run_stage(tmp, '    ctypes.PyDLL("kernel32").Sleep(5000) if os.name == "nt" else time.sleep(5)')
        self.assertEqual(result.returncode, 1)
        self.assertIn("act1/g01", log)
        self.assertIn("Timeout", log)
        self.assertIn("<module>", log)

    def test_成功阶段取消定时器不误杀后续工作(self):
        with tempfile.TemporaryDirectory() as tmp:
            result, log = self.run_stage(tmp, "    pass\ntime.sleep(0.5)")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("完成", log)
        self.assertNotIn("Timeout", log)

    def test_异常保留原错误并记录到诊断文件(self):
        with tempfile.TemporaryDirectory() as tmp:
            result, log = self.run_stage(tmp, "    raise ValueError('bad-reference')")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ValueError: bad-reference", log)

    def test_非法超时不能关闭防护(self):
        for timeout in (0, -1, float("nan"), float("inf")):
            with self.subTest(timeout=timeout), self.assertRaises(ValueError):
                with voxcpm_tts.timed_stage("act1/g01", timeout, "unused.log"):
                    self.fail("不应执行阶段")

    def test_生产入口的模型阻塞受到超时保护(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = pathlib.Path(tmp)
            script = folder / "act1.json"
            script.write_text(json.dumps({"segments": [{"id": "g01", "text": "测试。"}]}), encoding="utf-8")
            ref = folder / "ref.wav"
            ref.write_bytes(b"ref")
            (folder / "ref.txt").write_text("测试参考文本", encoding="utf-8")
            out = folder / "audio"
            code = (
                "import sys, types, time, runpy\n"
                "class Model:\n"
                "    tts_model = types.SimpleNamespace(sample_rate=48000)\n"
                "    def generate(self, **kwargs): time.sleep(5)\n"
                "sys.modules['torch'] = types.ModuleType('torch')\n"
                "sys.modules['voxcpm'] = types.SimpleNamespace(VoxCPM=types.SimpleNamespace(from_pretrained=lambda **k: Model()))\n"
                "sys.modules['soundfile'] = types.SimpleNamespace(write=lambda *args: None)\n"
                f"sys.argv = {[str(MODULE_PATH), '--script', str(script), '--out', str(out), '--ref', str(ref), '--ref-text-file', str(folder / 'ref.txt'), '--timeout-seconds', '0.2']!r}\n"
                f"runpy.run_path({str(MODULE_PATH)!r}, run_name='__main__')\n"
            )
            result = subprocess.run([sys.executable, "-c", code], capture_output=True, timeout=10)
            self.assertEqual(result.returncode, 1)
            log = (out / "voxcpm_run.log").read_text(encoding="utf-8")
            self.assertIn("act1.json/g01", log)
            self.assertIn("Timeout", log)
            self.assertIn("generate", log)
            self.assertFalse((out / "g01.wav").exists())


class ResolveTtsTextTests(unittest.TestCase):
    def test_未配置_tts_text时回退到text(self):
        segment = {"id": "g01", "text": "显示与朗读相同"}

        self.assertEqual(voxcpm_tts.resolve_tts_text(segment), "显示与朗读相同")

    def test_非空_tts_text优先于text(self):
        segment = {
            "id": "g02",
            "text": "画面显示文本",
            "tts_text": "语音朗读文本",
        }

        self.assertEqual(voxcpm_tts.resolve_tts_text(segment), "语音朗读文本")

    def test_显示文本含双引号时必须显式提供无引号朗读文本(self):
        for text in ("解释“猫”和狗的关系。", '解释"猫"和狗的关系。'):
            with self.subTest(text=text):
                with self.assertRaisesRegex(ValueError, "g02.*tts_text|tts_text.*g02"):
                    voxcpm_tts.resolve_tts_text({"id": "g02", "text": text})

    def test_显示文本含双引号时允许无引号朗读文本(self):
        segment = {
            "id": "g02",
            "text": "解释“猫”和“狗”的关系。",
            "tts_text": "解释猫和狗的关系。",
        }

        self.assertEqual(voxcpm_tts.resolve_tts_text(segment), "解释猫和狗的关系。")

    def test_朗读文本不能继续包含双引号(self):
        segment = {
            "id": "g02",
            "text": "解释“猫”和“狗”的关系。",
            "tts_text": "解释“猫”和狗的关系。",
        }

        with self.assertRaisesRegex(ValueError, "g02.*引号|引号.*g02"):
            voxcpm_tts.resolve_tts_text(segment)

    def test_空白_tts_text抛出包含segment_id的错误(self):
        for value in ("", "   ", "\t\n"):
            with self.subTest(value=repr(value)):
                with self.assertRaisesRegex(ValueError, "g14.*tts_text|tts_text.*g14"):
                    voxcpm_tts.resolve_tts_text(
                        {"id": "g14", "text": "画面显示文本", "tts_text": value}
                    )

    def test_非字符串或空白_text抛出包含segment_id和字段名的错误(self):
        for value in (None, 123, [], "", " \t\n"):
            with self.subTest(value=repr(value)):
                with self.assertRaisesRegex(ValueError, "g14.*text|text.*g14"):
                    voxcpm_tts.resolve_tts_text({"id": "g14", "text": value})

    def test_非字符串_tts_text抛出包含segment_id和字段名的错误(self):
        for value in (None, 123, []):
            with self.subTest(value=repr(value)):
                with self.assertRaisesRegex(ValueError, "g14.*tts_text|tts_text.*g14"):
                    voxcpm_tts.resolve_tts_text(
                        {"id": "g14", "text": "画面显示文本", "tts_text": value}
                    )

    def test_缺少_text保留自然_KeyError(self):
        with self.assertRaises(KeyError):
            voxcpm_tts.resolve_tts_text({"id": "g14"})

    def test_英文术语允许只调整连字符和字母间空格(self):
        for text, tts_text in (
            ("今天聊 Fine-tuning。", "今天聊 Fine tuning。"),
            ("也就是 CoT。", "也就是 C O T。"),
            ("让 AI 帮你。", "让 A I 帮你。"),
        ):
            with self.subTest(text=text, tts_text=tts_text):
                segment = {"id": "g01", "text": text, "tts_text": tts_text}
                self.assertEqual(voxcpm_tts.resolve_tts_text(segment), tts_text)

    def test_英文术语从朗读文本消失时拒绝(self):
        segment = {
            "id": "g01",
            "text": "今天聊微调，也就是 Fine-tuning。",
            "tts_text": "今天聊微调。",
        }

        with self.assertRaisesRegex(ValueError, "g01.*英文|英文.*g01"):
            voxcpm_tts.resolve_tts_text(segment)

    def test_英文术语被翻译成中文时拒绝(self):
        segment = {
            "id": "g02",
            "text": "让 AI 帮你。",
            "tts_text": "让人工智能帮你。",
        }

        with self.assertRaisesRegex(ValueError, "g02.*英文|英文.*g02"):
            voxcpm_tts.resolve_tts_text(segment)

    def test_英文术语被替换成其他英文时拒绝(self):
        segment = {
            "id": "g03",
            "text": "使用 LoRA。",
            "tts_text": "使用 Adapter。",
        }

        with self.assertRaisesRegex(ValueError, "g03.*英文|英文.*g03"):
            voxcpm_tts.resolve_tts_text(segment)


class TtsMappingTests(unittest.TestCase):
    def test_默认映射表包含已确定的两项读法(self):
        mappings = voxcpm_tts.load_tts_mappings()

        self.assertEqual(mappings["Fine-tuning"], "Fine tuning")
        self.assertEqual(mappings["LoRA"], "Lora")

    def test_只替换完整术语而不误伤复合名称(self):
        mappings = {"LoRA": "Lora"}

        self.assertEqual(
            voxcpm_tts.apply_tts_mappings(
                "LoRA、QLoRA、AdaLoRA 和 LoRA-GA。", mappings
            ),
            "Lora、QLoRA、AdaLoRA 和 LoRA-GA。",
        )

    def test_映射同步写入父句和字幕单元且重复执行幂等(self):
        script = {
            "segments": [
                {
                    "id": "g11",
                    "text": "LoRA 是一类参数高效方法。",
                    "subtitle_units": [
                        {"id": "g11.u01", "text": "LoRA 是一类参数高效方法。"}
                    ],
                }
            ]
        }

        self.assertEqual(
            voxcpm_tts.apply_tts_mappings_to_script(script, {"LoRA": "Lora"}),
            2,
        )
        self.assertEqual(script["segments"][0]["tts_text"], "Lora 是一类参数高效方法。")
        self.assertEqual(
            script["segments"][0]["subtitle_units"][0]["tts_text"],
            "Lora 是一类参数高效方法。",
        )
        self.assertEqual(
            voxcpm_tts.apply_tts_mappings_to_script(script, {"LoRA": "Lora"}),
            0,
        )

    def test_映射表明确声明时允许英文转为其他朗读文本(self):
        voxcpm_tts.validate_english_preserved(
            "g01", "让 AI 帮你。", "让人工智能帮你。", {"AI": "人工智能"}
        )

    def test_已知映射尚未应用时配音预检拒绝(self):
        segment = {
            "id": "g11",
            "text": "LoRA 是一类参数高效方法。",
            "tts_text": "LoRA 是一类参数高效方法。",
        }

        with self.assertRaisesRegex(ValueError, "g11.*映射|映射.*g11"):
            voxcpm_tts.resolve_tts_text(segment)


class FormalCourseScriptTests(unittest.TestCase):
    def test_Embedding四幕正式脚本通过配音文本门禁(self):
        script_dir = MODULE_PATH.parents[1] / "01_script"
        for script_path in sorted(script_dir.glob("course_ep03_act*.json")):
            with self.subTest(script=script_path.name):
                script = json.loads(script_path.read_text(encoding="utf-8"))
                voxcpm_tts.validate_segments(script["segments"])


class MainFlowTests(unittest.TestCase):
    def run_main(self, segment, skip_existing=False, create_existing=False):
        generated = []

        class FakeModel:
            tts_model = types.SimpleNamespace(sample_rate=24000)

            def generate(self, **kwargs):
                generated.append(kwargs)
                return b"wav"

        class FakeVoxCPM:
            @staticmethod
            def from_pretrained(**kwargs):
                return FakeModel()

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = pathlib.Path(tmp)
            script_path = tmp_path / "script.json"
            out_dir = tmp_path / "audio"
            ref_path = tmp_path / "ref.wav"
            script_path.write_text(
                json.dumps({"segments": [segment]}, ensure_ascii=False),
                encoding="utf-8",
            )
            ref_path.write_bytes(b"ref")
            ref_path.with_suffix(".txt").write_text("测试参考文本", encoding="utf-8")
            if create_existing:
                out_dir.mkdir()
                (out_dir / (segment["id"] + ".wav")).write_bytes(b"existing")

            argv = [
                "voxcpm_tts.py",
                "--script",
                str(script_path),
                "--out",
                str(out_dir),
                "--ref",
                str(ref_path),
                "--ref-text-file", str(ref_path.with_suffix(".txt")),
            ]
            if skip_existing:
                argv.append("--skip-existing")

            fake_modules = {
                "torch": types.ModuleType("torch"),
                "voxcpm": types.SimpleNamespace(VoxCPM=FakeVoxCPM),
                "soundfile": types.SimpleNamespace(write=lambda *args: None),
            }
            with mock.patch.object(sys, "argv", argv), mock.patch.dict(
                sys.modules, fake_modules
            ):
                voxcpm_tts.main()

        return generated

    def test_主流程用解析后的_tts_text调用模型(self):
        generated = self.run_main(
            {"id": "g02", "text": "画面显示文本", "tts_text": "语音朗读文本"}
        )

        self.assertEqual(generated[0]["text"], "语音朗读文本")

    def test_skip_existing且已有_wav时仍校验空白_tts_text(self):
        with self.assertRaisesRegex(ValueError, "g14"):
            self.run_main(
                {"id": "g14", "text": "画面显示文本", "tts_text": "   "},
                skip_existing=True,
                create_existing=True,
            )

    def test_主流程在加载模型和创建输出目录前拒绝非法父文本(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = pathlib.Path(tmp)
            script_path = tmp_path / "script.json"
            out_dir = tmp_path / "audio"
            ref_path = tmp_path / "ref.wav"
            script_path.write_text(
                json.dumps(
                    {"segments": [{"id": "g14", "text": 123}]},
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            ref_path.write_bytes(b"ref")
            ref_path.with_suffix(".txt").write_text("测试参考文本", encoding="utf-8")
            argv = [
                "voxcpm_tts.py",
                "--script",
                str(script_path),
                "--out",
                str(out_dir),
                "--ref",
                str(ref_path),
                "--ref-text-file", str(ref_path.with_suffix(".txt")),
            ]
            fake_voxcpm = types.SimpleNamespace(
                VoxCPM=types.SimpleNamespace(
                    from_pretrained=mock.Mock(side_effect=AssertionError("不应加载模型"))
                )
            )
            with mock.patch.object(sys, "argv", argv), mock.patch.dict(
                sys.modules,
                {
                    "torch": types.ModuleType("torch"),
                    "voxcpm": fake_voxcpm,
                    "soundfile": types.SimpleNamespace(write=lambda *args: None),
                },
            ):
                with self.assertRaisesRegex(ValueError, "g14.*text|text.*g14"):
                    voxcpm_tts.main()

            self.assertFalse(out_dir.exists())
            fake_voxcpm.VoxCPM.from_pretrained.assert_not_called()


class BatchJobTests(unittest.TestCase):
    def test_批量任务只加载一次模型并处理全部脚本(self):
        generated = []
        written_paths = []

        class FakeModel:
            tts_model = types.SimpleNamespace(sample_rate=48000)

            def generate(self, **kwargs):
                generated.append(kwargs)
                return b"wav"

        from_pretrained = mock.Mock(return_value=FakeModel())
        fake_voxcpm = types.SimpleNamespace(
            VoxCPM=types.SimpleNamespace(from_pretrained=from_pretrained)
        )

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = pathlib.Path(tmp)
            ref_path = tmp_path / "ref.wav"
            ref_path.write_bytes(b"ref")
            ref_path.with_suffix(".txt").write_text("测试参考文本", encoding="utf-8")
            argv = ["voxcpm_tts.py"]
            out_dirs = []
            for act in (1, 2, 3, 4):
                script_path = tmp_path / ("act%d.json" % act)
                out_dir = tmp_path / ("audio%d" % act)
                script_path.write_text(
                    json.dumps(
                        {
                            "segments": [
                                {"id": "a%d" % act, "text": "第%d幕" % act}
                            ]
                        },
                        ensure_ascii=False,
                    ),
                    encoding="utf-8",
                )
                argv.extend(["--job", str(script_path), str(out_dir)])
                out_dirs.append(out_dir)
            argv.extend(["--ref", str(ref_path), "--ref-text-file", str(ref_path.with_suffix(".txt"))])

            fake_modules = {
                "torch": types.ModuleType("torch"),
                "voxcpm": fake_voxcpm,
                "soundfile": types.SimpleNamespace(
                    write=lambda path, *args: written_paths.append(path)
                ),
            }
            with mock.patch.object(sys, "argv", argv), mock.patch.dict(
                sys.modules, fake_modules
            ):
                voxcpm_tts.main()

            self.assertEqual(from_pretrained.call_count, 1)
            self.assertEqual(
                [item["text"] for item in generated],
                ["第1幕", "第2幕", "第3幕", "第4幕"],
            )
            self.assertEqual(
                [pathlib.Path(path).parent for path in written_paths], out_dirs
            )

    def test_批量任务在任一脚本非法时不加载模型也不创建输出目录(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = pathlib.Path(tmp)
            ref_path = tmp_path / "ref.wav"
            ref_path.write_bytes(b"ref")
            ref_path.with_suffix(".txt").write_text("测试参考文本", encoding="utf-8")
            argv = ["voxcpm_tts.py"]
            out_dirs = []
            for act, text in ((1, "第一幕"), (2, 123)):
                script_path = tmp_path / ("act%d.json" % act)
                out_dir = tmp_path / ("audio%d" % act)
                script_path.write_text(
                    json.dumps(
                        {"segments": [{"id": "a%d" % act, "text": text}]},
                        ensure_ascii=False,
                    ),
                    encoding="utf-8",
                )
                argv.extend(["--job", str(script_path), str(out_dir)])
                out_dirs.append(out_dir)
            argv.extend(["--ref", str(ref_path), "--ref-text-file", str(ref_path.with_suffix(".txt"))])

            from_pretrained = mock.Mock(side_effect=AssertionError("不应加载模型"))
            fake_modules = {
                "torch": types.ModuleType("torch"),
                "voxcpm": types.SimpleNamespace(
                    VoxCPM=types.SimpleNamespace(from_pretrained=from_pretrained)
                ),
                "soundfile": types.SimpleNamespace(write=lambda *args: None),
            }
            with mock.patch.object(sys, "argv", argv), mock.patch.dict(
                sys.modules, fake_modules
            ):
                with self.assertRaisesRegex(ValueError, "a2.*text|text.*a2"):
                    voxcpm_tts.main()

            from_pretrained.assert_not_called()
            self.assertTrue(all(not out_dir.exists() for out_dir in out_dirs))


class SegmentIdValidationTests(unittest.TestCase):
    def test_正常_segment_id可用于文件名(self):
        for segment_id in ("s0", "g01", "g14", "seg_001", "A-Z_9-"):
            with self.subTest(segment_id=segment_id):
                self.assertEqual(voxcpm_tts.validate_segment_id(segment_id), segment_id)

    def test_危险_segment_id全部拒绝(self):
        invalid_ids = (
            "",
            ".",
            "..",
            "../x",
            "a/b",
            r"a\b",
            'a"b',
            "a'b",
            "a;b",
            "a b",
            "a\tb",
            "a\r\nb",
        )
        for segment_id in invalid_ids:
            with self.subTest(segment_id=repr(segment_id)):
                with self.assertRaisesRegex(
                    ValueError, re.escape("segment id %r" % segment_id) + ".*id"
                ):
                    voxcpm_tts.validate_segment_id(segment_id)

    def test_输出_wav解析后仍在输出目录内(self):
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = pathlib.Path(tmp) / "audio"
            out_wav = pathlib.Path(voxcpm_tts.resolve_out_wav(str(out_dir), "g14"))

            self.assertEqual(out_wav.parent, out_dir.resolve())
            self.assertTrue(out_wav.is_relative_to(out_dir.resolve()))


class MainFlowSafetyTests(unittest.TestCase):
    def test_主流程在创建输出目录和导入模型前拒绝恶意_sid(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = pathlib.Path(tmp)
            script_path = tmp_path / "script.json"
            out_dir = tmp_path / "audio"
            ref_path = tmp_path / "ref.wav"
            script_path.write_text(
                json.dumps(
                    {"segments": [{"id": "../escape", "text": "测试文本"}]},
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            ref_path.write_bytes(b"ref")
            ref_path.with_suffix(".txt").write_text("测试参考文本", encoding="utf-8")
            argv = [
                "voxcpm_tts.py",
                "--script",
                str(script_path),
                "--out",
                str(out_dir),
                "--ref",
                str(ref_path),
                "--ref-text-file", str(ref_path.with_suffix(".txt")),
            ]
            fake_voxcpm = types.SimpleNamespace(
                VoxCPM=types.SimpleNamespace(
                    from_pretrained=mock.Mock(side_effect=AssertionError("不应加载模型"))
                )
            )
            imported_modules = []
            original_import = __import__

            def record_import(name, *args, **kwargs):
                imported_modules.append(name)
                return original_import(name, *args, **kwargs)

            with mock.patch.object(sys, "argv", argv), mock.patch.dict(
                sys.modules,
                {
                    "torch": types.ModuleType("torch"),
                    "voxcpm": fake_voxcpm,
                    "soundfile": types.SimpleNamespace(write=lambda *args: None),
                },
            ), mock.patch("builtins.__import__", side_effect=record_import):
                with self.assertRaisesRegex(ValueError, "segment id.*id"):
                    voxcpm_tts.main()

            self.assertFalse(out_dir.exists())
            self.assertNotIn("voxcpm", imported_modules)
            fake_voxcpm.VoxCPM.from_pretrained.assert_not_called()

    def test_主流程在副作用前拒绝重复_sid(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = pathlib.Path(tmp)
            script_path = tmp_path / "script.json"
            out_dir = tmp_path / "audio"
            ref_path = tmp_path / "ref.wav"
            script_path.write_text(
                json.dumps(
                    {
                        "segments": [
                            {"id": "g01", "text": "第一句"},
                            {"id": "g01", "text": "第二句"},
                        ]
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            ref_path.write_bytes(b"ref")
            ref_path.with_suffix(".txt").write_text("测试参考文本", encoding="utf-8")
            argv = [
                "voxcpm_tts.py",
                "--script",
                str(script_path),
                "--out",
                str(out_dir),
                "--ref",
                str(ref_path),
                "--ref-text-file", str(ref_path.with_suffix(".txt")),
            ]
            fake_voxcpm = types.SimpleNamespace(
                VoxCPM=types.SimpleNamespace(
                    from_pretrained=mock.Mock(side_effect=AssertionError("不应加载模型"))
                )
            )
            with mock.patch.object(sys, "argv", argv), mock.patch.dict(
                sys.modules,
                {
                    "torch": types.ModuleType("torch"),
                    "voxcpm": fake_voxcpm,
                    "soundfile": types.SimpleNamespace(write=lambda *args: None),
                },
            ):
                with self.assertRaisesRegex(ValueError, "g01.*id|id.*g01"):
                    voxcpm_tts.main()

            self.assertFalse(out_dir.exists())
            fake_voxcpm.VoxCPM.from_pretrained.assert_not_called()


if __name__ == "__main__":
    unittest.main()
