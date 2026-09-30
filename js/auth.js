'use strict';

/**
 * RadSkrin — kirish / ro'yxatdan o'tish (Auth)
 * Server: /api/auth/register, /api/auth/login, /api/auth/logout, /api/auth/me
 * Token: localStorage (radskrin_token) — barcha API so'rovlarida Bearer sifatida
 */
window.Auth = (() => {
  const KEY = 'radskrin_token';
  const listeners = [];
  let user = null;

  const getToken = () => localStorage.getItem(KEY) || '';
  const setToken = (t) => {
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
  };

  const on = (cb) => listeners.push(cb);
  const emit = () => listeners.forEach((cb) => { try { cb(user); } catch { /* */ } });

  async function api(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || ('Server xatosi: ' + res.status));
    return j;
  }

  async function register(data) {
    const j = await api('/api/auth/register', data);
    setToken(j.token);
    user = j.user;
    emit();
    return user;
  }

  async function login(data) {
    const j = await api('/api/auth/login', data);
    setToken(j.token);
    user = j.user;
    emit();
    return user;
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
        body: '{}'
      });
    } catch { /* server yo'q bo'lsa ham chiqamiz */ }
    setToken('');
    user = null;
    emit();
  }

  /** Sahifa ochilganda sessiyani tiklash */
  async function restore() {
    const t = getToken();
    if (!t) return false;
    try {
      const res = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + t } });
      if (!res.ok) throw new Error('401');
      user = await res.json();
      emit();
      return true;
    } catch {
      setToken('');
      user = null;
      emit();
      return false;
    }
  }

  /** API 401 qaytarsa — sessiya tugagan */
  function onUnauthorized() {
    if (!getToken()) return;
    setToken('');
    user = null;
    emit();
    showScreen();
    toast('Sessiya tugagan — qayta kiring', 'warn');
  }

  /* --------------------- Registratsiya: Face ID yuzi ---------------------- */
  let regStream = null;
  let regTimer = null;
  let regSamples = [];
  let regLastAt = 0;
  let regReady = false;

  const regStatus = (t) => { const el = $('#regFaceStatus'); if (el) el.textContent = t; };

  function renderRegDots() {
    const box = $('#regFaceDots');
    if (!box) return;
    box.innerHTML = Array.from({ length: 5 }, (_, i) =>
      `<i class="edot ${i < regSamples.length ? 'on' : ''}"></i>`).join('');
  }

  async function ensureFaceModel() {
    if (!window.FaceID) return false;
    if (FaceID.status === 'ready') return true;
    if (FaceID.status === 'idle') FaceID.init().catch(() => {});
    for (let i = 0; i < 80; i++) {
      if (FaceID.status === 'ready') return true;
      if (FaceID.status === 'error') return false;
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }

  function stopRegFace() {
    if (regTimer) clearInterval(regTimer);
    regTimer = null;
    if (regStream) regStream.getTracks().forEach((t) => t.stop());
    regStream = null;
    const v = $('#regVideo');
    if (v) { v.srcObject = null; v.hidden = true; }
    const off = $('#regFaceOff');
    if (off) off.hidden = regSamples.length >= 5;   // 5/5 bo'lsa — ✓ qolsin, kamera ikonkasi yashirilsin
    const ok = $('#regFaceOk');
    if (ok && regSamples.length < 5) ok.hidden = true;
    const b = $('#btnRegFace');
    if (b) b.textContent = regSamples.length >= 5
      ? '✓ Yuz tayyor — qayta olish'
      : '📷 Yuzni qo\'shish (5 ta namuna)';
  }

  async function startRegFace() {
    showError('');
    regStatus('Face ID modeli yuklanmoqda...');
    const ok = await ensureFaceModel();
    if (!ok) {
      regStatus('Face ID modeli yuklanmadi — serverni tekshiring');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      regStatus('Brauzer kamerani qo\'llab-quvvatlamaydi (HTTPS/Chrome kerak)');
      return;
    }
    try {
      regStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
    } catch {
      regStatus('Kamera uchun ruxsat bering yoki boshqa ilova yopilsin');
      return;
    }
    const v = $('#regVideo');
    v.srcObject = regStream;
    v.hidden = false;
    const off = $('#regFaceOff');
    if (off) off.hidden = true;
    const okEl = $('#regFaceOk');
    if (okEl) okEl.hidden = true;
    await v.play().catch(() => {});
    regSamples = [];
    regReady = false;
    renderRegDots();
    $('#btnRegFace').textContent = '■ Kamerani to\'xtatish';
    regStatus('Yuzni ramkada ushlang — 5 ta namuna olinmoqda...');
    regTimer = setInterval(captureTick, 500);
  }

  async function captureTick() {
    if (!regStream || regSamples.length >= 5 || window.FaceID.busy) return;
    const v = $('#regVideo');
    if (!v || !v.videoWidth) return;
    if (Date.now() - regLastAt < 450) return;
    regLastAt = Date.now();
    const r = await FaceID.compute(v);
    if (!r) {
      regStatus('Yuz topilmadi — yorug\'likka yuzni qarating va qimirlamang...');
      return;
    }
    regSamples.push(r.descriptor);
    renderRegDots();
    regStatus(`Namuna ${regSamples.length}/5 olinmoqda... (yuz ishonchi ${r.score}%)`);
    if (regSamples.length >= 5) {
      regReady = true;
      stopRegFace();
      const ok = $('#regFaceOk');
      if (ok) { ok.hidden = false; ok.style.animation = 'none'; void ok.offsetWidth; ok.style.animation = ''; }
      regStatus('✓ Yuz tayyor (5 namuna) — endi "Ro\'yxatdan o\'tish" ni bosing');
    }
  }

  function regFacePayload() {
    if (!regReady || !regSamples.length || !window.FaceID) return undefined;
    const templates = FaceID.enroll(null, regSamples);
    if (!templates.length) return undefined;
    return { templates, at: new Date().toISOString(), samples: regSamples.length };
  }

  /* ------------------------------ UI ---------------------------------- */
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function toast(msg, kind) {
    if (window.UI && window.UI.toast) window.UI.toast(msg, kind);
    else console.log('[auth]', msg);
  }

  function showError(text) {
    const el = $('#authErr');
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
  }

  function showScreen() {
    const s = $('#authScreen');
    if (s) s.hidden = false;
    document.body.classList.add('auth-open');
    const b = $('#userBadge');
    if (b) b.hidden = true;
  }

  function hideScreen() {
    const s = $('#authScreen');
    if (s) s.hidden = true;
    document.body.classList.remove('auth-open');
    renderBadge();
  }

  function renderBadge() {
    const b = $('#userBadge');
    if (!b) return;
    if (!user) { b.hidden = true; return; }
    b.hidden = false;
    $('#ubName').textContent = user.name;
    $('#ubRole').textContent = user.role === 'doctor' ? 'shifokor' : 'ishchi';
  }

  function bindUi() {
    const tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach((t) => t.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.toggle('active', x === t));
      const isLogin = t.dataset.auth === 'login';
      $('#authLoginForm').hidden = !isLogin;
      $('#authRegisterForm').hidden = isLogin;
      if (isLogin) stopRegFace();     // login tabiga o'tsak — kamerani yopamiz
      showError('');
    }));

    const btnFace = $('#btnRegFace');
    if (btnFace) btnFace.addEventListener('click', () => {
      if (regStream) {
        stopRegFace();
        regStatus(regSamples.length
          ? `Vaqtincha to'xtatildi (${regSamples.length}/5 namuna) — qayta davom eting`
          : 'Kamera o\'chirildi');
      } else {
        startRegFace();
      }
    });

    const loading = (on_) => {
      document.querySelectorAll('#authLoginForm button, #authRegisterForm button')
        .forEach((b) => { b.disabled = !!on_; });
    };

    $('#authLoginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      showError('');
      const f = new FormData(e.target);
      loading(true);
      try {
        await login({ login: f.get('login'), password: f.get('password') });
        toast('Xush kelibsiz!', 'ok');
        location.reload();
      } catch (err) {
        showError(err.message);
      } finally {
        loading(false);
      }
    });

    $('#authRegisterForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      showError('');
      const f = new FormData(e.target);
      const pass = String(f.get('password') || '');
      if (pass !== String(f.get('password2') || '')) {
        showError('Parollar mos kelmadi');
        return;
      }
      if (pass.length < 6) {
        showError('Parol kamida 6 ta belgi bo\'lsin');
        return;
      }
      loading(true);
      try {
        stopRegFace();
        const face = regFacePayload();
        await register({
          name: String(f.get('name') || '').trim(),
          login: String(f.get('login') || '').trim(),
          password: pass,
          role: f.get('role'),
          ...(face ? { face } : {})
        });
        toast(face
          ? 'Ro\'yxatdan o\'tdingiz — yuz ham saqlandi!'
          : 'Ro\'yxatdan o\'tdingiz — tizimga kirdingiz', 'ok');
        location.reload();
      } catch (err) {
        showError(err.message);
      } finally {
        loading(false);
      }
    });

    const out = $('#btnLogout');
    if (out) out.addEventListener('click', async () => {
      await logout();
      toast('Tizimdan chiqildi', 'ok');
      location.reload();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindUi();
    if (!getToken()) showScreen();
  });

  return {
    register, login, logout, restore, onUnauthorized, on,
    getToken, setToken, showScreen, hideScreen, renderBadge,
    get user() { return user; }
  };
})();
