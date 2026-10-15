# -*- coding: utf-8 -*-
"""用途：向课程构建版 HTML 注入前 0.5 秒封面层；运行：python build/teaching/inject_course_cover.py 源HTML 封面相对路径 输出HTML。
依赖：仅 Python 标准库；输入和输出统一使用 UTF-8。
"""
import argparse
import html
import math
from pathlib import Path
import re


STYLE_ID = "course-cover-style"
COVER_ID = "cover-intro"
SEEK_BRIDGE_ID = "course-cover-seek-bridge"


def _attribute(tag, name):
    match = re.search(r"\b%s\s*=\s*(['\"])(.*?)\1" % re.escape(name), tag, re.I | re.S)
    return html.unescape(match.group(2)) if match else None


def _validate_existing_cover(source, duration_s):
    cover_tags = re.findall(
        r"<img\b[^>]*\bid\s*=\s*(['\"])%s\1[^>]*>" % COVER_ID,
        source,
        re.I | re.S,
    )
    style_ids = re.findall(
        r"\bid\s*=\s*(['\"])%s\1" % STYLE_ID,
        source,
        re.I,
    )
    legacy_style = bool(re.search(
        r"\.cover-intro\s*\{[^}]*\bz-index\s*:\s*100(?:\D|$)",
        source,
        re.I | re.S,
    ))
    if len(cover_tags) != 1 or len(style_ids) > 1 or (not style_ids and not legacy_style):
        raise ValueError("已有封面层结构不完整或重复")
    tag_match = re.search(
        r"<img\b[^>]*\bid\s*=\s*(['\"])%s\1[^>]*>" % COVER_ID,
        source,
        re.I | re.S,
    )
    tag = tag_match.group(0)
    classes = set((_attribute(tag, "class") or "").split())
    actual_duration = _attribute(tag, "data-duration")
    matches = (
        {"cover-intro", "clip"}.issubset(classes)
        and _attribute(tag, "src") is not None
        and _attribute(tag, "data-start") == "0"
        and _attribute(tag, "data-track-index") == "99"
        and actual_duration is not None
        and math.isclose(float(actual_duration), duration_s)
    )
    if not matches:
        raise ValueError("已有封面层与请求参数不一致")
    return tag_match


def inject_cover_html(source, cover_src, duration_s=0.5):
    """返回注入封面层后的 HTML；相同参数重复调用保持字节不变。"""
    if not isinstance(source, str):
        raise TypeError("source 必须是字符串")
    if not isinstance(cover_src, str) or not cover_src.strip():
        raise ValueError("cover_src 不能为空")
    duration_s = float(duration_s)
    if not math.isfinite(duration_s) or duration_s <= 0:
        raise ValueError("duration_s 必须是正数")
    has_cover = bool(re.search(r"\bid\s*=\s*(['\"])%s\1" % COVER_ID, source, re.I))
    has_style = bool(re.search(r"\bid\s*=\s*(['\"])%s\1" % STYLE_ID, source, re.I))
    if has_cover or has_style:
        tag_match = _validate_existing_cover(source, duration_s)
        tag = tag_match.group(0)
        if _attribute(tag, "src") == cover_src:
            return source
        rewritten_tag = re.sub(
            r"\bsrc\s*=\s*(['\"])(.*?)\1",
            'src="%s"' % html.escape(cover_src, quote=True),
            tag,
            count=1,
            flags=re.I | re.S,
        )
        return source[:tag_match.start()] + rewritten_tag + source[tag_match.end():]

    head_matches = list(re.finditer(r"</head\s*>", source, re.I))
    if len(head_matches) != 1:
        raise ValueError("源 HTML 必须恰好包含一个 </head>")
    root_matches = list(re.finditer(
        r"<(?:div|main)\b(?=[^>]*\bid\s*=\s*(['\"])root\1)(?=[^>]*\bdata-composition-id\s*=\s*(['\"])main\2)[^>]*>",
        source,
        re.I | re.S,
    ))
    if len(root_matches) != 1:
        raise ValueError("源 HTML 必须恰好包含一个主合成根节点")

    duration_text = format(duration_s, "g")
    escaped_src = html.escape(cover_src, quote=True)
    style = (
        '\n<style id="%s">\n'
        ".cover-intro{position:absolute;inset:0;width:100%%;height:100%%;"
        "object-fit:cover;z-index:1000}\n"
        "</style>\n" % STYLE_ID
    )
    head_end = head_matches[0].start()
    with_style = source[:head_end] + style + source[head_end:]
    root_match = re.search(
        r"<(?:div|main)\b(?=[^>]*\bid\s*=\s*(['\"])root\1)(?=[^>]*\bdata-composition-id\s*=\s*(['\"])main\2)[^>]*>",
        with_style,
        re.I | re.S,
    )
    cover = (
        '\n<img id="cover-intro" class="cover-intro clip" src="%s" alt="" '
        'data-start="0" data-duration="%s" data-track-index="99" data-layout-ignore />'
        % (escaped_src, duration_text)
    )
    with_cover = with_style[:root_match.end()] + cover + with_style[root_match.end():]
    body_matches = list(re.finditer(r"</body\s*>", with_cover, re.I))
    if len(body_matches) != 1:
        raise ValueError("源 HTML 必须恰好包含一个 </body>")
    seek_bridge = (
        '\n<script id="%s">\n'
        "(function(){function install(){window.__hf=window.__hf||{};"
        "if(typeof window.__hf.seek==='function')return;"
        "window.__hf.seek=function(time){const player=window.__player;"
        "if(player&&typeof player.renderSeek==='function')player.renderSeek(time);"
        "else if(player&&typeof player.seek==='function')player.seek(time);"
        "else{for(const timeline of Object.values(window.__timelines||{}))"
        "if(typeof timeline.seek==='function')timeline.seek(time,false);"
        "const cover=document.getElementById('cover-intro');"
        "if(cover)cover.style.opacity=time>=0&&time<Number(cover.dataset.duration)?'1':'0';}};}"
        "if(document.readyState==='loading')"
        "document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});"
        "else setTimeout(install,0);})();\n"
        '</script>\n'
        % SEEK_BRIDGE_ID
    )
    body_end = body_matches[0].start()
    return with_cover[:body_end] + seek_bridge + with_cover[body_end:]


def inject_cover(source_path, cover_src, output_path, duration_s=0.5):
    source_path = Path(source_path)
    output_path = Path(output_path)
    source = source_path.read_text(encoding="utf-8")
    result = inject_cover_html(source, cover_src, duration_s)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(result, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="向课程构建版 HTML 注入定时封面层")
    parser.add_argument("source", help="课程源 HTML")
    parser.add_argument("cover_src", help="构建版 HTML 使用的封面相对路径")
    parser.add_argument("output", help="输出构建版 HTML")
    parser.add_argument("--duration", type=float, default=0.5, help="封面持续秒数，默认 0.5")
    args = parser.parse_args()
    inject_cover(args.source, args.cover_src, args.output, args.duration)


if __name__ == "__main__":
    main()
