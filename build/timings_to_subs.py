# -*- coding: utf-8 -*-
"""timings.json → 合成用 SUBS 字面量（VoxCPM 课程线 · 阶段3 字幕桥接）。

用法: python build/timings_to_subs.py <timings.json> [高亮词,逗号分隔]
"""

import json
import math
import sys
from copy import deepcopy
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


_CENTISECOND = Decimal("0.01")
_MAX_SAFE_INTEGER = Decimal("9007199254740991")
_TRAILING_DISPLAY_PUNCTUATION = "，。！？；：、,.!?;:…—"


def strip_trailing_display_punctuation(text):
    """删除字幕显示文本绝对末尾的连续标点。"""
    return text.rstrip(_TRAILING_DISPLAY_PUNCTUATION)


def normalize_subtitle_entry(source, source_name):
    """将一个字幕来源量化为厘秒，并校验其最终时段。"""
    start = source["start"]
    end = source["end"]
    try:
        start = Decimal(str(start))
        end = Decimal(str(end))
    except (InvalidOperation, ValueError) as error:
        raise ValueError(
            f"无效字幕时段 {source_name}: start={source['start']!r}, end={source['end']!r}"
        ) from error

    if not start.is_finite() or not end.is_finite():
        raise ValueError(f"无效字幕时段 {source_name}: start={start}, end={end}")
    if start < 0 or end < 0:
        raise ValueError(f"无效字幕时段 {source_name}: 时间不得为负; start={start}, end={end}")

    try:
        start = start.quantize(_CENTISECOND, rounding=ROUND_HALF_UP)
        end = end.quantize(_CENTISECOND, rounding=ROUND_HALF_UP)
    except InvalidOperation as error:
        raise ValueError(
            f"无效字幕时段 {source_name}: start={source['start']!r}, end={source['end']!r}"
        ) from error

    if end <= start:
        raise ValueError(f"无效字幕时段 {source_name}: start={start}, end={end}")

    js_start = float(start)
    js_end = float(end)
    if not (math.isfinite(js_start) and math.isfinite(js_end) and js_start < js_end):
        raise ValueError(
            f"无效字幕时段 {source_name}: 两位时间无法由JavaScript Number区分; "
            f"start={start}, end={end}"
        )

    for value, js_value in ((start, js_start), (end, js_end)):
        centiseconds = value * 100
        if centiseconds > _MAX_SAFE_INTEGER:
            raise ValueError(
                f"无效字幕时段 {source_name}: 厘秒整数超出JavaScript Number安全范围; "
                f"start={start}, end={end}"
            )
        if math.floor(js_value * 100 + 0.5) != int(centiseconds):
            raise ValueError(
                f"无效字幕时段 {source_name}: JavaScript Number无法保持厘秒整数; "
                f"start={start}, end={end}"
            )

    def as_number(value):
        return int(value) if value == value.to_integral_value() else float(value)

    display_text = strip_trailing_display_punctuation(source["text"].strip())
    return {"s": as_number(start), "e": as_number(end), "t": display_text}


def flatten_subtitle_entries(data):
    """按 phrase/unit 顺序展平字幕，兼容旧版 phrase 级 timings。"""
    entries = []
    for phrase_index, phrase in enumerate(data.get("phrases", []), start=1):
        units = phrase.get("subtitle_units")
        sources = units if units else [phrase]
        for source_index, source in enumerate(sources, start=1):
            source_name = source.get(
                "id",
                phrase.get("id", f"phrase {phrase_index}") if not units
                else f"subtitle_unit {source_index}",
            )
            entries.append(normalize_subtitle_entry(source, source_name))
    return entries


def apply_highlights(text, highlights):
    """从左到右扫描原始文本，按关键词输入顺序高亮不重叠范围。"""
    highlights = [highlight for highlight in highlights if highlight]
    parts = []
    index = 0
    while index < len(text):
        for highlight in highlights:
            if text.startswith(highlight, index):
                parts.append("**" + highlight + "**")
                index += len(highlight)
                break
        else:
            parts.append(text[index])
            index += 1
    return "".join(parts)


def apply_targeted_highlights(data, highlights):
    """只在指定字幕 ID 中高亮指定且唯一出现的文本。"""
    highlighted = deepcopy(data)
    by_unit_id = {}
    for item in highlights:
        if not isinstance(item, dict) or any(
            not isinstance(item.get(key), str) or not item[key].strip()
            for key in ("unit_id", "text", "reason")
        ):
            raise ValueError("结构化字幕重点必须包含非空 unit_id、text 和 reason")
        unit_id = item["unit_id"].strip()
        if unit_id in by_unit_id:
            raise ValueError(f"字幕 {unit_id} 只能设置一个重点")
        by_unit_id[unit_id] = item

    matched = set()
    for phrase_index, phrase in enumerate(highlighted.get("phrases", []), start=1):
        units = phrase.get("subtitle_units")
        sources = units if units else [phrase]
        for source_index, source in enumerate(sources, start=1):
            source_id = source.get(
                "id",
                phrase.get("id", f"phrase {phrase_index}") if not units
                else f"subtitle_unit {source_index}",
            )
            item = by_unit_id.get(source_id)
            if item is None:
                continue
            count = source["text"].count(item["text"])
            if count != 1:
                raise ValueError(
                    f"字幕 {source_id} 中重点文字 {item['text']!r} 必须恰好出现 1 次，实际 {count} 次"
                )
            source["text"] = source["text"].replace(
                item["text"], f"**{item['text']}**", 1
            )
            matched.add(source_id)

    missing = [unit_id for unit_id in by_unit_id if unit_id not in matched]
    if missing:
        raise ValueError(f"字幕重点 ID {', '.join(missing)} 不存在")
    return highlighted


def format_subs(entries):
    """生成 HTML 占位所需的 SUBS 字面量。"""
    lines = ["      const SUBS=["]
    for entry_index, entry in enumerate(entries, start=1):
        normalized = normalize_subtitle_entry(
            {"start": entry["s"], "end": entry["e"], "text": entry["t"]},
            entry.get("id", f"subtitle entry {entry_index}"),
        )
        text = json.dumps(normalized["t"], ensure_ascii=False).replace("<", "\\u003c")
        lines.append(f'        {{s:{normalized["s"]},e:{normalized["e"]},t:{text}}},')
    lines.append("      ];")
    return "\n".join(lines)


def main(argv=None):
    """读取 timings 并将 SUBS 字面量打印到标准输出。"""
    argv = sys.argv[1:] if argv is None else argv
    timings = argv[0]

    with open(timings, "r", encoding="utf-8") as file:
        data = json.load(file)

    highlights = []
    if len(argv) > 1 and argv[1] == "--highlights-json":
        if len(argv) != 3:
            raise ValueError("--highlights-json 后必须提供一个 JSON 数组")
        structured = json.loads(argv[2])
        if not isinstance(structured, list):
            raise ValueError("--highlights-json 必须是 JSON 数组")
        data = apply_targeted_highlights(data, structured)
    elif len(argv) > 1:
        highlights = [h for h in argv[1].split(",") if h]

    entries = flatten_subtitle_entries(data)
    for entry in entries:
        entry["t"] = apply_highlights(entry["t"], highlights)
    print(format_subs(entries))


if __name__ == "__main__":
    main()
