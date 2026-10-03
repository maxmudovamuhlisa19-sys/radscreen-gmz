'use strict';

/**
 * RadSkrin — xalqaroellashtirish (i18n): o'zbekcha / ruscha
 *
 * Ishlash tartibi:
 *  1) HTML yorliqlariga data-i18n="kalit" (matn), data-i18n-ph="kalit" (placeholder),
 *     data-i18n-title="kalit" (title) beriladi — apply() ularni tarjima qiladi.
 *  2) Dynamic matnlar uchun I18n.t('kalit') chaqiriladi.
 *  3) Til localStorage'da saqlanadi, o'zgarsa 'langchange' hodisasi uzatiladi.
 *  4) Millatlar (nationality) ro'yxati ikki tilda ham mavjud.
 */
window.I18n = (() => {
  const KEY = 'radscreen.lang';

  /* ----------------------------- Sözlav ----------------------------- */
  const DICT = {
    uz: {
      // Kirish / registratsiya
      'auth.login': '🔑 Kirish',
      'auth.register': '📝 Ro\'yxatdan o\'tish',
      'auth.login.title': 'Tizimga kirish',
      'auth.login.submit': 'Tizimga kirish',
      'auth.login.desc': 'NMKG · radiatsion nazorat tizimi',
      'auth.fio': 'F.I.Sh. (ism familya)',
      'auth.login.ph': 'masalan: a.karimov',
      'auth.password': 'Parol',
      'auth.password.ph': 'kamida 6 ta belgi',
      'auth.password2': 'Parolni takrorlang',
      'auth.role': 'Rol',
      'auth.role.operator': 'Ishchi',
      'auth.role.doctor': 'Shifokor',
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
      'top.server.on': 'server onlayn',
      'top.server.off': 'lokal rejim (localStorage)',
      'top.checking': 'tekshirilmoqda...',

      // Sahifa sarlavhalari
      'page.monitor': 'Monitoring',
      'page.vision': 'Camera skriningi',
      'page.patients': 'Bemorlar ro\'yxati',
      'page.queue': 'Shifokor navbati — yo\'llanmalar',
      'page.admin': 'Admin panel — foydalanuvchilar',
      'page.method': 'Metodika',

      // Tugmalar
      'btn.analyze': '🔎 To\'liq tahlilni o\'tkazish',
      'btn.save.ref': '🏥 Yo\'llanmani navbatga qo\'shish',
      'btn.print': '🖨 Chop etish',
      'btn.cam.start': '▶ Kamerani yoqish',
      'btn.cam.stop': '■ To\'xtatish',
      'btn.image': '🖼 Rasm yuklash',
      'btn.clear.ident': '✕ Tanishni tozalash',
      'btn.ai.run': '🔎 Qayta tahlil qilish',
      'btn.add.patient': '+ Bemor qo\'shish',
      'btn.export.csv': '⬇ CSV eksport',
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
      'th.patient': 'Bemor',
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
      'msg.lang.changed': 'Til o\'zgartirildi'
    },

    ru: {
      // Вход / регистрация
      'auth.login': '🔑 Вход',
      'auth.register': '📝 Регистрация',
      'auth.login.title': 'Вход в систему',
      'auth.login.submit': 'Войти в систему',
      'auth.login.desc': 'НМКГ · система радиационного контроля',
      'auth.fio': 'Ф.И.О. (имя и фамилия)',
      'auth.login.ph': 'например: a.karimov',
      'auth.password': 'Пароль',
      'auth.password.ph': 'не менее 6 символов',
      'auth.password2': 'Повторите пароль',
      'auth.role': 'Роль',
      'auth.role.operator': 'Рабочий',
      'auth.role.doctor': 'Врач',
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
      'top.server.on': 'сервер онлайн',
      'top.server.off': 'локальный режим (localStorage)',
      'top.checking': 'проверка...',

      // Заголовки страниц
      'page.monitor': 'Мониторинг',
      'page.vision': 'Скрининг камеры',
      'page.patients': 'Список пациентов',
      'page.queue': 'Очередь врача — направления',
      'page.admin': 'Админ-панель — пользователи',
      'page.method': 'Методика',

      // Кнопки
      'btn.analyze': '🔎 Провести полный анализ',
      'btn.save.ref': '🏥 Добавить направление в очередь',
      'btn.print': '🖨 Печать',
      'btn.cam.start': '▶ Включить камеру',
      'btn.cam.stop': '■ Стоп',
      'btn.image': '🖼 Загрузить фото',
      'btn.clear.ident': '✕ Сбросить опознание',
      'btn.ai.run': '🔎 Повторный анализ',
      'btn.add.patient': '+ Добавить пациента',
      'btn.export.csv': '⬇ Экспорт CSV',
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
      'th.patient': 'Пациент',
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
      'msg.lang.changed': 'Язык изменён'
    }
  };

  /* ------------------------- Millatlar (nation) ------------------------ */
  const NATIONS = [
    { id: 'uzbek', uz: "O'zbek", ru: 'Узбек' },
    { id: 'russian', uz: 'Rus', ru: 'Русский' },
    { id: 'tajik', uz: 'Tojik', ru: 'Таджик' },
    { id: 'kazakh', uz: 'Qozoq', ru: 'Казах' },
    { id: 'kyrgyz', uz: 'Qirg\'iz', ru: 'Киргиз' },
    { id: 'turkmen', uz: 'Turkman', ru: 'Туркмен' },
    { id: 'azerbaijani', uz: 'O\'zerbayjon', ru: 'Азербайджанец' },
    { id: 'korean', uz: 'Koreys', ru: 'Кореец' },
    { id: 'tatar', uz: 'Tatar', ru: 'Татарин' },
    { id: 'bashkir', uz: 'Boshqird', ru: 'Башкир' },
    { id: 'chinese', uz: 'Chin', ru: 'Китаец' },
    { id: 'turkish', uz: 'Turk', ru: 'Турок' },
    { id: 'ukrainian', uz: 'Ukrain', ru: 'Украинец' },
    { id: 'belarusian', uz: 'Belarus', ru: 'Белорус' },
    { id: 'armenian', uz: 'Arman', ru: 'Армянин' },
    { id: 'georgian', uz: 'Gruzin', ru: 'Грузин' },
    { id: 'moldovan', uz: 'Moldovan', ru: 'Молдован' },
    { id: 'german', uz: 'Nemis', ru: 'Немец' },
    { id: 'jewish', uz: 'Yahudiy', ru: 'Еврей' },
    { id: 'uyghur', uz: 'Uyg\'ur', ru: 'Уйгур' },
    { id: 'other', uz: 'Boshqa', ru: 'Другая' }
  ];

  // Eslab qolinadigan tanlov yo'q — interfeys doimiy o'zbek tilida.
  // AI ovozi esa shaxsning millatiga qarab avtomatik uz/ru bo'ladi (ai-diagnosis.js).
  const lang = 'uz';

  const listeners = [];
  const onLang = (cb) => listeners.push(cb);

  const t = (key) => (DICT[lang] && DICT[lang][key]) || DICT.uz[key] || key;

  /** Millat id → hozirgi tilda nom */
  const nation = (id) => {
    const n = NATIONS.find((x) => x.id === id);
    return n ? n[lang] : (id || '');
  };

  /** Millat nomi → id (registratsiyadan keyin saqlash uchun) */
  const nationId = (nameOrId) => {
    const s = String(nameOrId || '').trim();
    if (!s) return '';
    const byId = NATIONS.find((x) => x.id === s);
    if (byId) return byId.id;
    const low = s.toLowerCase();
    const byName = NATIONS.find((x) => x.uz.toLowerCase() === low || x.ru.toLowerCase() === low);
    return byName ? byName.id : s;
  };

  /** DOM'dagi data-i18n yorliqlarini tarjima qilish */
  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    document.documentElement.lang = lang;
  }

  /** Endi til almashtirish yo'q — UI doimiy uz. Keyinchalik qayta tiklash mumkin. */
  function setLang() { return lang; }

  return {
    t, nation, nationId, apply, setLang, onLang, NATIONS,
    get lang() { return lang; },
    get dict() { return DICT; }
  };
})();
