# -*- coding: utf-8 -*-
"""Nurlangan va nurlanmagan odam farqi — MP4 video (slayd uchun).
Ishlatish:  python make_diff_video.py
Chiqish:    %TEMP%\\opencode\\media\\diff.mp4  (+ diff_narr.mp3)
"""
import os, sys, math, subprocess

sys.argv = [sys.argv[0]]
GMZ = r'C:\Users\sardor\Desktop\gmz'
sys.path.insert(0, GMZ)
import gen_voice_uz as g                      # Uzbek_TTS repo'siga chdir qiladi
os.chdir(GMZ)
from omegaconf import OmegaConf
from hydra.utils import get_class
from tts import TTS
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1280, 720, 30
MEDIA = os.path.join(os.environ.get('TEMP', '.'), 'opencode', 'media')
OUT = os.path.join(MEDIA, 'diff.mp4')
NARR = os.path.join(MEDIA, 'diff_narr.mp3')
TMPW = os.path.join(MEDIA, '_diff_narr.wav')

BG     = (0x0B, 0x12, 0x20)
CARD   = (0x16, 0x24, 0x3A)
CARD2  = (0x1B, 0x2A, 0x40)
CYAN   = (0x22, 0xD3, 0xEE)
GREEN  = (0x22, 0xC5, 0x5E)
RED    = (0xEF, 0x44, 0x44)
AMBER  = (0xEA, 0xB3, 0x08)
WHITE  = (0xF1, 0xF5, 0xF9)
MUTED  = (0x94, 0xA3, 0xB8)

NARR_TEXT = ("Nurlangan odamda doza tezligi yuqori: teri qizarishi, charchoq va tez pulslanish kuzatiladi, "
             "klinik xulosa kasallikni bor deydi. Nurlanmagan odamda fon normal, belgilar yo'q va "
             "xulosa xavfsiz. RadSkrin bu farqni bir daqiqada ko'rsatadi.")

FDIR = r'C:\Windows\Fonts'
_ff = {}


def F(size, bold=False, italic=False):
    key = (size, bold, italic)
    if key not in _ff:
        names = ['segoeuib.ttf' if bold else ('segoeuii.ttf' if italic else 'segoeui.ttf'),
                 'arialbd.ttf' if bold else 'arial.ttf']
        path = next((os.path.join(FDIR, n) for n in names
                     if os.path.exists(os.path.join(FDIR, n))),
                    os.path.join(FDIR, 'arial.ttf'))
        _ff[key] = ImageFont.truetype(path, size)
    return _ff[key]


def ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def layer_text(im, xy, txt, font, fill, anchor='la', alpha=1.0):
    if alpha <= 0.01:
        return
    if alpha >= 0.99:
        ImageDraw.Draw(im).text(xy, txt, font=font, fill=fill, anchor=anchor)
        return
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(ov).text(xy, txt, font=font, fill=fill + (int(255 * alpha),), anchor=anchor)
    im.alpha_composite(ov)


def rrect(d, box, r, fill, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def narration():
    if os.path.exists(NARR) and os.path.getsize(NARR) > 10000:
        pass
    else:
        cfg = OmegaConf.load(os.path.join(g.REPO, 'config', 'UZTTS_conf.yaml'))
        tts = TTS(ref_audio_path=g.REF_AUDIO, ref_text=g.REF_TEXT, model_cfg=cfg,
                  model_cls=get_class('uz_tts.model.%s' % cfg.model.backbone),
                  vocab=os.path.join(g.REPO, 'config', 'uz_vocab.txt'),
                  ckpt_path=os.path.join(g.REPO, 'ckpts', 'UZ.safetensors'),
                  device='auto', speed=1.0)
        audio, sr = tts.generate_speech(NARR_TEXT)
        tts.save_audio(audio, TMPW, sr)
        g.to_mp3(TMPW, NARR)
        os.remove(TMPW)
    r = subprocess.run([g.FF, '-i', NARR], capture_output=True, text=True,
                       encoding='utf-8', errors='ignore')
    import re
    m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', r.stderr)
    dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    print('narratsiya: %.1f s' % dur)
    return dur


# --------------------------- sahnalar ----------------------------
ROWS_L = [('Doza tezligi', '8.4 \u00b5Sv/h', RED),
          ('Kunlik doza', "me'yordan 65% yuqori", RED),
          ('Belgilar', 'teri qizarishi, charchoq', RED),
          ('Puls (PPG)', '92 bpm', RED),
          ('AI xulosa', 'ARS — bor, 74%', RED)]
ROWS_R = [('Doza tezligi', '0.28 \u00b5Sv/h', GREEN),
          ('Kunlik doza', "me'yor ichida", GREEN),
          ('Belgilar', "belgilar yo'q", GREEN),
          ('Puls (PPG)', '72 bpm', GREEN),
          ('AI xulosa', "13 holat — yo'q", GREEN)]


def panel(im, x, title, rows, color, show_units):
    """Bitta panel (6 qator). show_units — 0..6 qachon ochilishi."""
    y0, w, h = 150, 570, 500
    d = ImageDraw.Draw(im)
    rrect(d, [x, y0, x + w, y0 + h], 18, CARD)
    rrect(d, [x, y0, x + w, y0 + 62], 18, color)
    d.rectangle([x, y0 + 40, x + w, y0 + 62], fill=color)
    d.text((x + w / 2, y0 + 31), title, font=F(26, True), fill=(5, 36, 44), anchor='mm')

    ry = y0 + 84
    for i, (k, v, c) in enumerate(rows):
        a = ease(show_units - i)
        if a <= 0:
            continue
        top = ry + i * 66
        alpha_panel(im, x + 20, top, w - 40, 62, k, v, c, a)

    # sog'lik yo'qotish shkalasi (oxirgi qator)
    a = ease(show_units - len(rows))
    if a > 0:
        top = ry + len(rows) * 66
        yy = top + 10
        layer_text(im, (x + 24, top - 6), "Sog'lik yo'qotish", F(17), MUTED, 'la', a)
        bx, bw = x + 24, w - 48
        ImageDraw.Draw(im).rounded_rectangle([bx, yy + 26, bx + bw, yy + 44], radius=9,
                                             fill=CARD2)
        pct = 0.74 if color == RED else 0.12
        fillw = max(6, int(bw * pct * a))
        ImageDraw.Draw(im).rounded_rectangle([bx, yy + 26, bx + fillw, yy + 44], radius=9,
                                             fill=color)
        layer_text(im, (bx + bw, yy), ('74%  yuqori xavf' if color == RED else "12%  xavfsiz"),
                   F(17, True), color, 'ra', a)


def alpha_panel(im, x, y, w, h, k, v, c, a):
    d = ImageDraw.Draw(im)
    rrect(d, [x, y, x + w, y + h], 10, CARD2)
    layer_text(im, (x + 16, y + h / 2), k, F(18), WHITE, 'lm', a)
    layer_text(im, (x + w - 16, y + h / 2), v, F(18, True), c, 'rm', a)


def render(t, D):
    im = Image.new('RGBA', (W, H), BG + (255,))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 7], fill=CYAN)

    INTRO = 2.4
    OUTRO = 2.6
    a_in = ease(t / 0.7)
    a_out = ease((D - t) / 0.6)

    # ---- sahna 1: kirish sarlavhasi ----
    if t < INTRO:
        a = ease(t / 0.6) * (1 - ease((t - (INTRO - 0.7)) / 0.7) if t > INTRO - 0.7 else 1)
        layer_text(im, (W / 2, 250), "NURLANGAN VA NURLANGANMAGAN ODOM", F(46, True),
                   WHITE, 'mm', a)
        layer_text(im, (W / 2, 330), "RadSkrin — farqni bir daqiqada ko'rsatadi",
                   F(26), CYAN, 'mm', a)
        for i, c in enumerate([GREEN, AMBER, RED]):
            alpha_box(im, 540 + i * 70, 400, 54, 14, c, a)
        layer_text(im, (W / 2, 640), "NMKG radiatsiya skriningi", F(18), MUTED, 'mm',
                   a * a_in)
        return im

    # ---- sahna 2: taqqoslash ----
    u = t - INTRO                      # chiziqli vaqt
    span = max(1.0, (D - OUTRO) - INTRO)
    k = u * 8.0 / span                 # 0..8 birlikda

    layer_text(im, (60, 48), "Farq nimada?", F(40, True), WHITE, 'la', a_in)
    layer_text(im, (60, 100), "Nurlangan va nurlanmagan odam — bir daqiqadik skrining",
               F(21), MUTED, 'la', a_in)

    ap = ease(k / 0.6)
    if ap > 0:
        off = int(24 * (1 - ap))
        panel(im, 60 + off, "NURLANGAN ODOM", ROWS_L, RED, ease((k - 0.7) / 4.2) * 6)
        panel(im, 650 - off, "NURLANGANMAGAN ODOM", ROWS_R, GREEN, ease((k - 1.1) / 4.2) * 6)

    # ---- sahna 3: xulosa banner ----
    if t > D - OUTRO:
        a = ease((t - (D - OUTRO)) / 0.6)
        ov = Image.new('RGBA', im.size, (0, 0, 0, 0))
        ImageDraw.Draw(ov).rectangle([0, 0, W, H], fill=(5, 8, 14, int(150 * a)))
        im.alpha_composite(ov)
        bw, bh = 900, 150
        bx, by = (W - bw) / 2, (H - bh) / 2
        layer_text(im, (W / 2, by + 46), "RadSkrin — farqni 1 daqiqada aniqlaydi",
                   F(40, True), WHITE, 'mm', a)
        layer_text(im, (W / 2, by + 104),
                   "doza  \u00b7  belgilar  \u00b7  puls  \u00b7  AI xulosa", F(23),
                   CYAN, 'mm', a)
    return im


def alpha_box(im, x, y, w, h, c, a):
    if a <= 0.01:
        return
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(ov).rounded_rectangle([x, y, x + w, y + h], radius=4,
                                         fill=c + (int(255 * a),))
    im.alpha_composite(ov)


def main():
    os.makedirs(MEDIA, exist_ok=True)
    D = narration()
    D = max(D, 18.0)
    n = int(math.ceil(D * FPS))
    print('kadrlar:', n, '(%.1f s)' % D)

    proc = subprocess.Popen(
        [g.FF, '-y', '-loglevel', 'error',
         '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H), '-r', str(FPS),
         '-i', 'pipe:0', '-i', NARR,
         '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
         '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT],
        stdin=subprocess.PIPE)
    try:
        for i in range(n):
            im = render(i / FPS, D).convert('RGB')
            proc.stdin.write(im.tobytes())
            if i % 150 == 0:
                print('  %4d / %d' % (i, n))
    finally:
        proc.stdin.close()
        proc.wait()
    print('OK ->', OUT, '%.1f MB' % (os.path.getsize(OUT) / 1e6))


if __name__ == '__main__':
    main()
