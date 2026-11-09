# -*- coding: utf-8 -*-
"""Real kamera: odam tanasi aniqlash (YOLOv8-pose) — slayd uchun MP4.
Ishlatish:  python make_body_video.py
Chiqish:    %TEMP%\\opencode\\media\\body.mp4  (+ body_narr.mp3)
"""
import os, sys, time, math, subprocess, re

sys.argv = [sys.argv[0]]
GMZ = r'C:\Users\sardor\Desktop\gmz'
os.chdir(GMZ)
sys.path.insert(0, GMZ)

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

TMP = os.path.join(os.environ.get('TEMP', '.'), 'opencode')
MEDIA = os.path.join(TMP, 'media')
OUT = os.path.join(MEDIA, 'body.mp4')
NARR = os.path.join(MEDIA, 'body_narr.mp3')
TMPW = os.path.join(MEDIA, '_body_narr.wav')
WEIGHTS = next(p for p in (os.path.join(TMP, 'yolov8n-pose.pt'),
                           os.path.join(GMZ, 'yolov8n-pose.pt')) if os.path.exists(p))

W, H = 1280, 720
COUNTDOWN = 3.0
BODY_NARR_TEXT = ("Kamera odam tanasini real vaqtda aniqlaydi: yelka, tirsak, son va tizza "
                  "nuqtalari bog'lanadi. Shundan keyin yuz va belgilar o'lchanadi, "
                  "natija klinik xulosaga aylanadi.")

BG = (0x0B, 0x12, 0x20)
CARD = (0x16, 0x24, 0x3A)
CARD2 = (0x1B, 0x2A, 0x40)
CYAN = (0x22, 0xD3, 0xEE)
GREEN = (0x22, 0xC5, 0x5E)
AMBER = (0xEA, 0xB3, 0x08)
RED = (0xEF, 0x44, 0x44)
WHITE = (0xF1, 0xF5, 0xF9)
MUTED = (0x94, 0xA3, 0xB8)
DARK = (0x05, 0x24, 0x2C)

EDGES = [(0, 1), (0, 2), (1, 3), (2, 4), (5, 6), (5, 7), (7, 9), (6, 8), (8, 10),
         (5, 11), (6, 12), (11, 12), (11, 13), (13, 15), (12, 14), (14, 16)]
JOINTS = {5: 'yelka', 7: 'tirsak', 11: 'son', 13: 'tizza'}
STAGES = ['1  KAMERADAN KADR', '2  TANA QUTISI', '3  17 NUQTA / POZA', '4  BELGILAR VA XULOSA']
STAGE_AT = [0.5, 1.8, 3.2, 4.8]

_F = {}


def F(size, bold=False):
    key = (size, bold)
    if key not in _F:
        name = 'segoeuib.ttf' if bold else 'segoeui.ttf'
        path = os.path.join(r'C:\Windows\Fonts', name)
        if not os.path.exists(path):
            path = os.path.join(r'C:\Windows\Fonts', 'arialbd.ttf' if bold else 'arial.ttf')
        _F[key] = ImageFont.truetype(path, size)
    return _FF(key)


def _FF(key):
    return _F[key]


_FF_PATH = None


def ffmpeg():
    global _FF_PATH
    if _FF_PATH is None:
        try:
            import gen_voice_uz as g
            _FF_PATH = g.FF
        except Exception:
            _FF_PATH = 'ffmpeg'
    return _FF_PATH


def narration():
    if not (os.path.exists(NARR) and os.path.getsize(NARR) > 10000):
        import gen_voice_uz as g
        from omegaconf import OmegaConf
        from hydra.utils import get_class
        from tts import TTS
        os.chdir(GMZ)
        cfg = OmegaConf.load(os.path.join(g.REPO, 'config', 'UZTTS_conf.yaml'))
        tts = TTS(ref_audio_path=g.REF_AUDIO, ref_text=g.REF_TEXT, model_cfg=cfg,
                  model_cls=get_class('uz_tts.model.%s' % cfg.model.backbone),
                  vocab=os.path.join(g.REPO, 'config', 'uz_vocab.txt'),
                  ckpt_path=os.path.join(g.REPO, 'ckpts', 'UZ.safetensors'),
                  device='auto', speed=1.0)
        audio, sr = tts.generate_speech(BODY_NARR_TEXT)
        tts.save_audio(audio, TMPW, sr)
        g.to_mp3(TMPW, NARR)
        os.remove(TMPW)
    r = subprocess.run([ffmpeg(), '-i', NARR], capture_output=True, text=True,
                       encoding='utf-8', errors='ignore')
    m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', r.stderr)
    d = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    print('narratsiya: %.1f s' % d)
    return d


# --------------------------- kadrlarni chizish ---------------------------
def compose(bgr, dets, t, status='', cd_left=None, show_stages=True,
            sub='real vaqtda odam tanasi aniqlash',
            small='YOLOv8-pose  ·  17 nuqta  ·  jonli kamera',
            stages=None):
    im = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 7], fill=CYAN)

    d.text((40, 30), 'RadSkrin', font=F(30, True), fill=CYAN)
    d.text((40, 68), sub, font=F(21), fill=WHITE)
    d.text((40, 98), small, font=F(15), fill=MUTED)

    n = len(dets)
    tw = 300
    d.rounded_rectangle([W - 40 - tw, 30, W - 40, 84], radius=10,
                        fill=GREEN if n else RED)
    d.text((W - 40 - tw / 2, 57),
           ('ODAM ANIQLANDI: %d' % n) if n else "ODAM YO'Q",
           font=F(18, True), fill=DARK, anchor='mm')
    if status:
        d.text((W - 40, 98), status, font=F(15), fill=MUTED, anchor='ra')

    for (box, conf, kpts) in dets:
        x1, y1, x2, y2 = [int(v) for v in box]
        d.rectangle([x1, y1, x2, y2], outline=CYAN, width=3)
        L = 34
        for cx, cy, dx, dy in ((x1, y1, 1, 1), (x2, y1, -1, 1), (x1, y2, 1, -1),
                               (x2, y2, -1, -1)):
            d.line([cx, cy, cx + dx * L, cy], fill=GREEN, width=6)
            d.line([cx, cy, cx, cy + dy * L], fill=GREEN, width=6)
        lab = 'ODAM  %.2f  ·  17 NUQTA' % conf
        tw2 = int(d.textlength(lab, font=F(17, True))) + 22
        ly = y1 - 34 if y1 > 44 else y1 + 8
        d.rectangle([x1, ly, x1 + tw2, ly + 30], fill=CYAN)
        d.text((x1 + 11, ly + 15), lab, font=F(17, True), fill=DARK, anchor='lm')
        for a, b in EDGES:
            pa, pb = kpts[a], kpts[b]
            if pa[2] > 0.3 and pb[2] > 0.3:
                d.line([pa[0], pa[1], pb[0], pb[1]], fill=CYAN, width=4)
        for i, p in enumerate(kpts):
            if p[2] > 0.3:
                r = 6 if i in JOINTS else 4
                d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r],
                          fill=GREEN if i in JOINTS else AMBER)
        for i, name in JOINTS.items():
            p = kpts[i]
            if p[2] > 0.3:
                d.text((p[0] + 12, p[1] - 10), name, font=F(13), fill=WHITE)

    if show_stages:
        stages = stages or STAGES
        cw, gap = 268, 14
        x0 = (W - (len(STAGES) * cw + (len(STAGES) - 1) * gap)) / 2
        for i, s in enumerate(STAGES):
            x = x0 + i * (cw + gap)
            y = H - 66
            if t >= STAGE_AT[i]:
                d.rounded_rectangle([x, y, x + cw, y + 44], radius=10, fill=CYAN)
                d.text((x + cw / 2, y + 22), s, font=F(15, True), fill=DARK, anchor='mm')
            else:
                d.rounded_rectangle([x, y, x + cw, y + 44], radius=10, fill=CARD,
                                    outline=CARD2, width=2)
                d.text((x + cw / 2, y + 22), s, font=F(15), fill=MUTED, anchor='mm')

    if cd_left is not None:
        ov = Image.new('RGBA', im.size, (0, 0, 0, 0))
        ImageDraw.Draw(ov).rectangle([0, 0, W, H], fill=(5, 8, 14, 150))
        im = Image.alpha_composite(im.convert('RGBA'), ov).convert('RGB')
        dd = ImageDraw.Draw(im)
        dd.text((W / 2, H / 2 - 40), str(max(1, int(math.ceil(cd_left)))),
                font=F(140, True), fill=WHITE, anchor='mm')
        dd.text((W / 2, H / 2 + 70), 'kameraga qarang — yozilmoqda',
                font=F(26), fill=CYAN, anchor='mm')
    return im


def person_time(rec, upto=None):
    """Odamlar paydo bo'lgan kadrlarning jami vaqti (soniya)."""
    tot, prev = 0.0, None
    for _, t, d in rec:
        if t < COUNTDOWN:
            continue
        if upto is not None and t > upto:
            break
        if d:
            if prev is not None and t - prev < 0.5:
                tot += t - prev
            prev = t
        else:
            prev = None
    return tot


def capture(model, target):
    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, W)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, H)
    cap.set(cv2.CAP_PROP_FPS, 30)
    for _ in range(12):
        cap.read()
    for _ in range(2):
        ok, f = cap.read()
        if ok:
            model.predict(f, conf=0.45, verbose=False)
    print('kamera: %d x %d' % (cap.get(3), cap.get(4)))

    rec = []
    t0 = time.time()
    last = time.time()
    last_prev = 0.0
    try:
        while True:
            now = time.time()
            fps = 1.0 / max(1e-3, now - last)
            last = now
            t = now - t0
            ok, frame = cap.read()
            if not ok:
                break
            r = model.predict(frame, conf=0.45, verbose=False)[0]
            dets = []
            if r.keypoints is not None and len(r.boxes):
                for i in range(len(r.boxes)):
                    dets.append((r.boxes.xyxy[i].cpu().numpy(),
                                 float(r.boxes.conf[i]),
                                 r.keypoints.data[i].cpu().numpy()))
            okk, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
            if okk:
                rec.append((buf.tobytes(), t, dets))

            if now - last_prev > 0.05:                    # ko'rinishni kamroq yangilash
                last_prev = now
                if t < COUNTDOWN:
                    img = compose(frame, dets, 0.0,
                                  cd_left=COUNTDOWN - t, show_stages=False)
                else:
                    got = person_time(rec, upto=t)
                    img = compose(frame, dets, t - COUNTDOWN,
                                  status='YOZILMOQDA  %.1f / %.1f s   FPS %d'
                                         % (got, target, fps))
                cv2.imshow('RadSkrin — tanani aniqlash',
                           cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR))
                cv2.waitKey(1)

            if t >= COUNTDOWN and person_time(rec, upto=t) >= target:
                print('yetarli material: %.1f s' % person_time(rec))
                break
            if t > 50:
                print('OGOHLANTRISH: vaqt tugadi, odam kadrlari %.1f s' % person_time(rec))
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()
    return rec


def longest_run(rec, target):
    pool = [(i, r) for i, r in enumerate(rec) if r[1] >= COUNTDOWN]
    best, cur = None, None
    for i, (_, t, d) in pool:
        if d:
            cur = [i, i] if cur is None else [cur[0], i]
        elif cur is not None:
            dur = rec[cur[1]][1] - rec[cur[0]][1]
            if best is None or dur > best[2]:
                best = (cur[0], cur[1], dur)
            cur = None
    if cur is not None:
        dur = rec[cur[1]][1] - rec[cur[0]][1]
        if best is None or dur > best[2]:
            best = (cur[0], cur[1], dur)
    if best is None:
        start = next((i for i, r in enumerate(rec) if r[1] >= COUNTDOWN), 0)
        print('OGOHLANTRISH: odam topilmadi — barcha kadrlar ishlatiladi')
        return rec[start:]
    a, b, dur = best
    if dur >= target:
        t_end = rec[a][1] + target
        b = next((i for i in range(a, len(rec)) if rec[i][1] >= t_end), b)
    else:
        print('OGOHLANTRISH: odam kadrlari %.1f s (kerak %.1f s)' % (dur, target))
    return rec[a:b + 1]


def main():
    os.makedirs(MEDIA, exist_ok=True)
    from ultralytics import YOLO
    narr_d = narration()
    model = YOLO(WEIGHTS)
    target = narr_d + 2.5

    rec = capture(model, target)
    sel = longest_run(rec, target)
    t_a, t_b = sel[0][1], sel[-1][1]
    fps = max(24.0, min(30.0, (len(sel) - 1) / max(0.5, t_b - t_a)))
    print('klip: %d kadr, %.1f s, %.1f fps' % (len(sel), t_b - t_a, fps))

    proc = subprocess.Popen(
        [ffmpeg(), '-y', '-loglevel', 'error',
         '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H),
         '-r', '%.3f' % fps, '-i', 'pipe:0', '-i', NARR,
         '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
         '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT],
        stdin=subprocess.PIPE)
    t0 = sel[0][1]
    try:
        for i, (jpg, t, dets) in enumerate(sel):
            frame = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
            img = compose(frame, dets, t - t0, status='FPS %d  ·  ODM %d' % (fps, len(dets)))
            proc.stdin.write(np.asarray(img, np.uint8).tobytes())
            if i % 120 == 0:
                print('  %4d / %d' % (i, len(sel)))
    finally:
        proc.stdin.close()
        proc.wait()
    print('OK ->', OUT, '%.1f MB' % (os.path.getsize(OUT) / 1e6))


if __name__ == '__main__':
    main()
