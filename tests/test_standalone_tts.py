# 用途：验证配音配置，不加载真实模型。
# 运行：python -m unittest discover -s tests -p test_standalone_tts.py
# 依赖：Python 标准库。
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "pipeline/02_audio/voxcpm_tts.py"

class StandaloneTtsTests(unittest.TestCase):
    def test_模型和源码可由环境变量配置(self):
        with patch.dict(os.environ, {"VOXCPM_MODEL": "models/test", "VOXCPM_SRC": "vendor/src"}):
            spec = importlib.util.spec_from_file_location("standalone_tts", SCRIPT)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
        self.assertEqual(module.MODEL, "models/test")
        self.assertEqual(module.VOXCPM_SRC, "vendor/src")

    def test_缺少配对文本在创建输出和导入模型前失败(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            script = root / "act.json"
            script.write_text(json.dumps({"segments": [{"id": "g01", "text": "测试。"}]}), encoding="utf-8")
            ref = root / "ref.wav"
            ref.write_bytes(b"reference")
            result = subprocess.run([sys.executable, str(SCRIPT), "--script", str(script), "--out", str(root / "out"), "--ref", str(ref), "--ref-text-file", str(root / "missing.txt")], capture_output=True, text=True, encoding="utf-8")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("参考文本", result.stderr + result.stdout)
            self.assertFalse((root / "out").exists())

    def test_命令行接受模型和可选源码目录(self):
        result = subprocess.run([sys.executable, str(SCRIPT), "--help"], capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(result.returncode, 0)
        self.assertIn("--model", result.stdout)
        self.assertIn("--voxcpm-src", result.stdout)

if __name__ == "__main__":
    unittest.main()
