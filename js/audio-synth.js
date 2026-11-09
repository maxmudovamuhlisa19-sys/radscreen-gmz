'use strict';

/**
 * RadAudio — Zero-dependency Web Audio API Tovush Sintezatori
 *
 * Imkoniyatlar:
 *  1. Geiger-Müller hisoblagichining xos "chertish" (clicks) tovushlari:
 *     - Doza oshishi bilan chertishlar chastotasi Poisson taqsimoti bo'yicha tezlashadi.
 *  2. Favqulodda ogohlantirish sirenalari va signallari (Watch / High / Critical).
 *  3. Biometrik puls (yurak urishi) tovushi (rPPG).
 *  4. UI tovush effektlari (tugma bosilishi, tahlil yakunlanishi).
 *  5. Global ovoz yoqish/o'chirish (mute) va sozlash.
 */
window.RadAudio = (() => {
  const STORAGE_KEY = 'radscreen_audio_enabled';
  let enabled = localStorage.getItem(STORAGE_KEY) !== 'false'; // default ON
  let ctx = null;
  let geigerTimer = null;
  let alarmTimer = null;
  let currentRate = 0.16;
  let alarmActive = false;

  function getContext() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        ctx = new AC();
      }
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  // Sahifadagi ilk foydalanuvchi harakatida AudioContext'ni faollashtirish
  function unlockAudio() {
    const c = getContext();
    if (c && c.state === 'suspended') {
      c.resume().catch(() => {});
    }
  }
  ['click', 'touchstart', 'keydown'].forEach((ev) => {
    window.addEventListener(ev, unlockAudio, { once: true, passive: true });
  });

  /**
   * Bitta Geiger chertishini sintez qilish (Web Audio API)
   * Qisqa (2-4ms) oq shovqin + rezonansli polosali filtr (2200-2800 Hz)
   */
  function playGeigerClick() {
    if (!enabled) return;
    const c = getContext();
    if (!c || c.state !== 'running') return;

    try {
      const bufferSize = Math.floor(c.sampleRate * 0.0035); // ~3.5 ms
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        // Eksponentsial so'nuvchi oq shovqin
        const decay = Math.exp(-i / (bufferSize * 0.35));
        data[i] = (Math.random() * 2 - 1) * decay;
      }

      const source = c.createBufferSource();
      source.buffer = buffer;

      // Yuqori rezonansli polosali filtr (Geiger trubkasi metall rezonansi)
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2400 + (Math.random() - 0.5) * 400, c.currentTime);
      filter.Q.setValueAtTime(7.5, c.currentTime);

      const gain = c.createGain();
      gain.gain.setValueAtTime(0.35, c.currentTime);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(c.destination);

      source.start();
    } catch {
      // Audio xatolari ilovani to'xtatmasligi kerak
    }
  }

  /**
   * Geiger chertishlarini doza tezligiga mutanosib ravishda rejalashtirish
   * (Poisson taqsimotiga yaqin tasodifiy intervallar)
   */
  function scheduleNextGeiger() {
    if (geigerTimer) {
      clearTimeout(geigerTimer);
      geigerTimer = null;
    }
    if (!enabled) return;

    // Doza tezligiga bog'liq o'rtacha kutish vaqti (ms)
    // 0.16 µSv/h -> ~2000 ms kutish (kamdan-kam chertish)
    // 1.0 µSv/h  -> ~350 ms kutish
    // 5.0 µSv/h  -> ~80 ms kutish
    // 20.0 µSv/h -> ~15 ms kutish (uzluksiz chertish)
    const rate = Math.max(0.05, currentRate);
    let avgIntervalMs;
    if (rate <= 0.3) {
      avgIntervalMs = 2800 / (rate / 0.16);
    } else if (rate <= 1.5) {
      avgIntervalMs = 500 / (rate / 0.6);
    } else if (rate <= 10.0) {
      avgIntervalMs = 120 / (rate / 3.0);
    } else {
      avgIntervalMs = Math.max(12, 40 / (rate / 10.0));
    }

    // Eksponentsial tasodifiy interval (Poisson process)
    const interval = -Math.log(1 - Math.random()) * avgIntervalMs;
    const clampedInterval = Math.max(8, Math.min(8000, interval));

    geigerTimer = setTimeout(() => {
      playGeigerClick();
      scheduleNextGeiger();
    }, clampedInterval);
  }

  /**
   * Doza tezligi yangilanganda chaqiriladi
   */
  function updateRate(rate) {
    currentRate = Number(rate) || 0.16;
    if (enabled && !geigerTimer) {
      scheduleNextGeiger();
    }

    // Agar favqulodda xavfli bo'lsa (> 5.0 µSv/h) signalizatsiyani ishga tushirish
    if (currentRate >= 5.0) {
      startAlarm('critical');
    } else if (currentRate >= 1.2) {
      startAlarm('warning');
    } else {
      stopAlarm();
    }
  }

  /**
   * Ogohlantiruvchi signalizatsiya tovushi
   */
  function startAlarm(level = 'warning') {
    if (alarmActive || !enabled) return;
    alarmActive = true;

    function beep() {
      if (!alarmActive || !enabled) return;
      const c = getContext();
      if (!c || c.state !== 'running') return;

      try {
        const osc = c.createOscillator();
        const gain = c.createGain();
        const now = c.currentTime;

        const freq = level === 'critical' ? 960 : 720;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.7, now + 0.22);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc.connect(gain);
        gain.connect(c.destination);

        osc.start(now);
        osc.stop(now + 0.24);
      } catch {}

      const repeatInterval = level === 'critical' ? 550 : 1200;
      alarmTimer = setTimeout(beep, repeatInterval);
    }

    beep();
  }

  function stopAlarm() {
    alarmActive = false;
    if (alarmTimer) {
      clearTimeout(alarmTimer);
      alarmTimer = null;
    }
  }

  /**
   * Biometrik puls ovozi (rPPG yurak zarbasi)
   */
  function playHeartbeat() {
    if (!enabled) return;
    const c = getContext();
    if (!c || c.state !== 'running') return;

    try {
      const osc = c.createOscillator();
      const gain = c.createGain();
      const now = c.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(75, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.12);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(c.destination);

      osc.start(now);
      osc.stop(now + 0.14);
    } catch {}
  }

  /**
   * UI tovushi — tugma bosilishi (futuristik qisqa chertish)
   */
  function playUiClick() {
    if (!enabled) return;
    const c = getContext();
    if (!c || c.state !== 'running') return;

    try {
      const osc = c.createOscillator();
      const gain = c.createGain();
      const now = c.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.03);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      osc.connect(gain);
      gain.connect(c.destination);

      osc.start(now);
      osc.stop(now + 0.035);
    } catch {}
  }

  /**
   * UI tovushi — muvaffaqiyatli tahlil yakuni
   */
  function playSuccessChime() {
    if (!enabled) return;
    const c = getContext();
    if (!c || c.state !== 'running') return;

    try {
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 - E5 - G5 - C6 arpeggio
      notes.forEach((freq, idx) => {
        const osc = c.createOscillator();
        const gain = c.createGain();
        const now = c.currentTime + idx * 0.08;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(c.destination);

        osc.start(now);
        osc.stop(now + 0.36);
      });
    } catch {}
  }

  /**
   * Ovozni yoqish / o'chirish (Toggle mute)
   */
  function toggle() {
    enabled = !enabled;
    localStorage.setItem(STORAGE_KEY, String(enabled));
    if (enabled) {
      getContext();
      scheduleNextGeiger();
      playUiClick();
    } else {
      if (geigerTimer) {
        clearTimeout(geigerTimer);
        geigerTimer = null;
      }
      stopAlarm();
    }
    return enabled;
  }

  function setEnabled(val) {
    if (enabled === val) return;
    enabled = !!val;
    localStorage.setItem(STORAGE_KEY, String(enabled));
    if (enabled) {
      getContext();
      scheduleNextGeiger();
    } else {
      if (geigerTimer) {
        clearTimeout(geigerTimer);
        geigerTimer = null;
      }
      stopAlarm();
    }
  }

  // Dastlabki rejalashtirish
  if (enabled) {
    setTimeout(() => scheduleNextGeiger(), 1500);
  }

  return {
    get isEnabled() { return enabled; },
    toggle,
    setEnabled,
    updateRate,
    playGeigerClick,
    playHeartbeat,
    playUiClick,
    playSuccessChime,
    startAlarm,
    stopAlarm
  };
})();
