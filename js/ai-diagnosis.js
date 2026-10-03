'use strict';

/**
 * RadSkrin — AI klinik xulosa (oflayn qoidalar dvijoki)
 *
 * Kirish: shaxs (Face ID / bemor), RadModel.analyze() hisobi, kamera vision,
 * belgilar (simptomlar), bemor tashriflari tarixi.
 * Chiqish: ICD-10 bo'yicha kasalliklar ro'yxati holatda:
 *      BOR (aniqlandi) · SHUBHA (qo'shimcha tekshiruv kerak) · YO'Q
 * + dalillar (evidence), tavsiya, ekran va ovozli xulosa matni.
 *
 * Manbalar: ICRP 103, WHO (2017) "Public health effects of nuclear accidents",
 * BEIR VII (LNT), O'zR Sog'liqni Saqlash Vazirligi normativ hujjatlari.
 *
 * OG'OHLANTIRISH: bu tizim tashxis qo'ymaydi — yakuniy xulosa shifokor
 * tomonidan beriladi. AI faqat skrining darajasida xulosa beradi.
 */
window.AIDiag = (() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const STATUS = {
    bor:    { label: 'Bor',    color: '#ef4444', hint: 'Belgilar aniqlandi — shifokor ko\'rigi shart' },
    shubha: { label: 'Shubha', color: '#f97316', hint: 'Qo\'shimcha tahlil/ko\'rik kerak' },
    yoq:    { label: 'Yo\'q',  color: '#22c55e', hint: 'Aynet belgilar aniqlanmadi' }
  };

  const T_BOR = 70;     // >= 70 ball — BOR
  const T_SHUBHA = 38;  // >= 38 ball — SHUBHA, pastrog'i — YO'Q

  /* ============================ 1. KONTXT ============================== */

  function cumDose(person) {
    const visits = (person && person.visits) || [];
    return visits.reduce((s, v) => s + (Number(v.dose) || 0), 0);
  }

  function makeCtx(input) {
    const a = input.a;
    const det = (a.vision && a.vision.details) || {};
    return {
      a,
      person: input.person || null,
      rate: a.doses.rate,
      dayPct: a.doses.dayPercent,
      yearPct: a.doses.yearPercent,
      workerPct: a.doses.workerPercent,
      health: a.healthLoss,
      cancer: a.cancerRiskPercent,
      risk: a.risk.key,
      riskLabel: a.risk.label,
      tier: a.tier.key,
      tierLabel: a.tier.label,
      visionOk: a.vision.score !== null && a.vision.score !== undefined,
      pallor: det.pallor ?? null,
      pulse: det.pulse ?? null,
      stability: det.stability ?? null,
      doseScore: a.scores.dose,
      symScore: a.scores.symptoms,
      sym: new Set(input.symptoms || a.input.symptoms || []),
      cumDose: cumDose(input.person)
    };
  }

  /* ========================= 2. BILIMLAR BAZASI ========================= */
  /* Har bir qoida: check(ctx) -> { score: 0..100, ev: string[] }          */

  const KB = [
    {
      id: 'ars',
      name: "O'tkir radiatsiya kasalligi (ARS)",
      icd: 'T66',
      group: 'Radiatsiya kasalliklari',
      check(c) {
        const ev = []; let s = 0;
        if (c.dayPct >= 100) { s += 50; ev.push(`Bugungi doza kunlik normaning ${Math.round(c.dayPct)}%`); }
        else if (c.dayPct >= 30) { s += 28; ev.push(`Bugungi doza normaning ${Math.round(c.dayPct)}%`); }
        else if (c.dayPct >= 10) { s += 12; ev.push(`Bugungi doza normaning ${Math.round(c.dayPct)}%`); }
        if (c.tier === 'critical' || c.tier === 'high') { s += 30; ev.push(`Doza tezligi "${c.tierLabel}" darajada — ${c.rate} µSv/soat`); }
        else if (c.tier === 'elevated') { s += 16; ev.push(`Doza tezligi ko'tarilgan — ${c.rate} µSv/soat`); }
        if (c.health >= 70) { s += 20; ev.push(`Sog'lik yo'qotish ${c.health}% — og'ir daraja`); }
        else if (c.health >= 50) { s += 10; }
        if (c.sym.has('nausea')) { s += 12; ev.push("Ko'ngil aynish — o'tkir belgi"); }
        if (c.sym.has('diarrhea')) { s += 10; ev.push('Diareya — o\'tkir belgisi'); }
        if (c.sym.has('bleed')) { s += 8; ev.push('Burun/tish qonashi — gemopoez zarari belgisi'); }
        return { score: Math.min(100, s), ev };
      },
      advice: 'Gemogramma (umumiy qon tahlili), trombosit va leykotsit darajasini baholang; og\'ir holatda statsionar kuzatuv.'
    },
    {
      id: 'anemia',
      name: 'Radiatsion anemiya / leykopeniya',
      icd: 'D61.9',
      group: 'Qon va gemopoez',
      check(c) {
        const ev = []; let s = 0;
        if (c.pallor !== null && c.pallor < 45) { s += 45; ev.push(`Teri rangi juda ochiq — ${c.pallor}/100 (angiya belgisi)`); }
        else if (c.pallor !== null && c.pallor < 58) { s += 30; ev.push(`Teri rangi ochargan — ${c.pallor}/100`); }
        if (c.sym.has('bleed')) { s += 25; ev.push('Qon quyilishi — trombosit pasayishi belgisi'); }
        if (c.sym.has('hairloss')) { s += 15; ev.push("Soch to'kilishi — gemopoez ta'siri"); }
        if (c.sym.has('fatigue')) { s += 10; ev.push('Kuchli charchoq — anemiya belgisi'); }
        if (c.doseScore >= 60) { s += 20; ev.push(`Doza balining yuqori qiymati (${c.doseScore})`); }
        if (c.cumDose > 0.5) { s += 10; ev.push(`Jami kumulyativ doza ${c.cumDose.toFixed(2)} mSv`); }
        return { score: Math.min(100, s), ev };
      },
      advice: 'Umumiy qon tahlili + ferritin, B12, retikulositlar; hematolog maslahati.'
    },
    {
      id: 'immune',
      name: 'Immunitet pasayishi (neytropeniya shubhasi)',
      icd: 'D70',
      group: 'Qon va gemopoez',
      check(c) {
        const ev = []; let s = 0;
        if (c.sym.has('sorethroat')) { s += 35; ev.push("Og'iz/toboq yallig'lanishi — neytropeniya belgisi"); }
        if (c.sym.has('bleed')) { s += 20; ev.push('Qon quyilishi — immunitet pasayishi bilan mos keladi'); }
        if (c.sym.has('fatigue')) { s += 12; ev.push('Holsizlik'); }
        if (c.doseScore >= 70) { s += 30; ev.push(`Yuqori doza ta'siri (doza bali ${c.doseScore})`); }
        else if (c.doseScore >= 45) { s += 15; }
        if (c.tier === 'high' || c.tier === 'critical') { s += 15; ev.push('Yuqori fon darajasi'); }
        return { score: Math.min(100, s), ev };
      },
      advice: 'Neytrofil va leykotsit sanalari, EBC tahlili; infeksiyaga qarshi profilaktika.'
    },
    {
      id: 'derma',
      name: 'Radiatsion dermatit (teri zarari)',
      icd: 'L59.0',
      group: 'Teri',
      check(c) {
        const ev = []; let s = 0;
        if (c.sym.has('redskin')) { s += 55; ev.push('Terida qizarish, qichish — asosiy belgi'); }
        if (c.pallor !== null && c.pallor < 50) { s += 15; ev.push('Teri rangi normal emas'); }
        if (c.rate >= 5) { s += 25; ev.push(`Yuqori doza tezligi — ${c.rate} µSv/soat`); }
        else if (c.rate >= 1) { s += 12; }
        if (c.sym.has('fatigue')) { s += 8; }
        return { score: Math.min(100, s), ev };
      },
      advice: 'Dermatolog ko\'rigi, teri reaksiyasi darajasi baholansin; himoya vositalari (respirator, ko\'zoynek) kiydirilsin.'
    },
    {
      id: 'cataract',
      name: 'Radiatsion katarakta (ko\'z linzasi)',
      icd: 'H26.1',
      group: 'Ko\'z',
      check(c) {
        const ev = []; let s = 0;
        if (c.yearPct >= 400) { s += 55; ev.push(`Yillik doza limitning ${Math.round(c.yearPct)}% — ko'z buzog'i uchun xavfli`); }
        else if (c.yearPct >= 200) { s += 40; ev.push(`Yillik doza limitning ${Math.round(c.yearPct)}%`); }
        else if (c.yearPct >= 100) { s += 22; ev.push(`Yillik doza limitni oshib ketgan — ${Math.round(c.yearPct)}%`); }
        if (c.workerPct >= 300) { s += 25; ev.push(`Kasbiy limitning ${Math.round(c.workerPct)}% (ko'z buzog'i 20 mSv/yil)`); }
        else if (c.workerPct >= 150) { s += 12; }
        if (c.rate >= 8) { s += 15; ev.push('Yuqori fonli hududda ishlash'); }
        return { score: Math.min(100, s), ev };
      },
      advice: 'Oftalmolog ko\'rigi (lampa bilan), ko\'z buzog\'i holati baholansin; yillik doza nazorati.'
    },
    {
      id: 'cardio',
      name: 'Yurak-tomir ritm buzilishi',
      icd: 'R00.0',
      group: 'Yurak-tomir',
      check(c) {
        const ev = []; let s = 0;
        if (c.pulse !== null) {
          if (c.pulse > 110) { s += 50; ev.push(`Puls tezlashgan — ${c.pulse} urish/daqiqa`); }
          else if (c.pulse > 100) { s += 35; ev.push(`Puls ${c.pulse} urish/daqiqa (chegaradan yuqori)`); }
          else if (c.pulse < 50) { s += 50; ev.push(`Puls sekinlashgan — ${c.pulse} urish/daqiqa`); }
          else if (c.pulse < 55) { s += 35; ev.push(`Puls ${c.pulse} urish/daqiqa (chegaradan past)`); }
        }
        if (c.sym.has('dizzy')) { s += 25; ev.push('Bosh aylanishi — gipotenziya/aritmiya belgisi'); }
        if (c.sym.has('fatigue')) { s += 10; }
        if (c.visionOk && c.stability !== null && c.stability < 55) { s += 12; ev.push(`Yuz barqarorligi past — ${c.stability}%`); }
        return { score: Math.min(100, s), ev };
      },
      advice: 'EKG, EKK (yurak UTT); 24 soatlik Holter monitoringi kerak bo\'lishi mumkin.'
    },
    {
      id: 'gastro',
      name: "Radiatsion gastroenterit (oshqozon-ichak)",
      icd: 'K52.9',
      group: 'Oshqozon-ichak',
      check(c) {
        const ev = []; let s = 0;
        if (c.sym.has('nausea')) { s += 40; ev.push("Ko'ngil aynish, qusish"); }
        if (c.sym.has('diarrhea')) { s += 40; ev.push('Diareya, oshqozon buzilishi'); }
        if (c.dayPct >= 100) { s += 25; ev.push('Kunlik doza me\'yoridan oshgan'); }
        else if (c.dayPct >= 30) { s += 12; }
        if (c.tier === 'elevated' || c.tier === 'high' || c.tier === 'critical') { s += 15; ev.push('Ko\'tarilgan doza darajasi'); }
        return { score: Math.min(100, s), ev };
      },
      advice: 'Suv-salomet muvozanati baholansin; ichki ifloslanishga shubha bo\'lsa — siydikda radioaktiv moddalar tahlili.'
    },
    {
      id: 'thyroid',
      name: 'Qalqonsimon bez disfunksiyasi (radioyod)',
      icd: 'E04.9',
      group: 'Gormonlar',
      check(c) {
        const ev = []; let s = 0;
        if (c.rate >= 8) { s += 35; ev.push(`Radioaktiv yod xavfi yuqori — fon ${c.rate} µSv/soat`); }
        else if (c.rate >= 3) { s += 20; }
        if (c.yearPct >= 150) { s += 25; ev.push(`Yillik doza limitning ${Math.round(c.yearPct)}%`); }
        if (c.sym.has('fatigue')) { s += 15; ev.push('Charchoq — gormonal muammo belgisi'); }
        if (c.sym.has('dizzy')) { s += 10; }
        if (c.cumDose > 1) { s += 15; ev.push(`Jami doza ${c.cumDose.toFixed(2)} mSv — ichki ifloslanish xavfi`); }
        return { score: Math.min(100, s), ev };
      },
      advice: 'TSH, sV4, T3/T4 gormonlari; III-131 bilan yopiq gama-spektrometriya (ichki ifloslanish).'
    },
    {
      id: 'neuro',
      name: 'Bosh aylanishi / vegetativ distoniya',
      icd: 'R42',
      group: 'Nerv tizimi',
      check(c) {
        const ev = []; let s = 0;
        if (c.sym.has('dizzy')) { s += 55; ev.push('Bosh aylanishi, holsizlik — asosiy belgi'); }
        if (c.sym.has('fatigue')) { s += 20; ev.push('Kuchli charchoq'); }
        if (c.pulse !== null && (c.pulse > 100 || c.pulse < 55)) { s += 20; ev.push(`Puls buzilgan — ${c.pulse}/daqiqa`); }
        if (c.pallor !== null && c.pallor < 55) { s += 12; ev.push('Teri rangi o\'zgargan'); }
        if (c.health >= 50) { s += 10; }
        return { score: Math.min(100, s), ev };
      },
      advice: 'Nevrolog ko\'rigi, qon bosimi kuzatuvi, qon tahlili (gemoglobin, qand).'
    },
    {
      id: 'resp',
      name: "O'tkir nafas yo'llari yallig'lanishi",
      icd: 'J06.9',
      group: "Nafas yo’llari",
      check(c) {
        const ev = []; let s = 0;
        if (c.sym.has('sorethroat')) { s += 55; ev.push("Og'iz yallig'lanishi — asosiy belgi"); }
        if (c.sym.has('fatigue')) { s += 15; }
        if (c.sym.has('nausea')) { s += 8; }
        if (c.tier === 'elevated' || c.tier === 'high') { s += 12; ev.push('Ko\'tarilgan fon — nafas yo\'llari qo\'shimcha yuklanishi'); }
        return { score: Math.min(100, s), ev };
      },
      advice: 'Terapevt ko\'rigi; agar fon yuqori bo\'lsa — respirator va himoya vositalari.'
    },
    {
      id: 'fatigue',
      name: 'Umumiy intoksikatsiya va charchoq sindromi',
      icd: 'R53',
      group: 'Umumiy',
      check(c) {
        const ev = []; let s = 0;
        if (c.sym.has('fatigue')) { s += 45; ev.push("Kuchli charchoq, holsizlik — asosiy belgi"); }
        if (c.health >= 60) { s += 30; ev.push(`Sog'lik yo'qotish ${c.health}%`); }
        else if (c.health >= 35) { s += 15; }
        if (c.sym.has('dizzy')) { s += 15; }
        if (c.sym.has('hairloss')) { s += 10; }
        if (c.pallor !== null && c.pallor < 60) { s += 12; }
        return { score: Math.min(100, s), ev };
      },
      advice: 'Biokimyoviy tahlil (jigar, buyrak funktsiyasi), vitamin darajasi, ish/grafik rejimi tahlili.'
    },
    {
      id: 'cancer',
      name: 'Saraton xavfi (LNT ko\'rsatkichi)',
      icd: 'C00–C97 (xavf)',
      group: 'Uzoq muddatli xavflar',
      check(c) {
        const ev = []; let s = 0;
        if (c.cancer >= 10) { s += 75; ev.push(`LNT bo'yicha qo'shimcha xavf ${c.cancer}% — yuqori`); }
        else if (c.cancer >= 5) { s += 55; ev.push(`LNT bo'yicha qo'shimcha xavf ${c.cancer}%`); }
        else if (c.cancer >= 2) { s += 35; ev.push(`LNT bo'yicha xavf ${c.cancer}% — o'rta daraja`); }
        else if (c.cancer >= 1) { s += 20; ev.push(`LNT bo'yicha xavf ${c.cancer}% — past`); }
        if (c.cumDose > 5) { s += 15; ev.push(`Jami kumulyativ doza ${c.cumDose.toFixed(2)} mSv`); }
        if (c.yearPct >= 100) { s += 10; }
        return { score: Math.min(100, s), ev };
      },
      advice: 'Yillik doza chegarasini saqlash (aholi 1 mSv, kasbiy 20 mSv); profilaktik skrining 6 oyda bir.'
    },
    {
      id: 'prof',
      name: "Radiatsiyaga professional ta'sir xavfi",
      icd: 'Z58.8',
      group: 'Kasbiy omillar',
      check(c) {
        const ev = []; let s = 0;
        if (c.yearPct >= 100) { s += 55; ev.push(`Yillik doza aholi limitini oshgan — ${Math.round(c.yearPct)}%`); }
        else if (c.yearPct >= 20) { s += 35; ev.push(`Yillik doza limitning ${Math.round(c.yearPct)}%`); }
        else if (c.yearPct >= 5) { s += 18; }
        if (c.workerPct >= 100) { s += 35; ev.push(`Kasbiy limit (${c.workerPct}%) yetib keldi yoki oshdi`); }
        else if (c.workerPct >= 50) { s += 18; }
        if (c.tier === 'watch' || c.tier === 'elevated') { s += 10; }
        return { score: Math.min(100, s), ev };
      },
      advice: 'Dozimetrik nazorat, shaxsiy dozimetrlar, himoya vositalari va kasbiy tibbiy ko\'rik (yillik).'
    }
  ];

  /* ========================== 2.1 RUSCHA NOMLANGAN ====================== */
  /* Kasallik nomlari va maslahatlarning ruscha varianti (AI ovozi uchun) */
  const RU = {
    ars: {
      name: 'Острая лучевая болезнь (ОЛБ)',
      advice: 'Гемограмма, уровень тромбоцитов и лейкоцитов; при тяжёлом течении — стационарное наблюдение.'
    },
    anemia: {
      name: 'Лучевая анемия / лейкопения',
      advice: 'Общий анализ крови + ферритин, В12, ретикулоциты; консультация гематолога.'
    },
    immune: {
      name: 'Снижение иммунитета (нейтропения)',
      advice: 'Подсчёт нейтрофилов и лейкоцитов, ОАК; профилактика инфекций.'
    },
    derma: {
      name: 'Лучевой дерматит (повреждение кожи)',
      advice: 'Осмотр дерматолога, оценка степени реакции кожи; средства защиты (респиратор, очки).'
    },
    cataract: {
      name: 'Лучевая катаракта (хрусталик)',
      advice: 'Осмотр офтальмолога (лампой), оценка состояния хрусталика; контроль годовой дозы.'
    },
    cardio: {
      name: 'Нарушение ритма сердца',
      advice: 'ЭКГ, ЭхоКГ; при необходимости — суточный мониторинг Холтера.'
    },
    gastro: {
      name: 'Лучевой гастроэнтерит',
      advice: 'Оценка водно-электролитного баланса; при подозрении на внутреннее заражение — анализ мочи на радиоактивные вещества.'
    },
    thyroid: {
      name: 'Дисфункция щитовидной железы (радиоактивный йод)',
      advice: 'ТТГ, Т4, Т3; закрытая гамма-спектрометрия по I-131 (внутреннее заражение).'
    },
    neuro: {
      name: 'Головокружение / вегетативная дистония',
      advice: 'Осмотр невролога, контроль давления, анализ крови (гемоглобин, сахар).'
    },
    resp: {
      name: 'Острая респираторная инфекция',
      advice: 'Осмотр терапевта; при повышенном фоне — респиратор и средства защиты.'
    },
    fatigue: {
      name: 'Общая интоксикация и синдром усталости',
      advice: 'Биохимия (печень, почки), уровень витаминов, анализ режима работы.'
    },
    cancer: {
      name: 'Риск рака (LNT-показатель)',
      advice: 'Соблюдение годового лимита дозы (население 1 мЗв, профессионалы 20 мЗв); профилактический скрининг раз в 6 месяцев.'
    },
    prof: {
      name: 'Риск профессионального воздействия радиации',
      advice: 'Дозиметрический контроль, индивидуальные дозиметры, средства защиты и ежегодный медицинский осмотр.'
    }
  };

  /** Tili: shaxsning millatiga qarab 'ru' yoki 'uz' */
  const RU_NATIONS = new Set([
    'russian', 'tatar', 'bashkir', 'ukrainian', 'belarusian', 'moldovan',
    'kazakh', 'kyrgyz', 'armenian', 'georgian'
  ]);

  function langOf(person) {
    const nat = String((person && person.nationality) || '').toLowerCase();
    return RU_NATIONS.has(nat) ? 'ru' : 'uz';
  }

  /* ========================== 3. TAHHLIL ============================== */

  function diagnose(input) {
    const ctx = makeCtx(input || {});
    const lang = langOf(ctx.person);
    const items = KB.map((rule) => {
      let score = 0, ev = [];
      try {
        const r = rule.check(ctx) || {};
        score = clamp(Math.round(r.score) || 0, 0, 100);
        ev = Array.isArray(r.ev) ? [...new Set(r.ev.filter(Boolean))] : [];
      } catch { score = 0; ev = []; }

      const status = score >= T_BOR ? 'bor' : score >= T_SHUBHA ? 'shubha' : 'yoq';
      const ru = RU[rule.id] || {};
      return {
        id: rule.id, name: rule.name, nameRu: ru.name || rule.name,
        icd: rule.icd, group: rule.group,
        score, status, color: STATUS[status].color, ev,
        advice: rule.advice, adviceRu: ru.advice || rule.advice
      };
    });

    const order = { bor: 0, shubha: 1, yoq: 2 };
    items.sort((x, y) => order[x.status] - order[y.status] || y.score - x.score);

    const present = items.filter((i) => i.status === 'bor');
    const suspect = items.filter((i) => i.status === 'shubha');
    const absent = items.filter((i) => i.status === 'yoq');

    const a = ctx.a;
    const headline = present.length === 0 && suspect.length === 0
      ? "Kasallik belgilari aniqlanmadi"
      : present.length
        ? `${present.length} ta kasallik aniqlandi`
        : `${suspect.length} ta kasallik bo'yicha shubha`;
    const headlineRu = present.length === 0 && suspect.length === 0
      ? 'Признаки заболеваний не обнаружены'
      : present.length
        ? `Обнаружено заболеваний: ${present.length}`
        : `Подозрение на заболеваний: ${suspect.length}`;
    return {
      at: Date.now(),
      lang,
      person: ctx.person,
      personName: (ctx.person && ctx.person.name) || null,
      items, present, suspect, absent,
      counts: { bor: present.length, shubha: suspect.length, yoq: absent.length },
      health: a.healthLoss,
      riskLabel: a.risk.label,
      riskColor: a.risk.color,
      rate: a.doses.rate,
      dayPercent: a.doses.dayPercent,
      cancerRiskPercent: a.cancerRiskPercent,
      headline: lang === 'ru' ? headlineRu : headline,
      headlineUz: headline,
      headlineRu
    };
  }

  return {
    diagnose, langOf,
    STATUS, KB
  };
})();
