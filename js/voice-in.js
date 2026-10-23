/**
 * VoiceIn — mikrofon orqali matn ovozni tanish (Web Speech API).
 *
 *   VoiceIn.onText = (matn, interim) => {...};   // interim = yozilayotgan matn
 *   VoiceIn.onState = (holat) => {...};          // 'idle' | 'listen' | 'error'
 *   VoiceIn.start() / VoiceIn.stop()
 *   VoiceIn.available
 */
(function () {
  'use strict';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  let rec = null;
  let active = false;
  let interimText = '';

  const listeners = { text: [], state: [] };

  function emit(kind, a, b) { listeners[kind].forEach((fn) => { try { fn(a, b); } catch { /* olam */ } }); }

  function make(lang) {
    const r = new SR();
    r.lang = lang;
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onstart = () => { active = true; interimText = ''; emit('state', 'listen'); };

    r.onresult = (ev) => {
      let interim = '';
      let final = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const txt = res[0] ? res[0].transcript : '';
        if (res.isFinal) final += txt;
        else interim += txt;
      }
      if (interim) { interimText = interim; emit('text', interim, true); }
      if (final) {
        interimText = '';
        emit('text', final.trim(), false);
      }
    };

    r.onerror = (e) => {
      active = false;
      // til qo'llab-quvvatlanmasa — ruscha bilan qayta urinamiz
      if ((e.error === 'language-not-supported' || e.error === 'language-unavailable') && lang.indexOf('uz') === 0) {
        try {
          rec = make('ru-RU');
          rec.start();
          emit('state', 'listen');
          return;
        } catch { /* olam */ }
      }
      emit('state', e.error === 'no-speech' || e.error === 'aborted' ? 'idle' : 'error');
      emit('err', e.error || 'unknown');
    };

    r.onend = () => { active = false; emit('state', 'idle'); };
    return r;
  }

  function start() {
    if (!SR) { emit('state', 'error'); emit('err', 'unsupported'); return false; }
    if (active) { stop(); return false; }
    try {
      if (!rec) rec = make('uz-UZ');
      rec.start();
      return true;
    } catch {
      try { rec = make('ru-RU'); rec.start(); return true; }
      catch { emit('state', 'error'); return false; }
    }
  }

  function stop() {
    if (rec && active) { try { rec.stop(); } catch { /* olam */ } }
    active = false;
  }

  window.VoiceIn = {
    start, stop,
    get available() { return !!SR; },
    get listening() { return active; },
    get interim() { return interimText; },
    on(fn) { listeners.text.push(fn); },
    onState(fn) { listeners.state.push(fn); },
    onError(fn) { listeners.err = listeners.err || []; listeners.err.push(fn); }
  };
})();
