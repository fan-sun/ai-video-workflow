# 用途：验证教学文档链接和配音路径配置。
# 运行：python -m unittest discover -s tests -p test_repository_layout.py
# 依赖：Python 标准库。
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]

class RepositoryLayoutTests(unittest.TestCase):
    def test_教学文档的本地链接完整(self):
        missing = []
        sources = [ROOT / "README.md", ROOT / "AGENTS.md", ROOT / "CLAUDE.md",
                   *(ROOT / "course/docs").glob("*.md"),
                   *(ROOT / "examples").rglob("*.md"),
                   *(ROOT / ".agents/skills").rglob("*.md")]
        for source in sources:
            for link in re.findall(r"\]\(([^)]+)\)", source.read_text(encoding="utf-8")):
                if link.startswith(("http:", "https:", "#", "mailto:", "<")):
                    continue
                if not (source.parent / link.split("#")[0]).exists():
                    missing.append(f"{source.name}: {link}")
        self.assertEqual(missing, [])

    def test_动画技能引用的示例随仓库分发(self):
        skill = ROOT / ".agents/skills/hyperframes-animation"
        references = set()
        for source in skill.rglob("*.md"):
            references.update(re.findall(r"examples/[A-Za-z0-9_-]+\.html", source.read_text(encoding="utf-8")))
        self.assertTrue(references)
        self.assertEqual([name for name in sorted(references) if not (skill / name).is_file()], [])

    def test_生产代码的模型与配音环境路径由配置指定(self):
        for directory in [ROOT / "build", ROOT / "pipeline/02_audio"]:
            for source in directory.iterdir():
                if source.suffix not in (".py", ".mjs") or source.name.endswith(".test.mjs"):
                    continue
                text = source.read_text(encoding="utf-8")
                self.assertIsNone(re.search(r"[A-Za-z]:[/\\](?:My_project|Environment[/\\]Anaconda)", text), source.name)

    def test_教学流程不路由到事件热点写法(self):
        for source in (ROOT / "course/docs").glob("*.md"):
            text = source.read_text(encoding="utf-8")
            self.assertNotIn("hotspot_explainer", text, source.name)
            self.assertNotIn("热点讲解适配规则", text, source.name)

if __name__ == "__main__":
    unittest.main()
