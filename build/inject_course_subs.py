# -*- coding: utf-8 -*-
"""用途：把字幕声明注入课程 HTML；运行：python build/inject_course_subs.py 源HTML 字幕TXT 输出HTML。
依赖：仅 Python 标准库；输入和输出统一使用 UTF-8。
"""
import argparse
from pathlib import Path


MARKER = "/*__SUBS__*/"


def inject_subs(source_path, subs_path, output_path):
    source_path = Path(source_path)
    subs_path = Path(subs_path)
    output_path = Path(output_path)
    source = source_path.read_text(encoding="utf-8")
    if source.count(MARKER) != 1:
        raise ValueError("源 HTML 必须恰好包含一个 %s" % MARKER)
    subs = subs_path.read_text(encoding="utf-8").strip()
    if not subs:
        raise ValueError("字幕文件不能为空")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(source.replace(MARKER, subs), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="将课程字幕声明注入源 HTML")
    parser.add_argument("source", help="包含唯一字幕占位符的源 HTML")
    parser.add_argument("subs", help="timings_to_subs.py 生成的字幕文本")
    parser.add_argument("output", help="注入后的构建版 index.html")
    args = parser.parse_args()
    inject_subs(args.source, args.subs, args.output)


if __name__ == "__main__":
    main()
