# -*- coding: utf-8 -*-
import importlib.util
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "build" / "inject_course_cover.py"


def load_module():
    spec = importlib.util.spec_from_file_location("inject_course_cover", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class InjectCourseCoverTests(unittest.TestCase):
    def test_把封面样式和定时图片注入主合成根节点(self):
        module = load_module()
        source = '<html><head></head><body><div id="root" data-composition-id="main"><p>正文</p></div></body></html>'

        result = module.inject_cover_html(source, "assets/cover.png", 0.5)

        self.assertIn('id="course-cover-style"', result)
        self.assertIn('id="cover-intro"', result)
        self.assertIn('class="cover-intro clip"', result)
        self.assertIn('src="assets/cover.png"', result)
        self.assertIn('data-start="0"', result)
        self.assertIn('data-duration="0.5"', result)
        self.assertIn('data-track-index="99"', result)
        self.assertLess(result.index('id="cover-intro"'), result.index("<p>正文</p>"))

    def test_仅在缺少原生_seek时桥接播放器_renderSeek(self):
        module = load_module()
        source = '''<html><head></head><body>
<div id="root" data-composition-id="main"><p>正文</p></div>
<script>window.__timelines={main:{}};</script>
</body></html>'''

        result = module.inject_cover_html(source, "assets/cover.png", 0.5)

        self.assertIn('id="course-cover-seek-bridge"', result)
        self.assertIn("if(typeof window.__hf.seek==='function')return", result)
        self.assertIn("player.renderSeek(time)", result)
        self.assertIn("player.seek(time)", result)

    def test_相同参数重复注入保持字节幂等(self):
        module = load_module()
        source = '<html><head></head><body><div id="root" data-composition-id="main"></div></body></html>'

        once = module.inject_cover_html(source, "assets/cover.png", 0.5)
        twice = module.inject_cover_html(once, "assets/cover.png", 0.5)

        self.assertEqual(twice, once)
        self.assertEqual(twice.count('id="cover-intro"'), 1)
        self.assertEqual(twice.count('id="course-cover-style"'), 1)

    def test_已存在封面与请求参数不一致时拒绝(self):
        module = load_module()
        source = '''<html><head><style id="course-cover-style"></style></head><body>
<div id="root" data-composition-id="main">
<img id="cover-intro" class="cover-intro clip" src="assets/old.png" data-start="0" data-duration="1" data-track-index="99" />
</div></body></html>'''

        with self.assertRaisesRegex(ValueError, "已有封面层.*不一致"):
            module.inject_cover_html(source, "assets/cover.png", 0.5)

    def test_已有正确封面层只重写构建目录资源路径(self):
        module = load_module()
        source = '''<html><head><style id="course-cover-style"></style></head><body>
<div id="root" data-composition-id="main">
<img id="cover-intro" class="cover-intro clip" src="../../episodes/04-prompt/cover.png" data-start="0" data-duration="0.5" data-track-index="99" />
</div></body></html>'''

        result = module.inject_cover_html(source, "assets/cover.png", 0.5)

        self.assertIn('src="assets/cover.png"', result)
        self.assertNotIn("../../episodes/04-prompt/cover.png", result)
        self.assertEqual(module.inject_cover_html(result, "assets/cover.png", 0.5), result)

    def test_兼容旧源内已有无标识封面样式(self):
        module = load_module()
        source = '''<html><head><style>.cover-intro{position:absolute;z-index:100}</style></head><body>
<div id="root" data-composition-id="main">
<img id="cover-intro" class="cover-intro clip" src="../../episodes/04-prompt/cover.png" data-start="0" data-duration="0.5" data-track-index="99" />
</div></body></html>'''

        result = module.inject_cover_html(source, "assets/cover.png", 0.5)

        self.assertIn('src="assets/cover.png"', result)
        self.assertEqual(result.count('id="cover-intro"'), 1)
        self.assertEqual(result.count('id="course-cover-style"'), 0)

    def test_缺少主合成根节点时拒绝(self):
        module = load_module()

        with self.assertRaisesRegex(ValueError, "主合成根节点"):
            module.inject_cover_html("<html><head></head><body></body></html>", "assets/cover.png", 0.5)


if __name__ == "__main__":
    unittest.main()
