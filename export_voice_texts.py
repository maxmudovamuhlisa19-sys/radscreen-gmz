# -*- coding: utf-8 -*-
import io, re, sys, os

os.chdir(r'C:\Users\sardor\Desktop\gmz')
sys.path.insert(0, '.')
from gen_voice import TEXTS

lines = ['RadSkrin taqdimoti — ovozli matnlar (slayd tartibida), NMKG',
         '=' * 60]
for n in sorted(TEXTS):
    t = (TEXTS[n] or '').strip()
    if not t:
        continue
    lines += ['', '%02d-slayd:' % n, t]

# bo'sh slaydlar — video slaydlari (ovoz videoning o'chida)
empties = [n for n in sorted(TEXTS) if not (TEXTS[n] or '').strip()]


def _lit(path, var):
    try:
        src = io.open(path, encoding='utf-8').read()
    except OSError:
        return ''
    m = re.search(var + r' = \((.*?)\)\n', src, re.S)
    return ' '.join(''.join(re.findall(r'"([^"]*)"', m.group(1))).split()) if m else ''


SOURCES = [
    ('make_diff_video.py', 'NARR_TEXT', 'video narratsiyasi'),
    ('make_synth_video.py', 'BODY_NARR_TEXT', 'video narratsiyasi'),
    ('gen_video_voice.py', 'TEXT', 'demo video narratsiyasi'),
]

if empties:
    srcs = list(SOURCES)
    if len(empties) == 1:
        srcs = [srcs[-1]]
    elif len(empties) == 2:
        srcs = [srcs[0], srcs[-1]]
    for n, (path, var, label) in zip(empties, srcs):
        body = _lit(path, var)
        if body:
            lines += ['', '%02d-slayd (%s):' % (n, label), body]

txt = '\n'.join(lines) + '\n'
io.open('ovoz_matnlari.txt', 'w', encoding='utf-8').write(txt)
print(txt)
