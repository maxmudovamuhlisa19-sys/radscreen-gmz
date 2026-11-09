'use strict';

/**
 * RadSkrin — xalqaroellashtirish (i18n): O'zbekcha / Русский / English
 *
 * Imkoniyatlar:
 *  1) DOM dagi data-i18n (textContent), data-i18n-ph (placeholder),
 *     data-i18n-title (title) atributlarini tarjima qilish.
 *  2) Dinamik matnlar uchun I18n.t(kalit) chaqiruvlari.
 *  3) Til sozlamasini localStorage da saqlash va onLang obuna tizimi.
 *  4) 3 ta to'liq til: UZ (O'zbekcha), RU (Русский), EN (English).
 *  5) Millatlar (nationality) ro'yxati 3 tilda.
 */
window.I18n = (() => {
  const KEY = 'radscreen.lang';

  /* ----------------------------- Lug'atlar ----------------------------- */
  const DICT = {
    uz: {
      // Kirish / registratsiya
      'auth.login': '🔑 Kirish',
      'auth.register': '📝 Ro\'yxatdan o\'tish',
      'auth.login.title': 'Tizimga kirish',
      'auth.login.submit': 'Tizimga kirish',
      'auth.login.desc': 'NMKG · radiatsion nazorat va tibbiy skrining tizimi',
      'auth.fio': 'F.I.Sh. (ism familya)',
      'auth.login.ph': 'masalan: a.karimov',
      'auth.password': 'Parol',
      'auth.password.ph': 'kamida 6 ta belgi',
      'auth.password2': 'Parolni takrorlang',
      'auth.role': 'Rol',
      'auth.role.operator': 'Ishchi / Operator',
      'auth.role.doctor': 'Shifokor / Radiolog',
      'auth.nation': 'Millat',
      'auth.nation.ph': 'Millatni tanlang',
      'auth.submit': 'Ro\'yxatdan o\'tish',
      'auth.wait': 'Kutilmoqda…',
      'auth.face': 'Yuz orqali identifikatsiya (Face ID) — ixtiyoriy',
      'auth.face.add': '📷 Yuzni qo\'shish (5 ta namuna)',
      'auth.face.on': '■ Kamerani to\'xtatish',
      'auth.face.done': '✓ Yuz tayyor — qayta olish',
      'auth.face.wait': 'Kamera yoqilmagan — yuzni ro\'yxatga olish uchun bosing',

      // Asosiy navigatsiya
      'tab.monitor': '📊 Monitoring',
      'tab.vision': '📷 Camera skriningi',
      'tab.patients': '🧑‍🤝‍🧑 Bemorlar',
      'tab.queue': '🏥 Shifokor navbati',
      'tab.admin': '🛠 Admin',
      'tab.method': '📐 Metodika',

      // Yuqori panel
      'top.lang': 'Til',
      'top.logout': 'Chiqish',
      'top.sound.on': 'Ovoz yoqilgan (Geiger / Siren)',
      'top.sound.off': 'Ovoz o\'chirilgan',
      'top.server.on': 'server onlayn',
      'top.server.off': 'lokal rejim (offline)',
      'top.checking': 'tekshirilmoqda...',
      'top.org': 'NMKG · Gidrometallurgiya Zavodi · Radiatsion Xavfsizlik',

      // Favqulodda ogohlantirish banneri
      'alert.title': '⚠️ DIQQAT: RADIATSIYA ME\'YORDAN YUQORI!',
      'alert.desc': 'Hududda nurlanish foni oshgan. Xodimlar shaxsiy himoya vositalarini taqsin va zaxira zonasiga o\'tsin.',
      'alert.btn.mute': '🔕 Signalni o\'chirish',
      'alert.btn.ref': '🏥 Shifokorga yo\'naltirish',

      // Sahifa sarlavhalari
      'page.monitor': 'Monitoring va Dozimetriya',
      'page.vision': 'Camera Skriningi va Biometriya',
      'page.patients': 'Bemorlar va Xodimlar Reestri',
      'page.queue': 'Shifokor Navbati — Yo\'llanmalar',
      'page.admin': 'Admin Panel — Boshqaruv',
      'page.method': 'Metodika va Standartlar',

      // Tugmalar
      'btn.analyze': '🔎 To\'liq tahlilni o\'tkazish',
      'btn.save.ref': '🏥 Yo\'llanmani navbatga qo\'shish',
      'btn.print': '🖨 Chop etish (PDF)',
      'btn.cam.start': '▶ Kamerani yoqish',
      'btn.cam.stop': '■ To\'xtatish',
      'btn.cam.snap': '📸 Skrining suratini olish',
      'btn.image': '🖼 Rasm yuklash',
      'btn.clear.ident': '✕ Tanishni tozalash',
      'btn.ai.run': '🔎 Qayta tahlil qilish',
      'btn.add.patient': '+ Yangi bemor qo\'shish',
      'btn.export.csv': '⬇ CSV eksport',
      'btn.backup': '📥 Zaxira nusxa (JSON)',
      'btn.restore': '📤 Tiklash (JSON)',
      'btn.refresh': '⟳ Yangilash',

      // AI panel
      'ai.title': '🤖 AI klinik xulosa — kasalliklar (bor / yo\'q)',
      'ai.empty': 'Shaxs tanilmadi — Face ID bilan yuzni tanlang yoki bemorni tanlab, "Qayta tahlil qilish" tugmasini bosing.',
      'ai.bor': 'Bor (aniqlandi)',
      'ai.shubha': 'Shubha — tekshiruv kerak',
      'ai.yoq': 'Yo\'q (aniqlanmadi)',
      'ai.group': 'Guruh',
      'ai.conf': 'Ishonch',
      'ai.disclaimer': '⚕ AI xulosa oflayn qoidalar dvijoki (ICRP 103, WHO, BEIR VII, ICD-10) asosida tuziladi. Bu tashxis emas — yakuniy xulosa shifokor tomonidan beriladi.',

      // Face ID
      'faceid.title': '🪪 Shaxsni tanish (Face ID)',
      'faceid.wait': 'Yuz tanilmoqda...',
      'faceid.noface': 'Ro\'yxatda yuz yo\'q — yuzni registratsiyada qo\'shing',
      'faceid.off': 'Kamera yoqilmagan',
      'faceid.unknown': 'Noma\'lum shaxs',
      'faceid.match': 'o\'xshashlik',

      // Bemorlar jadvali
      'th.patient': 'Bemor / Xodim',
      'th.dept': 'Bo\'lim / hudud',
      'th.year': 'Tug\'ilgan yil',
      'th.phone': 'Telefon',
      'th.visits': 'Tashriflar',
      'th.dose': 'Jami doza',
      'th.risk': 'Oxirgi risk',
      'th.face': 'Face ID',
      'th.nation': 'Millat',
      'th.login': 'Login',
      'th.role': 'Rol',
      'th.created': 'Ro\'yxatdan o\'tgan',
      'th.lastlogin': 'Oxirgi kirish',

      // Xabarlar
      'msg.need.analysis': 'Avval tahlilni o\'tkazing',
      'msg.need.person': 'Shaxs/bemor tanlanmagan',
      'msg.ident.cleared': 'Identifikatsiya tozalandi',
      'msg.lang.changed': 'Til o\'zgartirildi',
      'msg.snap.saved': 'Skrining surati saqlandi'
    },

    ru: {
      // Вход / регистрация
      'auth.login': '🔑 Вход',
      'auth.register': '📝 Регистрация',
      'auth.login.title': 'Вход в систему',
      'auth.login.submit': 'Войти в систему',
      'auth.login.desc': 'НМКГ · радиационный контроль и медицинский скрининг',
      'auth.fio': 'Ф.И.О. (имя и фамилия)',
      'auth.login.ph': 'например: a.karimov',
      'auth.password': 'Пароль',
      'auth.password.ph': 'не менее 6 символов',
      'auth.password2': 'Повторите пароль',
      'auth.role': 'Роль',
      'auth.role.operator': 'Рабочий / Оператор',
      'auth.role.doctor': 'Врач / Радиолог',
      'auth.nation': 'Национальность',
      'auth.nation.ph': 'Выберите национальность',
      'auth.submit': 'Зарегистрироваться',
      'auth.wait': 'Ожидание…',
      'auth.face': 'Идентификация по лицу (Face ID) — необязательно',
      'auth.face.add': '📷 Добавить лицо (5 образцов)',
      'auth.face.on': '■ Остановить камеру',
      'auth.face.done': '✓ Лицо готово — повторить',
      'auth.face.wait': 'Камера выключена — нажмите, чтобы записать лицо',

      // Основная навигация
      'tab.monitor': '📊 Мониторинг',
      'tab.vision': '📷 Скрининг камеры',
      'tab.patients': '🧑‍🤝‍🧑 Пациенты',
      'tab.queue': '🏥 Очередь врача',
      'tab.admin': '🛠 Админ',
      'tab.method': '📐 Методика',

      // Верхняя панель
      'top.lang': 'Язык',
      'top.logout': 'Выход',
      'top.sound.on': 'Звук включен (Гейгер / Сирена)',
      'top.sound.off': 'Звук выключен',
      'top.server.on': 'сервер онлайн',
      'top.server.off': 'локальный режим (offline)',
      'top.checking': 'проверка...',
      'top.org': 'НМКГ · Гидрометаллургический завод · Радиационная безопасность',

      // Баннер тревоги
      'alert.title': '⚠️ ВНИМАНИЕ: РАДИАЦИЯ ВЫШЕ НОРМЫ!',
      'alert.desc': 'Повышенный радиационный фон в зоне. Персоналу надеть средства защиты и перейти в укрытие.',
      'alert.btn.mute': '🔕 Отключить звук',
      'alert.btn.ref': '🏥 Направить к врачу',

      // Заголовки страниц
      'page.monitor': 'Мониторинг и Дозиметрия',
      'page.vision': 'Скрининг Камеры и Биометрия',
      'page.patients': 'Реестр Пациентов и Персонала',
      'page.queue': 'Очередь Врача — Направления',
      'page.admin': 'Админ-Панель — Управление',
      'page.method': 'Методика и Стандарты',

      // Кнопки
      'btn.analyze': '🔎 Провести полный анализ',
      'btn.save.ref': '🏥 Добавить направление в очередь',
      'btn.print': '🖨 Печать (PDF)',
      'btn.cam.start': '▶ Включить камеру',
      'btn.cam.stop': '■ Стоп',
      'btn.cam.snap': '📸 Сделать снимок скрининга',
      'btn.image': '🖼 Загрузить фото',
      'btn.clear.ident': '✕ Сбросить опознание',
      'btn.ai.run': '🔎 Повторный анализ',
      'btn.add.patient': '+ Добавить пациента',
      'btn.export.csv': '⬇ Экспорт CSV',
      'btn.backup': '📥 Бэкап (JSON)',
      'btn.restore': '📤 Восстановить (JSON)',
      'btn.refresh': '⟳ Обновить',

      // AI панель
      'ai.title': '🤖 AI клиническое заключение — болезни (есть / нет)',
      'ai.empty': 'Лицо не опознано — выберите лицо через Face ID или пациента и нажмите «Повторный анализ».',
      'ai.bor': 'Есть (обнаружено)',
      'ai.shubha': 'Подозрение — нужна проверка',
      'ai.yoq': 'Нет (не обнаружено)',
      'ai.group': 'Группа',
      'ai.conf': 'Уверенность',
      'ai.disclaimer': '⚕ AI-заключение составлено офлайн-движком правил (ICRP 103, WHO, BEIR VII, ICD-10). Это не диагноз — окончательное заключение даёт врач.',

      // Face ID
      'faceid.title': '🪪 Опознание лица (Face ID)',
      'faceid.wait': 'Идентификация лица...',
      'faceid.noface': 'Нет лиц в реестре — добавьте лицо при регистрации',
      'faceid.off': 'Камера выключена',
      'faceid.unknown': 'Неизвестное лицо',
      'faceid.match': 'сходство',

      // Таблица пациентов
      'th.patient': 'Пациент / Работник',
      'th.dept': 'Отдел / зона',
      'th.year': 'Год рождения',
      'th.phone': 'Телефон',
      'th.visits': 'Визиты',
      'th.dose': 'Суммарная доза',
      'th.risk': 'Последний риск',
      'th.face': 'Face ID',
      'th.nation': 'Национальность',
      'th.login': 'Логин',
      'th.role': 'Роль',
      'th.created': 'Зарегистрирован',
      'th.lastlogin': 'Последний вход',

      // Сообщения
      'msg.need.analysis': 'Сначала выполните анализ',
      'msg.need.person': 'Лицо/пациент не выбраны',
      'msg.ident.cleared': 'Опознание сброшено',
      'msg.lang.changed': 'Язык изменён',
      'msg.snap.saved': 'Снимок скрининга сохранён'
    },

    en: {
      // Auth
      'auth.login': '🔑 Login',
      'auth.register': '📝 Register',
      'auth.login.title': 'System Login',
      'auth.login.submit': 'Sign In',
      'auth.login.desc': 'NMMC · Radiation Safety and Health Screening System',
      'auth.fio': 'Full Name',
      'auth.login.ph': 'e.g.: a.karimov',
      'auth.password': 'Password',
      'auth.password.ph': 'at least 6 characters',
      'auth.password2': 'Repeat Password',
      'auth.role': 'Role',
      'auth.role.operator': 'Worker / Operator',
      'auth.role.doctor': 'Doctor / Radiologist',
      'auth.nation': 'Nationality',
      'auth.nation.ph': 'Select nationality',
      'auth.submit': 'Register Account',
      'auth.wait': 'Please wait…',
      'auth.face': 'Face Identification (Face ID) — optional',
      'auth.face.add': '📷 Register Face (5 samples)',
      'auth.face.on': '■ Stop Camera',
      'auth.face.done': '✓ Face enrolled — retake',
      'auth.face.wait': 'Camera off — click to enroll face',

      // Main Navigation
      'tab.monitor': '📊 Monitoring',
      'tab.vision': '📷 Camera Screening',
      'tab.patients': '🧑‍🤝‍🧑 Patients',
      'tab.queue': '🏥 Doctor Queue',
      'tab.admin': '🛠 Admin',
      'tab.method': '📐 Methodology',

      // Topbar
      'top.lang': 'Language',
      'top.logout': 'Logout',
      'top.sound.on': 'Audio Active (Geiger / Alarm)',
      'top.sound.off': 'Audio Muted',
      'top.server.on': 'server online',
      'top.server.off': 'local mode (offline)',
      'top.checking': 'checking...',
      'top.org': 'NMMC · Hydrometallurgical Plant · Radiation Safety',

      // Warning Banner
      'alert.title': '⚠️ WARNING: ELEVATED RADIATION LEVEL!',
      'alert.desc': 'Radiation rate exceeds normal baseline. Personnel must equip protective gear and proceed to shelter.',
      'alert.btn.mute': '🔕 Mute Alarm',
      'alert.btn.ref': '🏥 Create Referral',

      // Page Titles
      'page.monitor': 'Monitoring & Dosimetry',
      'page.vision': 'Camera Screening & Biometrics',
      'page.patients': 'Patient & Personnel Registry',
      'page.queue': 'Doctor Queue & Referrals',
      'page.admin': 'Admin Panel & Control',
      'page.method': 'Methodology & Standards',

      // Buttons
      'btn.analyze': '🔎 Run Full Analysis',
      'btn.save.ref': '🏥 Add Referral to Queue',
      'btn.print': '🖨 Print (PDF)',
      'btn.cam.start': '▶ Start Camera',
      'btn.cam.stop': '■ Stop Camera',
      'btn.cam.snap': '📸 Take Screening Snapshot',
      'btn.image': '🖼 Upload Photo',
      'btn.clear.ident': '✕ Clear Identification',
      'btn.ai.run': '🔎 Re-analyze',
      'btn.add.patient': '+ Add Patient',
      'btn.export.csv': '⬇ Export CSV',
      'btn.backup': '📥 Backup (JSON)',
      'btn.restore': '📤 Restore (JSON)',
      'btn.refresh': '⟳ Refresh',

      // AI panel
      'ai.title': '🤖 AI Clinical Assessment — Findings (Present / Absent)',
      'ai.empty': 'Identity not confirmed — use Face ID or select a patient, then click "Re-analyze".',
      'ai.bor': 'Present (Confirmed)',
      'ai.shubha': 'Suspect — Needs Check',
      'ai.yoq': 'Absent (Not Found)',
      'ai.group': 'Category',
      'ai.conf': 'Confidence',
      'ai.disclaimer': '⚕ AI evaluation based on rule engine (ICRP 103, WHO, BEIR VII, ICD-10). Not a definitive diagnosis — final judgment belongs to a physician.',

      // Face ID
      'faceid.title': '🪪 Face Identification (Face ID)',
      'faceid.wait': 'Identifying face...',
      'faceid.noface': 'No faces registered — enroll during registration',
      'faceid.off': 'Camera is off',
      'faceid.unknown': 'Unrecognized Person',
      'faceid.match': 'similarity',

      // Patient Table
      'th.patient': 'Patient / Personnel',
      'th.dept': 'Department / Zone',
      'th.year': 'Birth Year',
      'th.phone': 'Phone',
      'th.visits': 'Visits',
      'th.dose': 'Total Dose',
      'th.risk': 'Latest Risk',
      'th.face': 'Face ID',
      'th.nation': 'Nationality',
      'th.login': 'Login',
      'th.role': 'Role',
      'th.created': 'Registered At',
      'th.lastlogin': 'Last Login',

      // Messages
      'msg.need.analysis': 'Please run analysis first',
      'msg.need.person': 'No patient selected',
      'msg.ident.cleared': 'Identification cleared',
      'msg.lang.changed': 'Language changed',
      'msg.snap.saved': 'Screening snapshot saved'
    }
  };

  /* ------------------------- Millatlar (nations) ------------------------ */
  const NATIONS = [
    { id: 'uzbek', uz: "O'zbek", ru: 'Узбек', en: 'Uzbek' },
    { id: 'russian', uz: 'Rus', ru: 'Русский', en: 'Russian' },
    { id: 'tajik', uz: 'Tojik', ru: 'Таджик', en: 'Tajik' },
    { id: 'kazakh', uz: 'Qozoq', ru: 'Казах', en: 'Kazakh' },
    { id: 'kyrgyz', uz: "Qirg'iz", ru: 'Киргиз', en: 'Kyrgyz' },
    { id: 'turkmen', uz: 'Turkman', ru: 'Туркмен', en: 'Turkmen' },
    { id: 'azerbaijani', uz: "O'zarbayjon", ru: 'Азербайджанец', en: 'Azerbaijani' },
    { id: 'korean', uz: 'Koreys', ru: 'Кореец', en: 'Korean' },
    { id: 'tatar', uz: 'Tatar', ru: 'Татарин', en: 'Tatar' },
    { id: 'bashkir', uz: 'Boshqird', ru: 'Башкир', en: 'Bashkir' },
    { id: 'chinese', uz: 'Xitoylik', ru: 'Китаец', en: 'Chinese' },
    { id: 'turkish', uz: 'Turk', ru: 'Турок', en: 'Turkish' },
    { id: 'ukrainian', uz: 'Ukrain', ru: 'Украинец', en: 'Ukrainian' },
    { id: 'belarusian', uz: 'Belarus', ru: 'Белорус', en: 'Belarusian' },
    { id: 'armenian', uz: 'Arman', ru: 'Армянин', en: 'Armenian' },
    { id: 'georgian', uz: 'Gruzin', ru: 'Грузин', en: 'Georgian' },
    { id: 'moldovan', uz: 'Moldovan', ru: 'Молдован', en: 'Moldovan' },
    { id: 'german', uz: 'Nemis', ru: 'Немец', en: 'German' },
    { id: 'jewish', uz: 'Yahudiy', ru: 'Еврей', en: 'Jewish' },
    { id: 'uyghur', uz: "Uyg'ur", ru: 'Уйгур', en: 'Uyghur' },
    { id: 'other', uz: 'Boshqa', ru: 'Другая', en: 'Other' }
  ];

  let currentLang = localStorage.getItem(KEY) || 'uz';
  if (!DICT[currentLang]) currentLang = 'uz';

  const listeners = [];
  const onLang = (cb) => listeners.push(cb);

  const t = (key) => {
    const cur = DICT[currentLang] || DICT.uz;
    return cur[key] || DICT.uz[key] || key;
  };

  /** Millat id → hozirgi tildagi nomi */
  const nation = (id) => {
    const n = NATIONS.find((x) => x.id === id);
    return n ? (n[currentLang] || n.uz) : (id || '');
  };

  /** Millat nomi → id */
  const nationId = (nameOrId) => {
    const s = String(nameOrId || '').trim();
    if (!s) return '';
    const byId = NATIONS.find((x) => x.id === s);
    if (byId) return byId.id;
    const low = s.toLowerCase();
    const byName = NATIONS.find(
      (x) =>
        x.uz.toLowerCase() === low ||
        x.ru.toLowerCase() === low ||
        (x.en && x.en.toLowerCase() === low)
    );
    return byName ? byName.id : s;
  };

  /** DOM'dagi barcha data-i18n elementlarini tarjima qilish */
  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      const val = t(el.dataset.i18n);
      if (val) el.textContent = val;
    });
    root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
      const val = t(el.dataset.i18nPh);
      if (val) el.placeholder = val;
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const val = t(el.dataset.i18nTitle);
      if (val) el.title = val;
    });
    document.documentElement.lang = currentLang;

    // Til tanlagich tugmalarini yangilash
    document.querySelectorAll('[data-set-lang]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.setLang === currentLang);
    });
  }

  /** Tilni almashtirish */
  function setLang(newLang) {
    if (!DICT[newLang]) return currentLang;
    currentLang = newLang;
    localStorage.setItem(KEY, newLang);
    apply();
    listeners.forEach((cb) => {
      try { cb(currentLang); } catch (e) { console.error('i18n callback error', e); }
    });
    return currentLang;
  }

  return {
    t,
    nation,
    nationId,
    apply,
    setLang,
    onLang,
    NATIONS,
    get lang() { return currentLang; },
    get dict() { return DICT; }
  };
})();
