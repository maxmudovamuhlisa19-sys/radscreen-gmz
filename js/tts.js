/**
 * RemoteTTS — serverdagi Edge neural ovoz bilan ketma-ket gapirish.
 * API:
 *   await RemoteTTS.speak(text, lang, {voice, onstart, onend})  -> true/false
 *   RemoteTTS.stop()
 *   RemoteTTS.probe(lang)  -> server TTS ishlayaptimi
 *   RemoteTTS.playing
 * TTS bo'lmasa false qaytaradi (fallback: Web Speech API).
 */
(function () {
  'use strict';

  const URL_MAX = 600;      // server chegarasi bilan mos
  const GAP_MS = 260;       // gaplar orasidagi pauza
  const blobCache = new Map();
  const BLOB_MAX = 60;

  let seq = 0;              // navbat tokeni (stop uchun)
  let audio = null;         // joriy <audio>
  let playing = false;

  /* ------------------------------- yordamchilar -------------------------- */

  /* Raqamlarni so'zga aylantirish — TTS "0" ni noto'g'ri o'qiydi (0 -> "oh").
     Shuning uchun matndagi sonlar tilga so'z qilib chiqariladi. */
  const UZ = {
    one: ['nol', 'bir', 'ikki', 'uch', 'to\'rt', 'besh', 'olti', 'yetti', 'sakkiz', 'to\'qqiz'],
    teen: ['o\'n', 'yigirma', 'o\'ttiz', 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', 'to\'qqison']
  };
  const RU = {
    one: ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'],
    teen: ['десять', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'],
    hundred: ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'],
    oneF: ['ноль', 'одна', 'две']
  };

  function uzInt(n, fem) {
    n = Math.floor(Math.abs(n));
    if (n < 10) return UZ.one[n];
    if (n < 100) {
      const t = Math.floor(n / 10), o = n % 10;
      return UZ.teen[t - 1] + (o ? ' ' + UZ.one[o] : '');
    }
    if (n < 1000) {
      const h = Math.floor(n / 100), r = n % 100;
      return UZ.one[h] + ' yuz' + (r ? ' ' + uzInt(r) : '');
    }
    if (n < 1000000) {
      const t = Math.floor(n / 1000), r = n % 1000;
      return uzInt(t) + ' ming' + (r ? ' ' + uzInt(r) : '');
    }
    return String(n);
  }

  function ruInt(n, fem) {
    n = Math.floor(Math.abs(n));
    if (n < 10) return fem ? (RU.oneF[n] || RU.one[n]) : RU.one[n];
    if (n < 100) {
      const t = Math.floor(n / 10), o = n % 10;
      return RU.teen[t - 1] + (o ? ' ' + (fem && o === 1 ? 'один' : fem && o === 2 ? 'две' : RU.one[o]) : '');
    }
    if (n < 1000) {
      const h = Math.floor(n / 100), r = n % 100;
      return RU.hundred[h] + (r ? ' ' + ruInt(r, fem) : '');
    }
    if (n < 1000000) {
      const t = Math.floor(n / 1000), r = n % 1000;
      const th = RU.one[t] ? (fem ? 'тысяча' : 'тысяча') : 'тысяча';
      let stem;
      if (t === 1) stem = 'одна тысяча';
      else if (t === 2) stem = 'две тысячи';
      else if (t >= 5) stem = ruInt(t) + ' тысяч';
      else stem = ruInt(t) + ' тысячи';
      return stem + (r ? ' ' + ruInt(r, fem) : '');
    }
    return String(n);
  }

  /** Matndagi sonlarni so'zga aylantiradi (lang: uz | ru) */
  function spellNumbers(text, lang) {
    const fem = lang === 'ru';
    return String(text || '').replace(/-?\d+(?:[.,]\d+)?/g, (m) => {
      const sep = m.indexOf(',') >= 0 && m.indexOf('.') < 0 ? ',' : '.';
      const parts = m.split(sep === ',' ? ',' : '.');
      const head = parseInt(parts[0], 10);
      if (isNaN(head)) return m;
      const words = (lang === 'ru' ? ruInt : uzInt)(head, fem && Math.abs(head) === 1);
      if (parts.length < 2) return words;
      const dec = parts[1].slice(0, 4);
      const decWords = dec.split('').map((d) => {
        const i = parseInt(d, 10);
        return (lang === 'ru' ? RU.one[i] : UZ.one[i]) || d;
      }).join(' ');
      return words + (lang === 'ru' ? ' целых ' : ' nuqta ') + decWords;
    });
  }

  function chunk(text, max) {
    const t = String(text || '').trim();
    if (!t) return [];
    if (t.length <= max) return [t];
    // gaplarga bo'lamiz, uzun gaplarni qisqartiramiz
    const parts = t.split(/(?<=[.!?…])\s+/);
    const out = [];
    let cur = '';
    for (const p of parts) {
      const piece = p.length > max ? p.slice(0, max - 1) + '…' : p;
      if ((cur + ' ' + piece).trim().length > max) {
        if (cur) out.push(cur.trim());
        cur = piece;
      } else {
        cur = (cur + ' ' + piece).trim();
      }
    }
    if (cur) out.push(cur.trim());
    return out;
  }

  function toUrl(text, lang) {
    return '/api/tts?lang=' + encodeURIComponent(lang || 'uz') +
      '&text=' + encodeURIComponent(text);
  }

  async function loadBlob(url) {
    if (blobCache.has(url)) return blobCache.get(url);
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) throw new Error('TTS ' + res.status);
    const blob = await res.blob();
    if (!blob || blob.size < 200) throw new Error('TTS bo\'sh audio');
    if (blobCache.size >= BLOB_MAX) {
      const first = blobCache.keys().next().value;
      blobCache.delete(first);
    }
    blobCache.set(url, blob);
    return blob;
  }

  function playBlob(blob, my, cb) {
    const a = new Audio(URL.createObjectURL(blob));
    audio = a;
    a.volume = 1;
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try { URL.revokeObjectURL(a.src); } catch { /* olam */ }
      if (audio === a) audio = null;
      cb(ok);
    };
    a.onended = () => finish(true);
    a.onerror = () => finish(false);
    a.oncanplaythrough = () => { if (my !== seq) finish(false); };
    a.play().catch(() => finish(false));
    // token bekor qilinsa — to'xtatamiz
    const iv = setInterval(() => {
      if (my !== seq) { clearInterval(iv); try { a.pause(); } catch { /* olam */ } finish(false); }
    }, 200);
  }

  const wait = (ms, my) => new Promise((r) => {
    const t = setTimeout(r, ms);
    // token o'zgarsa erta uyg'onamiz
    const iv = setInterval(() => { if (my !== seq) { clearTimeout(t); clearInterval(iv); r(); } }, 120);
    setTimeout(() => clearInterval(iv), ms + 200);
  });

  /* --------------------------------- asosiy ------------------------------ */

  /**
   * Matnni ovozda aytadi (server Edge ovozi).
   * @returns {Promise<boolean>} true = server TTS ishladi
   */
  async function speak(text, lang, opt) {
    opt = opt || {};
    const my = ++seq;
    const parts = chunk(spellNumbers(text, lang === 'ru' ? 'ru' : 'uz'), URL_MAX);
    if (!parts.length) return false;

    // birinchi bo'lib server TTS ni sinab ko'ramiz
    let blob;
    try {
      blob = await loadBlob(toUrl(parts[0], lang));
    } catch (e) {
      return false;
    }
    if (my !== seq) return true;

    playing = true;
    if (opt.onstart) opt.onstart();

    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (my !== seq) break;
      const b = i === 0 ? blob : await loadBlob(toUrl(parts[i], lang)).catch(() => null);
      if (!b) { ok = false; break; }
      if (my !== seq) break;
      const good = await new Promise((r) => playBlob(b, my, r));
      if (!good) { ok = false; break; }
      if (i < parts.length - 1) await wait(GAP_MS, my);
    }

    playing = false;
    if (opt.onend) opt.onend(ok);
    return true;
  }

  function stop() {
    seq++;
    playing = false;
    if (audio) { try { audio.pause(); } catch { /* olam */ } audio = null; }
  }

  /** Server TTS ishlayaptimi (qisqa sinov) */
  async function probe(lang) {
    try {
      const res = await fetch(toUrl('ok', lang || 'uz'), { method: 'GET' });
      return res.ok;
    } catch { return false; }
  }

  window.RemoteTTS = {
    speak, stop, probe,
    get playing() { return playing; }
  };
})();
