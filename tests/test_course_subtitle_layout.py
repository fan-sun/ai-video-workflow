# -*- coding: utf-8 -*-
import pathlib
import re
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
COURSE_ACTS = ROOT / "course" / "acts"
COURSE_TEMPLATE = ROOT / "templates" / "course-explainer-3x4" / "index.html"


class CourseSubtitleLayoutTests(unittest.TestCase):
    def test_课程字幕必须均衡换行且flex只包含单一_subtext(self):
        renderers = []
        invalid = []
        html_paths = sorted(COURSE_ACTS.rglob("*.html")) + [COURSE_TEMPLATE]
        for html_path in html_paths:
            source = html_path.read_text(encoding="utf-8")
            if not re.search(r'\.className\s*=\s*["\']sub["\']', source):
                continue
            renderers.append(html_path)
            uses_flex = bool(re.search(r"\.sub\s*\{[^}]*display\s*:\s*flex", source))
            has_balanced_wrap = "text-wrap:balance" in source
            has_single_flex_item = (
                'class="subtext"' in source
                and ".subtext{display:block;width:100%;text-wrap:balance}" in source
            )
            if not has_balanced_wrap or (uses_flex and not has_single_flex_item):
                invalid.append(html_path.relative_to(ROOT).as_posix())

        self.assertTrue(renderers, "没有找到课程字幕渲染器")
        self.assertEqual(
            invalid,
            [],
            "字幕缺少均衡换行或可能被 Flex 拆成多个换行块：%s" % invalid,
        )


class CourseTemplateLayoutTests(unittest.TestCase):
    def test_共享模板的示例字幕时间不重叠(self):
        source = COURSE_TEMPLATE.read_text(encoding="utf-8")
        cues = [
            (float(start), float(end))
            for start, end in re.findall(r"\{s:([\d.]+),e:([\d.]+),t:", source)
        ]

        self.assertTrue(cues, "没有找到共享模板的示例字幕")
        overlaps = [
            (index + 1, end, cues[index + 1][0])
            for index, (_, end) in enumerate(cues[:-1])
            if cues[index + 1][0] < end
        ]
        self.assertEqual(overlaps, [], "示例字幕时间重叠：%s" % overlaps)
        self.assertIn(
            "Math.max(p.s+0.4,p.e-0.18)",
            source,
            "字幕淡出必须在本句结束时完成，不能延伸到下一句",
        )

    def test_共享模板的装饰景深层不参与布局审计(self):
        source = COURSE_TEMPLATE.read_text(encoding="utf-8")

        self.assertRegex(
            source,
            r'<div\s+class="depth"\s+data-layout-ignore(?:\s|>)',
        )


if __name__ == "__main__":
    unittest.main()
