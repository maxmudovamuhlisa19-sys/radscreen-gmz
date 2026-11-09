# -*- coding: utf-8 -*-
"""Sintetik video (kamerasiz): Blender 3D odam modeli + YOLOv8-pose aniqlash.
Ishlatish:  python make_synth_video.py
Chiqish:    %TEMP%\\opencode\\media\\body.mp4  (+ body_narr.mp3)
Eski kamera yozuvi: %TEMP%\\opencode\\media\\body_camera.mp4 (birinchi marta saqlanadi)
"""
import os, sys, time, glob, shutil, subprocess

sys.argv = [sys.argv[0]]
GMZ = r'C:\Users\sardor\Desktop\gmz'
os.chdir(GMZ)
sys.path.insert(0, GMZ)

import cv2
from make_body_video import (W, H, CYAN, GREEN, RED, WHITE, MUTED, WEIGHTS, F,
                             compose, ffmpeg, COUNTDOWN, STAGE_AT)

TMP = os.path.join(os.environ.get('TEMP', '.'), 'opencode')
MEDIA = os.path.join(TMP, 'media')
OUT = os.path.join(MEDIA, 'body.mp4')
CAM = os.path.join(MEDIA, 'body_camera.mp4')
NARR = os.path.join(MEDIA, 'body_narr.mp3')
FRAMES = os.path.join(TMP, 'synth')
GLB = os.path.join(TMP, 'models', 'CesiumMan.glb')
BLENDER = next(p for p in (
    r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe',
    r'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe',
    r'C:\Program Files\Blender Foundation\Blender 4.2\blender.exe',
) if os.path.exists(p))

FPS = 30
BODY_NARR_TEXT = ("Kamera ishlatilmadi: bu sun'iy uch o'lchamli odam modeli. "
                  "Bir xil tizim tana qutisini va o'n yetti nuqtani model ustida real "
                  "vaqtda chizadi — yelka, tirsak, son va tizza. Demak, RadSkrin har "
                  "qanday odam tasvirini, hatto raqamli modelni ham aniqlaydi.")

SUB = 'kamerasiz — sintetik 3D model'
SMALL = 'Blender 3D render  ·  YOLOv8-pose  ·  17 nuqta'
SYN_STAGES = ['1  3D MODEL KADR', '2  TANA QUTISI', '3  17 NUQTA / POZA', '4  BELGILAR VA XULOSA']


def narration():
    import make_body_video as mbv
    if os.path.exists(NARR):
        os.remove(NARR)
    mbv.NARR, mbv.TMPW, mbv.BODY_NARR_TEXT = NARR, os.path.join(MEDIA, '_syn.wav'), BODY_NARR_TEXT
    return mbv.narration()


def render_cycle():
    if os.path.exists(FRAMES):
        shutil.rmtree(FRAMES, ignore_errors=True)
    os.makedirs(FRAMES, exist_ok=True)
    out = os.path.join(FRAMES, 'f_')
    cmd = [BLENDER, '-b', '-P', os.path.join(GMZ, 'blender_render.py'),
           '--', GLB, out, str(FPS * 4), str(FPS)]
    r = subprocess.run(cmd, capture_output=True, text=True,
                       encoding='utf-8', errors='ignore')
    for ln in (r.stdout or '').splitlines():
        if any(k in ln for k in ('engine', 'animatsiya', 'bbox', 'render:', 'FRAMES_DONE')):
            print('  blender:', ln)
    if 'FRAMES_DONE' not in (r.stdout or ''):
        print((r.stderr or '')[-2000:])
        raise SystemExit('blender render yiqildi')
    files = sorted(glob.glob(os.path.join(FRAMES, 'f_*.png')))
    print('sikl: %d kadr' % len(files))
    if len(files) < 8:
        raise SystemExit('kam kadr render qilindi')
    return files


def dets_for(model, path, cache, i):
    if i in cache:
        return cache[i]
    frame = cv2.imread(path)
    r = model.predict(frame, conf=0.45, verbose=False)[0]
    dets = []
    if r.keypoints is not None and len(r.boxes):
        for j in range(len(r.boxes)):
            dets.append((r.boxes.xyxy[j].cpu().numpy(),
                         float(r.boxes.conf[j]),
                         r.keypoints.data[j].cpu().numpy()))
    cache[i] = (frame, dets)
    return cache[i]


def build(files, n, narr_d):
    from ultralytics import YOLO
    model = YOLO(WEIGHTS)
    model.predict(cv2.imread(files[0]), conf=0.45, verbose=False)

    proc = subprocess.Popen(
        [ffmpeg(), '-y', '-loglevel', 'error',
         '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H),
         '-r', '%d' % FPS, '-i', 'pipe:0', '-i', NARR,
         '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
         '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT],
        stdin=subprocess.PIPE)
    cache = {}
    t0 = time.time()
    try:
        for i in range(n):
            src = i % len(files)
            frame, dets = dets_for(model, files[src], cache, src)
            img = compose(frame, dets, i / FPS,
                          status='FPS %d  ·  ODAM %d  ·  KADR %d/%d'
                                 % (FPS, len(dets), i + 1, n),
                          sub=SUB, small=SMALL, stages=SYN_STAGES)
            import numpy as np
            proc.stdin.write(np.asarray(img, np.uint8).tobytes())
            if i % 120 == 0:
                print('  %4d / %d  (%.1f s)' % (i, n, time.time() - t0))
    finally:
        proc.stdin.close()
        proc.wait()
    miss = sum(1 for _, d in cache.values() if not d)
    print('aniqlanmagan unikal kadr: %d / %d' % (miss, len(cache)))


def main():
    narr_d = narration()
    n = int(narr_d + 2.5) * FPS + 1
    print('maqsad: %.1f s narretsiya → %d kadr @ %d fps' % (narr_d, n, FPS))
    files = render_cycle()
    build(files, n, narr_d)
    print('OK ->', OUT, '%.1f MB' % (os.path.getsize(OUT) / 1e6))


if __name__ == '__main__':
    main()
