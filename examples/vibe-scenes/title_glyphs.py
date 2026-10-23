# 用途：把五字标题转成原立体点题使用的矢量轮廓，保留字体曲线与版权信息。
# 运行：python examples/vibe-scenes/title_glyphs.py <字体woff2> <五字标题> <输出JS>。
# 依赖：fontTools及Brotli；沿用原聚光灯工程的轮廓导出方法。
import json
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen

sys.stdout.reconfigure(encoding='utf-8')

font_path, text, output = sys.argv[1:]
if len(text) != 5:
    raise ValueError('立体标题须恰好五字')
font = TTFont(font_path)
glyphs, cmap, units = font.getGlyphSet(), font.getBestCmap(), font['head'].unitsPerEm

class OutlinePen(BasePen):
    def __init__(self):
        super().__init__(glyphs)
        self.commands = []
    def add(self, op, *points):
        self.commands.append([op, *[round(p / units, 6) for xy in points for p in xy]])
    def _moveTo(self, p): self.add('M', p)
    def _lineTo(self, p): self.add('L', p)
    def _curveToOne(self, a, b, p): self.add('C', a, b, p)
    def _qCurveToOne(self, a, p): self.add('Q', a, p)
    def _closePath(self): self.commands.append(['Z'])

data = dict(text=text, family=font['name'].getDebugName(1), copyright=font['name'].getDebugName(0), license=font['name'].getDebugName(13), glyphs=[])
for char in text:
    if ord(char) not in cmap: raise ValueError('字体缺少字形：' + char)
    name = cmap[ord(char)]
    pen = OutlinePen()
    glyphs[name].draw(pen)
    data['glyphs'].append(dict(char=char, advance=font['hmtx'][name][0] / units, commands=pen.commands))
result = '// Noto Sans SC矢量轮廓；字体版权与来源保留于数据中。\n'
result += 'globalThis.SceneGlyphs=globalThis.SceneGlyphs||{};SceneGlyphs[' + json.dumps(text, ensure_ascii=False) + ']=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
Path(output).write_text(result, encoding='utf-8')
print('已生成标题矢量：' + text)
