# -*- coding: utf-8 -*-
"""ovoz_matnlari.txt (foydalanuvchi tuzatgan) -> gen_voice.py TEXTS sinxronizatsiyasi.
O'zgargan slaydlar ro'yxatini chiqaradi. Ishlatish: python sync_voice_texts.py"""
import io, json, os, re, sys

os.chdir(r'C:\Users\sardor\Desktop\gmz')
sys.path.insert(0, '.')
from gen_voice import TEXTS

raw = io.open('ovoz_matnlari.txt', encoding='utf-8').read()
parts = re.split(r'\n(?=\d{2}-slayd)', raw)
new = {}
for p in parts:
    m = re.match(r'(\d{2})-slayd( \(demo video narratsiyasi\))?:\n(.*)', p.strip(), re.S)
    if not m or m.group(2):
        continue
    t = ' '.join(m.group(3).split())
    t = re.sub(r'\s+([,.;:!?)])', r'\1', t)
    new[int(m.group(1))] = t

merged = dict(TEXTS)
changed = []
for n, t in new.items():
    if ' '.join((TEXTS.get(n) or '').split()) != t:
        changed.append(n)
        merged[n] = t

if not changed:
    print('O\'zgarish yo\'q')
    raise SystemExit(0)

src = io.open('gen_voice.py', encoding='utf-8').read()
lines = ['TEXTS = {']
for n in sorted(merged):
    if not (merged[n] or '').strip():
        lines.append('    %d: "",' % n)
        continue
    s = json.dumps(merged[n], ensure_ascii=False)
    lines.append('    %d: %s,' % (n, s))
lines.append('}')
block = '\n'.join(lines)

out, cnt = re.subn(r'TEXTS = \{.*?\n\}', block, src, count=1, flags=re.S)
if cnt != 1:
    raise SystemExit('TEXTS bloki topilmadi')
io.open('gen_voice.py', 'w', encoding='utf-8', newline='').write(out)
print('Tuzatildi, ozgargan slaydlar:', sorted(changed))
print('KEYIN: python gen_voice_uz.py ' + ' '.join(str(n) for n in sorted(changed)))
