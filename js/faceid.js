'use strict';

/**
 * RadSkrin — Face ID: yuzdan shaxs identifikatsiyasi (face-api.js asosida)
 *
 * Algoritm:
 *  1) vendor/face-api.js — oflayn ishlaydigan tayyor model (TinyFaceDetector
 *     + 68 nuqtali landmarks + 128-o'lchamli FaceRecognition descriptor).
 *  2) vendor/model/ — og'irliklar (yerda saqlanadi, internet kerak emas).
 *  3) descriptor — 128 sonli vektor; o'xshashlik = evklid masofasidan
 *     logistik egri chiziq (markaz 0.6 — face-api klassik chegara):
 *       sim(d) = 100 / (1 + e^(10·(d − 0.6)))   →  0..100%
 *  4) Ro'yxatga olishda 5 namunadan oxirgi 3 tasi saqlanadi (eng yaxshi moslik).
 *  5) Chegaralar: T_MATCH — avto-tanish, T_CANDIDATE — operator tasdig'i.
 *
 * Xavfsizlik: o'rta ball (nomzod) operator tasdig'i bilan ishlaydi,
 * yuqori ball — avto-tanish, past ball — "noma'lum shaxs".
 */
window.FaceID = (() => {
  const LEN = 128;
  const MAX_TEMPLATES = 3;
  const INPUT_SIZE = 320;
  const SCORE_THRESHOLD = 0.5;

  // logistik egri chiziq: d — evklid masofasi, natija 0..100%
  const CENTER = 0.6;
  const K = 10;

  const T_MATCH = 78;      // avto-tanish chegarasi (%) — d ≤ 0.46
  const T_CANDIDATE = 60;  // nomzod ko'rsatish chegarasi (%) — d ≤ 0.56
  const STREAK = 5;        // ketma-ket mos kadr (barqaror tanish)

  let status = 'idle';     // idle | loading | ready | error
  let err = '';
  let backend = '';
  let busy = false;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* --------------------------- 1. Modelni yuklash ------------------------ */
  async function init() {
    if (status === 'ready') return true;
    if (status === 'loading') return false;
    if (!window.faceapi) {
      status = 'error';
      err = 'face-api.js yuklanmadi (vendor/face-api.js)';
      return false;
    }
    status = 'loading';
    err = '';
    try {
      const tf = window.faceapi.tf;
      let ok = false;
      try { ok = await tf.setBackend('webgl'); } catch { ok = false; }
      if (!ok) await tf.setBackend('cpu');
      await tf.ready();
      backend = tf.getBackend();
      await faceapi.nets.tinyFaceDetector.loadFromUri('/vendor/model');
      await faceapi.nets.faceLandmark68Net.loadFromUri('/vendor/model');
      await faceapi.nets.faceRecognitionNet.loadFromUri('/vendor/model');
      status = 'ready';
      return true;
    } catch (e) {
      status = 'error';
      err = String(e && e.message ? e.message : e);
      return false;
    }
  }

  /* ------------------------- 2. Descriptor hisoblash ---------------------- */
  async function compute(source) {
    if (status !== 'ready' || busy || !source) return null;
    const w = source.videoWidth || source.naturalWidth || source.width;
    const h = source.videoHeight || source.naturalHeight || source.height;
    if (!w || !h) return null;
    busy = true;
    try {
      const r = await faceapi
        .detectSingleFace(
          source,
          new faceapi.TinyFaceDetectorOptions({ inputSize: INPUT_SIZE, scoreThreshold: SCORE_THRESHOLD })
        )
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (!r) return null;
      const b = r.detection.box;
      let eyes = null;
      try {
        const pos = r.landmarks.positions;
        const center = (a, z) => {
          let x = 0, y = 0;
          for (let i = a; i < z; i++) { x += pos[i].x; y += pos[i].y; }
          return { x: x / (z - a), y: y / (z - a) };
        };
        eyes = [center(36, 42), center(42, 48)];   // chap ko'z (36-41), o'ng ko'z (42-47)
      } catch { eyes = null; }
      return {
        descriptor: Array.from(r.descriptor),
        score: Math.round(r.detection.score * 100),
        box: {
          x0: b.x, y0: b.y,
          x1: b.x + b.width, y1: b.y + b.height
        },
        eyes
      };
    } catch {
      return null;
    } finally {
      busy = false;
    }
  }

  /* --------------------------- 3. O'xshashlik ---------------------------- */
  function distance(a, b) {
    if (!a || !b || a.length !== b.length || !a.length) return Infinity;
    let s = 0;
    for (let i = 0; i < a.length; i++) {
      const d = a[i] - b[i];
      s += d * d;
    }
    return Math.sqrt(s);
  }

  function similarity(a, b) {
    const d = distance(a, b);
    if (!isFinite(d)) return 0;
    return clamp(Math.round((100 / (1 + Math.exp(K * (d - CENTER)))) * 10) / 10, 0, 100);
  }

  /* ------------------------- 4. Ro'yxatga olish -------------------------- */
  function enroll(existingTemplates, descriptors) {
    const clean = (arr) => (arr || [])
      .filter((d) => Array.isArray(d) && d.length === LEN)
      .map((d) => d.map((v) => Number(Number(v).toFixed(4))));
    const all = [...clean(existingTemplates), ...clean(descriptors)];
    return all.slice(-MAX_TEMPLATES);
  }

  /* -------------------------- 5. Identifikatsiya ------------------------- */
  function identify(desc, patients) {
    if (!desc || desc.length !== LEN || !Array.isArray(patients)) return null;
    let best = null;
    for (const p of patients) {
      const tpls = p && p.face && p.face.templates;
      if (!tpls || !tpls.length) continue;
      let top = 0;
      for (const t of tpls) {
        if (!Array.isArray(t) || t.length !== LEN) continue;
        const s = similarity(desc, t);
        if (s > top) top = s;
      }
      if (top > 0 && (!best || top > best.score)) best = { patient: p, score: top };
    }
    return best;
  }

  /* ------------------------- 6. Mini-surat (thumb) ----------------------- */
  function thumbnail(video, box, aw = 160, ah = 120) {
    try {
      if (!video || !video.videoWidth || !box) return null;
      const S = 84;
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const g = c.getContext('2d');
      const kx = video.videoWidth / aw;
      const ky = video.videoHeight / ah;
      const ex = box.w * 0.25, ey = box.h * 0.25;
      const sx = (box.x - ex) * kx, sy = (box.y - ey) * ky;
      const sw = (box.w + ex * 2) * kx, sh = (box.h + ey * 2) * ky;
      g.translate(S, 0);
      g.scale(-1, 1);
      g.drawImage(video, Math.max(0, sx), Math.max(0, sy), sw, sh, 0, 0, S, S);
      return c.toDataURL('image/jpeg', 0.7);
    } catch {
      return null;
    }
  }

  // Kalibratsiya uchun: masofa va ball
  function breakdown(a, b) {
    const d = distance(a, b);
    return {
      dist: isFinite(d) ? Number(d.toFixed(4)) : null,
      total: similarity(a, b)
    };
  }

  return {
    init, compute, similarity, distance, enroll, identify, thumbnail, breakdown,
    get status() { return status; },
    get err() { return err; },
    get backend() { return backend; },
    get busy() { return busy; },
    LEN, MAX_TEMPLATES,
    T_MATCH, T_CANDIDATE, STREAK
  };
})();
