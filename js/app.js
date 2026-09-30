'use strict';

/**
 * RadSkrin — asosiy ilova (app.js)
 * Modullar: RadConfig, RadModel, VisionEngine, Store, UI
 */
(() => {
  const C = window.RadConfig;
  const M = window.RadModel;
  const UI = window.UI;
  const FID = window.FaceID;
  const $ = UI.$;

  /* --------------------------------- State -------------------------------- */
  const state = {
    source: 'sim',
    rate: C.BACKGROUND.typical,
    vision: null,
    symptoms: new Set(),
    history: M.simulateHistory(C.BACKGROUND.typical),
    analysis: null,
    referral: null,
    patients: [],
    referrals: [],
    patientId: '',
    // Face ID
    identified: null,
    identScore: 0,
    streak: { id: null, n: 0 },
    userFaces: []          // registratsiyada yuz qo'shilgan xodimlar (serverdan)
  };

  const engine = new window.VisionEngine.VisionEngine({
    video: $('#camVideo'),
    overlay: $('#camOverlay'),
    onFrame: onVisionFrame
  });

  /* ============================== INIT ============================== */
  let booted = false;

  document.addEventListener('DOMContentLoaded', async () => {
    const ok = await window.Auth.restore();
    if (ok) {
      window.Auth.hideScreen();
      await boot();
    } else {
      window.Auth.showScreen();
    }
  });

  async function boot() {
    if (booted) return;
    booted = true;
    buildTabs();
    buildSymptoms();
    buildZones();
    buildLimitsTables();
    bindControls();
    buildFaceIdPanel();
    startClock();
    initFaceId();
    loadUserFaces();
    await checkApi();
    await loadPatients();
    await loadReferrals();
    syncRate(C.BACKGROUND.typical);
    recalc();
    window.addEventListener('resize', () => renderChart());
    console.info('%cRadSkrin ready', 'color:#22d3ee');
  }

  /* ============================== TABS =============================== */
  function buildTabs() {
    UI.$$('.tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        UI.$$('.tab').forEach((b) => b.classList.toggle('active', b === btn));
        UI.$$('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${btn.dataset.tab}`));
        if (btn.dataset.tab === 'monitor') renderChart();
        if (btn.dataset.tab === 'queue') renderQueue();
        if (btn.dataset.tab === 'patients') renderPatients();
        if (btn.dataset.tab === 'admin') loadAdminUsers();
      });
    });
    $('#btnGoVision').addEventListener('click', () => UI.$$('.tab').find((b) => b.dataset.tab === 'vision').click());
  }

  const goTab = (name) => {
    const t = UI.$$('.tab').find((b) => b.dataset.tab === name);
    if (t) t.click();
  };

  /* ============================== CLOCK ============================== */
  function startClock() {
    const tick = () => { $('#clock').textContent = UI.timeStr(); };
    tick();
    setInterval(tick, 1000);
  }

  /* =============================== API =============================== */
  async function checkApi() {
    try {
      const r = await fetch('/api/health');
      const j = await r.json();
      const el = $('#apiStatus');
      el.classList.add('ok');
      el.innerHTML = '<span class="dot"></span> server onlayn';
      void j;
    } catch {
      const el = $('#apiStatus');
      el.classList.add('bad');
      el.innerHTML = '<span class="dot"></span> lokal rejim (localStorage)';
    }
  }

  /* ============================ SYMPTOMS ============================= */
  function buildSymptoms() {
    $('#symptomChecks').innerHTML = C.SYMPTOMS.map(
      (s) => `<label class="check"><input type="checkbox" value="${s.id}" /> ${s.name}</label>`
    ).join('');
    $('#symptomChecks').addEventListener('change', (e) => {
      const box = e.target;
      box.closest('.check').classList.toggle('on', box.checked);
      if (box.checked) state.symptoms.add(box.value);
      else state.symptoms.delete(box.value);
      recalc();
    });
  }

  /* ============================== ZONES ============================== */
  function buildZones() {
    $('#zoneSelect').innerHTML =
      M.ZONES.map((z) => `<option value="${z.id}">${z.name} — ${z.rate} µSv/h</option>`).join('') +
      `<option value="custom">Boshqa (slayder)</option>`;
    $('#zoneSelect').addEventListener('change', (e) => {
      const z = M.ZONES.find((x) => x.id === e.target.value);
      if (z) { syncRate(z.rate); $('#simSlider').value = rateToSlider(z.rate); recalc(); }
    });
  }

  function buildLimitsTables() {
    $('#limitRows').innerHTML = [
      ['Aholi uchun qo\'shimcha yillik doza', '1 mSv/yil (ICRP 103)'],
      ['Kasbiy: 5 yillik o\'rtacha', '20 mSv/yil (bir yilda 50 mSv)'],
      ['Ko\'z buzog\'i uchun', '20 mSv/yil'],
      ['Homilador ayol uchun', '1 mSv/yil (kasbiy lavozimdan chetlab)'],
      ['Tabiiy fon (typical)', `${C.BACKGROUND.typical} µSv/soat`],
      ['Kunlik aholi normasi', `${C.LIMITS.dailyPublicAboveBg_uSv.toFixed(2)} µSv/kun`],
      ['LNT: 1 Sv uchun saraton xavfi', '~5%']
    ].map(([a, b]) => `<tr><td>${a}</td><td><b>${b}</b></td></tr>`).join('');

    $('#tierRows').innerHTML = C.RATE_TIERS.map((t, i) => {
      const prev = i === 0 ? null : C.RATE_TIERS[i - 1].max;
      const range = prev === null ? `< ${t.max} µSv/h` : t.max === Infinity ? `> ${prev} µSv/h` : `${prev} – ${t.max} µSv/h`;
      return `<tr><td>${UI.badge(t.label, t.color)}</td><td>${range}</td><td class="muted">${t.note}</td></tr>`;
    }).join('');
  }

  /* ============================= CONTROLS =========================== */
  function bindControls() {
    // manba tanlash
    UI.$$('#sourceSeg .seg-btn').forEach((b) => {
      b.addEventListener('click', () => {
        UI.$$('#sourceSeg .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
        state.source = b.dataset.src;
        $('#zoneRow').hidden = state.source !== 'sim';
        $('#manualRow').hidden = state.source !== 'manual';
        $('#simSlider').closest('.sensor-row').hidden = state.source !== 'sim';
        const hints = {
          sim: 'Simulyatsiya rejimida — haqiqiy dozimetr ulanmagan.',
          manual: 'Qo\'lda kiritilgan doza tezligi — dozimetrdan o\'qib kiriting.',
          serial: 'Web Serial orqali USB Geiger detector — liniya: yoki CPM.'
        };
        $('#sensorHint').textContent = hints[state.source];
        if (state.source === 'manual') $('#rateInput').value = state.rate;
        if (state.source === 'serial') connectSerial();
      });
    });

    $('#simSlider').addEventListener('input', (e) => {
      const r = sliderToRate(Number(e.target.value));
      $('#simVal').textContent = `${r.toFixed(2)} µSv/h`;
      $('#zoneSelect').value = 'custom';
      syncRate(r);
      recalc();
    });

    $('#rateInput').addEventListener('input', (e) => {
      const v = Math.max(0, Number(e.target.value) || 0);
      syncRate(v);
      recalc();
    });

    $('#btnReset').addEventListener('click', () => {
      syncRate(C.BACKGROUND.typical);
      $('#simSlider').value = rateToSlider(C.BACKGROUND.typical);
      $('#simVal').textContent = `${C.BACKGROUND.typical} µSv/h`;
      $('#zoneSelect').value = M.ZONES[0].id;
      recalc();
      UI.toast('Fon darajasiga qaytarildi', 'ok');
    });

    $('#btnSerial').addEventListener('click', connectSerial);
    $('#btnQuickReferral').addEventListener('click', quickReferral);

    // kamera
    $('#btnCamStart').addEventListener('click', startCamera);
    $('#btnCamStop').addEventListener('click', stopCamera);
    $('#imgInput').addEventListener('change', onImageUpload);

    // tahlil
    $('#btnAnalyze').addEventListener('click', runAnalysis);
    $('#btnSaveReferral').addEventListener('click', saveReferral);
    $('#btnPrintReferral').addEventListener('click', () => printReferral(state.referral));

    // bemorlar
    $('#btnAddPatient').addEventListener('click', () => UI.openModal('modalPatient'));
    $('#patientForm').addEventListener('submit', addPatient);
    $('#btnExportPatients').addEventListener('click', () => {
      const rows = state.patients.map((p) => ({
        FIO: p.name, Bolum: p.dept, TugilganYil: p.year, Telefon: p.phone || '',
        OxirgiDoza_uSv_h: p.lastRate ?? '', Risk: p.riskLabel || '', Sana: UI.dateStr(p.createdAt)
      }));
      Store.exportCsv(rows, 'bemorlar.csv') || UI.toast("Ma'lumot yo'q", 'warn');
    });
    $('#btnExportRefs').addEventListener('click', () => {
      const rows = state.referrals.map((r) => ({
        Bemor: r.patient?.name || r.patientName || '—',
        Risk: r.riskLabel, Holat: r.healthLoss + '%',
        Doza_uSv_h: r.rate, SutkalikFoiz: r.dayPercent,
        Muddat: r.deadline, Joy: r.place,
        ICD: (r.icd || []).join(', '), Sana: UI.dateStr(r.createdAt)
      }));
      Store.exportCsv(rows, 'yollanmalar.csv') || UI.toast("Ma'lumot yo'q", 'warn');
    });
    $('#btnClearQueue').addEventListener('click', async () => {
      if (!UI.confirmBox('Barcha yo\'llanmalar o\'chirilsinmi?')) return;
      await Store.referrals.clear();
      await loadReferrals();
      UI.toast('Navbat tozalandi', 'ok');
    });

    // modal
    document.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', () => {
        const m = b.closest('.modal');
        UI.closeModal(m ? m.id : 'modalPatient');
      })
    );
    document.querySelectorAll('.modal').forEach((m) =>
      m.addEventListener('click', (e) => { if (e.target === m) UI.closeModal(m.id); })
    );

    // Face ID
    $('#btnIdentClear').addEventListener('click', () => {
      clearIdentity();
      UI.toast('Identifikatsiya tozalandi', 'ok');
    });

    // Admin panel: foydalanuvchini o'chirish
    $('#btnAdminRefresh').addEventListener('click', () => loadAdminUsers());
    $('#adminRows').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-del-user]');
      if (!btn) return;
      const id = btn.dataset.delUser;
      const name = btn.dataset.name || '';
      if (!UI.confirmBox(`"${name}" foydalanuvchisi o'chirilsinmi? U tizimdan chiqadi va yuz namunalari ham o'chiriladi.`)) return;
      btn.disabled = true;
      try {
        const res = await fetch('/api/auth/users/' + encodeURIComponent(id), {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + window.Auth.getToken() }
        });
        if (res.status === 401) { window.Auth.onUnauthorized(); return; }
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
        UI.toast(`O'chirildi: ${name}`, 'ok');
        await loadAdminUsers();
      } catch (err) {
        UI.toast("O'chirib bo'lmadi: " + err.message, 'error');
        btn.disabled = false;
      }
    });
  }

  /* ========================== RATE / HISTORY ========================= */
  const sliderToRate = (v) => Number((0.05 * Math.pow(2000, v / 100)).toFixed(3));
  const rateToSlider = (r) => Math.round((Math.log(r / 0.05) / Math.log(2000)) * 100);

  function syncRate(v) {
    state.rate = Math.max(0, Number(v) || 0);
    const last = state.history[state.history.length - 1];
    if (!last || Date.now() - last.t > 4000) state.history.push({ t: Date.now(), v: state.rate });
    else last.v = state.rate;
    if (state.history.length > 240) state.history.shift();
    const vis = $('#visionRate');
    if (vis && document.activeElement !== vis) vis.value = state.rate;
  }

  // jonli tarix (simulyatsiya: har 5 sekundda nuqta qo'shiladi)
  setInterval(() => {
    if (state.source === 'sim') {
      const noise = state.rate * (Math.random() - 0.5) * 0.14;
      state.history.push({ t: Date.now(), v: Math.max(0, Number((state.rate + noise).toFixed(3))) });
      if (state.history.length > 240) state.history.shift();
      if ($('#page-monitor').classList.contains('active')) renderChart();
    }
  }, 5000);

  /* ============================== RECALC ============================= */
  function recalc() {
    const a = M.analyze({
      rateUSvH: state.rate,
      vision: state.vision,
      symptoms: [...state.symptoms]
    });
    state.analysis = a;
    renderMonitor(a);
  }

  function renderMonitor(a) {
    const color = a.tier.color;

    // gauge
    $('#gaugeWrap').innerHTML = UI.gauge(
      a.doses.rate,
      Math.max(2, Math.min(a.doses.rate * 1.6, 30)),
      'µSv/soat',
      'joriy doza tezligi'
    );
    $('#gaugeWrap').style.setProperty('--gauge-color', color);

    // tier
    const tb = $('#tierBanner');
    $('#tierLabel').textContent = a.tier.label;
    $('#tierNote').textContent = a.tier.note;
    tb.style.borderLeftColor = color;
    tb.style.background = `${color}14`;

    // KPI
    UI.progress($('#barDay'), Math.min(100, a.doses.dayPercent / 4), color);
    $('#kpiDay').innerHTML = `${a.doses.perDay_mSv} <i>mSv</i>`;
    $('#kpiDaySub').textContent = `bugungi doza — fon ${C.BACKGROUND.typical} µSv/h dan tashqari`;

    $('#kpiDayPct').innerHTML = `${Math.round(a.doses.dayPercent)}<i>%</i>`;
    UI.progress($('#barDayPct'), Math.min(100, a.doses.dayPercent), a.doses.dayPercent > 100 ? '#ef4444' : '#22d3ee');

    $('#kpiYearPct').innerHTML = `${Math.round(a.doses.yearPercent)}<i>%</i>`;
    UI.progress($('#barYearPct'), Math.min(100, a.doses.yearPercent), a.doses.yearPercent > 100 ? '#ef4444' : '#38bdf8');
    $('#kpiWorker').textContent = `ishchi uchun: ${Math.round(a.doses.workerPercent)}% (20 mSv/yil)`;

    $('#kpiHealth').innerHTML = `${a.healthLoss}<i>%</i>`;
    UI.progress($('#barHealth'), a.healthLoss, a.risk.color);
    $('#kpiRiskLabel').textContent = `${a.risk.label} · saraton xavfi ${a.cancerRiskPercent}%`;

    // verdict
    $('#verdictPct').textContent = a.healthLoss;
    $('#verdictPct').style.color = a.risk.color;
    $('#verdictBadges').innerHTML =
      UI.badge(a.risk.label, a.risk.color) +
      UI.badge(a.tier.label, a.tier.color) +
      (a.referralNeeded ? UI.badge('Yo\'llanma kerak', '#f97316') : UI.badge('Kuzatuv', '#22c55e'));

    const txt = [];
    txt.push(`Doza tezligi ${a.doses.rate} µSv/soat → sutkalik ${a.doses.perDay_mSv} mSv, yillik ${a.doses.perYear_mSv} mSv.`);
    txt.push(`Bugungi foiz: ${Math.round(a.doses.dayPercent)}% (aholi kunlik normasi), yillik foiz: ${Math.round(a.doses.yearPercent)}% (1 mSv limit).`);
    txt.push(`LNT bo'yicha qo'shimcha saraton xavfi: ${a.cancerRiskPercent}%. ${a.risk.refer ? 'Shifokor ko\'rigi tavsiya etiladi.' : 'Shifokor yo\'llanmasi shart emas.'}`);
    $('#verdictText').textContent = txt.join(' ');

    $('#adviceList').innerHTML = a.advice.map((x) => `<li class="${x.level}">${x.text}</li>`).join('');
    $('#btnQuickReferral').disabled = !a.referralNeeded;

    // vision mini
    const v = state.vision;
    $('#mPresence').textContent = v && v.presence !== undefined ? `${v.presence}%` : '—';
    $('#mPallor').textContent = v && v.pallor != null ? `${v.pallor}` : '—';
    $('#mPulse').textContent = v && v.pulse ? `${v.pulse} bpm` : '—';
    $('#mQuality').textContent = v && v.quality != null ? `${v.quality}%` : '—';

    const vs = a.vision;
    $('#visionScoreTxt').textContent = vs.score === null ? 'kamera o\'tkazilmagan' : `${vs.score}/100`;
    UI.progress($('#barVision'), vs.score ?? 0, vs.score === null ? '#64748b' : vs.score > 70 ? '#22c55e' : vs.score > 45 ? '#eab308' : '#ef4444');

    renderChart();
  }

  function renderChart() {
    UI.lineChart($('#doseChart'), state.history, {
      color: '#22d3ee',
      threshold: 1.0
    });
    const t0 = new Date(state.history[0]?.t || Date.now());
    const t1 = new Date(state.history[state.history.length - 1]?.t || Date.now());
    $('#chartMeta').textContent = `${UI.timeStr(t0)} → ${UI.timeStr(t1)} · chegara 1.0 µSv/h`;
  }

  /* ============================== CAMERA ============================= */
  async function startCamera() {
    try {
      await engine.start();
      $('#camPlaceholder').classList.add('hide');
      $('#camState').hidden = false;
      $('#btnCamStart').disabled = true;
      $('#btnCamStop').disabled = false;
      $('#camHint').textContent = 'Yuzni ichki ramkada ushlang, yuzga yorug\'lik tushsin. Puls uchun 6–12 soniya tinch turish kerak.';
      updateStatus();
      UI.toast('Kamera yoqildi — yuz skriningi boshlandi', 'ok');
    } catch (e) {
      UI.toast('Kamera ochilmadi: ' + e.message, 'error', 6000);
      $('#camHint').textContent = 'Kamera uchun ruxsat bering yoki "Rasm yuklash" orqali tahlil qiling.';
    }
  }

  function stopCamera() {
    engine.stop();
    $('#camPlaceholder').classList.remove('hide');
    $('#camState').hidden = true;
    $('#btnCamStart').disabled = false;
    $('#btnCamStop').disabled = true;
    resetCamMetrics();
    clearIdentity();
    setBanner('none');
    updateStatus();
  }

  function resetCamMetrics() {
    ['cPresence', 'cPallor', 'cPulse', 'cStability'].forEach((id) => (document.getElementById(id).textContent = '—'));
    ['barPresence', 'barPallor', 'barPulse', 'barStability'].forEach((id) => UI.progress(document.getElementById(id), 0));
  }

  function onVisionFrame(f) {
    state.vision = f;

    $('#cPresence').textContent = f.found ? `${f.presence}%` : 'aniqlanmadi';
    $('#cPallor').textContent = f.pallor == null ? '—' : `${f.pallor}`;
    $('#cPulse').textContent = f.pulse ? `${f.pulse} bpm` : (f.parsed ? 'puls kutilmoqda...' : '—');
    $('#cStability').textContent = f.found ? `${Math.round(f.stability)}%` : '—';

    UI.progress($('#barPresence'), f.presence, f.presence > 45 ? '#22c55e' : f.presence > 20 ? '#eab308' : '#ef4444');
    UI.progress($('#barPallor'), f.pallor ?? 0, (f.pallor ?? 0) > 55 ? '#22c55e' : '#eab308');
    UI.progress($('#barPulse'), f.pulse ? Math.min(100, (f.pulse / 140) * 100) : 0, '#4ade80');
    UI.progress($('#barStability'), f.stability, '#38bdf8');

    // jonli ko'rsatmalar
    const tips = {
      'yuz yo\'q': 'Yuzni ichki ramkada to\'liq ko\'ring: yuzga yorug\'lik tushsin, qo\'l yuzga yaqin kelmasin.',
      'yuz kuzatilmoqda...': 'Yuz topildi — bir necha soniya ushlab turing (barqarorlik kutilmoqda).',
      'yorug\'lik kam': 'Yorug\'lik kam: derza yoki chiroqni yuzga qarating.',
      'yorug\'lik ortiqcha': 'Yorug\'lik ortiqcha: kamarni o\'chiring yoki teskari o\'tiring.',
      'kadr aniq emas (silkinyapti)': 'Kamerani qimirlatmasdan ushlab turing.'
    };
    if (f.status === 'yuz barqarar') {
      $('#camHint').textContent = f.pulse
        ? `Yuz barqarar · puls ${f.pulse} bpm (ishonch ${f.pulseConfidence}%) · sifat ${f.quality}%`
        : `Yuz barqarar · puls hisoblanmoqda (${Math.round(window.VisionEngine.PPG_MIN_S)}+ soniya kerak) · sifat ${f.quality}%`;
    } else if (tips[f.status]) {
      $('#camHint').textContent = tips[f.status];
    }

    // monitoring sahifasini ham yangilaymiz
    if (state.analysis) renderMonitor(state.analysis);

    // Face ID: tanish (descriptor — VisionEngine ichida FaceID.compute)
    feedIdentity(f);
  }

  /* =================== FACE ID: MODELNI YUKLASH ===================== */
  async function initFaceId() {
    const ok = await FID.init();
    buildFaceIdPanel();
    if (ok) {
      UI.toast(`Face ID model tayyor (${FID.backend} rejim) — yuz avtomatik taniladi`, 'ok', 5000);
    } else {
      UI.toast('Face ID modeli yuklanmadi: ' + FID.err, 'error', 8000);
    }
    updateStatus();
  }

  /* =========================== FACE ID: TANISH =========================== */
  const patientsWithFace = () => state.patients.filter((p) => p.face && p.face.templates && p.face.templates.length);
  // tanish havfi: avval registratsiyada yuz qo'shilgan xodimlar, so'ng yuzli bemorlar
  const identityPool = () => [...state.userFaces, ...patientsWithFace()];

  function feedIdentity(f) {
    if (!f || !f.parsed || !f.descriptor) {
      state.streak.n = 0;
      return;
    }
    const pool = identityPool();
    if (!pool.length) {
      if (state.vision && f.found) setBanner('unknown', 'Ro\'yxatda yuz yo\'q — yuzni registratsiyada qo\'shing');
      return;
    }
    const best = FID.identify(f.descriptor, pool);
    if (!best) return;
    const subj = best.patient;

    if (best.score >= FID.T_MATCH) {
      state.unknownStreak = 0;
      if (state.streak.id !== subj.id) state.streak = { id: subj.id, n: 1 };
      else state.streak.n++;

      if (state.identified && state.identified.id === subj.id) {
        state.identScore = Math.round(best.score);
        state.unknownStreak = 0;
        updateStatus();
        return;
      }
      if (state.streak.n >= FID.STREAK) {
        confirmIdentity(subj, best.score);
      } else {
        setBanner('candidate',
          `Nomzod: <b>${esc(subj.name)}</b> (${subj.kind === 'user' ? subj.role : subj.year}) — o'xshashlik ${best.score}% ` +
          `<button class="btn btn-sm btn-primary" id="btnConfirmIdent">Ha, shu odam</button>`);
        const b = document.getElementById('btnConfirmIdent');
        if (b) b.onclick = () => confirmIdentity(subj, best.score);
      }
    } else if (best.score >= FID.T_CANDIDATE) {
      state.streak = { id: null, n: 0 };
      // tanilgan shaxs o'z odami bo'lsa — shu odamda qolamiz (pastroq ball)
      if (state.identified && state.identified.id === subj.id) {
        state.unknownStreak = 0;
        state.identScore = Math.round(best.score);
        updateStatus();
        return;
      }
      if (state.identified) state.unknownStreak = (state.unknownStreak || 0) + 1;
      setBanner('candidate',
        `Shubha: <b>${esc(subj.name)}</b> — ${best.score}% ` +
        `<button class="btn btn-sm btn-primary" id="btnConfirmIdent">Ha, shu odam</button>`);
      const b = document.getElementById('btnConfirmIdent');
      if (b) b.onclick = () => confirmIdentity(subj, best.score);
      if (state.identified && state.unknownStreak >= 15) {
        clearIdentity();
        UI.toast("Noma'lum shaxs — identifikatsiya tozalandi", 'warn');
      }
    } else {
      state.streak = { id: null, n: 0 };
      state.unknownStreak = (state.unknownStreak || 0) + 1;
      // begona yuz ko'rinayotgan bo'lsa — avvalgi tanishni o'chiramiz
      if (state.identified && state.unknownStreak >= 15) {
        clearIdentity();
        UI.toast("Noma'lum shaxs — identifikatsiya tozalandi", 'warn');
      } else if (!state.identified) {
        setBanner('unknown', `Noma'lum shaxs (eng yuqoshi: ${best.score}%)`);
      }
    }
  }

  function confirmIdentity(person, score) {
    state.identified = person;
    state.identScore = Math.round(score);
    state.streak = { id: person.id, n: FID.STREAK };
    const isUser = person.kind === 'user';
    if (isUser) {
      // xodim tanilganda — bemor tanlanmaydi (yuz registratsiyada qo'shilgan)
      setBanner('ok',
        `✓ <b>${esc(person.name)}</b> · ${esc(person.role)} — o'xshashlik ${state.identScore}%`);
    } else {
      state.patientId = person.id;
      const sel = $('#patientSelect');
      if (sel) sel.value = person.id;
      setBanner('ok',
        `✓ <b>${esc(person.name)}</b> · ${person.year} yil · ${esc(person.dept)} — o'xshashlik ${state.identScore}%`);
    }
    updateStatus();
    UI.toast(`Tanildi: ${person.name} (${isUser ? person.role : person.year})`, 'ok');
  }

  function clearIdentity() {
    state.identified = null;
    state.identScore = 0;
    state.streak = { id: null, n: 0 };
    setBanner('none');
    updateStatus();
  }

  function setBanner(kind, html) {
    const el = $('#idBanner');
    if (!el) return;
    if (kind === 'none') { el.hidden = true; return; }
    el.hidden = false;
    el.className = `id-banner show b-${kind}`;
    if (el.dataset.k !== kind + (html || '')) {
      el.innerHTML = html || '';
      el.dataset.k = kind + (html || '');
    }
  }

  function updateStatus() {
    const txt = $('#faceStatusText');
    const box = $('#faceStatus');
    if (!txt) return;
    if (state.identified) {
      const p = state.identified;
      box.className = 'faceid-status fs-ok';
      txt.innerHTML = p.kind === 'user'
        ? `<b>${esc(p.name)}</b> · ${esc(p.role)} · o'xshashlik ${state.identScore}%`
        : `<b>${esc(p.name)}</b> · ${p.year} · ${esc(p.dept)} · tashriflar: ${(p.visits || []).length} · o'xshashlik ${state.identScore}%`;
    } else if (!engine.running) {
      box.className = 'faceid-status';
      txt.textContent = 'Kamera yoqilmagan';
    } else {
      box.className = 'faceid-status fs-wait';
      txt.textContent = identityPool().length
        ? 'Yuz tanilmoqda...'
        : "Ro'yxatda yuz yo'q — yuzni registratsiyada qo'shing";
    }
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ==================== FACE ID: RO'YXAT VA YUZLAR ====================== */
  const FID_LABEL = { idle: 'kutilmoqda', loading: 'yuklanmoqda', ready: 'tayyor', error: 'xato' };

  function buildFaceIdPanel() {
    const st = FID ? FID.status : 'idle';
    const model = `${FID_LABEL[st] || st}${st === 'ready' && FID.backend ? ` (${FID.backend})` : ''}${st === 'error' ? ' — ' + esc(FID.err || '') : ''}`;
    const el = $('#faceIdCount');
    if (el) el.innerHTML = `${state.userFaces.length} ta xodim · ${patientsWithFace().length} ta bemor · model: <b>${model}</b>`;
  }

  /** Registratsiyada yuz qo'shilgan xodimlarni serverdan yuklash */
  async function loadUserFaces() {
    try {
      const res = await fetch('/api/auth/faces', {
        headers: { Authorization: 'Bearer ' + window.Auth.getToken() }
      });
      if (res.status === 401) { window.Auth.onUnauthorized(); return; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = await res.json();
      state.userFaces = (rows || []).map((u) => ({
        id: 'u:' + u.id,
        kind: 'user',
        name: u.name,
        role: u.role === 'doctor' ? 'shifokor' : 'ishchi',
        year: null,
        face: u.face,
        visits: []
      }));
      buildFaceIdPanel();
      updateStatus();
    } catch (err) {
      console.warn('loadUserFaces:', err.message);
    }
  }

  /* ============================ ADMIN PANEL ============================= */
  async function loadAdminUsers() {
    try {
      const res = await fetch('/api/auth/users', {
        headers: { Authorization: 'Bearer ' + window.Auth.getToken() }
      });
      if (res.status === 401) { window.Auth.onUnauthorized(); return; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = await res.json();
      renderAdminUsers(rows);
    } catch (err) {
      UI.toast("Foydalanuvchilarni yuklab bo'lmadi: " + err.message, 'error');
    }
  }

  function renderAdminUsers(rows) {
    const meId = (window.Auth.user || {}).id;
    const cnt = $('#adminCount');
    if (cnt) cnt.textContent = `${rows.length} ta foydalanuvchi`;
    UI.renderRows($('#adminRows'), rows.map((r, i) => ({ ...r, i })), [
      { render: (r) => r.i + 1 },
      { render: (r) => `<b>${esc(r.name)}</b>${r.id === meId ? ' ' + UI.badge('siz', '#22d3ee') : ''}` },
      { render: (r) => esc(r.login) },
      { render: (r) => UI.badge(r.role === 'doctor' ? 'shifokor' : 'ishchi', r.role === 'doctor' ? '#a78bfa' : '#22d3ee') },
      { render: (r) => r.hasFace ? UI.badge(`✓ ${r.faceCount} namuna`, '#22c55e') : UI.badge("yo'q", '#64748b') },
      { render: (r) => r.createdAt ? UI.dateStr(r.createdAt) : '—' },
      { render: (r) => r.lastLogin ? UI.dateStr(r.lastLogin) : '—' },
      { render: (r) => r.id === meId
        ? '<span class="muted">—</span>'
        : `<button class="btn btn-sm btn-warn" data-del-user="${esc(r.id)}" data-name="${esc(r.name)}">O'chirish</button>` }
    ], "Foydalanuvchi yo'q");
  }

  /* ============================ TASHRIFLAR (LOG) ========================== */
  async function logVisit(patient, a) {
    if (!patient) return;
    const visits = [...(patient.visits || [])];
    visits.push({
      t: Date.now(),
      rate: a.doses.rate,
      dose: a.doses.perDay_mSv,
      dayPercent: a.doses.dayPercent,
      healthLoss: a.healthLoss,
      riskKey: a.risk.key,
      riskLabel: a.risk.label
    });
    const patch = {
      visits: visits.slice(-80),
      lastRate: a.doses.rate,
      riskLabel: a.risk.label,
      riskColor: a.risk.color,
      lastSeen: new Date().toISOString()
    };
    const upd = await Store.patients.update(patient.id, patch);
    const i = state.patients.findIndex((x) => x.id === patient.id);
    if (i > -1) state.patients[i] = upd || { ...patient, ...patch };
    if (state.identified && state.identified.id === patient.id) state.identified = state.patients[i];
    renderPatients();
  }

  function totalDose(p) {
    return (p.visits || []).reduce((s, v) => s + (Number(v.dose) || 0), 0);
  }

  function openHistory(p) {
    const visits = [...(p.visits || [])].reverse();
    $('#histTitle').textContent = `Bemor tarixi — ${p.name}`;
    const rows = visits.length
      ? visits.map((v, i) => `<tr>
          <td>${i + 1}</td>
          <td>${UI.dateStr(v.t)}</td>
          <td>${v.rate} µSv/h</td>
          <td>${v.dose} mSv</td>
          <td>${Math.round(v.dayPercent)}%</td>
          <td>${v.healthLoss}%</td>
          <td>${UI.badge(v.riskLabel || '—', (C.RISK_TIERS.find((r) => r.key === v.riskKey) || {}).color || '#94a3b8')}</td>
        </tr>`).join('')
      : `<tr><td colspan="7" class="empty">Hali tashriflar yo'q</td></tr>`;

    $('#histBody').innerHTML = `
      <div class="hist-head">
        ${p.thumb ? `<img class="thumb lg" src="${p.thumb}" alt="" />` : '<div class="thumb lg none">👤</div>'}
        <div>
          <b>${esc(p.name)}</b><br/>
          <span class="muted">${esc(p.dept)} · ${p.year} yil · ${esc(p.phone || '')}</span><br/>
          <span class="muted">Tashriflar: ${visits.length} · jami sutkalik doza: ${totalDose(p).toFixed(3)} mSv</span><br/>
          ${p.face ? UI.badge(`Face ID: ${p.face.templates.length} namuna`, '#22c55e') : UI.badge('Face ID yo\'q', '#64748b')}
        </div>
      </div>
      <table class="table">
        <thead><tr><th>#</th><th>Sana</th><th>Doza</th><th>Sutkalik</th><th>Bugungi %</th><th>Sog'lik yo'qotish</th><th>Risk</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    UI.openModal('modalHistory');
  }

  async function onImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await window.VisionEngine.analyseImage(file);
      if (!res.parsed) {
        UI.toast(
          res.status === 'yorug\'lik ortiqcha' || res.status === 'teri maydoni kam'
            ? 'Yuz topildi, lekin sifat past: yorug\'likni o\'zgartiring'
            : 'Yuz aniqlanmadi — yaxshi yorug\'likdagi, oldinga qaragan kadrni tanlang',
          'warn', 5000
        );
        if (res.status) $('#camHint').textContent = 'Rasm: ' + res.status;
        return;
      }
      state.vision = res;
      $('#cPresence').textContent = `${res.presence}%`;
      $('#cPallor').textContent = `${res.pallor}`;
      $('#cPulse').textContent = 'rasm rejimida yo\'q';
      $('#cStability').textContent = '—';
      UI.progress($('#barPresence'), res.presence, res.presence > 45 ? '#22c55e' : '#eab308');
      UI.progress($('#barPallor'), res.pallor ?? 0, (res.pallor ?? 0) > 55 ? '#22c55e' : '#eab308');
      $('#camHint').textContent = `Rasm: yuz ${res.faceScore}%, sifat ${res.quality}%, eksponiya ${res.exposure}`;
      UI.toast(`Rasm tahlil qilindi (yuz ${res.faceScore}%)`, 'ok');
      recalc();
      if (res.descriptor) {
        feedIdentity({ ...res, found: true });
      } else if (identityPool().length) {
        setBanner('unknown', 'Face ID: yuzdan descriptor olinmadi (model tayyor emas yoki yuz aniqlanmadi)');
      }
    } catch (err) {
      UI.toast('Rasmni o\'qib bo\'lmadi: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  }

  /* ========================== SERIAL GEIGER ========================== */
  let serialPort = null;
  async function connectSerial() {
    try {
      if (!('serial' in navigator)) {
        UI.toast('Web Serial brauzerda mavjud emas (Chrome/Edge + HTTPS)', 'warn');
        return;
      }
      serialPort = await navigator.serial.requestPort();
      await serialPort.open({ baudRate: 9600 });
      $('#sensorHint').textContent = 'Geiger detector ulandi — o\'lchov jonli.';
      UI.toast('Geiger ulandi', 'ok');

      const reader = serialPort.readable.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += value;
            const lines = buf.split(/\r?\n/);
            buf = lines.pop();
            for (const line of lines) parseGeigerLine(line);
          }
        } catch { /* port yopildi */ }
      })();
    } catch (e) {
      UI.toast('Serial xato: ' + e.message, 'warn');
    }
  }

  function parseGeigerLine(line) {
    const m = line.match(/(-?\d+(?:[.,]\d+)?)/);
    if (!m) return;
    let val = parseFloat(m[1].replace(',', '.'));
    if (/cpm/i.test(line)) val = val * 0.0057; // tipik SBM-20 konversiyasi
    if (val < 0 || val > 100000) return;
    if (state.source !== 'serial') return;
    syncRate(val);
    $('#rateInput').value = val;
    $('#simVal').textContent = `${val.toFixed(3)} µSv/h`;
    recalc();
  }

  /* ============================= ANALYSIS =========================== */
  function runAnalysis() {
    const vis = $('#visionRate');
    if (vis.value !== '') {
      state.rate = Math.max(0, Number(vis.value) || 0);
    }
    if (!state.vision && engine.running) state.vision = engine.latest;
    if (!state.patientId && state.identified) state.patientId = state.identified.id;

    const a = M.analyze({ rateUSvH: state.rate, vision: state.vision, symptoms: [...state.symptoms] });
    state.analysis = a;

    const patient = state.patients.find((p) => p.id === state.patientId);
    const ref = M.buildReferral(a, patient);
    state.referral = ref;

    // tashrifni bazaga yozish (kunlik doza tarixi shakllanadi)
    if (patient) logVisit(patient, a);

    // render result
    $('#visionResult').hidden = false;
    $('#resPct').textContent = a.healthLoss;
    $('#resPct').style.color = a.risk.color;
    $('#resTags').innerHTML =
      (patient ? UI.badge(`🪪 ${patient.name}`, '#38bdf8') : '') +
      UI.badge(a.risk.label, a.risk.color) +
      UI.badge(a.tier.label, a.tier.color) +
      UI.badge(a.referralNeeded ? `Navbat: ${ref.deadline}` : 'Kuzatuv', ref.urgency.color);

    $('#resRows').innerHTML = [
      ['Doza tezligi', `${a.doses.rate} µSv/soat`],
      ['Sutkalik doza', `${a.doses.perDay_mSv} mSv`],
      ['Bugungi foiz (norma)', `${Math.round(a.doses.dayPercent)}%`],
      ['Yillik doza / foiz', `${a.doses.perYear_mSv} mSv · ${Math.round(a.doses.yearPercent)}%`],
      ['Saraton xavfi (LNT)', `${a.cancerRiskPercent}%`],
      ['Vizual ball', a.vision.score === null ? 'kamera o\'tkazilmagan' : `${a.vision.score}/100`],
      ['Simptom balli', `${a.scores.symptoms}/100`],
      ['Doza balli', `${a.scores.dose}/100`]
    ].map(([k, v]) => `<div class="res-row"><span>${k}</span><b>${v}</b></div>`).join('');

    $('#resAdvice').innerHTML = a.advice.map((x) => `<li class="${x.level}">${x.text}</li>`).join('');
    renderRefPreview(ref);

    renderMonitor(a);
    UI.toast(`Tahlil yakunlandi: ${a.healthLoss}% — ${a.risk.label}`, a.referralNeeded ? 'warn' : 'ok', 5000);
  }

  function renderRefPreview(r) {
    $('#refPreview').innerHTML = `
      <h5>🏥 SHIFOKOR YO'LLANMASI (avtomatik) ${UI.badge(r.riskLabel, r.riskColor)}</h5>
      <div class="rp-grid">
        <div><span>Bemor:</span> <b>${r.patient ? r.patient.name : 'nomalum (keyin qo\'shiladi)'}</b></div>
        <div><span>Joy:</span> <b>${r.place}</b></div>
        <div><span>Muddat:</span> <b>${r.deadline}</b></div>
        <div><span>Sog'lik yo'qotish:</span> <b>${r.healthLoss}%</b></div>
        <div><span>Doza:</span> <b>${r.rate} µSv/soat · bugungi ${Math.round(r.dayPercent)}%</b></div>
        <div><span>ICD:</span> <b>${r.icd.join('; ')}</b></div>
      </div>
      <div style="margin-top:9px"><b>Tavsiya etilgan tahlillar:</b><ul>${r.tests.map((t) => `<li>${t}</li>`).join('')}</ul></div>
      ${r.meds.length ? `<div><b>Dori-darmon (faqat shifokor ko'rsatmasi bilan):</b><ul>${r.meds.map((m) => `<li>${m}</li>`).join('')}</ul></div>` : ''}
      <div class="rp-note">Izoh: ${r.note}</div>`;
  }

  async function saveReferral() {
    if (!state.referral) return runAnalysis();
    const payload = {
      ...state.referral,
      patientName: state.referral.patient?.name || '—',
      status: 'new',
      analysis: {
        rate: state.analysis.doses.rate,
        healthLoss: state.analysis.healthLoss,
        riskKey: state.analysis.risk.key,
        dayPercent: state.analysis.doses.dayPercent,
        cancerRiskPercent: state.analysis.cancerRiskPercent
      }
    };
    delete payload.urgency;
    await Store.referrals.create(payload);
    await loadReferrals();
    UI.toast("Yo'llanma shifokor navbatiga qo'shildi", 'ok');
    goTab('queue');
  }

  async function quickReferral() {
    const a = state.analysis;
    if (!a) return;
    const patient = state.patients[0];
    const ref = M.buildReferral(a, patient);
    state.referral = ref;
    const payload = { ...ref, patientName: ref.patient?.name || 'Nomalum', status: 'new' };
    delete payload.urgency;
    await Store.referrals.create(payload);
    await loadReferrals();
    UI.toast("Yo'llanma navbatga qo'shildi", 'ok');
    goTab('queue');
  }

  /* ============================= PRINT ============================== */
  function printReferral(r) {
    if (!r) return UI.toast('Avval tahlilni o\'tkazing', 'warn');
    const now = UI.dateStr();
    $('#printArea').innerHTML = `
      <h1>SHIFOKOR YO'LLANMASI — ${C.APP_NAME}</h1>
      <p><b>${C.ORGANIZATION}</b> · Sana: ${now}</p>
      <table>
        <tr><th>Bemor</th><td>${r.patient ? r.patient.name : '—'}</td><th>Tug'ilgan yil</th><td>${r.patient?.year || '—'}</td></tr>
        <tr><th>Bo'lim / hudud</th><td>${r.patient?.dept || '—'}</td><th>Risk darajasi</th><td>${r.riskLabel} (${r.healthLoss}%)</td></tr>
        <tr><th>Doza tezligi</th><td>${r.rate} µSv/soat</td><th>Sutkalik doza</th><td>${r.dose} mSv</td></tr>
        <tr><th>Bugungi foiz</th><td>${Math.round(r.dayPercent)}%</td><th>Yillik foiz</th><td>${Math.round(r.yearPercent)}%</td></tr>
        <tr><th>Saraton xavfi (LNT)</th><td>${r.cancerRiskPercent}%</td><th>Muddat</th><td><b>${r.deadline}</b></td></tr>
        <tr><th>Yo'naltirish joyi</th><td colspan="3">${r.place}</td></tr>
        <tr><th>ICD-10</th><td colspan="3">${r.icd.join('; ')}</td></tr>
      </table>
      <p style="margin-top:12px"><b>Tavsiya etilgan tahlillar:</b></p>
      <ul>${r.tests.map((t) => `<li>${t}</li>`).join('')}</ul>
      ${r.meds.length ? `<p><b>Dori-darmon (shifokor nazoratida):</b></p><ul>${r.meds.map((m) => `<li>${m}</li>`).join('')}</ul>` : ''}
      <div class="p-note"><b>Izoh:</b> ${r.note}</div>
      <div class="p-sign">
        <div>Shifokor: ________________ / ____________</div>
        <div>Bemor: ________________ / ____________</div>
      </div>`;
    window.print();
  }

  /* ============================ PATIENTS ============================ */
  async function loadPatients() {
    state.patients = await Store.patients.list();
    renderPatients();
    const opts = '<option value="">— tanlanmagan —</option>' +
      state.patients.map((p) => `<option value="${p.id}">${esc(p.name)} — ${esc(p.dept)}</option>`).join('');
    const sel = $('#patientSelect');
    sel.innerHTML = '<option value="">— tanlanmagan —</option>' +
      state.patients.map((p) => `<option value="${p.id}">${esc(p.name)} — ${esc(p.dept)}</option>`).join('');
    sel.value = state.patientId;
    sel.onchange = (e) => { state.patientId = e.target.value; };

    const cnt = $('#faceIdCount');
    if (cnt) buildFaceIdPanel();
    void opts;
    updateStatus();
  }

  function renderPatients() {
    UI.renderRows($('#patientRows'), state.patients, [
      { render: (p) => `<div class="person">${p.thumb ? `<img class="thumb" src="${p.thumb}" alt="" />` : '<div class="thumb none">👤</div>'}<div><b>${esc(p.name)}</b><br/><span class="muted">${p.lastSeen ? 'oxirgi: ' + UI.dateStr(p.lastSeen) : UI.dateStr(p.createdAt)}</span></div></div>` },
      { render: (p) => esc(p.dept) },
      { render: (p) => p.year },
      { render: (p) => p.phone ? esc(p.phone) : '—' },
      { render: (p) => (p.visits || []).length },
      { render: (p) => `${totalDose(p).toFixed(3)} mSv` },
      { render: (p) => (p.riskLabel ? UI.badge(p.riskLabel, p.riskColor || '#94a3b8') : '—') },
      { render: (p) => (p.face ? UI.badge(`✓ ${p.face.templates.length}`, '#22c55e') : UI.badge('yo\'q', '#64748b')) },
      { render: (p) => `<div class="actions">
          <button class="btn btn-ghost btn-sm" data-pick="${p.id}">Tanlash</button>
          <button class="btn btn-ghost btn-sm" data-hist="${p.id}">Tarix</button>
          <button class="btn btn-ghost btn-sm" data-del-p="${p.id}">O'chirish</button>
        </div>` }
    ], 9, "Bemorlar yo'q — 'Yangi bemor ro'yxatga olish' tugmasini bosing (camera sahifasi)");

    $('#patientRows').onclick = async (e) => {
      const pick = e.target.dataset.pick;
      const del = e.target.dataset.delP;
      const hist = e.target.dataset.hist;
      if (pick) {
        state.patientId = pick;
        $('#patientSelect').value = pick;
        const p = state.patients.find((x) => x.id === pick);
        if (p && p.lastRate != null) { syncRate(p.lastRate); recalc(); }
        UI.toast(`Tanlandi: ${p?.name}`, 'ok');
        goTab('vision');
      }
      if (hist) {
        const p = state.patients.find((x) => x.id === hist);
        if (p) openHistory(p);
      }
      if (del) {
        if (!UI.confirmBox('Bemor o\'chirilsinmi? (yuz namunalari ham o\'chadi)')) return;
        await Store.patients.remove(del);
        if (state.patientId === del) state.patientId = '';
        if (state.identified && state.identified.id === del) clearIdentity();
        await loadPatients();
        UI.toast('Bemor o\'chirildi', 'ok');
      }
    };
  }

  async function addPatient(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const row = await Store.patients.create({
      name: f.get('name').trim(),
      dept: f.get('dept').trim(),
      year: Number(f.get('year')),
      phone: (f.get('phone') || '').trim(),
      lastRate: state.rate,
      riskLabel: state.analysis?.risk.label,
      riskColor: state.analysis?.risk.color
    });
    state.patients.push(row);
    await loadPatients();
    UI.closeModal('modalPatient');
    e.target.reset();
    UI.toast('Bemor qo\'shildi', 'ok');
  }

  /* ============================== QUEUE ============================= */
  async function loadReferrals() {
    state.referrals = await Store.referrals.list();
    state.referrals.sort((a, b) => (a.status === 'new' ? -1 : 1) - (b.status === 'new' ? -1 : 1) || new Date(b.createdAt) - new Date(a.createdAt));
    const fresh = state.referrals.filter((r) => r.status === 'new').length;
    $('#queueCount').textContent = fresh;
    renderQueue();
  }

  const STATUSES = [
    ['new', 'Yangi', 's-new'],
    ['seen', 'Ko\'rildi', 's-seen'],
    ['treat', 'Davolanyapti', 's-treat'],
    ['done', 'Yopildi', 's-done']
  ];

  function renderQueue() {
    const box = $('#queueList');
    if (!state.referrals.length) {
      box.innerHTML = `<div class="empty" style="text-align:center;color:var(--muted);padding:34px">Navbat bo'sh. "Camera skriningi" sahifasida tahlil o'tkazib, yo'llanma yarating.</div>`;
      return;
    }
    box.innerHTML = state.referrals.map((r) => {
      const st = STATUSES.find((s) => s[0] === r.status) || STATUSES[0];
      return `
      <div class="q-item" style="--b:${r.riskColor || '#94a3b8'}">
        <div class="q-head">
          <div>
            <h4>${r.patientName || r.patient?.name || 'Nomalum bemor'} ${UI.badge(r.riskLabel, r.riskColor || '#94a3b8')}</h4>
            <div class="q-meta">${UI.dateStr(r.createdAt)} · ${r.place} · muddat: <b>${r.deadline}</b></div>
          </div>
          <span class="status ${st[1] ? st[2] : ''}">${st[1]}</span>
        </div>
        <div class="q-body">
          <div>
            <div><b>Doza:</b> ${r.rate} µSv/soat · bugungi ${Math.round(r.dayPercent)}% · yillik ${Math.round(r.yearPercent)}%</div>
            <div><b>Sog'lik yo'qotish:</b> ${r.healthLoss}% · <b>saraton xavfi:</b> ${r.cancerRiskPercent}%</div>
            <div><b>ICD:</b> ${(r.icd || []).join('; ')}</div>
            <div class="q-meta">${r.note || ''}</div>
          </div>
          <div>
            <b>Tahlillar:</b><ul>${(r.tests || []).map((t) => `<li>${t}</li>`).join('')}</ul>
            ${r.meds?.length ? `<b>Dori (shifokor nazoratida):</b><ul>${r.meds.map((m) => `<li>${m}</li>`).join('')}</ul>` : ''}
          </div>
        </div>
        <div class="q-actions">
          ${STATUSES.map((s) => `<button class="btn btn-ghost btn-sm" data-status="${s[0]}" data-id="${r.id}" ${r.status === s[0] ? 'disabled' : ''}>${s[1]}</button>`).join('')}
          <button class="btn btn-ghost btn-sm" data-print="${r.id}">🖨 Chop etish</button>
          <button class="btn btn-ghost btn-sm" data-del="${r.id}">O'chirish</button>
        </div>
      </div>`;
    }).join('');

    box.onclick = async (e) => {
      const t = e.target;
      if (t.dataset.status) {
        await Store.referrals.update(t.dataset.id, { status: t.dataset.status });
        await loadReferrals();
        UI.toast('Holat yangilandi', 'ok');
      }
      if (t.dataset.print) printReferral(state.referrals.find((r) => r.id === t.dataset.print));
      if (t.dataset.del) {
        if (!UI.confirmBox('Yo\'llanma o\'chirilsinmi?')) return;
        await Store.referrals.remove(t.dataset.del);
        await loadReferrals();
      }
    };
  }

  // Support / test uchun kichik hook (xavfsiz, faqat o'qish-mutatsiya)
  window.RadDebug = { state, feedIdentity, confirmIdentity, clearIdentity, runAnalysis, loadPatients, loadUserFaces };
})();
