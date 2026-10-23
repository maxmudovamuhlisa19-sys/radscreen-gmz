'use strict';

/**
 * RadSkrin — konfiguratsiya va standartlar
 * Manbalar: ICRP 103, WHO (2017) "Public health effects of nuclear accidents",
 * O'zR Sog'liqni Saqlash Vazirligi normativ-huquqiy hujjatlari, UNSCEAR.
 */
window.RadConfig = (() => {
  // --- Tabiiy fon (NMKG uchun tipik qiymatlar), µSv/saat ---
  const BACKGROUND = { min: 0.10, typical: 0.16, max: 0.30 };

  // --- Chegaralar ---
  const LIMITS = {
    publicAnnualAboveBg_mSv: 1.0,   // ICRP/WHO: aholi uchun qo'shimcha yillik doza
    occupationalAnnualAvg_mSv: 20.0, // kasbiy: 5 yil o'rtacha, bir yilda 50
    occupationalAnnualMax_mSv: 50.0,
    dailyPublicAboveBg_uSv: 1000 / 365, // ~2.74 µSv/kun (1 mSv/yil normasi)
    eyeLensAnnual_mSv: 20.0,
    fetusAnnual_mSv: 1.0
  };

  // --- Doza tezligi bo'yicha klassifikatsiya (µSv/saat) ---
  const RATE_TIERS = [
    { key: 'normal',   max: 0.5,      label: 'Fon normal',        color: '#22c55e', note: 'Tabiiy fon darajasi. Chora ko\'rish shart emas.' },
    { key: 'watch',    max: 1.0,      label: 'Kuzatuv',           color: '#eab308', note: 'Fondan yuqori. Takroriy o\'lchov va nazorat kerak.' },
    { key: 'elevated', max: 5.0,      label: 'Ko\'tarilgan',      color: '#f97316', note: 'Vaqtincha himoya, dozimetrik nazorat, 24 soat ichida baholash.' },
    { key: 'high',     max: 20.0,     label: 'Yuqori',            color: '#ef4444', note: 'Kishini himoyalangan hududga o\'tkazish, mutaxassis ko\'rigi.' },
    { key: 'critical', max: Infinity, label: 'Favqulodda',        color: '#b91c1c', note: 'Darhol evakuatsiya va favqulodda tibbiy yordam!' }
  ];

  // --- Sog'liq yo'qotish darajalari ---
  const RISK_TIERS = [
    { key: 'safe',   min: 0,  max: 24,  label: 'Xavfsiz',       color: '#22c55e', refer: false },
    { key: 'low',    min: 25, max: 49,  label: 'Past xavf',     color: '#eab308', refer: true  },
    { key: 'medium', min: 50, max: 69,  label: 'O\'rta xavf',   color: '#f97316', refer: true  },
    { key: 'high',   min: 70, max: 84,  label: 'Yuqori xavf',   color: '#ef4444', refer: true  },
    { key: 'severe', min: 85, max: 100, label: 'Juda yuqori',   color: '#7f1d1d', refer: true  }
  ];

  // --- Shifokor yo'llanmasi bo'yicha kechikish (soat) ---
  const REFERRAL_URGENCY = {
    safe:   { hours: null,  place: 'Profilaktik kuzatuv',                    color: '#22c55e' },
    low:    { hours: 168,   place: 'Ambulatoriya / radiolog',                color: '#eab308' },
    medium: { hours: 24,    place: 'Shifoxona poliklinikasi',                color: '#f97316' },
    high:   { hours: 4,     place: 'Favqulodda shifoxona, radiatsiya bo\'limi', color: '#ef4444' },
    severe: { hours: 0,     place: 'Respublika favqulodda markazi',          color: '#7f1d1d' }
  };

  // --- Klinik ko'riklar katalogi ---
  const TESTS = [
    { id: 'oac',    name: 'Umumiy qon tahlili (leykotsit, trombosit)', base: true },
    { id: 'biochem', name: 'Biokimyoviy tahlil (jigar, buyrak funktsiyasi)', base: true },
    { id: 'tsh',    name: 'TSH va qalqonsimon bez gormonlari', base: false },
    { id: 'karyo',  name: 'Karyotip va sitogenetik tahlil', base: false },
    { id: 'urine',  name: 'Siydikda radioaktiv moddalar (ichki ifloslanish)', base: false },
    { id: 'gfr',    name: 'Yopiq gama-spektrometriya (Cs-137, I-131)', base: false },
    { id: 'ecg',    name: 'EKG va yurak UTT', base: true },
    { id: 'cita',   name: 'Sitoplazmatik mikroyadralar (doza rekonstruksiyasi)', base: false },
    { id: 'fert',   name: 'Reproduktiv salomatlik ko\'rigi', base: false }
  ];

  // --- Dori vositalari (faqat shifokor ko'rsatmasi bilan!) ---
  const MEDS = [
    { id: 'ki',    name: 'Kaliy yodid (KI) — faqat radioyod holatida', hint: 'I-131 ichki ifloslanishida 24 soat ichida qabul qilinadi' },
    { id: 'dtpa',  name: 'Ca-DTPA / Zn-DTPA (keyelatori)', hint: 'Faqat statsionar, shifokor nazoratida' },
    { id: 'anti',  name: 'Antihistamin va yallig\'lanishga qarshi', hint: 'Teri reaksiyalari, yallig\'lanish uchun' },
    { id: 'anto',  name: 'Antioksidant kompleksi (E, C vitamini, selen)', hint: 'Profilaktik, kurs bilan' },
    { id: 'hem',   name: 'Gemopoezni qo\'llab-quvvatlovchi terapiya', hint: 'Og\'ir holatda, statsionarda' },
    { id: 'detox', name: 'Detoksikatsiya va infuzion terapiya', hint: 'Suv-salomet egiluvchanligi uchun' }
  ];

  // --- ICD-10 kodlar (yo'llanma uchun) ---
  const ICD = {
    safe:   ['Z00.0 Umumiy tibbiy ko\'rik'],
    low:    ['Z58.8 Radiatsiyaga professional ta\'sir xavfi', 'D64.9 Anemiyani aniqlash (ko\'rinishsiz)'],
    medium: ['Z58.8 Radiatsiyaga professional ta\'sir xavfi', 'D61.9 Talosimik/toksik anemiya shubhasi'],
    high:   ['T66 Radiatsiya ta\'siri (aqibati)', 'D61.9 Siljish/neytropeniya shubhasi'],
    severe: ['T66 Radiatsiya ta\'siri (aqibati)', 'T78.2 Anafilaktik/ochiq holat', 'T79.0 Havoga (emboliyaga) rangi oqish oqma']
  };

  // --- Simptomlar (bemor ro'yxati) ---
  const SYMPTOMS = [
    { id: 'nausea', name: 'Ko\'ngil aynish, qusish', w: 6 },
    { id: 'redskin', name: 'Terida qizarish, qichish', w: 5 },
    { id: 'fatigue', name: 'Kuchli charchoq, holsizlik', w: 4 },
    { id: 'hairloss', name: 'Soch to\'kilishi', w: 7 },
    { id: 'bleed', name: 'Burun yoki tish qonashi', w: 8 },
    { id: 'sorethroat', name: 'Og\'iz yallig\'lanishi', w: 4 },
    { id: 'dizzy', name: 'Bosh aylanishi, holsizlik', w: 5 },
    { id: 'diarrhea', name: 'Diareya, oshqozon buzilishi', w: 5 }
  ];

  // --- Vizual (camera vision) indikatorlar vazni ---
  const VISION_WEIGHTS = {
    pallor: 0.40,  // teri rangi (angiya/ocharang)
    pulse: 0.30,   // rPPG yurak urishi
    stability: 0.15, // harakat barqarorligi
    presence: 0.15  // yuz/teri aniqlanganligi
  };

  // --- Umumiy risk modeli vaznlari ---
  const RISK_WEIGHTS = {
    dose: 0.55,      // radiatsiya dozasi asosiy omil
    vision: 0.25,    // camera vision skriningi
    symptoms: 0.20   // klinik simptomlar
  };

  return {
    BACKGROUND,
    LIMITS,
    RATE_TIERS,
    RISK_TIERS,
    REFERRAL_URGENCY,
    TESTS,
    MEDS,
    ICD,
    SYMPTOMS,
    VISION_WEIGHTS,
    RISK_WEIGHTS,
    ORGANIZATION: 'NMKG — Gornometallurg zavodi',
    APP_NAME: 'RadSkrin'
  };
})();
