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
    userFaces: [],          // registratsiyada yuz qo'shilgan xodimlar (serverdan)
    chartRangeHours: 24,
    patientSearch: '',
    patientFilter: 'all',
    queueFilter: 'all',
    adminUserSearch: '',
    adminUsers: [],
    lastSnapshot: null
  };

  const engine = new window.VisionEngine.VisionEngine({
    video: $('#camVideo'),
    overlay: $('#camOverlay'),
    onFrame: onVisionFrame
  });

  /* ============================== INIT ============================== */
  let booted = false;

  document.addEventListener('DOMContentLoaded', () => {
    window.Auth.setAfterAuth(() => boot());      // kirish — reloadsiz, darhol ilova
    window.Auth.showScreen();                    // login oynasi darhol ko'rinadi
    window.Auth.restore(10000).then((ok) => {
      if (ok) {
        window.Auth.hideScreen();
        boot();
      }
    });
  });

  async function boot() {
    if (booted) return;
    booted = true;
    I18n.apply();                            // tanlangan tilni (uz/ru) qo'llash
    buildTabs();
    applyHash();
    window.addEventListener('hashchange', applyHash);
    buildSymptoms();
    buildZones();
    buildLimitsTables();
    bindControls();
    buildFaceIdPanel();
    bindAiPanel();
    bindAlcohol();
    startClock();
    initFaceId();
    loadUserFaces();
    await checkApi();
    await loadPatients();
    await loadReferrals();
    syncRate(C.BACKGROUND.typical);
    recalc();
    window.addEventListener('resize', () => renderChart());

    // Til o'zgarganda — statik matnlar I18n.apply() da, dinamiklar shu yerda
    I18n.onLang(() => refreshLang());
    console.info('%cRadSkrin ready', 'color:#22d3ee');
  }

  /** Til almashtirilganda ko'rinishni yangilash */
  async function refreshLang() {
    checkApi();
    updateStatus();
    renderPatients();
    renderQueue();
    const active = UI.$$('.tab').find((b) => b.classList.contains('active'));
    if (active && active.dataset.tab === 'admin') loadAdminUsers();
    if (state.aiDiag) renderAiPanel(state.aiDiag);
    buildFaceIdPanel();
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

  /** URL hash orqali tab va elementga o'tish: #vision / #vision/aiCard */
  function applyHash() {
    const raw = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    if (!raw) return;
    const [tab, sel] = raw.split('/');
    goTab(tab);
    if (sel) {
      const el = document.getElementById(sel);
      if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 60);
    } else {
      window.scrollTo(0, 0);
    }
  }

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
      el.classList.remove('bad');
      el.innerHTML = `<span class="dot"></span> ${I18n.t('top.server.on')}`;
      void j;
    } catch {
      const el = $('#apiStatus');
      el.classList.add('bad');
      el.classList.remove('ok');
      el.innerHTML = `<span class="dot"></span> ${I18n.t('top.server.off')}`;
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

    // Tovush (audio) tugmasi
    const btnAudio = $('#btnAudioToggle');
    if (btnAudio) {
      const updateAudioIcon = () => {
        const on = window.RadAudio && window.RadAudio.isEnabled;
        $('#iconSound').textContent = on ? '🔊' : '🔇';
        btnAudio.classList.toggle('muted', !on);
        btnAudio.title = on ? I18n.t('top.sound.on') : I18n.t('top.sound.off');
      };
      btnAudio.addEventListener('click', () => {
        const nowEnabled = window.RadAudio.toggle();
        updateAudioIcon();
        UI.toast(nowEnabled ? I18n.t('top.sound.on') : I18n.t('top.sound.off'), 'info');
      });
      updateAudioIcon();
    }

    // Til tanlagichlar (UZ / RU / EN)
    document.querySelectorAll('[data-set-lang]').forEach((b) => {
      b.addEventListener('click', () => {
        I18n.setLang(b.dataset.setLang);
        if (window.RadAudio) window.RadAudio.playUiClick();
      });
    });

    // Favqulodda ogohlantirish banneri tugmalari
    const bMute = $('#btnMuteAlert');
    if (bMute) {
      bMute.addEventListener('click', () => {
        if (window.RadAudio) window.RadAudio.stopAlarm();
        UI.toast('Signal ovozi to\'xtatildi', 'info');
      });
    }
    const bAlertRef = $('#btnAlertReferral');
    if (bAlertRef) {
      bAlertRef.addEventListener('click', () => quickReferral());
    }

    // Grafik vaqt diapazoni (24s / 6s / 1s)
    UI.$$('#chartRangeSeg .seg-btn').forEach((b) => {
      b.addEventListener('click', () => {
        UI.$$('#chartRangeSeg .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
        state.chartRangeHours = Number(b.dataset.range) || 24;
        renderChart();
        if (window.RadAudio) window.RadAudio.playUiClick();
      });
    });

    // kamera
    $('#btnCamStart').addEventListener('click', startCamera);
    $('#btnCamStartHero')?.addEventListener('click', startCamera);
    $('#btnCamStop').addEventListener('click', stopCamera);
    const bSnap = $('#btnCamSnap');
    if (bSnap) bSnap.addEventListener('click', () => takeScreeningSnapshot());
    $('#imgInput').addEventListener('change', onImageUpload);

    // 3D va Kamera Tanlash
    $('#camDeviceSelect')?.addEventListener('change', async (e) => {
      const devId = e.target.value;
      if (!devId) return;
      if (engine && engine.running) {
        try {
          await engine.start(devId);
          UI.toast(`Kamera almashtirildi: ${e.target.options[e.target.selectedIndex].text}`, 'ok');
        } catch (err) {
          UI.toast(`Kamera almashtirishda xato: ${err.message}`, 'error');
        }
      } else if (engine) {
        engine.selectedDeviceId = devId;
      }
    });

    $('#btnToggle3D')?.addEventListener('click', () => {
      if (!engine) return;
      const on = engine.toggle3D();
      const btn = $('#btnToggle3D');
      if (btn) {
        btn.textContent = on ? '🧊 3D Rejim: FAOL' : '⬜ 3D Rejim: O\'CHIQ';
        btn.style.color = on ? '#00e5a3' : '#94a3b8';
        btn.style.borderColor = on ? 'rgba(0, 229, 163, 0.5)' : 'rgba(148, 163, 184, 0.3)';
      }
      UI.toast(on ? '3D Fazoviy Biometriya yoqildi' : '2D Oddiy rejimga o\'tildi', 'ok');
    });

    // Tezkor klinik demo ssenariylar
    $('#btnScenarioSafe')?.addEventListener('click', () => runDemoScenario('safe'));
    $('#btnScenarioWarn')?.addEventListener('click', () => runDemoScenario('warn'));
    $('#btnScenarioDanger')?.addEventListener('click', () => runDemoScenario('danger'));

    // PWA O'rnatish hodisasi (Desktop / Mobile Standalone App)
    let deferredInstallPrompt = null;
    const btnInstall = $('#btnInstallApp');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      if (btnInstall) btnInstall.style.display = 'inline-flex';
    });
    if (btnInstall) {
      btnInstall.addEventListener('click', async () => {
        if (!deferredInstallPrompt) {
          UI.toast("Ilovani brauzer menyusi (Uch nuqta -> 'O'rnatish') orqali o'rnatishingiz mumkin", 'info', 6000);
          return;
        }
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          UI.toast("RadSkrin muvaffaqiyatli o'rnatildi!", 'ok');
          btnInstall.style.display = 'none';
        }
        deferredInstallPrompt = null;
      });
    }

    // tahlil
    $('#btnAnalyze').addEventListener('click', runAnalysis);
    $('#btnSaveReferral').addEventListener('click', saveReferral);
    $('#btnPrintReferral').addEventListener('click', () => printReferral(state.referral));

    // bemorlar qidiruvi va filtri
    const pSearch = $('#patientSearch');
    if (pSearch) {
      pSearch.addEventListener('input', (e) => {
        state.patientSearch = e.target.value.toLowerCase().trim();
        renderPatients();
      });
    }
    UI.$$('#patientFilterPills .filter-pill').forEach((b) => {
      b.addEventListener('click', () => {
        UI.$$('#patientFilterPills .filter-pill').forEach((x) => x.classList.toggle('active', x === b));
        state.patientFilter = b.dataset.pfilter || 'all';
        renderPatients();
        if (window.RadAudio) window.RadAudio.playUiClick();
      });
    });

    $('#btnAddPatient').addEventListener('click', () => UI.openModal('modalPatient'));
    $('#patientForm').addEventListener('submit', addPatient);
    $('#btnExportPatients').addEventListener('click', () => {
      const rows = state.patients.map((p) => ({
        FIO: p.name, Bolum: p.dept, TugilganYil: p.year, Telefon: p.phone || '',
        OxirgiDoza_uSv_h: p.lastRate ?? '', Risk: p.riskLabel || '', Sana: UI.dateStr(p.createdAt)
      }));
      Store.exportCsv(rows, 'bemorlar.csv') || UI.toast("Ma'lumot yo'q", 'warn');
    });

    // Shifokor navbati filtri
    UI.$$('#queueFilterPills .filter-pill').forEach((b) => {
      b.addEventListener('click', () => {
        UI.$$('#queueFilterPills .filter-pill').forEach((x) => x.classList.toggle('active', x === b));
        state.queueFilter = b.dataset.qfilter || 'all';
        renderQueue();
        if (window.RadAudio) window.RadAudio.playUiClick();
      });
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

    // Admin panel: qidiruv, backup, restore va yangilash
    const aSearch = $('#adminUserSearch');
    if (aSearch) {
      aSearch.addEventListener('input', (e) => {
        state.adminUserSearch = e.target.value.toLowerCase().trim();
        filterAdminUsers();
      });
    }

    const bBackup = $('#btnBackupDb');
    if (bBackup) {
      bBackup.addEventListener('click', () => {
        const backup = {
          app: 'RadSkrin',
          version: '2.0',
          exportedAt: new Date().toISOString(),
          patients: state.patients,
          referrals: state.referrals
        };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `radskrin_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        UI.toast('Zaxira nusxasi yuklab olindi (JSON)', 'ok');
      });
    }

    const inputRestore = $('#inputRestoreDb');
    if (inputRestore) {
      inputRestore.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          const txt = await file.text();
          const j = JSON.parse(txt);
          if (j.patients && Array.isArray(j.patients)) {
            for (const p of j.patients) await Store.patients.create(p);
          }
          if (j.referrals && Array.isArray(j.referrals)) {
            for (const r of j.referrals) await Store.referrals.create(r);
          }
          await loadPatients();
          await loadReferrals();
          UI.toast('Ma\'lumotlar tiklandi!', 'ok');
        } catch (err) {
          UI.toast('Tiklashda xatolik: ' + err.message, 'error');
        }
        e.target.value = '';
      });
    }

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

    // Global tezkor tugmalar (Keyboard Shortcuts)
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'm' || e.key === 'M') {
        const nowOn = window.RadAudio.toggle();
        const bA = $('#btnAudioToggle');
        if (bA) {
          $('#iconSound').textContent = nowOn ? '🔊' : '🔇';
          bA.classList.toggle('muted', !nowOn);
        }
        UI.toast(nowOn ? I18n.t('top.sound.on') : I18n.t('top.sound.off'), 'info');
      } else if (e.key === 'Escape') {
        UI.$$('.modal.open').forEach((m) => UI.closeModal(m.id));
      } else if (e.key >= '1' && e.key <= '6') {
        const tabNames = ['monitor', 'vision', 'patients', 'queue', 'admin', 'method'];
        const idx = Number(e.key) - 1;
        if (tabNames[idx]) goTab(tabNames[idx]);
      } else if (e.key === ' ' && $('#page-vision').classList.contains('active')) {
        e.preventDefault();
        runAnalysis();
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
    if (window.RadAudio) window.RadAudio.updateRate(state.rate);
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

    // Topbar jonli threat pill
    const tp = $('#threatPill');
    if (tp) {
      $('#threatPillRate').textContent = `${a.doses.rate} µSv/h`;
      $('#threatPillLabel').textContent = a.tier.label;
      tp.className = `threat-pill ${a.tier.key}`;
    }

    // Favqulodda ogohlantirish banneri (agar doza me'yordan yuqori bo'lsa)
    const alertBanner = $('#alertBanner');
    if (alertBanner) {
      if (a.doses.rate >= 1.0) {
        alertBanner.hidden = false;
        const ratio = (a.doses.rate / C.BACKGROUND.typical).toFixed(1);
        $('#alertBannerTitle').textContent = a.doses.rate >= 5.0
          ? `☣️ FAVQULODDA RADIATSIYA XAVFI! (${a.doses.rate} µSv/h)`
          : `⚠️ DIQQAT: RADIATSIYA ME'YORDAN YUQORI! (${a.doses.rate} µSv/h)`;
        $('#alertBannerText').textContent = `Joriy doza tabiiy fondan ${ratio} baravar oshgan (${a.doses.rate} µSv/soat). Hududdagi xodimlar shaxsiy himoya vositalarini taqsin va zaxira hududiga o'tsin!`;
      } else {
        alertBanner.hidden = true;
      }
    }

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
    const rangeMs = (state.chartRangeHours || 24) * 3600 * 1000;
    const now = Date.now();
    const filteredHistory = state.history.filter((d) => now - d.t <= rangeMs);
    const displayData = filteredHistory.length >= 2 ? filteredHistory : state.history;

    UI.lineChart($('#doseChart'), displayData, {
      color: '#22d3ee',
      threshold: 1.0
    });

    if (displayData.length) {
      const vals = displayData.map((d) => d.v);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
      if ($('#statMin')) $('#statMin').textContent = `${min.toFixed(2)} µSv/h`;
      if ($('#statAvg')) $('#statAvg').textContent = `${avg.toFixed(2)} µSv/h`;
      if ($('#statMax')) $('#statMax').textContent = `${max.toFixed(2)} µSv/h`;
    }

    const t0 = new Date(displayData[0]?.t || Date.now());
    const t1 = new Date(displayData[displayData.length - 1]?.t || Date.now());
    $('#chartMeta').textContent = `${UI.timeStr(t0)} → ${UI.timeStr(t1)} · chegara 1.0 µSv/h`;
  }

  /* ============================== CAMERA ============================= */
  function takeScreeningSnapshot() {
    const vid = $('#camVideo');
    const overlay = $('#camOverlay');
    if (!vid || vid.videoWidth < 10) return UI.toast('Kamera tasviri mavjud emas', 'warn');

    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = vid.videoWidth;
    snapCanvas.height = vid.videoHeight;
    const ctx = snapCanvas.getContext('2d');

    // Video kadrini chizish
    ctx.drawImage(vid, 0, 0);

    // Overlay ni ustiga qo'shish
    if (overlay && overlay.width > 0) {
      ctx.drawImage(overlay, 0, 0, snapCanvas.width, snapCanvas.height);
    }

    // Telemetriya shtampi (NMKG · RadSkrin va sana)
    ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';
    ctx.fillRect(0, snapCanvas.height - 30, snapCanvas.width, 30);
    ctx.fillStyle = '#22d3ee';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`RADSKRIN NMKG · ${UI.dateStr()} · ${state.rate} µSv/h`, 10, snapCanvas.height - 10);

    const dataUrl = snapCanvas.toDataURL('image/jpeg', 0.88);
    state.lastSnapshot = dataUrl;

    if (state.patientId) {
      const p = state.patients.find((x) => x.id === state.patientId);
      if (p) {
        p.thumb = dataUrl;
        Store.patients.update(p.id, { thumb: dataUrl });
        renderPatients();
      }
    }

    if (window.RadAudio) window.RadAudio.playUiClick();
    UI.toast(I18n.t('msg.snap.saved'), 'ok');
  }

  async function populateCameraDevices() {
    const sel = $('#camDeviceSelect');
    if (!sel || !engine || !engine.getCameraDevices) return;
    try {
      const devices = await engine.getCameraDevices();
      if (!devices || !devices.length) return;
      sel.innerHTML = '';
      let irFound = false;
      devices.forEach((d, idx) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        const label = d.label || `Kamera ${idx + 1}`;
        const isIR = /ir|infra|3d|depth|hello/i.test(label);
        if (isIR) irFound = true;
        opt.textContent = isIR ? `⚡ ${label} (3D IR datchik)` : `📷 ${label}`;
        sel.appendChild(opt);
      });
      if (engine.selectedDeviceId) sel.value = engine.selectedDeviceId;
      const b3d = $('#cam3dBadge');
      if (b3d) b3d.textContent = irFound ? '[ASUS IR 3D DATCHIK BIRIKTIRILDI]' : '[3D FAZOVIY MATRIX FAOL]';
    } catch {}
  }

  async function startCamera() {
    try {
      await engine.start();
      populateCameraDevices();
      $('#camPlaceholder').classList.add('hide');
      $('#camState').hidden = false;
      $('#btnCamStart').disabled = true;
      $('#btnCamStop').disabled = false;
      if ($('#btnCamSnap')) $('#btnCamSnap').disabled = false;
      $('#camHint').textContent = 'Yuzni ichki ramkada ushlang, yuzga yorug\'lik tushsin. Puls uchun 6–12 soniya tinch turish kerak.';
      updateStatus();
      UI.toast('Kamera yoqildi — 3D fazoviy yuz skriningi boshlandi', 'ok');
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
    if ($('#btnCamSnap')) $('#btnCamSnap').disabled = true;
    resetCamMetrics();
    clearIdentity();
    setBanner('none');
    updateStatus();
  }

  function resetCamMetrics() {
    ['cPresence', 'cPallor', 'cPulse', 'cStability'].forEach((id) => (document.getElementById(id).textContent = '—'));
    ['barPresence', 'barPallor', 'barPulse', 'barStability'].forEach((id) => UI.progress(document.getElementById(id), 0));
    if ($('#liveBpmTxt')) $('#liveBpmTxt').textContent = '— bpm';
  }

  let lastPulseBeep = 0;
  function onVisionFrame(f) {
    state.vision = f;

    // alkogol: duranglik testi faol bo'lsa — kadrni yig'amiz
    if (window.AlcoholTest && AlcoholTest.swayRunning) AlcoholTest.swayFeed(f);

    $('#cPresence').textContent = f.found ? `${f.presence}%` : 'aniqlanmadi';
    $('#cPallor').textContent = f.pallor == null ? '—' : `${f.pallor}`;
    $('#cPulse').textContent = f.pulse ? `${f.pulse} bpm` : (f.parsed ? 'puls kutilmoqda...' : '—');
    $('#cStability').textContent = f.found ? `${Math.round(f.stability)}%` : '—';

    // rPPG Jonli fotopletizmogramma to'lqini (EKG)
    if (f.ppgSamples && f.ppgSamples.length >= 2) {
      const pCanvas = $('#pulseCanvas');
      if (pCanvas) {
        UI.pulseWave(pCanvas, f.ppgSamples, { color: f.pulse ? '#22c55e' : '#38bdf8' });
      }
    }
    const bpmTxt = $('#liveBpmTxt');
    if (bpmTxt) {
      bpmTxt.textContent = f.pulse ? `${f.pulse} bpm` : (f.found ? 'o\'lchanmoqda...' : '— bpm');
    }

    // Biometrik puls tovushi (agar yurak urishi aniqlangan bo'lsa)
    if (f.pulse && Date.now() - lastPulseBeep > (60000 / f.pulse)) {
      lastPulseBeep = Date.now();
      if (window.RadAudio && Math.random() < 0.3) window.RadAudio.playHeartbeat();
    }

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

    // 3D Top HUD Telemetry
    if (f.pose3d) {
      const cm = $('#cthMode');
      if (cm) cm.textContent = `3D POSE: Y ${f.pose3d.yaw}° P ${f.pose3d.pitch}°`;
      const cf = $('#cthFps');
      if (cf) cf.textContent = `Z: ${f.pose3d.zDepthCm} cm`;
    }

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
    if (window.RadAudio) window.RadAudio.playLockChime();

    // AI ovozli salomlashish (uz-UZ-MadinaNeural)
    const greeting = isUser
      ? `Assalomu alaykum, ${person.name}! Shaxsingiz Face ID orqali tasdiqlandi. 3D biometrik nazorat faol.`
      : `Assalomu alaykum, ${person.name}! Shaxsingiz tasdiqlandi. Tibbiy skrining boshlandi.`;
    aiSay(greeting, 'uz');

    // AI: ism + kasalliklar xulosasi (ekran)
    runAiDiagnosis({ person, auto: true, voice: false });
  }

  function clearIdentity() {
    state.identified = null;
    state.identScore = 0;
    state.streak = { id: null, n: 0 };
    setBanner('none');
    updateStatus();
    resetAiPanel();
  }

  function setBanner(kind, html) {
    const el = $('#idBanner');
    if (!el) return;
    if (kind === 'none') { el.hidden = true; }
    else {
      el.hidden = false;
      el.className = `id-banner show b-${kind}`;
      if (el.dataset.k !== kind + (html || '')) {
        el.innerHTML = html || '';
        el.dataset.k = kind + (html || '');
      }
    }
    updateHud(kind);
  }

  /* AI HUD: kadr ichida "bijr-bijr" chiqadigan shaxs kartochkasi */
  function updateHud(kind) {
    const hud = $('#aiHud');
    const frame = $('#camFrame');
    if (!hud) return;
    const id = state.identified;
    const show = !!id && (kind === 'ok' || kind === 'candidate');
    hud.hidden = !show;
    if (frame) frame.classList.toggle('ai-on', show);

    if (!show) return;
    const sub = id.kind === 'user'
      ? `AI · xodim · ${id.role || ''}`.trim()
      : `AI · bemor · ${id.dept || ''}`.trim();
    $('#hudName').textContent = id.name || '—';
    $('#hudSub').textContent = sub;
    $('#hudPct').textContent = `MATCH ${state.identScore || 0}% · ICD SYNC OK`;
  }

  function updateStatus() {
    const txt = $('#faceStatusText');
    const box = $('#faceStatus');
    if (!txt) return;
    if (state.identified) {
      const p = state.identified;
      box.className = 'faceid-status fs-ok';
      txt.innerHTML = p.kind === 'user'
        ? `<b>${esc(p.name)}</b> · ${esc(p.role)} · ${I18n.t('faceid.match')} ${state.identScore}%`
        : `<b>${esc(p.name)}</b> · ${p.year} · ${esc(p.dept)} · ${I18n.lang === 'ru' ? 'визиты' : 'tashriflar'}: ${(p.visits || []).length} · ${I18n.t('faceid.match')} ${state.identScore}%`;
      updateHud('ok');
    } else if (!engine.running) {
      box.className = 'faceid-status';
      txt.textContent = I18n.t('faceid.off');
      updateHud('none');
    } else {
      box.className = 'faceid-status fs-wait';
      txt.textContent = identityPool().length
        ? I18n.t('faceid.wait')
        : I18n.t('faceid.noface');
      updateHud('none');
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
        nationality: u.nationality || '',
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

  /* ==================== AI: KLINIK XULOSA + OVOZ ===================== */
  const AIG = () => ({
    bor: I18n.t('ai.bor'), shubha: I18n.t('ai.shubha'), yoq: I18n.t('ai.yoq')
  });

  function aiPerson() {
    if (state.identified) return state.identified;
    if (state.patientId) return state.patients.find((p) => p.id === state.patientId) || null;
    return null;
  }

  function runAiDiagnosis(opts = {}) {
    const person = opts.person !== undefined ? opts.person : aiPerson();
    if (!window.AIDiag) return null;

    if (!person) {
      state.aiDiag = null;
      renderAiPanel(null);
      return null;
    }

    // joriy holat bo'yicha to'liq tahlil (tashrif yozilmaydi)
    if (!state.vision && engine.running) state.vision = engine.latest;
    const a = M.analyze({
      rateUSvH: state.rate,
      vision: state.vision,
      symptoms: [...state.symptoms]
    });
    state.analysis = a;

    const res = window.AIDiag.diagnose({ a, person, symptoms: [...state.symptoms] });
    state.aiDiag = res;
    renderAiPanel(res);

    // tahlil tugagach — AI ovozda qisqa xabar bersin (suhbat boshlansin)
    if (opts.voice !== false && res && window.AIChat) {
      const g = window.AIChat.ask('tahlil', res, res.lang);
      setTimeout(() => aiSay(g.text, g.lang), 400);
    }

    return res;
  }

  function renderAiPanel(res) {
    const boxPerson = $('#aiPerson');
    const boxEmpty = $('#aiEmpty');
    const boxGroups = $('#aiGroups');
    if (!boxPerson) return;

    if (!res) {
      boxPerson.hidden = true;
      boxEmpty.hidden = false;
      boxGroups.hidden = true;
      boxGroups.innerHTML = '';
      return;
    }

    boxPerson.hidden = false;
    boxEmpty.hidden = true;
    boxGroups.hidden = false;

    const p = res.person || {};
    const thumbEl = $('#aiThumb');
    if (thumbEl) {
      if (p.thumb) {
        const img = document.createElement('img');
        img.className = 'thumb lg';
        img.id = 'aiThumb';
        img.src = p.thumb;
        img.alt = '';
        thumbEl.replaceWith(img);
      } else if (thumbEl.tagName !== 'DIV') {
        const div = document.createElement('div');
        div.className = 'thumb lg';
        div.id = 'aiThumb';
        div.textContent = '👤';
        thumbEl.replaceWith(div);
      }
    }
    $('#aiName').textContent = res.personName || "Noma'lum shaxs";
    $('#aiMeta').textContent = p.kind === 'user'
      ? `${p.role || 'xodim'} · o'xshashlik ${state.identScore}%`
      : [p.year ? `${p.year} yil` : '', p.dept || '', state.identScore ? `o'xshashlik ${state.identScore}%` : '']
          .filter(Boolean).join(' · ') || 'Face ID tasdiqlangan';
    $('#aiHeadline').textContent =
      `${res.headline} · ${res.counts.bor} bor, ${res.counts.shubha} shubha, ${res.counts.yoq} yo'q`;

    const groups = ['bor', 'shubha', 'yoq'];
    const ru = res.lang === 'ru';   // shaxs rus millatidan bo'lsa — ruscha nomlar
    boxGroups.innerHTML = groups.map((k) => {
      const items = res.items.filter((i) => i.status === k);
      const st = window.AIDiag.STATUS[k];
      return `
      <div class="ai-g ${k}">
          <div class="ai-g-head"><span>${st.label} — ${AIG()[k]}</span><span class="cnt">${items.length}</span></div>
        <div class="ai-g-body">
          ${items.length ? items.map((i) => `
            <div class="ai-item" style="--b:${i.color}">
              <div class="ai-item-top">
                <span class="ai-item-name">${esc(ru ? i.nameRu : i.name)}</span>
                <span class="ai-item-icd">${esc(i.icd)}</span>
              </div>
              <div class="ai-item-score">${ru ? 'уверенность' : 'ishonch'}: ${i.score}% · ${ru ? 'группа' : 'guruh'}: ${esc(i.group)}</div>
              ${i.ev.length ? `<ul>${i.ev.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
              ${i.status !== 'yoq' && i.advice ? `<div class="ai-item-advice">💊 ${esc(ru ? i.adviceRu : i.advice)}</div>` : ''}
            </div>`).join('')
            : `<div class="ai-g-empty">— ${k === 'yoq' ? (ru ? 'Список пуст' : "Ro'yxat bo'sh") : (ru ? 'Не обнаружено' : 'Aniqlanmadi')} —</div>`}
        </div>
      </div>`;
    }).join('');
  }


  function resetAiPanel() {
    state.aiDiag = null;
    renderAiPanel(null);
  }

  function bindAiPanel() {
    const btnRun = $('#btnAiRun');
    if (btnRun) btnRun.addEventListener('click', () => {
      const r = runAiDiagnosis({});
      if (r) UI.toast(`AI tahlili yangilandi: ${r.headline}`, r.counts.bor ? 'warn' : 'ok');
      else UI.toast("Shaxs/bemor tanlanmagan", 'warn');
    });

    bindAiChat();
  }

  /* ==================== ALKOHOL ANIQLASH (5 signal) ====================== */

  const alc = { reactionMs: null, jitter: null, bac: null, selfScore: null, result: null };

  /** Yakuniy natijani hisoblash + chizish */
  function alcCompute() {
    const A = window.AlcoholTest;
    if (!A) return null;

    const self = A.selfReport({
      counts: alcDrinks(),
      weight: Number(($('#alcWeight') || {}).value) || 75,
      hours: Number(($('#alcHours') || {}).value) || 1,
      sex: (($('#alcSex') || {}).value) || 'male',
      behaviour: (($('#alcBehaviour') || {}).value) || 'no'
    });
    alc.bac = self.bac;
    alc.selfScore = self.score;

    const v = state.vision || (engine && engine.latest) || null;
    const res = A.compute({
      reactionMs: alc.reactionMs,
      jitter: alc.jitter,
      redness: v ? v.redness : null,
      pulse: v ? v.pulse : null,
      bac: self.bac,
      selfScore: self.score
    });
    alc.result = res;
    alcRender(res, self);
    return res;
  }

  function alcRender(res, self) {
    const scoreEl = $('#alcScore'), arc = $('#alcArc');
    const verdict = $('#alcVerdict'), conf = $('#alcConf'), bacEl = $('#alcBac');
    const adv = $('#alcAdvice');
    if (!scoreEl) return;

    if (!res || !res.signals.length) {
      scoreEl.textContent = '—';
      verdict.textContent = 'Hech bir signal yig\'ilmadi';
      verdict.style.background = 'rgba(148,163,184,.12)';
      return;
    }

    scoreEl.textContent = res.score;
    scoreEl.style.color = res.color;
    conf.textContent = 'ishonch ' + res.confidence + '% (' + res.signals.length + '/5 signal)';
    if (arc) {
      arc.style.stroke = res.color;
      arc.style.strokeDashoffset = String(157 - (157 * res.score) / 100);
    }
    verdict.textContent = res.verdict;
    verdict.style.background = res.color + '26';
    verdict.style.color = res.color;

    bacEl.textContent = res.bac != null
      ? `Qon alkogoli (Widmark): ${res.bac}%  ·  ichilgan: ${self ? self.grams : 0} g etanol`
      : 'Qon alkogoli: savolnoma bo\'yicha hisoblanmadi';

    adv.innerHTML = (res.advice || []).map((t) => '<li>' + esc(t) + '</li>').join('');

    // signal qiymatlarini panelga chiqarish
    const map = { sway: 'Sway', reaction: 'React', voice: 'Voice', physio: 'Phys', self: 'Self' };
    res.signals.forEach((s) => {
      const key = map[s.id];
      if (!key) return;
      const box = document.getElementById('alcV' + key);
      if (box) {
        box.textContent = s.id === 'sway' ? s.value + ' px'
          : s.id === 'reaction' ? s.value + ' ms'
          : s.id === 'voice' ? s.value + '% jitter'
          : s.id === 'self' ? s.value
          : (s.value || '—');
      }
      const bar = document.getElementById('alcB' + key);
      if (bar) {
        bar.style.width = Math.round(s.n) + '%';
        bar.style.background = s.n < 20 ? '#22c55e' : s.n < 45 ? '#eab308' : s.n < 70 ? '#f97316' : '#ef4444';
      }
    });
    // mavjud bo'lmagan signallarni xiralashtirish
    const present = res.signals.map((s) => s.id);
    const ids = { sway: 'Sway', reaction: 'React', voice: 'Voice', physio: 'Phys', self: 'Self' };
    Object.keys(ids).forEach((k) => {
      const sig = document.querySelector('.alc-sig[data-sig="' + (k === 'physio' ? 'physio' : k) + '"]');
      if (sig) sig.classList.toggle('dim', !present.includes(k === 'physio' ? 'physio' : k));
    });
  }

  function alcDrinks() {
    const out = {};
    const box = $('#alcDrinks');
    if (!box) return out;
    box.querySelectorAll('input[data-drink]').forEach((i) => {
      const n = Number(i.value) || 0;
      if (n > 0) out[i.dataset.drink] = n;
    });
    return out;
  }

  function buildAlcoholPanel() {
    const box = $('#alcDrinks');
    if (box) {
      const A = window.AlcoholTest;
      box.innerHTML = Object.keys(A.DRINKS).map((k) =>
        `<label class="alc-drink"><span>${A.DRINKS[k].label}</span>` +
        `<input type="number" data-drink="${k}" min="0" max="30" step="1" value="0" /></label>`
      ).join('');
      box.addEventListener('change', () => alcCompute());
    }
    ['#alcHours', '#alcWeight', '#alcSex', '#alcBehaviour'].forEach((sel) => {
      const el = $(sel);
      if (el) el.addEventListener('change', () => alcCompute());
    });
  }

  function bindAlcohol() {
    const A = window.AlcoholTest;
    if (!A) return;
    buildAlcoholPanel();

    // duranglik: kamera 6 soniya yig'adi
    const bSway = $('#btnAlcSway');
    if (bSway) bSway.addEventListener('click', async () => {
      if (A.swayRunning) { A.swayStop(); bSway.textContent = 'duranglik (kamera)'; return; }
      if (!state.vision) {
        UI.toast('Avval kamerani yoqing (Kamera)', 'warn');
        return;
      }
      A.swayStart();
      bSway.textContent = '⏳ yig\'ilmoqda…';
      setTimeout(() => {
        A.swayStop();
        bSway.textContent = 'duranglik (kamera)';
        const r = A.swayResult();
        if (r.px == null) { UI.toast('Yuz barqaror emas — qayta urinib ko\'ring', 'warn'); return; }
        UI.toast(`Duranglik: ${r.px.toFixed(1)} px (${r.n} kadr)`, 'ok');
        alcCompute();
      }, 6000);
    });

    // ovoz: ~4 soniya mikrofon
    const bVoice = $('#btnAlcVoice');
    if (bVoice) bVoice.addEventListener('click', async () => {
      if (A.voiceActive) { A.voiceStop(); return; }
      if (VoiceIn && VoiceIn.listening) { UI.toast('Avval mikrofonni to\'xtating', 'warn'); return; }
      UI.toast('Mikrofonga gapiring (4 soniya)…', 'info');
      const ok = await A.voiceStart((r) => {
        alc.jitter = r.jitter;
        UI.toast(r.jitter != null
          ? `Ovoz jitter: ${r.jitter}% (${r.n} kad)`
          : 'Ovoz yetarli tahlil qilinmadi — qayta urinib ko\'ring', r.jitter != null ? 'ok' : 'warn');
        alcCompute();
      });
      if (!ok) UI.toast('Mikrofonga ruxsat bering', 'error');
    });

    // to'liq test: duranglik + reaktsiya + ovoz navbat bilan
    const bRun = $('#btnAlcRun');
    if (bRun) bRun.addEventListener('click', async () => {
      if (alc.busy) return;
      alc.busy = true;
      const rt = $('#alcRt');
      if (rt) rt.hidden = true;

      // 1) duranglik
      if (!state.vision) {
        UI.toast('Kamera yo\'q — duranglik o\'tkazildi', 'warn');
      } else {
        UI.toast('1/3 Duranglik testi — kamerni qimirlatmang…', 'info');
        A.swayStart();
        await new Promise((r) => setTimeout(r, 6000));
        A.swayStop();
        const sr = A.swayResult();
        UI.toast(sr.px != null ? `Duranglik: ${sr.px.toFixed(1)} px` : 'Duranglik: yig\'ilmadi', sr.px != null ? 'ok' : 'warn');
      }

      // 2) reaktsiya
      if (rt) rt.hidden = false;
      UI.toast('2/3 Reaktsiya testi — ekranni kuzating', 'info');
      await new Promise((resolve) => {
        A.reactionStart((med, trials) => {
          alc.reactionMs = med;
          UI.toast(med != null ? `Reaktsiya: ${med} ms (${trials.length} sinov)` : 'Reaktsiya o\'tkazilmadi', med != null ? 'ok' : 'warn');
          if (rt) rt.hidden = true;
          resolve();
        }, 6);
      });

      // 3) ovoz
      UI.toast('3/3 Ovoz testi — biror gap gapiring', 'info');
      const started = await A.voiceStart((r) => {
        alc.jitter = r.jitter;
        UI.toast(r.jitter != null ? `Jitter: ${r.jitter}%` : 'Ovoz tahlili yetmadi', r.jitter != null ? 'ok' : 'warn');
        alcCompute();
        alc.busy = false;
      });
      if (!started) { UI.toast('Mikrofon ruxsati kerak', 'error'); alc.busy = false; }

      alcCompute();
    });

    // kameradan duranglikni jonli yig'ish
    alcCompute();
  }

  /* ====================== AI SUHBAT (ovozli muloqot) ==================== */

  const chat = { lastAi: '', busy: false, history: [] };

  function chatAdd(kind, text) {
    const log = $('#aiChatLog');
    if (!log || !text) return null;
    const el = document.createElement('div');
    el.className = 'msg ' + kind;
    el.textContent = text;
    const ts = document.createElement('span');
    ts.className = 'ts';
    ts.textContent = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    el.appendChild(ts);
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function setMic(on) {
    const b = $('#btnAiMic');
    if (b) { b.classList.toggle('rec', !!on); b.textContent = on ? '⏹' : '🔺'; }
  }

  function setStop(on) {
    const b = $('#btnAiStop');
    if (b) b.disabled = !on;
  }

  /** AI javobini matn + ovozda aytish */
  function aiSay(text, lang) {
    chat.lastAi = text;
    chatAdd('ai', text);
    speakText(text, lang);
  }

  /** Brauzer ovozi (Web Speech API) — server TTS ishlamasa fallback */
  function browserSay(text, lang) {
    if (!('speechSynthesis' in window)) return false;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text || '').slice(0, 600));
      u.lang = lang === 'ru' ? 'ru-RU' : 'uz-UZ';
      const vs = window.speechSynthesis.getVoices() || [];
      const hit = vs.find((v) => /madina|female|woman|zira/i.test(v.name) && v.lang && v.lang.slice(0, 2).toLowerCase() === (lang === 'ru' ? 'ru' : 'uz'))
        || vs.find((v) => v.lang && v.lang.slice(0, 2).toLowerCase() === (lang === 'ru' ? 'ru' : 'uz'))
        || vs.find((v) => /female|woman/i.test(v.name));
      if (hit) u.voice = hit;
      window.speechSynthesis.speak(u);
      return true;
    } catch { return false; }
  }

  function speakText(text, lang) {
    if (!window.RemoteTTS) return;
    if (window.RadAudio && !window.RadAudio.isEnabled) return;
    const want = lang === 'ru' ? 'ru' : 'uz';
    RemoteTTS.stop();
    setStop(true);
    RemoteTTS.speak(text, want, {
      onend: () => setStop(false)
    }).then((ok) => {
      setStop(false);
      if (!ok && !browserSay(text, want)) UI.toast('Server ovozi ishlamayapti', 'warn');
    }).catch(() => setStop(false));
  }

  /** Foydalanuvchi savoliga javob: avval Gemini (LLM), ishlamasa — oflayn qoidalar */
  async function chatAsk(raw, fromVoice) {
    const q = String(raw || '').trim();
    if (!q || chat.busy) return;
    chatAdd('me', q);

    if (!window.AIChat) { chatAdd('ai', 'AI moduli yuklanmagan'); return; }

    const diag = state.aiDiag;
    const lang = window.AIChat.langOf(diag, aiPerson());

    if (fromVoice) {
      const el = $('#aiChatLang');
      if (el) el.textContent = lang === 'ru' ? 'til: русский' : "til: o'zbekcha";
    }

    chat.busy = true;
    const think = chatAdd('ai', '…');
    if (think) think.classList.add('live');

    let text = null;
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, lang, diag, history: chat.history.slice(-8) })
      });
      if (res.ok) {
        const j = await res.json();
        if (j && j.reply) text = j.reply;
      }
    } catch { /* tarmoq xatosi — oflaynga tushamiz */ }

    if (think && think.parentNode) think.parentNode.removeChild(think);

    if (!text) {
      // oflayn qoidalar dvijoki (fallback)
      const a = window.AIChat.ask(q, diag, lang, chat.history);
      text = a.text;
      chat.history.push({ role: 'user', text: q }, { role: 'ai', text });
      chat.busy = false;
      aiSay(text, lang);
      return;
    }

    chat.history.push({ role: 'user', text: q }, { role: 'ai', text });
    chat.busy = false;
    aiSay(text, lang);
  }

  function bindAiChat() {
    const form = $('#aiChatForm');
    const input = $('#aiChatInput');
    const btnSpeak = $('#btnAiSpeak');
    const btnStop = $('#btnAiStop');
    const btnMic = $('#btnAiMic');

    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input ? input.value : '';
      if (input) input.value = '';
      chatAsk(v, false);
    });

    if (btnSpeak) btnSpeak.addEventListener('click', () => {
      if (!chat.lastAi) { UI.toast('Avval savol bering', 'warn'); return; }
      const diag = state.aiDiag;
      speakText(chat.lastAi, window.AIChat ? window.AIChat.langOf(diag, aiPerson()) : 'uz');
    });

    if (btnStop) btnStop.addEventListener('click', () => {
      if (window.RemoteTTS) RemoteTTS.stop();
      setStop(false);
    });

    /* --------------------------- mikrofon --------------------------- */
    if (!window.VoiceIn || !VoiceIn.available) {
      if (btnMic) { btnMic.disabled = true; btnMic.title = 'Bu brauzerda mikrofon qo\'llab-quvvatlanmaydi'; }
      return;
    }

    let finalBuf = '';

    VoiceIn.on((text, interim) => {
      const live = $('#aiChatLive');
      if (interim) {
        if (live) { live.hidden = false; live.textContent = '🎧 eshitilmoqda: ' + text; }
        return;
      }
      if (live) { live.hidden = true; live.textContent = ''; }
      finalBuf = text;
      if (text) chatAsk(text, true);
    });

    VoiceIn.onState((st) => {
      setMic(st === 'listen');
      const live = $('#aiChatLive');
      if (st === 'listen') {
        finalBuf = '';
        if (live) { live.hidden = false; live.textContent = '🎧 gapiring…'; }
      } else if (st === 'idle' || st === 'error') {
        if (live && !finalBuf) { live.hidden = true; live.textContent = ''; }
        if (st === 'error') UI.toast('Mikrofon xatosi — ruxsat bering', 'error');
      }
    });

    if (btnMic) btnMic.addEventListener('click', () => {
      if (RemoteTTS && RemoteTTS.playing) RemoteTTS.stop();
      setStop(false);
      VoiceIn.start();
    });
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
      state.adminUsers = rows;
      filterAdminUsers();
    } catch (err) {
      UI.toast("Foydalanuvchilarni yuklab bo'lmadi: " + err.message, 'error');
    }
  }

  function filterAdminUsers() {
    let rows = state.adminUsers || [];
    if (state.adminUserSearch) {
      const q = state.adminUserSearch;
      rows = rows.filter((u) =>
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.login && u.login.toLowerCase().includes(q))
      );
    }
    renderAdminUsers(rows);
  }

  function renderAdminUsers(rows) {
    const meId = (window.Auth.user || {}).id;
    const cnt = $('#adminCount');
    if (cnt) cnt.textContent = `${rows.length} ta foydalanuvchi`;
    UI.renderRows($('#adminRows'), rows.map((r, i) => ({ ...r, i })), [
      { render: (r) => r.i + 1 },
      { render: (r) => `<b>${esc(r.name)}</b>${r.id === meId ? ' ' + UI.badge('siz', '#22d3ee') : ''}` },
      { render: (r) => esc(r.login) },
      { render: (r) => (r.nationality ? esc(I18n.nation(I18n.nationId(r.nationality))) : '—') },
      { render: (r) => UI.badge(r.role === 'doctor' ? I18n.t('auth.role.doctor') : I18n.t('auth.role.operator'), r.role === 'doctor' ? '#a78bfa' : '#22d3ee') },
      { render: (r) => r.hasFace ? UI.badge(`✓ ${r.faceCount} ${I18n.lang === 'ru' ? 'обр.' : 'namuna'}`, '#22c55e') : UI.badge(I18n.lang === 'ru' ? 'нет' : "yo'q", '#64748b') },
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

  /* ===================== TEZKOR KLINIK SSENARIYLAR =================== */
  function updateVisionUi(v) {
    if (!v) return;
    $('#cPresence').textContent = `${v.presence}%`;
    $('#cPallor').textContent = `${v.pallor}`;
    $('#cPulse').textContent = `${v.pulse} bpm`;
    $('#cStability').textContent = `${Math.round(v.stability)}%`;
    const bpmTxt = $('#liveBpmTxt');
    if (bpmTxt) bpmTxt.textContent = `${v.pulse} bpm`;
    UI.progress($('#barPresence'), v.presence, v.presence > 45 ? '#22c55e' : '#eab308');
    UI.progress($('#barPallor'), v.pallor, v.pallor > 55 ? '#22c55e' : '#eab308');
    UI.progress($('#barPulse'), Math.min(100, (v.pulse / 140) * 100), '#4ade80');
    UI.progress($('#barStability'), v.stability, '#38bdf8');
  }

  function runDemoScenario(key) {
    if (window.RadAudio) window.RadAudio.playUiClick();
    const chkContainer = $('#symptomChecks');
    const allChecks = chkContainer ? chkContainer.querySelectorAll('input[type="checkbox"]') : [];

    if (key === 'safe') {
      syncRate(0.16);
      state.symptoms.clear();
      allChecks.forEach((cb) => {
        cb.checked = false;
        cb.closest('.check')?.classList.remove('on');
      });
      state.vision = {
        found: true, parsed: true, presence: 96, pallor: 94, pulse: 72, pulseConfidence: 96,
        stability: 98, quality: 94, status: 'yuz barqarar',
        pose3d: { yaw: 2, pitch: -3, roll: 0, zDepthCm: 50 },
        landmarks: []
      };
      updateVisionUi(state.vision);
      runAnalysis({ speech: "1-ssenariy: Normal fon. Doza tezligi 0.16 mikro-zivert soat. Xodim sog'lom, me'yordan og'ish aniqlanmadi." });
      UI.toast("1-Ssenariy: Normal Fon (0.16 µSv/h) faollashtirildi", 'ok');
    } else if (key === 'warn') {
      syncRate(1.85);
      state.symptoms = new Set(['fatigue', 'dizzy']);
      allChecks.forEach((cb) => {
        const on = cb.value === 'fatigue' || cb.value === 'dizzy';
        cb.checked = on;
        cb.closest('.check')?.classList.toggle('on', on);
      });
      state.vision = {
        found: true, parsed: true, presence: 90, pallor: 62, pulse: 88, pulseConfidence: 90,
        stability: 88, quality: 86, status: 'yuz barqarar',
        pose3d: { yaw: -5, pitch: 4, roll: 1, zDepthCm: 48 },
        landmarks: []
      };
      updateVisionUi(state.vision);
      runAnalysis({ speech: "2-ssenariy: Doza me'yordan oshdi: 1.85 mikro-zivert soat. Sog'liq yo'qotish 34 foiz. Dispanser nazorati tavsiya etiladi." });
      UI.toast("2-Ssenariy: Sexda Doza Oshishi (1.85 µSv/h) faollashtirildi", 'warn');
    } else if (key === 'danger') {
      syncRate(14.2);
      state.symptoms = new Set(['nausea', 'redskin', 'fatigue', 'dizzy']);
      allChecks.forEach((cb) => {
        const on = ['nausea', 'redskin', 'fatigue', 'dizzy'].includes(cb.value);
        cb.checked = on;
        cb.closest('.check')?.classList.toggle('on', on);
      });
      state.vision = {
        found: true, parsed: true, presence: 84, pallor: 36, pulse: 114, pulseConfidence: 85,
        stability: 78, quality: 80, status: 'yuz barqarar',
        pose3d: { yaw: 8, pitch: -6, roll: -2, zDepthCm: 44 },
        landmarks: []
      };
      updateVisionUi(state.vision);
      runAnalysis({ speech: "Favqulodda holat! Doza tezligi 14.2 mikro-zivert soat! Zudlik bilan hududni tark eting va radiatsion gospitalga murojaat qiling!" });
      UI.toast("3-Ssenariy: Favqulodda Avariya (14.2 µSv/h) faollashtirildi!", 'error');
    }
  }

  /* ============================= ANALYSIS =========================== */
  function runAnalysis(opts = {}) {
    const vis = $('#visionRate');
    if (vis && vis.value !== '') {
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
    if (window.RadAudio) window.RadAudio.playSuccessChime();
    UI.toast(`Tahlil yakunlandi: ${a.healthLoss}% — ${a.risk.label}`, a.referralNeeded ? 'warn' : 'ok', 5000);

    // Ovozli xulosa (uz-UZ-MadinaNeural)
    if (opts.voice !== false) {
      const speechMsg = opts.speech || (a.healthLoss === 0
        ? `Klinik tahlil yakunlandi. Radiatsiya foni normal, ${a.doses.rate} mikro-zivert soat. Xodim sog'lom, ko'rsatkichlar me'yorda.`
        : `Klinik tahlil yakunlandi. Sog'liq yo'qotish koeffitsiyenti: ${a.healthLoss} foiz. ${a.risk.label}. ${a.referralNeeded ? "Ixtisoslashtirilgan shifokorga yo'llanma berildi." : "Profilaktik kuzatuv tavsiya etiladi."}`);
      setTimeout(() => aiSay(speechMsg, 'uz'), 350);
    }

    // AI xulosasi: kasallik bor/yo'q ro'yxatini ham yangilaymiz (ovozsiz, chunki yuqorida o'qildi)
    runAiDiagnosis({ voice: false });
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
    const docId = 'REG-NMKG-' + (r.id || Date.now().toString(36).slice(-6)).toUpperCase();
    $('#printArea').innerHTML = `
      <div class="cert-wrap">
        <div class="cert-header">
          <div class="cert-crest">🇺🇿</div>
          <div class="cert-gov">O'ZBEKISTON RESPUBLIKASI SOG'LIQNI SAQLASH VAZIRLIGI</div>
          <div class="cert-subgov">"NAVOIY KON-METALLURGIYA KOMBINATI" AJ · TIBBIY-SANITARIYA QISMI</div>
          <div class="cert-subgov">Radiatsion monitoring va kasbiy salomatlik markazi</div>
        </div>

        <div class="cert-title-box">
          <h2 class="cert-title">RADIATSION SKRINING VA SHIFOKOR YO'LLANMASI (086/R-SHAKL)</h2>
          <div class="cert-doc-id">Hujjat raqami: ${docId} · Rasmiylashtirilgan sana: ${now}</div>
        </div>

        <table class="cert-table">
          <tr>
            <th>Xodim / Bemor F.I.Sh.:</th>
            <td><b>${esc(r.patient ? r.patient.name : (r.patientName || 'Noma\'lum xodim'))}</b></td>
            <th>Tug'ilgan yili / Telefon:</th>
            <td>${r.patient?.year ? r.patient.year + ' yil' : '—'} · ${r.patient?.phone ? esc(r.patient.phone) : '—'}</td>
          </tr>
          <tr>
            <th>Ish joyi / Sex:</th>
            <td>${esc(r.patient?.dept || 'NMKG Gidrometallurgiya Zavodi')}</td>
            <th>Klinik xavf darajasi:</th>
            <td><b>${r.riskLabel || 'Xavfsiz'}</b> (Sog'liq yo'qotish: <b>${r.healthLoss}%</b>)</td>
          </tr>
          <tr>
            <th>Joriy doza tezligi:</th>
            <td><b>${r.rate} µSv/soat</b> (fondan ${(r.rate / 0.16).toFixed(1)} baravar)</td>
            <th>Hisoblangan kunlik doza:</th>
            <td><b>${r.dose} mSv</b> (kunlik me'yorda ${Math.round(r.dayPercent)}%)</td>
          </tr>
          <tr>
            <th>Yillik prognoz yuklama:</th>
            <td><b>${Math.round(r.yearPercent)}%</b> (1 mSv aholi limitidan)</td>
            <th>LNT saraton qo'shimcha xavfi:</th>
            <td><b>${r.cancerRiskPercent}%</b></td>
          </tr>
          <tr>
            <th>Yo'llanma muddati:</th>
            <td><b>${r.deadline}</b></td>
            <th>Yo'naltirilgan muassasa:</th>
            <td><b>${r.place}</b></td>
          </tr>
          <tr>
            <th>ICD-10 tashxis kodlari:</th>
            <td colspan="3">${(r.icd || []).join('; ')}</td>
          </tr>
        </table>

        <div class="cert-sec-title">Tavsiya etilgan klinik-laborator tahlillar:</div>
        <ul class="cert-list">
          ${(r.tests || []).map((t) => `<li>${esc(t)}</li>`).join('')}
        </ul>

        ${r.meds && r.meds.length ? `
          <div class="cert-sec-title">Tibbiy ko'rsatmalar va dori vositalari (shifokor ko'rigi asosida):</div>
          <ul class="cert-list">
            ${r.meds.map((m) => `<li>${esc(m)}</li>`).join('')}
          </ul>
        ` : ''}

        <div class="cert-note-box">
          <b>Ekspert xulosasi va profilaktik izoh:</b> ${esc(r.note || 'Xodimda doza va biometrik parametrlar monitoringi o\'tkazildi. Belgilangan muddatda ixtisoslashtirilgan ko\'rikdan o\'tish shart.')}
        </div>

        <div class="cert-footer-row">
          <div class="cert-qr-col">
            ${window.RadQR ? RadQR.toSVG(window.location.origin + '/#verify=' + docId, { size: 84 }) : ''}
            <div style="font-size:7pt; color:#475569; margin-top:3px; font-family:Courier,monospace;">QR: ELEKTRON TEKSHIRUV</div>
          </div>
          <div class="cert-sign-col">
            <div><b>Tekshiruvchi mutaxassis / Shifokor:</b> _________________________ (imzo)</div>
            <div><b>Xodim / Bemor tanishdi:</b> _________________________ (imzo)</div>
            <div>Sana va vaqt: ${now}</div>
          </div>
          <div class="cert-stamp-box">
            ${window.RadQR ? RadQR.toStampSVG(docId) : `
              <div class="cert-stamp">
                <div>O'ZBEKISTON RESPUBLIKASI</div>
                <div style="font-size:13pt;margin:2px 0;">★</div>
                <div>NMKG TIBBIY-SANITARIYA QISMI</div>
                <div style="font-size:6.5pt;margin-top:2px;">TASDIQLANDI</div>
              </div>
            `}
          </div>
        </div>
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
    sel.onchange = (e) => {
      state.patientId = e.target.value;
      if (state.patientId && state.aiDiag) runAiDiagnosis({});
    };

    const cnt = $('#faceIdCount');
    if (cnt) buildFaceIdPanel();
    void opts;
    updateStatus();
  }

  function renderPatients() {
    let list = state.patients.slice();

    // 1. Qidiruv filtri
    if (state.patientSearch) {
      const q = state.patientSearch;
      list = list.filter((p) =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.dept && p.dept.toLowerCase().includes(q)) ||
        (p.phone && p.phone.includes(q))
      );
    }

    // 2. Risk darajasi bo'yicha filtr
    if (state.patientFilter === 'safe') {
      list = list.filter((p) => p.riskLabel === 'Xavfsiz' || !p.riskLabel);
    } else if (state.patientFilter === 'watch') {
      list = list.filter((p) => p.riskLabel === 'Past xavf' || p.riskLabel === 'O\'rta xavf');
    } else if (state.patientFilter === 'risk') {
      list = list.filter((p) => p.riskLabel === 'Yuqori xavf' || p.riskLabel === 'Juda yuqori');
    }

    const countEl = $('#patientTotalCount');
    if (countEl) countEl.textContent = `Jami: ${list.length} ta xodim / bemor`;

    UI.renderRows($('#patientRows'), list, [
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
    ], 9, "Bemorlar topilmadi");

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
        runAiDiagnosis({});
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
      nationality: String(f.get('nationality') || '').trim(),
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
    let list = state.referrals.slice();

    // Shoshilinch yoki rejali filtr
    if (state.queueFilter === 'urgent') {
      list = list.filter((r) => r.deadline === 'Darhol' || r.deadline === '4 soat ichida' || r.deadline === '24 soat ichida');
    } else if (state.queueFilter === 'routine') {
      list = list.filter((r) => r.deadline !== 'Darhol' && r.deadline !== '4 soat ichida' && r.deadline !== '24 soat ichida');
    }

    if (!list.length) {
      box.innerHTML = `<div class="empty" style="text-align:center;color:var(--muted);padding:34px">Navbatda yo'llanmalar mavjud emas. "Camera skriningi" sahifasida tahlil o'tkazib, yo'llanma yarating.</div>`;
      return;
    }
    box.innerHTML = list.map((r) => {
      const st = STATUSES.find((s) => s[0] === r.status) || STATUSES[0];
      return `
      <div class="q-item" style="--b:${r.riskColor || '#94a3b8'}">
        <div class="q-head">
          <div>
            <h4>${r.patientName || r.patient?.name || 'Noma\'lum bemor'} ${UI.badge(r.riskLabel, r.riskColor || '#94a3b8')}</h4>
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
  window.RadDebug = { state, feedIdentity, confirmIdentity, clearIdentity, runAnalysis, loadPatients, loadUserFaces, runAiDiagnosis, runDemoScenario };
})();
