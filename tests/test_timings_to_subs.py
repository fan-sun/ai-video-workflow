# -*- coding: utf-8 -*-
"""timings_to_subs.py 的字幕展平与输出契约测试。"""

import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "build" / "teaching" / "timings_to_subs.py"


def load_module():
    spec = importlib.util.spec_from_file_location("timings_to_subs_under_test", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TimingsToSubsTest(unittest.TestCase):
    def test_import_without_cli_arguments_has_no_side_effect(self):
        code = (
            "import importlib.util; "
            f"spec = importlib.util.spec_from_file_location('timings_to_subs_import_test', {str(MODULE_PATH)!r}); "
            "module = importlib.util.module_from_spec(spec); "
            "spec.loader.exec_module(module)"
        )
        result = subprocess.run(
            [sys.executable, "-c", code],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")

    def test_flattens_two_units_in_phrase_and_preserves_order_and_times(self):
        module = load_module()
        data = {
            "phrases": [
                {
                    "text": "父字幕",
                    "start": 1,
                    "end": 3,
                    "subtitle_units": [
                        {"id": "g1.u01", "text": "第一句", "start": 1.234, "end": 2.345},
                        {"id": "g1.u02", "text": "第二句", "start": 2.345, "end": 3.456},
                    ],
                }
            ]
        }

        self.assertEqual(
            module.flatten_subtitle_entries(data),
            [
                {"s": 1.23, "e": 2.35, "t": "第一句"},
                {"s": 2.35, "e": 3.46, "t": "第二句"},
            ],
        )

    def test_legacy_fallback_for_missing_or_empty_units(self):
        module = load_module()
        data = {
            "phrases": [
                {"text": "无字段", "start": 0.004, "end": 1.006},
                {"text": "空数组", "start": 2.004, "end": 3.006, "subtitle_units": []},
            ]
        }

        self.assertEqual(
            module.flatten_subtitle_entries(data),
            [
                {"s": 0.0, "e": 1.01, "t": "无字段"},
                {"s": 2.0, "e": 3.01, "t": "空数组"},
            ],
        )

    def test_rejects_subtitle_unit_end_not_after_start_after_quantization(self):
        module = load_module()
        invalid_units = [
            ("unit-reversed", 2, 1),
            ("unit-equal", 1, 1),
            ("unit-quantized-equal", 0.004, 0.0049),
        ]

        for unit_id, start, end in invalid_units:
            with self.subTest(unit_id=unit_id), self.assertRaisesRegex(
                ValueError, rf"{unit_id}.*start=.*end="
            ):
                module.flatten_subtitle_entries({
                    "phrases": [{
                        "id": "phrase-parent",
                        "text": "父字幕",
                        "start": 0,
                        "end": 3,
                        "subtitle_units": [{
                            "id": unit_id,
                            "text": "子字幕",
                            "start": start,
                            "end": end,
                        }],
                    }]
                })

    def test_rejects_legacy_phrase_end_not_after_start_after_quantization(self):
        module = load_module()

        with self.assertRaisesRegex(ValueError, r"phrase-quantized-equal.*start=.*end="):
            module.flatten_subtitle_entries({
                "phrases": [{
                    "id": "phrase-quantized-equal",
                    "text": "旧字幕",
                    "start": 0.004,
                    "end": 0.0049,
                }]
            })

    def test_rejects_legacy_phrase_when_end_quantization_overflows(self):
        module = load_module()

        with self.assertRaisesRegex(ValueError, r"phrase-quantize-overflow.*end="):
            module.flatten_subtitle_entries({
                "phrases": [{
                    "id": "phrase-quantize-overflow",
                    "text": "旧字幕",
                    "start": 0,
                    "end": "1E+26",
                }]
            })

    def test_rejects_quantized_span_indistinguishable_to_javascript_number_for_units_and_legacy(self):
        module = load_module()
        start = "1E+25"
        end = "1.0000000000000000000000001E+25"
        invalid_sources = [
            (
                "unit-js-number-indistinguishable",
                {
                    "phrases": [{
                        "id": "phrase-parent",
                        "text": "父字幕",
                        "start": 0,
                        "end": 1,
                        "subtitle_units": [{
                            "id": "unit-js-number-indistinguishable",
                            "text": "子字幕",
                            "start": start,
                            "end": end,
                        }],
                    }]
                },
            ),
            (
                "phrase-js-number-indistinguishable",
                {
                    "phrases": [{
                        "id": "phrase-js-number-indistinguishable",
                        "text": "旧字幕",
                        "start": start,
                        "end": end,
                    }]
                },
            ),
        ]

        for source_name, data in invalid_sources:
            with self.subTest(source_name=source_name), self.assertRaisesRegex(
                ValueError,
                rf"{source_name}.*两位时间无法由JavaScript Number区分",
            ):
                module.flatten_subtitle_entries(data)

    def test_rejects_non_finite_subtitle_times(self):
        module = load_module()

        with self.assertRaisesRegex(ValueError, r"unit-non-finite.*start=.*end="):
            module.flatten_subtitle_entries({
                "phrases": [{
                    "id": "phrase-parent",
                    "text": "父字幕",
                    "start": 0,
                    "end": 1,
                    "subtitle_units": [{
                        "id": "unit-non-finite",
                        "text": "子字幕",
                        "start": float("inf"),
                        "end": 1,
                    }],
                }]
            })

    def test_accepts_positive_span_after_half_up_quantization(self):
        module = load_module()

        self.assertEqual(
            module.flatten_subtitle_entries({
                "phrases": [{
                    "id": "phrase-parent",
                    "text": "父字幕",
                    "start": 0,
                    "end": 1,
                    "subtitle_units": [{
                        "id": "unit-positive",
                        "text": "子字幕",
                        "start": 0,
                        "end": 0.011,
                    }],
                }]
            }),
            [{"s": 0.0, "e": 0.01, "t": "子字幕"}],
        )

    def test_format_subs_cannot_bypass_invalid_final_entry_validation(self):
        module = load_module()

        with self.assertRaisesRegex(ValueError, r"unit-format.*start=.*end="):
            module.format_subs([{"id": "unit-format", "s": 1, "e": 1, "t": "字幕"}])

    def test_highlights_all_non_overlapping_occurrences_in_keyword_order(self):
        module = load_module()
        entry = {"s": 1.25, "e": 2.5, "t": "AI 与脑子，AI"}

        highlighted = dict(entry)
        highlighted["t"] = module.apply_highlights(entry["t"], ["AI", "脑子"])

        self.assertEqual(highlighted, {"s": 1.25, "e": 2.5, "t": "**AI** 与**脑子**，**AI**"})

    def test_highlights_do_not_rescan_inserted_markers(self):
        module = load_module()

        self.assertEqual(module.apply_highlights("AI", ["AI", "I"]), "**AI**")

    def test_highlights_respect_keyword_order_for_overlapping_terms(self):
        module = load_module()

        self.assertEqual(module.apply_highlights("循环工程", ["循环", "循环工程"]), "**循环**工程")

    def test_highlights_reverse_keyword_order_for_overlapping_terms(self):
        module = load_module()

        self.assertEqual(module.apply_highlights("循环工程", ["循环工程", "循环"]), "**循环工程**")

    def test_highlights_all_non_overlapping_keyword_occurrences(self):
        module = load_module()

        self.assertEqual(module.apply_highlights("AI工程AI", ["AI", "工程"]), "**AI****工程****AI**")

    def test_highlights_duplicate_keywords_without_duplicate_markers(self):
        module = load_module()

        self.assertEqual(module.apply_highlights("AI工程", ["AI", "AI", "工程"]), "**AI****工程**")

    def test_strips_only_absolute_trailing_display_punctuation(self):
        module = load_module()
        cases = {
            "让 AI 写封邮件，": "让 AI 写封邮件",
            "你好？！": "你好",
            "？！": "",
            "中间，标点": "中间，标点",
            "AI": "AI",
            "「你好。」": "「你好。」",
        }

        for source, expected in cases.items():
            with self.subTest(source=source):
                entries = module.flatten_subtitle_entries({
                    "phrases": [{"text": source, "start": 1.234, "end": 2.345}]
                })
                self.assertEqual(entries, [{"s": 1.23, "e": 2.35, "t": expected}])

    def test_cleaning_preserves_times_and_highlight_markers(self):
        module = load_module()
        entries = module.flatten_subtitle_entries({
            "phrases": [{
                "text": "这个词，叫 Loop Engineering。",
                "start": 1.234,
                "end": 2.345,
            }]
        })
        entries[0]["t"] = module.apply_highlights(entries[0]["t"], ["Loop Engineering"])

        self.assertEqual(entries, [{
            "s": 1.23,
            "e": 2.35,
            "t": "这个词，叫 **Loop Engineering**",
        }])

    def test_rejects_legacy_phrase_negative_start_before_quantization(self):
        module = load_module()

        with self.assertRaisesRegex(ValueError, r"legacy-negative-start.*start=.*end="):
            module.flatten_subtitle_entries({
                "phrases": [{
                    "id": "legacy-negative-start",
                    "text": "旧字幕",
                    "start": -0.004,
                    "end": 1,
                }]
            })

    def test_special_characters_use_valid_json_string_encoding(self):
        module = load_module()
        text = '中文"引号"\\路径\n下一行'
        output = module.format_subs([{"s": 1.0, "e": 2.0, "t": text}])

        encoded = json.dumps(text, ensure_ascii=False)
        self.assertIn(f"t:{encoded}", output)
        self.assertNotIn("\\u4e2d", output)

    def test_less_than_sign_is_script_safe_without_changing_decoded_text(self):
        module = load_module()
        text = "</script><b>"
        output = module.format_subs([{"s": 1.0, "e": 2.0, "t": text}])

        self.assertNotIn("</script>", output)
        self.assertIn(chr(92) + "u003c/script>", output)
        encoded_text = output.split("t:", 1)[1].split("}", 1)[0]
        self.assertEqual(json.loads(encoded_text), text)

    def test_format_preserves_exact_subs_wrapper_and_item_indent(self):
        module = load_module()

        self.assertEqual(
            module.format_subs([{"s": 1.2, "e": 2.3, "t": "字幕"}]),
            '      const SUBS=[\n        {s:1.2,e:2.3,t:"字幕"},\n      ];',
        )

    def test_main_reads_utf8_file_and_prints_highlighted_subs(self):
        module = load_module()
        data = {"phrases": [{"text": "中文 AI", "start": 0, "end": 1}]}
        with tempfile.TemporaryDirectory() as temp_dir:
            timings_path = Path(temp_dir) / "timings.json"
            timings_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                result = module.main([str(timings_path), "AI"])

        self.assertIsNone(result)
        self.assertEqual(
            stdout.getvalue(),
            '      const SUBS=[\n        {s:0,e:1,t:"中文 **AI**"},\n      ];\n',
        )

    def test_main_targeted_highlight_only_marks_the_requested_unit(self):
        module = load_module()
        data = {
            "phrases": [{
                "id": "g01",
                "text": "父字幕",
                "start": 0,
                "end": 2,
                "subtitle_units": [
                    {"id": "g01.u01", "text": "第一次出现词元", "start": 0, "end": 1},
                    {"id": "g01.u02", "text": "第二次出现词元", "start": 1, "end": 2},
                ],
            }]
        }
        highlights = [{
            "unit_id": "g01.u02",
            "text": "词元",
            "reason": "只标记指定的第二次出现",
        }]
        with tempfile.TemporaryDirectory() as temp_dir:
            timings_path = Path(temp_dir) / "timings.json"
            timings_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                module.main([
                    str(timings_path),
                    "--highlights-json",
                    json.dumps(highlights, ensure_ascii=False),
                ])

        self.assertEqual(
            stdout.getvalue(),
            '      const SUBS=[\n'
            '        {s:0,e:1,t:"第一次出现词元"},\n'
            '        {s:1,e:2,t:"第二次出现**词元**"},\n'
            '      ];\n',
        )

    def test_main_targeted_highlight_rejects_unknown_unit(self):
        module = load_module()
        data = {"phrases": [{"id": "g01", "text": "词元", "start": 0, "end": 1}]}
        highlights = [{"unit_id": "g99.u01", "text": "词元", "reason": "错误 ID"}]
        with tempfile.TemporaryDirectory() as temp_dir:
            timings_path = Path(temp_dir) / "timings.json"
            timings_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, r"g99\.u01.*不存在"):
                module.main([
                    str(timings_path),
                    "--highlights-json",
                    json.dumps(highlights, ensure_ascii=False),
                ])

    def test_main_targeted_highlight_rejects_ambiguous_text_in_one_unit(self):
        module = load_module()
        data = {"phrases": [{"id": "g01", "text": "Token 和 Token", "start": 0, "end": 1}]}
        highlights = [{"unit_id": "g01", "text": "Token", "reason": "文本重复"}]
        with tempfile.TemporaryDirectory() as temp_dir:
            timings_path = Path(temp_dir) / "timings.json"
            timings_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, r"g01.*恰好出现 1 次"):
                module.main([
                    str(timings_path),
                    "--highlights-json",
                    json.dumps(highlights, ensure_ascii=False),
                ])


if __name__ == "__main__":
    unittest.main()
