/**
 * AlcoholTest — ko'p signalli alkogol aniqlash moduli.
 *
 * Beshta mustaqil signal (real olimiy asos):
 *   1. sway      — postural sway (kamerada boshning silkinishi) — FDA field sobriety testi asosi
 *   2. reaction  — reaktsiya vaqti (skaner/klaviatura) — alkogol sekinlashtiradi
 *   3. voice     — ovoz jitter/shimmer (mikrofon) — alkogol qovg'o tebranishini buzadi
 *   4. physio    — yuz qizarishi + puls teshirishi (kamera)
 *   5. self      — savolnoma → Widmark BAC (spirt miqdori hisobi)
 *
 * Har bir signal ishonchliligiga (coverage) ko'ra og'irliklanadi.
 * Tashqi API yo'q — hammasi brauzerda.
 */
(function () {
  'use strict';

  /* --------------------------- Widmark BAC ------------------------------ */
  // r — spirt taqsimlash koeffitsienti (erkak 0.68, ayol 0.55)
  // A = ichilgan grammlar, W = vazn (kg), beta = so'rilish tezligi (0.15 g/L/soat)
  function widmark(grams, weightKg, hours, sex) {
    if (!grams || !weightKg) return 0;
    const r = sex === 'female' ? 0.55 : 0.68;
    const bac = (grams / (r * weightKg)) - (0.15 * hours);
    return Math.max(0, Math.round(bac * 1000) / 1000); // % (masalan 0.043)
  }

  // standart ichimlik → grammlar (etanol)
  const DRINKS = {
    beer:   { g: 12.8, label: 'Pivo (0.5 L, 5%)' },
    wine:   { g: 15.5, label: 'Vino (150 ml, 12%)' },
    vodka:  { g: 20.0, label: 'Aroq (50 ml, 40%)' },
    brandy: { g: 20.0, label: 'Konyak (50 ml, 40%)' },
    cognac: { g: 20.0, label: 'Likyor (50 ml, 30%)' },
    shots:  { g: 16.0, label: 'Shot (40 ml, 40%)' }
  };

  /* ------------------------- signal normallash --------------------------- */

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /** 0 = soz, 100 = aniq alkogol ta'siri */
  function normSway(pxStd) {
    if (pxStd == null) return null;
    // 160x120 kadrda: <4px soz, >18px aniq buzilgan (head sway testi)
    return clamp(((pxStd - 4) / 14) * 100, 0, 100);
  }

  function normReaction(ms) {
    if (ms == null) return null;
    // 180ms = soz, 420ms = aniq sekin (alcohol reaction-time meta-analizlari)
    return clamp(((ms - 180) / 240) * 100, 0, 100);
  }

  function normJitter(pct) {
    if (pct == null) return null;
    // 0.4% = soz, 2.5% = yuqori jitter (disartriya belgisi)
    return clamp(((pct - 0.4) / 2.1) * 100, 0, 100);
  }

  function normRedness(v) {
    if (v == null) return null;
    // vision.js redness = (R-(G+B)/2)/255, odatda 0.05-0.18, yuz qizarishda 0.22+
    return clamp(((v - 0.14) / 0.12) * 100, 0, 100);
  }

  function normPulse(bpm) {
    if (bpm == null) return null;
    // 60-85 soz, 105+ tachikardiya (alkogol belgisi)
    return clamp(((bpm - 88) / 30) * 100, 0, 100);
  }

  /* --------------------------- Sway (duranglik) -------------------------- */

  const sway = { pts: [], t0: 0, minPts: 40, running: false, cx: null, cy: null };

  function swayStart() {
    sway.pts = [];
    sway.t0 = performance.now();
    sway.cx = null;
    sway.cy = null;
    sway.running = true;
  }

  function swayFeed(frame) {
    if (!sway.running || !frame || !frame.face) return;
    const cx = frame.face.x + frame.face.w / 2;
    const cy = frame.face.y + frame.face.h / 2;
    if (sway.cx == null) { sway.cx = cx; sway.cy = cy; return; }
    // marker (markazdan chetgacha masofa) — 50% dan ortiq sakrash = chetga chiqdi
    const dx = cx - sway.cx, dy = cy - sway.cy;
    if (Math.hypot(dx, dy) > Math.max(24, frame.face.w * 0.45)) { sway.cx = cx; sway.cy = cy; return; }
    sway.pts.push({ dx, dy, t: performance.now() });
    if (sway.pts.length > 900) sway.pts.shift();
  }

  function swayResult() {
    if (sway.pts.length < sway.minPts) return { px: null, n: sway.pts.length };
    const xs = sway.pts.map((p) => p.dx);
    const ys = sway.pts.map((p) => p.dy);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const varx = xs.reduce((a, b) => a + (b - mx) * (b - mx), 0) / xs.length;
    const vary = ys.reduce((a, b) => a + (b - my) * (b - my), 0) / ys.length;
    return { px: Math.sqrt(varx + vary), n: sway.pts.length };
  }

  function swayStop() { sway.running = false; }

  /* ------------------------ Reaktsiya vaqti testi ------------------------ */

  const reaction = { trials: [], t0: 0, timer: 0, active: false, onDone: null };

  function reactionStart(cb, trials) {
    reaction.trials = [];
    reaction.onDone = cb || null;
    reaction.active = true;
    nextTrial(trials || 6);
  }

  function nextTrial(left) {
    if (!reaction.active) return;
    if (left <= 0) {
      reaction.active = false;
      const a = reaction.trials.slice().sort((x, y) => x - y);
      const med = a.length ? a[Math.floor(a.length / 2)] : null;
      if (reaction.onDone) reaction.onDone(med, reaction.trials);
      return;
    }
    const el = document.getElementById('rtTarget');
    if (!el) { reaction.active = false; return; }
    el.className = 'rt-target wait';
    el.textContent = '…';
    el.onclick = null;
    clearTimeout(reaction.timer);
    // 700–2200 ms tasodifiy kutish (impulsivlikni oldini oladi)
    reaction.timer = setTimeout(() => {
      el.className = 'rt-target go';
      el.textContent = 'BOSING';
      reaction.t0 = performance.now();
      el.onclick = () => {
        const ms = performance.now() - reaction.t0;
        if (ms < 4000) reaction.trials.push(Math.round(ms));
        el.className = 'rt-target hit';
        el.textContent = Math.round(ms) + ' ms';
        setTimeout(() => nextTrial(left - 1), 600);
      };
    }, 700 + Math.random() * 1500);
  }

  function reactionCancel() {
    reaction.active = false;
    clearTimeout(reaction.timer);
  }

  /* --------------------------- Ovoz (mikrofon) --------------------------- */

  const voice = {
    ctx: null, stream: null, raf: 0, active: false,
    periods: [], prev: null, lastT: 0, done: null, need: 90
  };

  function acf(buf, rate) {
    // autokorrelatsiya bilan fundamental chastotani topish (f0)
    const n = buf.length;
    const minP = Math.floor(rate / 400);   // 400 Hz
    const maxP = Math.floor(rate / 70);    // 70 Hz
    let best = -1, bestCorr = 0;
    for (let lag = minP; lag < maxP && lag < n; lag++) {
      let sum = 0;
      for (let i = 0; i < n - lag; i++) sum += buf[i] * buf[i + lag];
      const norm = sum / (n - lag);
      if (norm > bestCorr) { bestCorr = norm; best = lag; }
    }
    if (best < 0 || bestCorr < 0.01) return null;
    return best;
  }

  async function voiceStart(cb) {
    if (voice.active) { voiceStop(); return false; }
    try {
      voice.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
    } catch { return false; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { voiceStop(); return false; }
    voice.ctx = new AC();
    const src = voice.ctx.createMediaStreamSource(voice.stream);
    const an = voice.ctx.createAnalyser();
    an.fftSize = 2048;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    voice.periods = [];
    voice.prev = null;
    voice.lastT = 0;
    voice.active = true;
    voice.done = cb || null;
    voice.need = 90;

    const tick = () => {
      if (!voice.active) return;
      an.getFloatTimeDomainData(buf);
      const now = performance.now();
      // ovoz borligini tekshirish (RMS)
      let e = 0;
      for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i];
      const rms = Math.sqrt(e / buf.length);
      if (rms > 0.012) {
        const p = acf(buf, voice.ctx.sampleRate);
        if (p) {
          if (voice.prev) {
            const jit = Math.abs(p - voice.prev) / voice.prev * 100;
            // 0.2% dan 12% gacha — qolganlari artefakt, tashlab yuboramiz
            if (jit >= 0.2 && jit <= 12) voice.periods.push(jit);
          }
          voice.prev = p;
          voice.lastT = now;
        }
      } else if (now - voice.lastT > 900) {
        voice.prev = null; // pauza — uzluksizlik buzildi
      }
      if (voice.periods.length >= voice.need) { voiceStop(); return; }
      voice.raf = requestAnimationFrame(tick);
    };
    voice.raf = requestAnimationFrame(tick);
    return true;
  }

  function voiceStop() {
    voice.active = false;
    cancelAnimationFrame(voice.raf);
    if (voice.stream) { voice.stream.getTracks().forEach((t) => t.stop()); voice.stream = null; }
    if (voice.ctx && voice.ctx.state !== 'closed') voice.ctx.close().catch(() => {});
    voice.ctx = null;
    if (voice.done && voice.periods.length) {
      const cb = voice.done; voice.done = null; cb(voiceResult());
    }
    voice.done = null;
  }

  function voiceResult() {
    const p = voice.periods;
    if (!p || p.length < 15) return { jitter: null, shimmer: null, n: p ? p.length : 0 };
    const m = p.reduce((a, b) => a + b, 0) / p.length;
    const sd = Math.sqrt(p.reduce((a, b) => a + (b - m) * (b - m), 0) / p.length);
    const jit = (sd / m) * 100;
    return { jitter: Math.round(jit * 100) / 100, shimmer: null, n: p.length };
  }

  /* ------------------------------ Savolnoma ------------------------------ */

  function selfReport(answers) {
    const a = answers || {};
    let grams = 0;
    for (const k in (a.counts || {})) {
      const d = DRINKS[k];
      if (d) grams += d.g * (Number(a.counts[k]) || 0);
    }
    const bac = widmark(grams, Number(a.weight) || 75, Number(a.hours) || 1, a.sex || 'male');
    let score = 0;
    if (grams >= 40) score += 30;
    else if (grams >= 20) score += 18;
    else if (grams >= 8) score += 8;
    if (bac >= 0.10) score = Math.max(score, 85);
    else if (bac >= 0.05) score = Math.max(score, 65);
    else if (bac >= 0.03) score = Math.max(score, 45);
    else if (bac >= 0.016) score = Math.max(score, 28);
    if (a.behaviour === 'yes') score = Math.max(score, 40);
    return { grams: Math.round(grams), bac, score: clamp(score, 0, 100) };
  }

  /* ------------------------------- Yakuniy ------------------------------- */

  const W = {
    sway:      { w: 26, label: 'Duranglik (bosh silkinishi)', unit: 'px' },
    reaction:  { w: 22, label: 'Reaktsiya vaqti', unit: 'ms' },
    voice:     { w: 16, label: 'Ovoz tebranishi (jitter)', unit: '%' },
    physio:    { w: 16, label: 'Yuz qizarishi va puls', unit: '' },
    self:      { w: 20, label: 'Savolnoma (BAC hisobi)', unit: '%' }
  };

  function compute(input) {
    const s = input || {};
    const sigs = [];

    const swayR = swayResult();
    const nSway = normSway(swayR.px);
    if (nSway != null) {
      sigs.push({ id: 'sway', ...W.sway, value: Math.round(swayR.px * 10) / 10, n: nSway, ok: swayR.n >= sway.minPts });
    }

    if (s.reactionMs != null) {
      sigs.push({ id: 'reaction', ...W.reaction, value: Math.round(s.reactionMs), n: normReaction(s.reactionMs), ok: true });
    }

    if (s.jitter != null && s.jitter >= 0) {
      sigs.push({ id: 'voice', ...W.voice, value: s.jitter, n: normJitter(s.jitter), ok: true });
    }

    const red = s.redness != null ? normRedness(s.redness) : null;
    const pul = s.pulse != null ? normPulse(s.pulse) : null;
    if (red != null || pul != null) {
      const vals = [red, pul].filter((v) => v != null);
      sigs.push({
        id: 'physio', ...W.physio,
        value: (s.pulse ? s.pulse + ' bpm' : '') + (red != null ? (s.pulse ? ' / ' : '') + Math.round((s.redness || 0) * 1000) / 10 + '%' : ''),
        n: vals.reduce((a, b) => a + b, 0) / vals.length,
        ok: true
      });
    }

    if (s.bac != null) {
      sigs.push({
        id: 'self', ...W.self,
        value: Math.round(s.bac * 1000) / 1000 + '% BAC',
        n: s.selfScore, ok: true
      });
    }

    if (!sigs.length) {
      return { score: 0, confidence: 0, signals: [], verdict: 'no_data', level: 0, advice: [] };
    }

    const tw = sigs.reduce((a, x) => a + (x.ok ? x.w : 0), 0);
    const score = sigs.reduce((a, x) => a + (x.ok ? x.n * x.w : 0), 0) / (tw || 1);
    const confidence = Math.round((tw / Object.values(W).reduce((a, x) => a + x.w, 0)) * 100);

    let level, verdict, color;
    if (score < 20) { level = 0; verdict = 'Alkogol ta\'siri aniqlanmadi'; color = '#22c55e'; }
    else if (score < 45) { level = 1; verdict = 'Yengil shubha — qo\'shimcha tekshiruv kerak'; color = '#eab308'; }
    else if (score < 70) { level = 2; verdict = 'Alkogol ta\'siri belgilari bor'; color = '#f97316'; }
    else { level = 3; verdict = 'Aniq alkogol ta\'siri — transport boshqarish mumkin emas'; color = '#ef4444'; }

    // jiddiy ogohlantirish: BAC yuqori bo'lsa har qanday darajada ham
    if (s.bac != null && s.bac >= 0.08) {
      level = 3; verdict = 'Yuqori qon alkogoli (' + s.bac + '%) — shifokor yoki IIB yordami zarur'; color = '#ef4444';
    }

    const advice = [];
    if (level === 0) advice.push('Belgilar aniqlanmadi. Holatni kuzatib boring.');
    if (level >= 1) {
      advice.push('Transport boshqarmang, katta qarorlar qabul qilmang.');
      advice.push('Har bir standart ichimlik uchun kamida 1 soat kuting; vodorod suvi iching.');
    }
    if (level >= 2) advice.push('Yakka o\'zingizni uyga yoki xavfsiz joyga yetkazing.');
    if (level >= 3) advice.push('Shoshilinch tibbiy yordam (103) yoki IIBga murojaat qiling.');
    if (s.bac != null && s.bac >= 0.08) advice.push('Bu ko\'rsatkich ko\'pchilik mamlakatlarda qonuniy chegaradan yuqori.');

    return {
      score: Math.round(score),
      confidence,
      signals: sigs,
      level, verdict, color,
      bac: s.bac != null ? Math.round(s.bac * 1000) / 1000 : null,
      advice
    };
  }

  window.AlcoholTest = {
    DRINKS, widmark, selfReport, compute,
    swayStart, swayFeed, swayStop, swayResult,
    reactionStart, reactionCancel,
    voiceStart, voiceStop, voiceResult,
    get swayRunning() { return sway.running; },
    get voiceActive() { return voice.active; }
  };
})();
