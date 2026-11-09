# -*- coding: utf-8 -*-
import io, os, re, sys

os.chdir(r'C:\Users\sardor\Desktop\gmz')
sys.path.insert(0, '.')
from gen_voice import TEXTS

raw = io.open('ovoz_matnlari.txt', encoding='utf-8').read()

# bo'limlarni ajratish: "NN-slayd:" yoki "15-slayd (demo video ...):"
parts = re.split(r'\n(?=\d{2}-slayd)', raw)
new = {}
video = None
for p in parts:
    m = re.match(r'(\d{2})-slayd( \(demo video narratsiyasi\))?:\n(.*)', p.strip(), re.S)
    if not m:
        continue
    n = int(m.group(1))
    body = m.group(3).strip()
    if m.group(2):
        video = body
    else:
        new[n] = body

changed = []
for n in sorted(TEXTS):
    old = (TEXTS[n] or '').strip()
    cur = new.get(n, old)
    if cur != old:
        changed.append((n, old, cur))

print('txt’dagi bo\'limlar:', len(new), '+ video:', bool(video))
print('ozgargan slaydlar:', [c[0] for c in changed])
for n, o, c in changed:
    print('--- %02d ---' % n)
    print('ESKI:', o)
    print('YANGI:', c)

# video matni o'zgarganmi?
src = io.open('gen_video_voice.py', encoding='utf-8').read()
m = re.search(r'TEXT = \((.*?)\)\n', src, re.S)
old_v = ''.join(re.findall(r'"([^"]*)"', m.group(1))) if m else ''
if video and video != old_v:
    print('--- 15 (video) ---')
    print('ESKI:', old_v)
    print('YANGI:', video)
