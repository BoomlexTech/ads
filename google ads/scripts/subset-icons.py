"""Build a small Material Symbols font with only the icons the client uses.

Run after adding an icon:  python scripts/subset-icons.py   (needs: pip install fonttools brotli)
Writes client/src/fonts/material-symbols-subset.woff2 and icons.json (the kept names).
"""
import json
import pathlib
import re

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'node_modules' / 'material-symbols' / 'material-symbols-outlined.woff2'
OUT = ROOT / 'client' / 'src' / 'fonts'

words = set()
for f in (ROOT / 'client' / 'src').rglob('*'):
    if f.suffix in ('.js', '.jsx'):
        words |= set(re.findall(r"['\"`]([a-z][a-z0-9_]*)['\"`]", f.read_text(encoding='utf-8')))

font = TTFont(SRC)
names = set(font.getGlyphOrder())
icons = sorted(w for w in words if w in names)
glyphs = icons + [f'{i}.fill' for i in icons if f'{i}.fill' in names]

opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['*']
opts.layout_closure = False  # keep only the ligatures for the listed icons
opts.name_IDs = ['*']
opts.notdef_outline = True
sub = subset.Subsetter(opts)
sub.populate(glyphs=glyphs, text='abcdefghijklmnopqrstuvwxyz0123456789_')
sub.subset(font)
OUT.mkdir(parents=True, exist_ok=True)
font.save(OUT / 'material-symbols-subset.woff2')
(OUT / 'icons.json').write_text(json.dumps(icons, indent=0))
print(f'{len(icons)} icons, {(OUT / "material-symbols-subset.woff2").stat().st_size // 1024} KB')
