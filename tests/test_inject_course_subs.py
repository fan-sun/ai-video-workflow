# -*- coding: utf-8 -*-
import importlib.util
import pathlib
import tempfile
import unittest


MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "build" / "inject_course_subs.py"


class InjectCourseSubsTests(unittest.TestCase):
    def test_用_utf8字幕替换唯一占位符(self):
        spec = importlib.util.spec_from_file_location("inject_course_subs", MODULE_PATH)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = pathlib.Path(tmp)
            source = tmp_path / "source.html"
            subs = tmp_path / "subs.txt"
            output = tmp_path / "index.html"
            source.write_text("前/*__SUBS__*/后", encoding="utf-8")
            subs.write_text("const SUBS=[{t:'中文'}];", encoding="utf-8")

            module.inject_subs(source, subs, output)

            self.assertEqual(
                output.read_text(encoding="utf-8"),
                "前const SUBS=[{t:'中文'}];后",
            )


if __name__ == "__main__":
    unittest.main()
