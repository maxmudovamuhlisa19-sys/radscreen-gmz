'use strict';

/**
 * RadSkrin — radiatsiya dozasi va sog'liq yo'qotish modeli
 *
 * Formula va manbalar:
 *  1) Doza tezligi (µSv/soat) -> sutkalik/yillik effektiv doza:
 *       D_kun(mSv)  = R(µSv/soat) * 24 / 1000
 *       D_yil(mSv)  = R(µSv/soat) * 8760 / 1000
 *  2) Chegara nisbati (ICRP 103 / WHO):
 *       Foiz = (D_yil - fon_yillik) / Limit * 100
 *       aholi uchun qo'shimcha limit = 1 mSv/yil, kasbiy = 20 mSv/yil
 *  3) Saraton xavfi — LNT (Linear No-Threshold) modeli:
 *       Xavf(%) = D_yil(Sv) * 5%   (ICRP/BEIR VII: 1 Sv uchun ~5% o'lim xavfi)
 *  4) O'tkir to'qima zarari (kunlik doza bo'yicha, silliqlangan logistic):
 *       D_kun < 1 mSv -> 0;  1000 mSv -> ~50 ball;  4000 mSv -> ~100 ball
 *  5) Umumiy Sog'liq Yo'qotish (SY%) =
 *       0.55 * DozaBal + 0.25 * VizualBall + 0.20 * SimptomBal
 */
window.RadModel = (() => {
  const C = window.RadConfig;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const round = (v, d = 2) => Number(v.toFixed(d));

  /* ------------------------- 1. Doza hisob-kitobi ------------------------- */

  /** Doza tezligi bo'yicha klassifikatsiya */
  function rateTier(rateUSvH) {
    return C.RATE_TIERS.find((t) => rateUSvH < t.max) || C.RATE_TIERS[C.RATE_TIERS.length - 1];
  }

  /** Effektiv dozalarni hisoblash */
  function doses(rateUSvH) {
    const r = Math.max(0, rateUSvH || 0);
    const perHour_uSv = r;
    const perDay_mSv = (r * 24) / 1000;
    const perYear_mSv = (r * 8760) / 1000;
    const bgYear = (C.BACKGROUND.typical * 8760) / 1000; // tabiiy fon yillik ~1.4 mSv
    const aboveBgYear = Math.max(0, perYear_mSv - bgYear);
    const aboveBgDay_uSv = Math.max(0, (r - C.BACKGROUND.typical) * 24);

    return {
      rate: round(r, 3),
      perHour_uSv: round(perHour_uSv, 3),
      perDay_mSv: round(perDay_mSv, 4),
      perYear_mSv: round(perYear_mSv, 3),
      bgYear_mSv: round(bgYear, 3),
      aboveBgYear_mSv: round(aboveBgYear, 3),
      // bugungi foiz: aholi uchun kunlik normaga nisbatan
      dayPercent: round((aboveBgDay_uSv / C.LIMITS.dailyPublicAboveBg_uSv) * 100, 1),
      // yillik foiz: aholi uchun 1 mSv/yil limitiga nisbatan
      yearPercent: round((aboveBgYear / C.LIMITS.publicAnnualAboveBg_mSv) * 100, 1),
      // kasbiy (ishchi) uchun foiz: 20 mSv/yil
      workerPercent: round((perYear_mSv / C.LIMITS.occupationalAnnualAvg_mSv) * 100, 1),
      // bir xodim uchun 40 yillik ish davomidagi jami doza (mensurable)
      cum40y_mSv: round(perYear_mSv * 40, 1)
    };
  }

  /* --------------------------- 2. Doza bal (0-100) -------------------------- */

  /**
   * Doza bal = chegaralarga nisbatan xavf darajasi (0-100).
   * Logarifmik shkala: fon atrofida 0, 20 µSv/soat atrofida 100.
   */
  function doseScore(rateUSvH) {
    const r = Math.max(0, rateUSvH || 0);
    if (r <= C.BACKGROUND.typical) return 0;
    // log shkala: 0.16 -> 0, 1 -> ~18, 5 -> ~44, 20 -> ~64, 1000 -> 100
    const raw = (Math.log10(r / C.BACKGROUND.typical) / Math.log10(1000 / C.BACKGROUND.typical)) * 100;
    return round(clamp(raw * 1.35, 0, 100), 1);
  }

  /**
   * O'tkir to'qima zarari ball (kunlik doza bo'yicha).
   * 1 mSv/kun -> 0, 1000 mSv/kun -> 50, 4000+ -> 100 (silliqlangan logistic).
   */
  function acuteDamageScore(perDayMsv) {
    const d = Math.max(0, perDayMsv || 0);
    if (d < 1) return 0;
    const x = Math.log10(d / 1);                 // log10 mSv/kun
    const score = 100 / (1 + Math.exp(-1.6 * (x - 2.0))); // markaz ~100 mSv/kun
    return round(clamp(score, 0, 100), 1);
  }

  /* ---------------------- 3. Saraton xavfi (LNT modeli) --------------------- */

  function cancerRisk(perYearMsv) {
    const sv = Math.max(0, perYearMsv) / 1000;
    return round(sv * 5, 3); // % qo'shimcha o'lim xavfi
  }

  /* ---------------------- 4. Camera vision bal (0-100) ---------------------- */

  /**
   * vision = { pallor(0-100 normal), pulse(bpm|null), stability(0-100),
   *            presence(0-100), raw{} }
   * Qaytadi: { score, details }
   */
  function visionScore(v) {
    if (!v || !v.parsed) return { score: null, details: { reason: 'Kamera tahlili o\'tkazilmagan' } };
    const W = C.VISION_WEIGHTS;
    const norm = (x) => clamp(x || 0, 0, 100);

    // Pallor: 100 = teri rangi normal, kamayishi = angiya/ocharang
    const pallor = norm(v.pallor);
    // Puls: 60-100 ideal; 40-140 qat'iy chegaraviy
    let pulseScore = 0;
    if (v.pulse && v.pulse > 0) {
      const bpm = v.pulse;
      if (bpm >= 60 && bpm <= 100) pulseScore = 100 - Math.abs(bpm - 80) * 0.8;
      else if (bpm >= 50 && bpm <= 120) pulseScore = 70 - Math.abs(bpm - 85) * 1.2;
      else pulseScore = 30;
      pulseScore = clamp(pulseScore, 0, 100);
    } else {
      pulseScore = 50; // aniqlanmadi -> neytral
    }
    const stability = norm(v.stability);
    const presence = norm(v.presence);

    const score = round(
      W.pallor * pallor + W.pulse * pulseScore + W.stability * stability + W.presence * presence,
      1
    );

    return {
      score,
      details: {
        pallor: round(pallor, 1),
        pulseScore: round(pulseScore, 1),
        pulse: v.pulse || null,
        stability: round(stability, 1),
        presence: round(presence, 1)
      }
    };
  }

  /* -------------------------- 5. Simptom bal (0-100) ------------------------ */

  function symptomScore(selectedIds) {
    const sel = new Set(selectedIds || []);
    if (sel.size === 0) return 0;
    const total = C.SYMPTOMS.reduce((s, x) => s + x.w, 0);
    const got = C.SYMPTOMS.filter((x) => sel.has(x.id)).reduce((s, x) => s + x.w, 0);
    return round(clamp((got / total) * 100, 0, 100), 1);
  }

  /* ---------------------- 6. Umumiy tahlil (yakuniy hisob) ------------------ */

  /**
   * analyze({ rateUSvH, vision, symptoms[] }) -> to'liq hisobot
   */
  function analyze(input) {
    const rate = Math.max(0, Number(input.rateUSvH) || 0);
    const d = doses(rate);
    const tier = rateTier(rate);

    const vs = visionScore(input.vision);
    const sScore = symptomScore(input.symptoms);

    // Doza bal: statik doza bal + o'tkir zarar (ularning eng yomon qismi)
    const dScore = round(Math.max(doseScore(rate), acuteDamageScore(d.perDay_mSv)), 1);

    // Vizual ball KAMAYGANI = xavf (100 = sog'lom ko'rinish)
    const visionPart = vs.score === null ? 0 : round(100 - vs.score, 1);
    const visionUsed = vs.score === null ? 0 : 1; // vizual tahlil bo'lmasa, uning o'rni dozaga beriladi

    const W = C.RISK_WEIGHTS;
    const denom = visionUsed ? W.dose + W.vision + W.symptoms : W.dose + W.symptoms;
    const numer =
      W.dose * dScore +
      (visionUsed ? W.vision * visionPart : 0) +
      W.symptoms * sScore;

    // numer — vaznli o'rtacha (0..100), denom — ishlatilgan vaznlar yig'indisi
    const healthLoss = round(clamp(numer / denom, 0, 100), 1);
    const risk = C.RISK_TIERS.find((t) => healthLoss >= t.min && healthLoss <= t.max) || C.RISK_TIERS[4];
    const urgency = C.REFERRAL_URGENCY[risk.key];
    const cancer = cancerRisk(d.perYear_mSv);

    const referralNeeded =
      risk.refer || tier.key === 'elevated' || tier.key === 'high' || tier.key === 'critical';

    return {
      input: { rate, symptoms: input.symptoms || [], hasVision: visionUsed === 1 },
      doses: d,
      tier,
      vision: vs,
      scores: { dose: dScore, vision: visionPart, symptoms: sScore },
      healthLoss,
      cancerRiskPercent: cancer,
      risk,
      urgency,
      referralNeeded,
      advice: buildAdvice(risk, tier, vs, d)
    };
  }

  /* ---------------------------- 7. Tavsiyalar ------------------------------ */

  function buildAdvice(risk, tier, vs, d) {
    const list = [];

    if (tier.key === 'critical') {
      list.push({ level: 'danger', text: 'Darhol shaxsni ifloslangan hududdan chiqarib, favqulodda tibbiy yordamga yuboring.' });
    } else if (tier.key === 'high') {
      list.push({ level: 'danger', text: 'Shaxsni himoyalangan (past fonli) hududga o\'tkazing, 4 soat ichida mutaxassis ko\'rigi.' });
    } else if (tier.key === 'elevated') {
      list.push({ level: 'warn', text: 'Vaqtincha himoya vositalari (respirator, ko\'zoynek) kiydiring, 24 soat ichida qayta o\'lchov.' });
    } else if (tier.key === 'watch') {
      list.push({ level: 'warn', text: 'Fon yuqori. Takroriy o\'lchov olib, manbani aniqlang.' });
    } else {
      list.push({ level: 'ok', text: 'Radiatsiya darajasi normal. Profilaktik kuzatuv kifoya.' });
    }

    if (d.dayPercent > 100) {
      list.push({ level: 'danger', text: `Bugungi doza kunning me'yorida ${Math.round(d.dayPercent)}% — shaxsni nazoratga oling.` });
    } else if (d.dayPercent > 20) {
      list.push({ level: 'warn', text: `Bugungi doza me'yorida ${Math.round(d.dayPercent)}% — takroriy o'lchov tavsiya etiladi.` });
    }

    if (vs.details && vs.details.pallor !== undefined && vs.score !== null) {
      if (vs.details.pallor < 55) {
        list.push({ level: 'warn', text: 'Kamera tahlili: teri rangida o\'zgarish (angiya/ocharang) — qon tahlili olib, leykotsit darajasini baholang.' });
      }
      if (vs.details.pulse && (vs.details.pulse > 100 || vs.details.pulse < 55)) {
        list.push({ level: 'warn', text: `Puls ${vs.details.pulse} urish/daqiqa — yurak-tomir tizimi baholansin (EKG).` });
      }
    }

    if (risk.key === 'safe' && !risk.refer) {
      list.push({ level: 'ok', text: 'Shifokor yo\'llanmasi shart emas, 6 oyda qayta skrining.' });
    }

    return list;
  }

  /* --------------------- 8. Shifokor yo'llanmasini tuzish ------------------- */

  function buildReferral(analysis, patient) {
    const key = analysis.risk.key;
    const icd = C.ICD[key] || C.ICD.low;
    const tests = C.TESTS.filter((t) => t.base).map((t) => t.name);
    if (key !== 'safe') {
      if (analysis.vision.details && analysis.vision.details.pallor < 60) tests.push(C.TESTS.find((t) => t.id === 'karyo').name);
      tests.push(C.TESTS.find((t) => t.id === 'cita').name);
    }
    if (analysis.doses.aboveBgYear_mSv > 1) tests.push(C.TESTS.find((t) => t.id === 'urine').name);
    if (key === 'high' || key === 'severe') tests.push(C.TESTS.find((t) => t.id === 'gfr').name);

    const meds = [];
    if (key === 'severe' || key === 'high') meds.push(C.MEDS.find((m) => m.id === 'detox').name, C.MEDS.find((m) => m.id === 'hem').name);
    if (key === 'medium' || key === 'high' || key === 'severe') meds.push(C.MEDS.find((m) => m.id === 'anto').name, C.MEDS.find((m) => m.id === 'anti').name);
    if (key === 'low') meds.push(C.MEDS.find((m) => m.id === 'anto').name);

    return {
      patient: patient ? { id: patient.id, name: patient.name, dept: patient.dept, year: patient.year } : null,
      urgency: analysis.urgency,
      riskLabel: analysis.risk.label,
      riskKey: key,
      riskColor: analysis.risk.color,
      healthLoss: analysis.healthLoss,
      cancerRiskPercent: analysis.cancerRiskPercent,
      rate: analysis.doses.rate,
      dayPercent: analysis.doses.dayPercent,
      yearPercent: analysis.doses.yearPercent,
      dose: analysis.doses.perDay_mSv,
      icd,
      tests: [...new Set(tests)],
      meds,
      deadline: analysis.urgency.hours === null
        ? 'Doimiy profilaktik nazorat'
        : analysis.urgency.hours === 0
          ? 'Darhol (hozir zaxira)'
          : `${analysis.urgency.hours} soat ichida`,
      place: analysis.urgency.place,
      note: buildReferralNote(analysis)
    };
  }

  function buildReferralNote(a) {
    const parts = [];
    parts.push(`O'lchov: ${a.doses.rate} µSv/soat (fon atrofi: ${C.BACKGROUND.typical} µSv/soat).`);
    parts.push(`Sutkalik doza: ${a.doses.perDay_mSv} mSv, bugungi me'yorda ${Math.round(a.doses.dayPercent)}%.`);
    parts.push(`Yillik doza: ${a.doses.perYear_mSv} mSv (aholi limitiga nisbatan ${Math.round(a.doses.yearPercent)}%).`);
    parts.push(`Sog'liq yo'qotish darajasi: ${a.healthLoss}% (${a.risk.label}).`);
    parts.push(`LNT bo'yicha qo'shimcha saraton xavfi: ${a.cancerRiskPercent}%.`);
    if (a.vision.score !== null) parts.push(`Vizual skrining bali: ${a.vision.score}/100.`);
    return parts.join(' ');
  }

  /* ----------------------------- 9. Simulyatsiya --------------------------- */

  /** GMZ hududlari uchun tipik doza tezliklari (demo / kalibratsiya) */
  const ZONES = [
    { id: 'yard',     name: 'Ombor hovli (tashqi)',     rate: 0.14 },
    { id: 'office',   name: 'Ma\'muriy bino',            rate: 0.12 },
    { id: 'crusher',  name: 'Maydalash sexsi',          rate: 0.38 },
    { id: 'smelter',  name: 'Pishirish sexsi (eritma)', rate: 1.25 },
    { id: 'leach',    name: 'Gidrometallurgiya liniyasi', rate: 3.7 },
    { id: 'waste',    name: 'Chiqindi maydonchasi',      rate: 8.4 },
    { id: 'storage',  name: 'Radioaktiv ombor (xona)',   rate: 26.5 }
  ];

  /** Doza tezligi tarixini simulyatsiya qilish (demo uchun) */
  function simulateHistory(rate, points = 96) {
    const out = [];
    const now = Date.now();
    for (let i = points - 1; i >= 0; i--) {
      const t = now - i * 15 * 60 * 1000; // har 15 daqiqada
      const noise = (Math.random() - 0.5) * Math.max(0.02, rate * 0.18);
      const wave = Math.sin((points - i) / 7) * rate * 0.06;
      out.push({ t, v: Math.max(0, Number((rate + noise + wave).toFixed(3))) });
    }
    return out;
  }

  return {
    doses,
    rateTier,
    doseScore,
    acuteDamageScore,
    cancerRisk,
    visionScore,
    symptomScore,
    analyze,
    buildReferral,
    ZONES,
    simulateHistory,
    clamp,
    round
  };
})();
