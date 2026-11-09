# -*- coding: utf-8 -*-
"""RadSkrin — JONLI kamera: odam tanasi real vaqtda aniqlash (yozuvsiz).
Ishlatish:  python live_camera.py      (yoki live_camera.bat)
Tugmalar:   Q / ESC — yopish, F — to'liq ekran
"""
import os, sys, time

sys.argv = [sys.argv[0]]
GMZ = r'C:\Users\sardor\Desktop\gmz'
os.chdir(GMZ)
sys.path.insert(0, GMZ)

import cv2
import numpy as np

from make_body_video import compose, W, H, WEIGHTS

WIN = "RadSkrin — JONLI aniqlash (Q=yopish, F=to'liq ekran)"


def main():
    from ultralytics import YOLO
    print('model yuklanmoqda...', WEIGHTS)
    model = YOLO(WEIGHTS)

    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, W)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, H)
    cap.set(cv2.CAP_PROP_FPS, 30)
    for _ in range(12):
        cap.read()
    ok, f = cap.read()
    if not ok:
        print('KAMERA TOPILMADI')
        return
    model.predict(f, conf=0.45, verbose=False)          # qizitish
    print('kamera: %dx%d  ·  JONLI rejim' % (cap.get(3), cap.get(4)))

    cv2.namedWindow(WIN, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(WIN, W, H)

    t0 = time.time()
    last, fps = time.time(), 30.0
    seen, n_people, log_t = 0, 0, 0.0
    while True:
        now = time.time()
        dt = max(1e-3, now - last)
        last = now
        fps = 0.9 * fps + 0.1 * (1.0 / dt)

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
        if dets:
            seen += 1
        n_people = len(dets)

        img = compose(frame, dets, now - t0,
                      status='JONLI  ·  FPS %d  ·  ODM %d' % (fps, n_people))
        cv2.imshow(WIN, cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2BGR))

        if now - log_t > 2:
            log_t = now
            print('  FPS %2d · odam %d · aniqlangan kadr %d' % (fps, n_people, seen))

        k = cv2.waitKey(1) & 0xFF
        if k in (27, ord('q'), ord('Q')):
            break
        if k in (ord('f'), ord('F')):
            prop = cv2.WND_PROP_FULLSCREEN
            cur = cv2.getWindowProperty(WIN, prop)
            cv2.setWindowProperty(WIN, prop,
                                  cv2.WINDOW_FULLSCREEN if cur != cv2.WINDOW_FULLSCREEN
                                  else cv2.WINDOW_NORMAL)

    cap.release()
    cv2.destroyAllWindows()
    print('yopildi · aniqlangan kadr:', seen)


if __name__ == '__main__':
    main()
