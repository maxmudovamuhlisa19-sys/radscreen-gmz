'use strict';

/**
 * RadSkrin — Camera Vision skrining moduli (yuz aniqlash pipeline'i)
 *
 * Kadr qayta ishlash zanjiri (har kadur, ~30 FPS):
 *   1) Kosmetik qisqartirish 160×120
 *   2) YCbCr + RGB teri maskasi
 *   3) Morfologik ochish (erode ×2 → dilate ×2) — shovqin va nozik ko'prikchalarni
 *      yo'qotish (qo'l, fon dog'lari)
 *   4) Connected components (BFS) — alohida teri "dog'lari"
 *   5) Yuz kandidati bahosi: maydon, eni/bo'yi nisbati, solidness, markazga
 *      yaqinlik, KO'Z va OG'IZ dalillari (yuqori/yeng past qorong'i klasterlar)
 *   6) Vaqt bo'yicha kuzatuv: ROI EMA + yo'qolgan hold + barqarorlik debounce
 *   7) Sifat nazorati: kontrast (blur), eksponiya (yorug'lik)
 *   8) Ichkarida: pallor (a* proxy), rPPG puls, yuz ichidagi harakat
 *
 * MUHIM: kamera IONIZALOVCHI radiatsiyani bevosita o'lchamaydi (fizik jihatdan
 * mumkin emas). Bu — ko'rinadigan tibbiy belgilar bo'yicha SKRINING indikatori.
 * Aniq doza dozimetr / Geiger detector orqali olinadi.
 */
window.VisionEngine = (() => {
  const W = 160, H = 120;          // tahlil o'lchami
  const SAMPLE_MS = 33;            // ~30 FPS
  const PPG_WINDOW_S = 12;         // rPPG oynasi (soniya)
  const PPG_MIN_S = 6;             // puls hisoblash uchun minimal oyna
  const HOLD_FRAMES = 12;          // yuz yo'qolganda ROI ni ushlab turish (~0.4 s)
  const STABLE_FRAMES = 12;        // "barqarar yuz" uchun ketma-ket kadr
  const N = W * H;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const round = (v, d = 1) => Number((v ?? 0).toFixed(d));

  /* ======================= 1. Teri maskasi (YCbCr) ======================= */
  function buildSkinMask(px) {
    const mask = new Uint8Array(N);
    for (let i = 0, p = 0; i < N; i++, p += 4) {
      const r = px[p], g = px[p + 1], b = px[p + 2];
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      if (
        cb >= 77 && cb <= 132 &&
        cr >= 133 && cr <= 177 &&
        y > 45 && y < 248 &&
        r > g && g >= b - 5          // teri uchun tabiiy R > G >= B zanjiri
      ) mask[i] = 1;
    }
    return mask;
  }

  /* ====================== 2. Morfologik ochish ========================== */
  function erode(m) {
    const o = new Uint8Array(N);
    for (let y = 1; y < H - 1; y++) {
      const row = y * W;
      for (let x = 1; x < W - 1; x++) {
        const i = row + x;
        if (m[i] && m[i - 1] && m[i + 1] && m[i - W] && m[i + W]) o[i] = 1;
      }
    }
    return o;
  }

  function dilate(m) {
    const o = new Uint8Array(N);
    for (let y = 1; y < H - 1; y++) {
      const row = y * W;
      for (let x = 1; x < W - 1; x++) {
        const i = row + x;
        if (m[i] || m[i - 1] || m[i + 1] || m[i - W] || m[i + W]) o[i] = 1;
      }
    }
    return o;
  }

  function openMask(mask) {
    let m = mask;
    m = dilate(erode(m));   // birinchi daraja: mayda dog'lar yo'qoladi
    m = dilate(erode(m));   // ikkinchi: nozik ko'prik (qo'l↔yuz) uziladi
    return m;
  }

  /* ==================== 3. Connected components (BFS) ==================== */
  function components(mask) {
    const lab = new Int32Array(N);
    const stack = new Int32Array(N);
    const out = [];
    let id = 0;
    for (let s = 0; s < N; s++) {
      if (!mask[s] || lab[s]) continue;
      id++;
      let sp = 0;
      stack[sp++] = s;
      lab[s] = id;
      let count = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
      while (sp > 0) {
        const p = stack[--sp];
        const x = p % W, y = (p - x) / W;
        count++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        if (x > 0 && mask[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack[sp++] = p - 1; }
        if (x < W - 1 && mask[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack[sp++] = p + 1; }
        if (y > 0 && mask[p - W] && !lab[p - W]) { lab[p - W] = id; stack[sp++] = p - W; }
        if (y < H - 1 && mask[p + W] && !lab[p + W]) { lab[p + W] = id; stack[sp++] = p + W; }
      }
      if (count >= 60) out.push({ count, x0, y0, x1, y1 });
    }
    return out;
  }

  /* ============= 4. Yuz kandidati: ko'z/og'iz dalillari + baho ========== */
  function evidenceFace(mask, gray, box) {
    const bw = box.x1 - box.x0 + 1;
    const bh = box.y1 - box.y0 + 1;
    const fx = (f) => Math.round(box.x0 + bw * f);
    const fy = (f) => Math.round(box.y0 + bh * f);

    // yuz terisining o'rtacha yorqinligi
    let sum = 0, n = 0;
    for (let y = box.y0; y <= box.y1; y += 2) {
      for (let x = box.x0; x <= box.x1; x += 2) {
        if (mask[y * W + x]) { sum += gray[y * W + x]; n++; }
      }
    }
    const mean = n ? sum / n : 128;

    // ko'zlar: yuzning 28–55% balandligida, chap/o'ng yarimda
    // qorong'i VA teri-maskadan tashqari piksellar (ko'z, qosh)
    const darkStats = (xa, xb, ya, yb) => {
      const X0 = fx(xa), X1 = fx(xb), Y0 = fy(ya), Y1 = fy(yb);
      let dark = 0, tot = 0, sx = 0, sy = 0;
      for (let y = Y0; y < Y1; y++) {
        for (let x = X0; x < X1; x++) {
          const i = y * W + x;
          tot++;
          if (!mask[i] && gray[i] < mean * 0.72) { dark++; sx += x; sy += y; }
        }
      }
      return {
        ratio: tot ? dark / tot : 0,
        cx: dark ? sx / dark : null,
        cy: dark ? sy / dark : null,
        n: dark
      };
    };
    const eyeL = darkStats(0.14, 0.47, 0.28, 0.56);
    const eyeR = darkStats(0.53, 0.86, 0.28, 0.56);
    const leftEye = eyeL.ratio, rightEye = eyeR.ratio;

    // ko'z markazlari (Face ID uchun affin tekislash)
    const eyes = [];
    if (eyeL.n > 8 && eyeL.cy != null) eyes.push({ x: eyeL.cx, y: eyeL.cy });
    if (eyeR.n > 8 && eyeR.cy != null) eyes.push({ x: eyeR.cx, y: eyeR.cy });
    if (eyes.length === 1) {
      const cxBox = (box.x0 + box.x1) / 2;
      const mirror = { x: 2 * cxBox - eyes[0].x, y: eyes[0].y };
      eyes.push(mirror);
      eyes.sort((a, b) => a.x - b.x);
    } else if (eyes.length === 2) {
      eyes.sort((a, b) => a.x - b.x);
    }

    // og'iz: yuzning 62–85% balandligida, o'rtasida qorong'i klaster
    const mouth = (() => {
      const X0 = fx(0.30), X1 = fx(0.70), Y0 = fy(0.62), Y1 = fy(0.85);
      let dark = 0, tot = 0;
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
        const i = y * W + x;
        tot++;
        if (!mask[i] && gray[i] < mean * 0.78) dark++;
      }
      return tot ? dark / tot : 0;
    })();

    // qosh zonasi: yuzning 10–27% balandligida qorong'i (soch bilan chegaradosh)
    const brow = (() => {
      const X0 = fx(0.2), X1 = fx(0.8), Y0 = fy(0.10), Y1 = fy(0.27);
      let dark = 0, tot = 0;
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
        const i = y * W + x;
        tot++;
        if (gray[i] < mean * 0.75) dark++;
      }
      return tot ? dark / tot : 0;
    })();

    const band = (v, lo, hi, soft) => {
      if (v < lo) return clamp(v / lo, 0, 1) * 0.5;
      if (v > hi) return clamp(1 - (v - hi) / (hi * soft), 0, 1);
      return 1;
    };
    const eyeScore = Math.min(band(leftEye, 0.02, 0.35, 1), band(rightEye, 0.02, 0.35, 1));
    const mouthScore = band(mouth, 0.01, 0.4, 1.2);
    const browScore = band(brow, 0.05, 0.6, 1);

    return {
      eyeScore, mouthScore, browScore,
      eyes,
      mean
    };
  }

  function pickFace(cands, mask, gray) {
    if (!cands.length) return null;
    const frameArea = N;
    let best = null;
    for (const c of cands) {
      const bw = c.x1 - c.x0 + 1;
      const bh = c.y1 - c.y0 + 1;
      const areaRatio = c.count / frameArea;
      const aspect = bh / bw;
      const solidity = c.count / (bw * bh);
      const cx = (c.x0 + c.x1) / 2 / W;
      const cy = (c.y0 + c.y1) / 2 / H;

      // 1) maydon: yuz kadrdagi 4%..45% oralig'ida
      const areaScore = areaRatio >= 0.04 && areaRatio <= 0.45
        ? 1
        : areaRatio < 0.04 ? clamp(areaRatio / 0.04, 0, 1) * 0.6
          : clamp(1 - (areaRatio - 0.45) / 0.3, 0, 1) * 0.6;

      // 2) nisbat: yuz bo'yi/eni ≈ 1.0–1.9 (yuz + to'n)
      const aspectScore = aspect >= 0.95 && aspect <= 1.9 ? 1
        : aspect < 0.95 ? clamp((aspect - 0.5) / 0.45, 0, 1)
          : clamp(1 - (aspect - 1.9) / 1.1, 0, 1);

      // 3) solidness: to'liq to'rtburchakka sig'ish
      const solidScore = solidity >= 0.4 && solidity <= 0.95 ? 1 : clamp(solidity / 0.4, 0, 1) * 0.7;

      // 4) holat: yuz odatda kadr markaziga yaqin va yuqori-oshirida
      const d = Math.hypot(cx - 0.5, (cy - 0.45) * 0.9);
      const posScore = clamp(1 - d * 1.8, 0, 1);

      const ev = evidenceFace(mask, gray, c);
      const featureScore = 0.45 * ev.eyeScore + 0.3 * ev.mouthScore + 0.25 * ev.browScore;

      // geometrik baho
      const geo =
        0.28 * areaScore + 0.22 * aspectScore + 0.18 * solidScore +
        0.14 * posScore + 0.18 * featureScore;

      // darvoza 1: yuzga xos belgilar (ko'z/og'iz/qosh) bo'lmasa — rad etiladi
      // (qo'l, devor dog'i kabi shakllar shu tufayli yuz bo'lmaydi)
      const gateFeature = 0.45 + 0.55 * clamp(featureScore / 0.7, 0, 1);
      // darvoza 2: geometriya — yuz bertarmoq (en/bo'y ≈ 0.75..2.1),
      // gorizontal "qo'l" bloklari shu chegaradan chiqadi
      const gateGeo = aspect >= 0.75 && aspect <= 2.1 ? 1 : 0.35;
      // darvoza 3: ko'z dalili juda zaif bo'lmasin
      const gateEye = ev.eyeScore >= 0.2 ? 1 : 0.6;

      const score = geo * gateFeature * gateGeo * gateEye;

      if (!best || score > best.score) {
        best = { ...c, bw, bh, areaRatio, aspect, solidity, ev, featureScore, score };
      }
    }
    // ishonch chegarasi: past bahoni "yuz emas" deb hisoblaymiz
    return best && best.score >= 0.42 ? best : null;
  }

  /* ===================== 5. Sifat: kontrast + yorug'lik =================== */
  function regionQuality(gray, box) {
    let sum = 0, sum2 = 0, n = 0;
    for (let y = box.y0; y <= box.y1; y += 2) {
      for (let x = box.x0; x <= box.x1; x += 2) {
        const v = gray[y * W + x];
        sum += v; sum2 += v * v; n++;
      }
    }
    if (!n) return { contrast: 0, exposure: 128 };
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    return { contrast: sd, exposure: mean };
  }

  /* ============================ Asosiy klass ============================= */
  class VisionEngine {
    constructor(opts = {}) {
      this.video = opts.video || null;
      this.overlay = opts.overlay || null;
      this.onFrame = opts.onFrame || (() => {});
      this.stream = null;
      this.running = false;
      this._timer = null;
      this._prevGray = null;
      this._ppg = [];
      this._motionAvg = 0.5;
      this._roi = null;          // {x0,y0,x1,y1} EMA-smoothed
      this._missed = 0;          // yuz yo'qolgandan keyingi kadrlar
      this._stable = 0;          // ketma-ket yuz topilgan kadrlar
      this.latest = null;
      this._lastRunAt = 0;
      this.warmupUntil = 0;
      this.errors = [];
    }

    /* ------------------------------ Kamera ------------------------------ */
    async start() {
      if (this.running) return true;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Bu brauzerda kamera API mavjud emas (HTTPS/localhost kerak).');
      }

      // Android: registratsiya kabi boshqa oqim kamerani band qilib qoymasin
      try {
        document.querySelectorAll('video').forEach((v) => {
          if (v !== this.video && v.srcObject) {
            v.srcObject.getTracks().forEach((t) => t.stop());
            v.srcObject = null;
          }
        });
      } catch { /* ignore */ }

      // ketma-ket yumshoq constraint'lar — Android'da biri albatta ishlaydi
      const attempts = [
        { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: 'user' } },
        { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: { ideal: 'user' } },
        { facingMode: { ideal: 'user' } },
        true
      ];
      let lastErr = null;
      for (const cand of attempts) {
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({
            video: cand === true ? true : cand, audio: false
          });
          break;
        } catch (e) { lastErr = e; }
      }
      if (!this.stream) {
        const n = lastErr && lastErr.name;
        const msg =
          (n === 'NotAllowedError' || n === 'PermissionDeniedError')
            ? 'Kamera ruxsati rad etildi — brauzer sozlamalaridan ruxsat bering.'
            : (n === 'NotFoundError' || n === 'DevicesNotFoundError')
              ? 'Kamera topilmadi — qurilmada kamera yo\'q yoki band.'
              : (n === 'NotReadableError' || n === 'TrackStartError')
                ? 'Kamera boshqa ilova tomonidan band — boshqa ilovani yoping va qayta urining.'
                : 'Kamera ochilmadi: ' + ((lastErr && lastErr.message) || n || 'noma\'lum xato');
        throw new Error(msg);
      }

      if (this.video) {
        const v = this.video;
        v.setAttribute('playsinline', '');
        v.muted = true;
        v.autoplay = true;
        v.srcObject = this.stream;
        // metadata kelishini kutamiz — Android'da erta play() rad etiladi
        await new Promise((res) => {
          if (v.readyState >= 1) return res();
          const t = setTimeout(res, 3000);
          v.addEventListener('loadedmetadata', () => { clearTimeout(t); res(); }, { once: true });
        });
        await v.play().catch(() => {});
      }
      this._buf = document.createElement('canvas');
      this._buf.width = W;
      this._buf.height = H;
      this._ctx = this._buf.getContext('2d', { willReadFrequently: true });
      // Face ID uchun kichraytirilgan kadr (to'liq 1080p emas — telefonda tezroq)
      this._faBuf = document.createElement('canvas');
      this._faCtx = this._faBuf.getContext('2d', { willReadFrequently: true });
      this._reset();
      this.running = true;
      this.warmupUntil = performance.now() + 2000;
      this._loop();
      return true;
    }

    stop() {
      this.running = false;
      if (this._timer) clearTimeout(this._timer);
      this._timer = null;
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.latest = null;
      this._reset();
      this._clearOverlay();
    }

    _reset() {
      this._ppg = [];
      this._prevGray = null;
      this._motionAvg = 0.5;
      this._roi = null;
      this._missed = 0;
      this._stable = 0;
      this._eyes = null;
      this._thumbCache = null;
      this._fa = null;
      this._faTick = 0;
    }

    /* ------------------------------- Sikl -------------------------------- */
    _loop() {
      if (!this.running) return;
      const now = performance.now();
      if (now - this._lastRunAt >= SAMPLE_MS) {
        this._lastRunAt = now;
        try { this._process(now); }
        catch (e) { this.errors.push(String(e.message || e)); }
      }
      this._timer = setTimeout(() => this._loop(), 8);
    }

    _process(now) {
      const v = this.video;
      if (!v || v.readyState < 2 || !v.videoWidth) return;

      const vw = v.videoWidth, vh = v.videoHeight;
      // CSS object-fit: cover bilan mos — kadrni markazdan 4:3 kesib olamiz
      // (to'liq 16:9 ni cho'zmaslik: aks holda yuz siqilib, aniqlash buziladi)
      const tar = W / H;
      let csx = 0, csy = 0, csw = vw, csh = vh;
      if (vw / vh > tar + 0.01) {
        csw = Math.round(vh * tar); csx = Math.round((vw - csw) / 2);
      } else if (vw / vh < tar - 0.01) {
        csh = Math.round(vw / tar); csy = Math.round((vh - csh) / 2);
      }

      this._ctx.drawImage(v, csx, csy, csw, csh, 0, 0, W, H);
      const img = this._ctx.getImageData(0, 0, W, H);
      const px = img.data;

      // gray
      const gray = new Uint8Array(N);
      for (let i = 0, p = 0; i < N; i++, p += 4) {
        gray[i] = (px[p] * 299 + px[p + 1] * 587 + px[p + 2] * 114) >> 10;
      }

      // teri maskasi + morfologiya + komponentlar + yuz (zaxira aniqlash)
      const rawMask = buildSkinMask(px);
      const mask = openMask(rawMask);
      const face = pickFace(components(mask), mask, gray);

      /* --- Face API aniqlash: kichraytirilgan kesilgan kadr (480×360) ---
       * To'liq 1080p emas — telefonda ~4× tezroq, koordinatalar esa
       * darhol 160×120 buferga mos (kx/ky bir xil). */
      const FA_W = 480, FA_H = 360;
      this._faTick = (this._faTick || 0) + 1;
      if (window.FaceID && FaceID.status === 'ready' && !FaceID.busy &&
          this._faTick % 4 === 0 && this._faBuf) {
        if (this._faBuf.width !== FA_W) {
          this._faBuf.width = FA_W;
          this._faBuf.height = FA_H;
        }
        this._faCtx.drawImage(v, csx, csy, csw, csh, 0, 0, FA_W, FA_H);
        FaceID.compute(this._faBuf)
          .then((r) => { if (r) this._fa = { ...r, at: performance.now() }; })
          .catch(() => {});
      }
      const fa = this._fa && now - this._fa.at < 1200 ? this._fa : null;
      const kx = W / FA_W, ky = H / FA_H;
      const faBox = fa ? {
        x0: Math.round(clamp(fa.box.x0 * kx, 0, W - 1)),
        y0: Math.round(clamp(fa.box.y0 * ky, 0, H - 1)),
        x1: Math.round(clamp(fa.box.x1 * kx, 0, W - 1)),
        y1: Math.round(clamp(fa.box.y1 * ky, 0, H - 1))
      } : null;
      const faEyes = fa && fa.eyes ? fa.eyes.map((e) => ({ x: e.x * kx, y: e.y * ky })) : null;
      const srcBox = faBox || (face ? { x0: face.x0, y0: face.y0, x1: face.x1, y1: face.y1 } : null);

      /* --- ROI kuzatuv (EMA + hold) --- */
      let roi = null;
      if (srcBox) {
        const b = { x0: srcBox.x0, y0: srcBox.y0, x1: srcBox.x1, y1: srcBox.y1 };
        if (!this._roi) this._roi = b;
        else {
          const a = 0.35;
          this._roi = {
            x0: this._roi.x0 + (b.x0 - this._roi.x0) * a,
            y0: this._roi.y0 + (b.y0 - this._roi.y0) * a,
            x1: this._roi.x1 + (b.x1 - this._roi.x1) * a,
            y1: this._roi.y1 + (b.y1 - this._roi.y1) * a
          };
        }
        roi = this._roi;
        this._missed = 0;
        this._stable = Math.min(STABLE_FRAMES + 6, this._stable + 1);
      } else if (this._roi && this._missed < HOLD_FRAMES) {
        this._missed++;
        this._stable = Math.max(0, this._stable - 1);
        roi = this._roi;                       // qisqa ushlab turish (kirishish)
      } else {
        this._roi = null;
        this._stable = 0;
      }

      const box = roi ? {
        x0: Math.round(clamp(roi.x0, 0, W - 1)),
        y0: Math.round(clamp(roi.y0, 0, H - 1)),
        x1: Math.round(clamp(roi.x1, 0, W - 1)),
        y1: Math.round(clamp(roi.y1, 0, H - 1))
      } : null;

      const found = !!srcBox;
      const stableEnough = this._stable >= STABLE_FRAMES;

      /* --- Yuz ichidan indikatorlar --- */
      let pallor = null, redness = null, lum = null, contrast = null, exposure = null;
      let rSum = 0, gSum = 0, bSum = 0, gCount = 0, skinCount = 0;

      if (box) {
        const q = regionQuality(gray, box);
        contrast = q.contrast;
        exposure = q.exposure;

        for (let y = box.y0; y <= box.y1; y++) {
          for (let x = box.x0; x <= box.x1; x++) {
            const i = y * W + x;
            if (!mask[i]) continue;
            const yv = gray[i];
            if (yv < exposure * 0.78) continue;      // soch, qosh, qorong'i — chetlab o'tamiz
            if (yv > 250) continue;
            skinCount++;
            rSum += px[i * 4]; gSum += px[i * 4 + 1]; bSum += px[i * 4 + 2];
          }
        }

        if (skinCount > 60) {
          const R = rSum / skinCount, G = gSum / skinCount, B = bSum / skinCount;
          redness = (R - (G + B) / 2) / 255;
          lum = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
          const norm = redness / Math.max(0.35, lum);
          pallor = clamp(((norm - 0.06) / (0.62 - 0.06)) * 100, 0, 100);
          gCount = skinCount;
        }
      }

      /* --- Yuz ichidagi harakat (barqarorlik) --- */
      let faceMotion = this._motionAvg;
      if (box && this._prevGray) {
        let diff = 0, n = 0;
        for (let y = box.y0 + 2; y < box.y1 - 1; y += 3) {
          for (let x = box.x0 + 2; x < box.x1 - 1; x += 3) {
            const i = y * W + x;
            diff += Math.abs(gray[i] - this._prevGray[i]);
            n++;
          }
        }
        if (n) {
          const d = diff / n;
          this._motionAvg = this._motionAvg * 0.85 + d * 0.15;
          faceMotion = this._motionAvg;
        }
      }
      this._prevGray = gray;

      /* --- rPPG (yashil kanal, faqat yuz terisi) --- */
      if (box && skinCount > 60) this._ppg.push({ t: now, g: gSum / gCount });
      const cutoff = now - PPG_WINDOW_S * 1000;
      while (this._ppg.length && this._ppg[0].t < cutoff) this._ppg.shift();
      const pulse = this._estimatePulse(now);

      /* --- Yuz rasmi (thumb) + ko'zlar --- */
      if (!box || !found) {
        this._eyes = null;
      } else {
        this._eyes = faEyes || (face && face.ev && face.ev.eyes && face.ev.eyes.length === 2 ? face.ev.eyes : null);
        this._thumbCache = this._makeThumb(px, box);
      }

      /* --- Indekslar --- */
      const presence = box && found
        ? (fa ? round(clamp(fa.score, 0, 100)) : round(clamp((face ? face.score : 0) * 100 * 1.15, 0, 100)))
        : 0;
      const stability = box ? round(clamp(100 - (faceMotion - 0.5) * 12, 0, 100)) : 0;

      const exposureOk = exposure != null && exposure > 55 && exposure < 240;
      const contrastOk = contrast != null && contrast > 8;

      let quality = 0;
      if (box && found) {
        quality = clamp(
          presence * 0.4 +
          (pallor != null ? 20 : 0) +
          (exposureOk ? 15 : 0) +
          (contrastOk ? 15 : 0) +
          (pulse ? 10 : 0),
          0, 100
        );
      }

      const parsed = now > this.warmupUntil && stableEnough && box && found &&
        pallor != null && exposureOk && contrastOk;

      let status = 'yuz yo\'q';
      if (box && found && !stableEnough) status = 'yuz kuzatilmoqda...';
      else if (box && found && !exposureOk) status = exposure < 55 ? 'yorug\'lik kam' : 'yorug\'lik ortiqcha';
      else if (box && found && !contrastOk) status = 'kadr aniq emas (silkinyapti)';
      else if (parsed) status = 'yuz barqarar';

      this.latest = {
        parsed,
        status,
        found,
        stable: stableEnough,
        thumb: this._thumbCache || null,
        descriptor: fa ? fa.descriptor : null,
        eyes: this._eyes || null,
        face: box ? { x: box.x0, y: box.y0, w: box.x1 - box.x0 + 1, h: box.y1 - box.y0 + 1 } : null,
        faceScore: fa ? round(fa.score) : (face ? round(face.score * 100) : 0),
        pallor: pallor == null ? null : round(pallor),
        redness,
        luminance: lum,
        exposure: exposure == null ? null : round(exposure),
        contrast: contrast == null ? null : round(contrast),
        skinRatio: box ? skinCount / ((box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1)) : 0,
        presence,
        pulse: pulse ? round(pulse.bpm) : null,
        pulseConfidence: pulse ? round(pulse.conf, 1) : 0,
        stability,
        quality: round(quality),
        motion: round(faceMotion, 2)
      };

      this._drawOverlay(box, this.latest);
      this.onFrame(this.latest);
    }

    /* --------------------------- rPPG puls hisobi ------------------------ */
    _estimatePulse(now) {
      const s = this._ppg;
      if (!s.length) return null;
      const span = (now - s[0].t) / 1000;
      if (s.length < 150 || span < PPG_MIN_S) return null;

      const Fs = 30;
      const Nn = Math.floor(span * Fs);
      if (Nn < 180) return null;
      const t0 = s[0].t;
      const uni = new Float64Array(Nn);
      let j = 0;
      for (let i = 0; i < Nn; i++) {
        const tt = t0 + (i / Fs) * 1000;
        while (j < s.length - 2 && s[j + 1].t < tt) j++;
        uni[i] = s[j].g;
      }

      // detrend (1.5 s harakatlanuvchi o'rtacha)
      const win = Math.floor(1.5 * Fs);
      let run = 0;
      const detr = new Float64Array(Nn);
      for (let i = 0; i < Nn; i++) {
        run += uni[i];
        if (i >= win) run -= uni[i - win];
        detr[i] = uni[i] - run / Math.min(i + 1, win);
      }
      // hamming
      for (let i = 0; i < Nn; i++) detr[i] *= 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (Nn - 1));

      // Goertzel 0.7..3.0 Hz
      let bestF = 0, bestP = 0, totalP = 0;
      for (let f = 0.7; f <= 3.0; f += 0.02) {
        const w = (2 * Math.PI * f) / Fs;
        const coeff = 2 * Math.cos(w);
        let s1 = 0, s2 = 0, s0 = 0;
        for (let i = 0; i < Nn; i++) {
          s0 = detr[i] + coeff * s1 - s2;
          s2 = s1; s1 = s0;
        }
        const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
        totalP += power;
        if (power > bestP) { bestP = power; bestF = f; }
      }
      if (!bestF || totalP <= 0) return null;
      const conf = clamp((bestP / totalP) * 10, 0, 100);
      if (conf < 14) return null;
      const bpm = bestF * 60;
      if (bpm < 42 || bpm > 165) return null;
      return { bpm, conf };
    }

    /* --------------------------- Yuz mini-surati -------------------------- */
    _makeThumb(px, box) {
      try {
        const S = 48;
        if (!this._t1) {
          this._t1 = document.createElement('canvas');
          this._t1.width = W; this._t1.height = H;
          this._t1c = this._t1.getContext('2d');
          this._t2 = document.createElement('canvas');
          this._t2.width = S; this._t2.height = S;
          this._t2c = this._t2.getContext('2d');
        }
        const id = this._t1c.createImageData(W, H);
        id.data.set(px);
        this._t1c.putImageData(id, 0, 0);

        const pad = Math.round((box.x1 - box.x0) * 0.18);
        const sx = Math.max(0, box.x0 - pad);
        const sy = Math.max(0, box.y0 - pad);
        const sw = Math.min(W - sx, box.x1 - box.x0 + 1 + pad * 2);
        const sh = Math.min(H - sy, box.y1 - box.y0 + 1 + pad * 2);

        const g = this._t2c;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, S, S);
        g.translate(S, 0);            // ekran ko'rinishiga mos (aks ettirilgan)
        g.scale(-1, 1);
        g.drawImage(this._t1, sx, sy, sw, sh, 0, 0, S, S);
        g.setTransform(1, 0, 0, 1, 0, 0);
        return this._t2.toDataURL('image/jpeg', 0.72);
      } catch {
        return null;
      }
    }

    /* ------------------------------- Overlay ----------------------------- */
    _drawOverlay(box, info) {
      const c = this.overlay;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth || W, h = c.clientHeight || H;
      if (c.width !== w * dpr || c.height !== h * dpr) {
        c.width = w * dpr; c.height = h * dpr;
      }
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      const sx = w / W, sy = h / H;
      // video CSS bilan aks ettirilgan (scaleX(-1)) — overlay ham moslashadi
      const mx = (x) => w - x * sx;

      const now = performance.now();
      const acc = info.parsed ? '#00ff88' : info.found ? '#ffcc00' : '#ff2d95';
      const glow = info.parsed ? 'rgba(0,255,136,.85)'
        : info.found ? 'rgba(255,204,0,.85)' : 'rgba(255,45,149,.85)';

      // Kompakt rejim (telefon/tablet): katta panel va yozuvlar yuzni yopmasligi
      // uchun faqat ramka + bitta qator status chiziladi.
      const compact = w < 520;

      // fon: AI nazorat to'ri (nuqtalar)
      g.save();
      g.fillStyle = 'rgba(34,211,238,.13)';
      for (let yy = 13; yy < h; yy += 26) {
        for (let xx = 13; xx < w; xx += 26) g.fillRect(xx, yy, 1.5, 1.5);
      }
      g.restore();

      // skaner chizigi (butun kadr bo'ylab)
      {
        const ph = ((now / 30) % (h + 80)) - 40;
        const grad = g.createLinearGradient(0, ph - 34, 0, ph + 34);
        grad.addColorStop(0, 'rgba(34,211,238,0)');
        grad.addColorStop(0.5, 'rgba(34,211,238,.22)');
        grad.addColorStop(1, 'rgba(34,211,238,0)');
        g.fillStyle = grad;
        g.fillRect(0, ph - 34, w, 68);
        g.fillStyle = 'rgba(34,211,238,.55)';
        g.fillRect(0, ph, w, 1);
      }

      // markazlash yo'nalishi — AI retikel
      {
        const cx0 = w * 0.5, cy0 = h * 0.47, r0 = Math.min(w, h) * 0.2;
        g.save();
        g.strokeStyle = 'rgba(34,211,238,.45)';
        g.lineWidth = 1.5;
        g.shadowColor = 'rgba(34,211,238,.8)';
        g.shadowBlur = 8;
        g.setLineDash([6, 8]);
        g.lineDashOffset = -(now / 45) % 14;
        g.beginPath(); g.arc(cx0, cy0, r0, 0, Math.PI * 2); g.stroke();
        g.setLineDash([]);
        g.shadowBlur = 0;
        g.strokeStyle = 'rgba(34,211,238,.55)';
        [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => {
          g.beginPath();
          g.moveTo(cx0 + dx * r0 * 0.28, cy0 + dy * r0 * 0.28);
          g.lineTo(cx0 + dx * r0 * 0.62, cy0 + dy * r0 * 0.62);
          g.stroke();
        });
        g.restore();
      }

      if (box) {
        const x = mx(box.x1 + 1), y = box.y0 * sy;
        const bw = (box.x1 - box.x0 + 1) * sx, bh = (box.y1 - box.y0 + 1) * sy;

        // ===== AI TAHLIL ko'rinishi (yangi model) =====
        const pad = 10;
        const fx = x - pad, fy = y - pad;
        const fw = bw + pad * 2, fh = bh + pad * 2;
        const cx = fx + fw / 2, cy = fy + fh / 2;
        const okColor = acc;
        const flick = 0.85 + 0.15 * Math.sin(now / 140);

        // 0) yuz ortidagi yengil nurnur (faqat chetda, yuzni yashirmaydi)
        {
          const R = Math.max(fw, fh) * 0.8;
          const rg = g.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
          rg.addColorStop(0, 'rgba(0,0,0,0)');
          rg.addColorStop(1, info.parsed ? 'rgba(0,255,136,.10)' : 'rgba(34,211,238,.08)');
          g.save();
          g.fillStyle = rg;
          g.beginPath();
          g.ellipse(cx, cy, R, R * 1.1, 0, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }

        // 1) aylanuvchi tashqi halqalar (yuz tashqarisida) — kompaktda yo'q
        if (!compact) {
          g.save();
          g.translate(cx, cy);
          const R = Math.max(fw, fh) * 0.68;
          [[R, 0.55, 1.6, 0], [R + 7, 0.30, 1.2, 1]].forEach(([rr, arc, lw, dir], i) => {
            g.save();
            g.rotate((dir ? -1 : 1) * (now / (2400 + i * 900)));
            g.strokeStyle = i === 0 ? okColor : 'rgba(34,211,238,.5)';
            g.globalAlpha = 0.55;
            g.shadowColor = i === 0 ? glow : 'rgba(34,211,238,.6)';
            g.shadowBlur = 6;
            g.lineWidth = lw;
            g.beginPath();
            g.arc(0, 0, rr, 0, Math.PI * 2 * arc);
            g.stroke();
            g.beginPath();
            g.arc(0, 0, rr, Math.PI, Math.PI + Math.PI * 2 * arc);
            g.stroke();
            g.restore();
          });
          g.restore();
        }

        // 2) ichki to'ldirish — deyarli ko'rinmaydigan shaffof plyonka
        g.save();
        g.fillStyle = info.parsed ? 'rgba(0,255,136,.03)' : 'rgba(34,211,238,.025)';
        g.fillRect(fx, fy, fw, fh);
        g.restore();

        // 3) yuz MESH to'ri — shaffof, yuzni bosmaydi (kompaktda o'chiriladi)
        if (!compact) {
          g.save();
          g.beginPath(); g.rect(fx, fy, fw, fh); g.clip();
          const COLS = 6, ROWS = 8;
          const pts = [];
          for (let r = 0; r < ROWS; r++) {
            pts[r] = [];
            for (let c = 0; c < COLS; c++) {
              const u = (c + 0.5) / COLS, v = (r + 0.5) / ROWS;
              const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2;
              const k = 1 - 0.32 * (dx * dx + dy * dy);
              const wob = Math.sin(now / 420 + c * 0.9 + r * 0.7) * 1.3;
              pts[r][c] = {
                x: cx + (u - 0.5) * fw * k + wob,
                y: cy + (v - 0.5) * fh * k + wob * 0.6
              };
            }
          }
          const base = info.parsed ? '0,255,136' : '34,211,238';
          g.lineWidth = 0.8;
          // gorizontal + vertikal (juda yupqa)
          for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
              const p = pts[r][c];
              if (c < COLS - 1) {
                g.strokeStyle = `rgba(${base},${0.05 + 0.05 * Math.abs(Math.sin(now / 700 + r))})`;
                g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(pts[r][c + 1].x, pts[r][c + 1].y); g.stroke();
              }
              if (r < ROWS - 1) {
                g.strokeStyle = `rgba(${base},${0.05 + 0.05 * Math.abs(Math.cos(now / 700 + c))})`;
                g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(pts[r + 1][c].x, pts[r + 1][c].y); g.stroke();
              }
              if (c < COLS - 1 && r < ROWS - 1) {
                g.strokeStyle = `rgba(${base},.04)`;
                g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(pts[r + 1][c + 1].x, pts[r + 1][c + 1].y); g.stroke();
              }
            }
          }
          // nuqtalar — faqat chegarada, yuz ustida emas
          for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
              const edge = (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1);
              if (!edge) continue;
              const p = pts[r][c];
              const pulse = 0.5 + 0.5 * Math.sin(now / 300 + (c + r) * 0.6);
              g.fillStyle = `rgba(${base},${0.35 + pulse * 0.4})`;
              g.beginPath();
              g.arc(p.x, p.y, 1.5 + pulse * 0.8, 0, Math.PI * 2);
              g.fill();
            }
          }
          g.restore();
        }

        // 4) landmark chiziqlari — ko'zlar, burun, og'iz + yorliqlar (kompaktda yo'q)
        let eL, eR, nose, mL, mR, chin;
        if (!compact) {
          const eyes = info.eyes;
          if (eyes && eyes.length === 2) {
            eL = { x: mx(eyes[0].x), y: eyes[0].y * sy };
            eR = { x: mx(eyes[1].x), y: eyes[1].y * sy };
            if (eL.x > eR.x) { const t = eL; eL = eR; eR = t; }
          } else {
            eL = { x: cx - fw * 0.17, y: cy - fh * 0.14 };
            eR = { x: cx + fw * 0.17, y: cy - fh * 0.14 };
          }
          nose = { x: cx, y: cy + fh * 0.08 };
          mL = { x: cx - fw * 0.15, y: cy + fh * 0.26 };
          mR = { x: cx + fw * 0.15, y: cy + fh * 0.26 };
          chin = { x: cx, y: cy + fh * 0.40 };

          g.save();
          g.strokeStyle = okColor;
          g.globalAlpha = 0.45 * flick;   // yupqa, yuzni bosmaydi
          g.lineWidth = 1;
          g.shadowBlur = 4;
          g.beginPath();
          g.moveTo(eL.x, eL.y); g.lineTo(nose.x, nose.y); g.lineTo(eR.x, eR.y);
          g.stroke();
          g.beginPath();
          g.moveTo(nose.x, nose.y); g.lineTo(mL.x, mL.y);
          g.moveTo(nose.x, nose.y); g.lineTo(mR.x, mR.y);
          g.moveTo(mL.x, mL.y); g.lineTo(mR.x, mR.y);
          g.stroke();
          // ko'zlar orasidagi o'lchov chizig'i
          g.globalAlpha = 0.3;
          g.setLineDash([3, 4]);
          g.lineDashOffset = -(now / 60) % 7;
          g.beginPath();
          g.moveTo(eL.x, eL.y); g.lineTo(eR.x, eR.y);
          g.stroke();
          g.setLineDash([]);
          g.globalAlpha = 1;
          g.restore();

          // faqat burun/og'iz nuqtalari — ko'zlar alohida (10-bo'lim)
          const mark = (p, r) => {
            g.save();
            g.strokeStyle = okColor;
            g.shadowColor = glow; g.shadowBlur = 6;
            g.lineWidth = 1.3;
            g.globalAlpha = 0.85;
            g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.stroke();
            g.restore();
          };
          mark(nose, 3); mark(mL, 2.5); mark(mR, 2.5);
        }

        // 5) AI burchak ramkasi (gradient + kesilgan burchaklar)
        {
          const grd = g.createLinearGradient(fx, fy, fx + fw, fy + fh);
          grd.addColorStop(0, okColor);
          grd.addColorStop(1, info.parsed ? '#00e5ff' : '#a78bfa');
          g.save();
          g.strokeStyle = grd;
          g.shadowColor = glow; g.shadowBlur = 12;
          g.lineWidth = 2.2;
          const L = Math.min(34, fw * 0.32, fh * 0.32);
          [[fx, fy, 1, 1], [fx + fw, fy, -1, 1], [fx, fy + fh, 1, -1], [fx + fw, fy + fh, -1, -1]]
            .forEach(([px, py, dx, dy]) => {
              g.beginPath();
              g.moveTo(px + dx * L, py + dy * 1.5);
              g.lineTo(px + dx * 1.5, py + dy * 1.5);
              g.lineTo(px + dx * 1.5, py + dy * L);
              g.stroke();
            });
          // ingichka ichki chiziq
          g.globalAlpha = 0.35;
          g.lineWidth = 1;
          g.shadowBlur = 0;
          g.strokeRect(fx + 3.5, fy + 3.5, fw - 7, fh - 7);
          g.restore();
        }

        // 6) o'lchov belgilari (tick marks) — qutiyon chetida (kompaktda yo'q)
        if (!compact) {
          g.save();
          g.strokeStyle = 'rgba(226,232,240,.55)';
          g.lineWidth = 1;
          const step = 14;
          for (let tx = fx + step; tx < fx + fw - 2; tx += step) {
            const tall = ((tx - fx) / step) % 5 < 1;
            g.beginPath();
            g.moveTo(tx, fy);
            g.lineTo(tx, fy + (tall ? 6 : 3));
            g.moveTo(tx, fy + fh);
            g.lineTo(tx, fy + fh - (tall ? 6 : 3));
            g.stroke();
          }
          for (let ty = fy + step; ty < fy + fh - 2; ty += step) {
            const tall = ((ty - fy) / step) % 5 < 1;
            g.beginPath();
            g.moveTo(fx, ty);
            g.lineTo(fx + (tall ? 6 : 3), ty);
            g.moveTo(fx + fw, ty);
            g.lineTo(fx + fw - (tall ? 6 : 3), ty);
            g.stroke();
          }
          // o'lchov yozuvlari
          g.font = '700 9px ui-monospace, Consolas, monospace';
          g.fillStyle = 'rgba(226,232,240,.75)';
          const wLbl = `${Math.round(bw)}px`, hLbl = `${Math.round(bh)}px`;
          g.fillText(wLbl, cx - g.measureText(wLbl).width / 2, fy + fh + 16);
          g.save();
          g.translate(fx - 6, cy);
          g.rotate(-Math.PI / 2);
          g.fillText(hLbl, -g.measureText(hLbl).width / 2, 0);
          g.restore();
          g.restore();
        }

        // 7) skaner progress bar (ramka ostida, segmentli) — kompaktda yo'q
        if (!compact) {
          const prog = info.parsed ? 1 : Math.min(0.96, (info.faceScore || 0) / 100);
          const bh2 = 5, by = fy + fh + 22;
          const segs = 24, sw = fw / segs;
          for (let i = 0; i < segs; i++) {
            const on = (i + 1) / segs <= prog;
            g.fillStyle = on
              ? (info.parsed ? '#00ff88' : '#22d3ee')
              : 'rgba(148,163,184,.22)';
            if (on) { g.shadowColor = glow; g.shadowBlur = 6; }
            g.fillRect(fx + i * sw + 1, by, sw - 2, bh2);
            g.shadowBlur = 0;
          }
        }

        // 8) ichki skaner chizig'i (clip) — xira, yuzni yoshirmaydi
        g.save();
        g.beginPath(); g.rect(fx, fy, fw, fh); g.clip();
        const sp = ((now / 16) % (fh + 60)) - 30;
        const sg = g.createLinearGradient(0, fy + sp - 18, 0, fy + sp + 18);
        sg.addColorStop(0, 'rgba(34,211,238,0)');
        sg.addColorStop(0.5, 'rgba(34,211,238,.14)');
        sg.addColorStop(1, 'rgba(34,211,238,0)');
        g.fillStyle = sg;
        g.fillRect(fx, fy + sp - 18, fw, 36);
        g.fillStyle = 'rgba(0,229,255,.35)';
        g.fillRect(fx, fy + sp, fw, 1);
        g.restore();

        // 9) sarlavha — AI tahlil yozuvi (kompaktda: qisqa, ramka ustida)
        {
          g.save();
          g.font = '700 11px ui-monospace, Consolas, monospace';
          g.fillStyle = okColor;
          g.shadowColor = glow; g.shadowBlur = 8;
          const tag = compact
            ? `${Math.round(info.faceScore || 0)}%`
            : (info.parsed ? 'AI TAHLIL · ANIQLANDI'
              : info.found ? 'AI SKANERLASH...' : 'YUZ QIDIRILMOQDA...');
          g.fillText(tag, fx, fy - 9);
          if (!compact) {
            const pct = `${Math.round(info.faceScore || 0)}%`;
            g.fillStyle = 'rgba(226,232,240,.9)';
            g.shadowBlur = 0;
            g.fillText(pct, fx + fw - g.measureText(pct).width, fy - 9);
          }
          g.restore();
        }

        // 10) ko'z nishonlari — faqat burchak yoylari (ko'zni yopmaydi)
        const drawRet = (px, py, r = 9) => {
          g.save();
          g.strokeStyle = okColor;
          g.globalAlpha = 0.85;
          g.shadowColor = glow; g.shadowBlur = 6;
          g.lineWidth = 1.6;
          [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx2, sy2]) => {
            g.beginPath();
            g.arc(px, py, r, Math.atan2(sy2, sx2) - 0.45, Math.atan2(sy2, sx2) + 0.45);
            g.stroke();
          });
          g.restore();
        };
        if (info.eyes && info.eyes.length === 2) {
          drawRet(mx(info.eyes[0].x), info.eyes[0].y * sy);
          drawRet(mx(info.eyes[1].x), info.eyes[1].y * sy);
        } else if (info.found) {
          drawRet(cx - fw * 0.17, cy - fh * 0.14);
          drawRet(cx + fw * 0.17, cy - fh * 0.14);
        }

        // 11) ma'lumot chiplari (o'ng tomonda, chiziq bilan) — kompaktda yo'q
        if (!compact && (info.parsed || info.found)) {
          const chips = [];
          if (info.pallor != null) chips.push({ c: '#93c5fd', t: `PIGMENT ${info.pallor}` });
          if (info.pulse) chips.push({ c: '#4ade80', t: `PULSE ${info.pulse}` });
          chips.push({ c: '#fcd34d', t: `EXP ${Math.round(info.exposure || 0)}` });
          const cxx = fx + fw + 10;
          g.save();
          g.font = '700 9px ui-monospace, Consolas, monospace';
          chips.forEach((ch2, i) => {
            const cyy = fy + 12 + i * 17;
            const tw = g.measureText(ch2.t).width;
            // ulash chizig'i
            g.strokeStyle = ch2.c;
            g.globalAlpha = 0.7;
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(fx + fw, cyy - 3);
            g.lineTo(cxx - 3, cyy - 3);
            g.stroke();
            g.globalAlpha = 1;
            g.fillStyle = 'rgba(2,6,23,.8)';
            g.fillRect(cxx, cyy - 11, tw + 10, 15);
            g.strokeStyle = ch2.c;
            g.strokeRect(cxx + 0.5, cyy - 10.5, tw + 9, 14);
            g.fillStyle = ch2.c;
            g.fillText(ch2.t, cxx + 5, cyy);
          });
          g.restore();
        }
      }

      // tahlil paneli — AI yon ko'rinishi (kompaktda: pastda bitta qator)
      if (!compact) {
        const lines = [
          { c: acc, t: `◈ ${info.status.toUpperCase()}` },
          { c: '#e2e8f0', t: `yuz ${info.faceScore}% · sifat ${info.quality}%` },
          ...(info.parsed ? [{ c: '#00e5ff', t: '▣ landmark · 68 nuqta' }] : []),
          ...(info.pulse ? [{ c: '#4ade80', t: `♥ ${info.pulse} bpm · rPPG` }] : []),
          ...(info.pallor != null ? [{ c: '#93c5fd', t: `◐ pigment ${info.pallor}/100` }] : []),
          ...(info.exposure != null ? [{ c: '#fcd34d', t: `☀ yorug'lik ${info.exposure}` }] : [])
        ];
        const pw = 210;
        let ph2 = 26 + lines.length * 15 + 8;
        ph2 = Math.max(ph2, 54);
        g.save();
        // panel fon — AI terminal
        g.fillStyle = 'rgba(2,6,23,.82)';
        g.fillRect(8, 8, pw, ph2);
        // sarlavha chizig'i
        g.fillStyle = acc;
        g.shadowColor = acc; g.shadowBlur = 8;
        g.fillRect(8, 8, pw, 3);
        g.shadowBlur = 0;
        g.strokeStyle = 'rgba(34,211,238,.35)';
        g.lineWidth = 1;
        g.strokeRect(8.5, 11.5, pw - 1, ph2 - 4);

        g.font = '700 11px ui-monospace, Consolas, monospace';
        g.fillStyle = acc;
        g.shadowColor = acc; g.shadowBlur = 6;
        g.fillText('◈ AI TAHLIL · NEURO-V2', 16, 26);
        g.shadowBlur = 0;

        g.font = '600 11px ui-monospace, Consolas, monospace';
        lines.forEach((l, i) => {
          g.fillStyle = l.c;
          g.fillText(l.t, 16, 42 + i * 15);
        });

        // pastki: sifat progress chizig'i
        const by = ph2 + 2;
        g.fillStyle = 'rgba(148,163,184,.25)';
        g.fillRect(8, by, pw, 3);
        g.fillStyle = acc;
        g.shadowColor = acc; g.shadowBlur = 6;
        g.fillRect(8, by, pw * Math.min(1, (info.quality || 0) / 100), 3);
        g.restore();
      } else {
        // KOMPAKT: kadr pastki chetida bitta qator — yuzni yopmaydi
        const line = [
          info.status.toUpperCase(),
          `${info.faceScore}%`,
          `sifat ${info.quality}%`,
          ...(info.pulse ? [`${info.pulse}bpm`] : []),
          ...(info.pallor != null ? [`pigment ${info.pallor}`] : [])
        ].join(' · ');
        g.save();
        g.font = '600 10.5px ui-monospace, Consolas, monospace';
        const tw = g.measureText(line).width;
        const px0 = Math.max(4, (w - tw) / 2 - 7);
        const py0 = h - 22;
        g.fillStyle = 'rgba(2,6,23,.78)';
        g.fillRect(px0, py0, tw + 14, 17);
        g.fillStyle = acc;
        g.shadowColor = glow; g.shadowBlur = 6;
        g.fillText(line, px0 + 7, py0 + 12);
        g.restore();
      }
    }

    _clearOverlay() {
      const c = this.overlay;
      if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
    }
  }

  /* ================ Rasm rejimi (fayl yuklash) — xuddi shu pipeline ====== */
  async function analyseImage(file) {
    const bmp = await createImageBitmap(file);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    // kadrni markazga kesib olish (square crop) — yuz kadr markazida bo'ladi
    const side = Math.min(bmp.width, bmp.height);
    const sx0 = (bmp.width - side) / 2, sy0 = (bmp.height - side) / 2;
    ctx.drawImage(bmp, sx0, sy0, side, side, 0, 0, W, H);
    const px = ctx.getImageData(0, 0, W, H).data;

    const gray = new Uint8Array(N);
    for (let i = 0, p = 0; i < N; i++, p += 4) {
      gray[i] = (px[p] * 299 + px[p + 1] * 587 + px[p + 2] * 114) >> 10;
    }
    const mask = openMask(buildSkinMask(px));
    const face = pickFace(components(mask), mask, gray);
    if (!face) return { parsed: false, found: false, presence: 0, pallor: null, status: 'yuz aniqlanmadi' };

    // Face ID uchun alohida katta kadr (model uchun yetarli sifat)
    const cf = document.createElement('canvas');
    cf.width = 320; cf.height = 320;
    cf.getContext('2d').drawImage(bmp, sx0, sy0, side, side, 0, 0, 320, 320);
    const idRes = window.FaceID ? await window.FaceID.compute(cf) : null;
    const descriptor = idRes ? idRes.descriptor : null;
    if (bmp.close) bmp.close();

    const q = regionQuality(gray, face);
    let rSum = 0, gSum = 0, bSum = 0, skin = 0;
    for (let y = face.y0; y <= face.y1; y++) {
      for (let x = face.x0; x <= face.x1; x++) {
        const i = y * W + x;
        if (!mask[i]) continue;
        const yv = gray[i];
        if (yv < q.exposure * 0.78 || yv > 250) continue;
        skin++;
        rSum += px[i * 4]; gSum += px[i * 4 + 1]; bSum += px[i * 4 + 2];
      }
    }
    if (skin < 60) return { parsed: false, found: true, presence: 0, pallor: null, status: 'teri maydoni kam' };

    const R = rSum / skin, G = gSum / skin, B = bSum / skin;
    const redness = (R - (G + B) / 2) / 255;
    const lum = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
    const pallor = clamp(((redness / Math.max(0.35, lum) - 0.06) / 0.56) * 100, 0, 100);
    const presence = clamp(face.score * 115, 0, 100);

    return {
      parsed: true,
      found: true,
      status: 'rasm tahlil qilindi',
      face: { x: face.x0, y: face.y0, w: face.bw, h: face.bh },
      faceScore: round(face.score * 100),
      descriptor,
      pallor: round(pallor),
      presence: round(presence),
      pulse: null,
      stability: 100,
      contrast: round(q.contrast),
      exposure: round(q.exposure),
      quality: round(clamp(presence * 0.5 + 25 + (q.contrast > 8 ? 15 : 0) + (q.exposure > 55 && q.exposure < 240 ? 10 : 0), 0, 100))
    };
  }

  return { VisionEngine, analyseImage, PPG_MIN_S };
})();
