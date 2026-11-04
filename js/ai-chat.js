/**
 * AIChat — oflayn suhbat dvijoki (tashqi API yo'q).
 *
 * Foydalanuvchi savolini (matn yoki ovozdan olingan) tushunib, joriy AI
 * tahlil (diag) asosida qisqa javob qaytaradi. Serverdagi LLM (Gemini)
 * javob bermaganda (internet/klit yo'q) shu dvijok ishlaydi.
 *
 *   const a = AIChat.ask(matn, diag, 'uz', history);
 *   -> { text: '...', lang: 'uz'|'ru' }
 *
 * Imkoniyatlari:
 *   • niyat (intent) ballari — savol ma'nosi bo'yicha eng mos javob tanlanadi;
 *   • ulashma savolga bir vaqtda javob ("xavf va doza qanday?");
 *   • kontekst: "batafsil", "nima uchun", "takrorla" — oldingi mavzu davom etadi;
 *   • ism eslab qolish, salom/rahmat/ha kabi oddiy muloqot;
 *   • tushunilmagan savolga — qisqa xulosa + misol savollar;
 *   • o'zbekcha va ruscha, so'rov tilini avtomatik aniqlaydi;
 *   • null diag bilan ham xato bermaydi.
 */
(function () {
  'use strict';

  /* ============================== TIL ============================== */

  const RU_NATIONS = new Set([
    'russian', 'tatar', 'bashkir', 'ukrainian', 'belarusian', 'moldovan',
    'kazakh', 'kyrgyz', 'armenian', 'georgian'
  ]);

  function langOf(diag, person) {
    if (diag && diag.lang) return diag.lang;
    const p = person || (diag && diag.person) || null;
    const nat = String((p && p.nationality) || '').toLowerCase();
    return RU_NATIONS.has(nat) ? 'ru' : 'uz';
  }

  const CYR = /[Ѐ-ӿ]/;

  /** Savol matnidagi kirill alifbosiga qarab tilni aniqlaydi. */
  function detectLang(q, base) {
    if (CYR.test(String(q || ''))) return 'ru';
    return base === 'ru' ? 'ru' : 'uz';
  }

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[''`´]/g, '')
      .replace(/[.,!?;:…]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const words = (t) => t.split(' ').filter(Boolean);
  const has = (t, list) => list.some((w) => t.includes(w));
  /** faqat butun so'z sifatida (qisqa so'zlarga uchirilmaydi) */
  const hasWord = (t, w) => (' ' + t + ' ').includes(' ' + w + ' ');

  /** Suhbat xotirasi (modul darajasida) */
  const mem = { name: null, topic: null, lastText: null };

  /* ============================ NIYATLAR ============================ */
  /* kw — kalit so'zlar (ball), whole — faqat butun so'z, limit — so'z soni */

  const INTENTS = [
    { id: 'greet', whole: 1, limit: 6, kw: { 'salom': 3, 'assalomu alaykum': 6, 'assalom': 5, 'hello': 5, 'hi': 4, 'привет': 5, 'здравствуйте': 6, 'здравствуй': 5, 'здорово': 4, 'салом': 4, 'добрый день': 5, 'доброе утро': 5, 'добрый вечер': 5 } },
    { id: 'howareyou', limit: 8, kw: { 'qandaysiz': 7, 'как дела': 6, 'как вы': 5, 'как жизнь': 5, 'как ваши дела': 6 } },
    { id: 'name', limit: 12, kw: { 'ismim': 6, 'меня зовут': 6, 'моё имя': 6, 'мое имя': 6, 'mening ismim': 6, 'ismlim': 5 } },
    { id: 'identity', kw: { 'siz kimsiz': 7, 'sizning ismingiz': 7, 'кто вы': 7, 'ваше имя': 7, 'как вас зовут': 7, 'названитесь': 6, 'radskrin': 5, 'men kim': 6, 'kimman': 5, 'meni kim': 6, 'кто я': 6, 'kimsan': 5, 'сунъи интеллект': 6, 'искусственный интеллект': 5 } },
    { id: 'bye', whole: 1, limit: 8, kw: { 'xayr': 5, 'hayr': 4, 'bye': 6, 'goodbye': 6, 'до свидания': 7, 'саломат': 4, 'rahmat': 5, 'спасибо': 6, 'thank': 6, 'thanks': 6 } },
    { id: 'yesok', whole: 1, limit: 5, kw: { 'ok': 4, 'okay': 4, 'ha': 3, 'togri': 4, 'tushunarli': 5, 'понятно': 5, 'ясно': 4, 'хорошо': 4, 'ладно': 4, 'да': 3 } },
    { id: 'emergency', kw: { 'favqulodda': 7, 'shoshilinch': 7, 'tez yordam': 7, 'скорая': 7, 'неотложн': 7, 'экстрен': 6, 'помогите': 6, 'ogriq': 4, 'боль': 4, '103': 7 } },
    { id: 'report', kw: { 'hisobot': 5, 'natijalar': 5, 'natija': 4, 'tahlil': 2, 'umumiy': 3, 'результат': 5, 'итог': 4, 'отчет': 6, 'отчёт': 6, 'заключен': 6, 'обследован': 4, 'расскажи': 3, 'расскажите': 3, 'summary': 5, 'показать всё': 6 } },
    { id: 'risk', kw: { 'xavf': 4, 'xavfli': 4, 'risk': 4, 'риск': 4, 'опасно': 4, 'опасность': 4, 'угроз': 4, 'foiz': 2, 'процент': 2 } },
    { id: 'dose', kw: { 'doza': 5, 'nurlanish': 5, 'sug ': 4, 'mikrosievert': 6, 'mikrosivert': 6, 'мкз': 6, 'доза': 5, 'облучен': 5, 'радиац': 4, 'фон': 4, 'излучен': 5, 'радиация': 5 } },
    { id: 'disease', kw: { 'kasallik': 5, 'kasal': 4, 'bemor': 3, 'tashxis': 5, 'nima bor': 6, 'belgi': 4, 'simptom': 5, 'symptom': 5, 'что у меня': 6, 'болезнь': 5, 'заболеван': 5, 'диагноз': 5, 'признак': 4, 'недуг': 5, 'найдено': 4 } },
    { id: 'health', kw: { 'holat': 4, 'soglik': 4, "sog'lik": 4, 'tanim': 4, 'здоровь': 5, 'состояни': 5, 'самочувств': 6, 'how am i': 5 } },
    { id: 'tests', kw: { 'analiz': 6, 'тест': 5, 'test': 4, 'qanday tahlil': 6, 'tahlil kerak': 6, 'kerakli tahlil': 6, 'qanday tekshir': 6, 'checkup': 6, 'чекап': 6, 'анализ': 6, 'требуется сдать': 6, 'что сдать': 6 } },
    { id: 'explain', kw: { 'nima uchun': 6, 'sabab': 5, 'почему': 6, 'нега': 6, 'причина': 6, 'как возник': 6, 'появил': 5, 'batafsil': 6, 'батафсил': 6, 'tushuntir': 5, 'объясн': 5, 'подробн': 5, 'qanday aniqlanadi': 7, 'как определя': 7, 'как выявля': 7, 'как работает': 6, 'принцип': 5, 'детально': 5 } },
    { id: 'repeat', kw: { 'takrorla': 6, 'yana ayting': 6, 'qayta ayt': 6, 'повтори': 6, 'повторите': 6, 'заново': 5, 'покажи ещё': 5 } },
    { id: 'advice', kw: { 'tavsiya': 5, 'nima qilay': 6, 'что делать': 6, 'совет': 5, 'рекомендац': 5, 'подскаж': 4, 'маслахат': 5, 'порекоменд': 5 } },
    { id: 'protection', kw: { 'himoya': 5, 'защит': 5, 'предохран': 5, 'безопасн': 4, 'респиратор': 5, 'дозиметр': 5, 'қандайҳимоя': 6 } },
    { id: 'treatment', kw: { 'davolash': 6, 'dori': 5, 'лечен': 6, 'лекарств': 6, 'терапи': 5, 'kurs': 4, 'рецепт': 5, 'исцелит': 5 } },
    { id: 'nutrition', kw: { 'ovqat': 5, 'parhez': 6, 'питани': 6, 'диет': 6, 'еда': 5, 'витамин': 5, 'taom': 4 } },
    { id: 'sport', kw: { 'sport': 5, 'mashq': 5, 'физкульт': 6, 'упражнен': 6, 'тренир': 6, 'прогулк': 6, 'бег': 4 } },
    { id: 'doctor', kw: { 'shifokor': 5, 'vrach': 5, 'доктор': 5, 'клиника': 5, 'navbat': 5, 'очеред': 5, 'yollanma': 6, 'направлен': 6, 'записаться': 5, 'прием к': 5 } },
    { id: 'when', kw: { 'qachon': 5, 'necha vaqt': 6, 'когда': 5, 'через сколько': 7, 'через': 3, 'повторн': 5, 'снова': 4, 'keyin qachon': 6 } },
    { id: 'prognosis', kw: { 'qancha yashay': 7, 'umrim': 5, 'omrim': 5, 'prognoz': 6, 'прогноз': 6, 'выживаем': 6, 'сколько прожив': 7, 'срок жизни': 6, 'продлить жизнь': 6 } },
    { id: 'prevention', kw: { 'profilaktika': 6, 'профилактик': 6, 'oldini olish': 7, 'предотврат': 6, 'предупред': 5, 'skrining': 4, 'скрининг': 4 } },
    { id: 'children', kw: { 'homilador': 7, 'беремен': 7, ' bola': 5, 'bolalar': 6, 'bolani': 5, 'ребенок': 6, 'ребёнок': 6, 'дети': 6 } },
    { id: 'fact', kw: { 'nima ekan': 7, 'nima ekanini': 7, 'nima degan': 6, 'degani': 5, 'что такое': 7, 'что это': 6, 'расскажи': 7, 'tell me': 7, 'what is': 7, 'malumot': 6, 'информац': 5, 'haqida': 5, 'об этом': 4, 'поговори': 5, 'определи': 5 } },
    { id: 'help', kw: { 'yordam': 5, 'помощ': 5, 'help': 5, 'imkoniyat': 5, 'что ты умеешь': 7, 'что умеешь': 7, 'возможност': 5, 'как работаешь': 6, 'как пользоваться': 7, 'nima': 1, 'qanday': 1, 'что': 1, 'как': 1 } }
  ];

  const byId = {};
  INTENTS.forEach((i) => { byId[i.id] = i; });

  /** Ma'lumotga (diag) tayangan niyatlar — kontekst mavzusi sifatida eslab qolinadi */
  const CONTENT = new Set(['report', 'risk', 'dose', 'disease', 'health', 'tests', 'advice',
    'protection', 'treatment', 'nutrition', 'sport', 'doctor', 'when', 'prognosis',
    'prevention', 'children', 'emergency']);

  /** Ikkiga bo'linadigan (ulashma) niyatlar */
  const JOINABLE = new Set(['report', 'risk', 'dose', 'disease', 'health', 'tests', 'explain',
    'advice', 'protection', 'treatment', 'nutrition', 'sport', 'doctor', 'when',
    'prognosis', 'prevention', 'children', 'emergency']);

  const CONNECT = [' va ', ' ham ', ' va ham ', ' shuningdek ', ' а также ', ' и ', ' plus ', ' + '];

  function scoreOf(t, it) {
    if (it.limit && words(t).length > it.limit) return 0;
    let s = 0;
    for (const k in it.kw) {
      const hit = it.whole ? hasWord(t, k) : t.includes(k);
      if (hit) s += it.kw[k];
    }
    return s;
  }

  function scoreAll(t) {
    return INTENTS
      .map((it, i) => ({ it, i, score: scoreOf(t, it) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.i - b.i);
  }

  /* =================== BIG DATA — BILIMLAR LUG'ATI ==================== */
  /* kw — kalit so'zlar (uz/ru), uz/ru — izohli ma'lumot matni.          */
  /* «nima ekan?», «nima haqida?» kabi savollarda shu lug'atdan javob    */
  /* beriladi: mikrosievert, ICRP, himoya qoidalari, organlar, kasallik,  */
  /* favqulodda tartib, hayot tarzi, tibbiy asboblar — jami 60+ ma'lumot. */

  const FACTS = [
    /* --- birliklar --- */
    { kw: ['mikrosievert', 'mikrosivert', 'мкз', 'микросиверт', 'микросиеверт', ' µsv', 'usv'], uz: "Mikrosievert (µSv) — kichik doza birligi: 1 µSv = 0,001 mSv. Doza tezligini aynan shu birligda o'lchaydi (µSv/soat). Tabiiy fon odatda 0,1–0,5 µSv/soat atrofida bo'ladi.", ru: 'Микросиверт (мкЗв) — единица малой дозы: 1 мкЗв = 0,001 мЗв. Именно в ней измеряют скорость дозы (мкЗв/ч). Естественный фон обычно 0,1–0,5 мкЗв/ч.' },
    { kw: ['millisievert', 'millisivert', 'мсв', 'миллисиверт'], uz: "Millisievert (mSv) — 1000 mikrosievert. Shu birligda yillik chegaraviy dozalar hisoblanadi: aholi uchun 1 mSv/yil, kasbiy uchun 20 mSv/yil.", ru: 'Миллизиверт (мЗв) = 1000 микросивертов. В этой единице считают годовые предельные дозы: для населения 1 мЗв/год, для профессионалов 20 мЗв/год.' },
    { kw: ['sievert', 'зиверт', 'sv nima'], uz: "Sievert (Sv) — xalqaro doza birligi. 1 Sv = 1000 mSv = 1 000 000 µSv. Odamlarda odatda mSv va µSv qo'llanadi, Sv katta texnogen vaziyatlarda ishlatiladi.", ru: 'Зиверт (Зв) — международная единица дозы: 1 Зв = 1000 мЗв = 1 000 000 мкЗв. В быту и медицине применяют мЗв и мкЗв, Зв — для крупных аварий.' },
    { kw: ['gray', 'грей', 'absorb'], uz: "Gray (Gy) — yutilgan energiya birligi. Biologik ta'sirni baholashda ekvivalent doza (Sv) ishlatiladi: Sv = Gy × tishli qiymat (Q).", ru: 'Грей (Гр) — единица поглощённой энергии. Для биологической оценки используют эквивалентную дозу: Зв = Гр × коэффициент качества (Q).' },
    { kw: ['rentgen', 'рентген'], uz: "Rentgen (R) — eskirgan doza birligi: 1 R ≈ 0,00877 Sv. Zamonaviy asboblar sievert ko'rinishida ko'rsatadi.", ru: 'Рентген (Р) — устаревшая единица дозы: 1 Р ≈ 0,00877 Зв. Современные приборы показывают дозу в зивертах.' },
    { kw: ['bekerel', 'бекерель', 'bq', 'активность радионуклида'], uz: "Bekerel (Bq) — radioaktiv modda faolligi birligi: bir sekundda qancha atom yemirilishini ko'rsatadi. Katta qiymatlar MBq, GBq ko'rinishida beriladi.", ru: 'Беккерел (Бк) — единица активности радионуклида: сколько атомов распадается за секунду. Крупные значения выражают в МБк, ГБк.' },
    { kw: ['doza tezligi', 'µsv soat', 'mikrosievert soat', 'скорость дозы', 'мкзв в час'], uz: "Doza tezligi — birlik vaqtda olingan doza (µSv/soat). U ortib borishi xavf belgisi: tezlik qanchalik yuqori bo'lsa, hududda bo'lish shunchalik xavfli.", ru: 'Скорость дозы — доза за единицу времени (мкЗв/ч). Её рост — тревожный признак: чем выше скорость, тем опаснее находиться в зоне.' },
    { kw: ['fon nurlanishi', 'фоновое излучение', 'background radiation'], uz: "Fon nurlanishi — atrof-muhitdagi doimiy nurlanish: tuproq, tosh, havo va kosmik nurlar. Dunyo o'rtachasi yiliga ~2,4 mSv, ya'ni kuniga ~6,6 µSv.", ru: 'Фоновое излучение — постоянное излучение среды: почва, горные породы, воздух и космические лучи. В среднем по миру ~2,4 мЗв/год, то есть ~6,6 мкЗв/сутки.' },
    { kw: ['tabiiy fon', 'естественный фон', 'natural background'], uz: "Tabiiy fonning asosiy manbalari: kosmik nurlar, tosh va tuproqdagi uran-toriy va radon gazi. Hududga qarab tezlik 0,1–0,5 µSv/soat oralig'ida farq qiladi.", ru: 'Основные источники естественного фона: космическое излучение, уран и торий в горных породах, радон. Скорость зависит от региона и составляет 0,1–0,5 мкЗв/ч.' },
    { kw: ['radon', 'радон'], uz: "Radon — tuproq va toshdan ajraladigan radioaktiv gaz; yopiq xonalarda ichki fonni asosan aynan u ko'taradi. Oddiy ventilyatsiya bilan sezilarli kamayadi.", ru: 'Радон — радиоактивный газ из почвы и пород; в закрытых помещениях именно он повышает внутренний фон. Обычная вентиляция заметно снижает его уровень.' },
    { kw: ['kunlik norma', 'kunlik doza', 'суточная норма', 'суточная доза'], uz: "Kunlik norma — bir kunda ruxsat etilgan doza. Aholi uchun yillik 1 mSv dan kelib chiqib ~2,7 µSv/kun deb olinadi.", ru: 'Суточная норма — допустимая доза за сутки. Для населения от годового лимита 1 мЗв её берут как ~2,7 мкЗв/сутки.' },
    { kw: ['yillik norma', 'yillik doza', 'годовая норма', 'годовая доза'], uz: "Aholi uchun yillik chegaraviy doza — 1 mSv (ICRP 103). Bu nurlanish manbalari, tibbiy ko'rik va boshqa manbalar uchun umumiy yillik chegara.", ru: 'Годовой предел для населения — 1 мЗв (ICRP 103). Это общий годовой порог с учётом всех источников: среды, медицины и других.' },
    { kw: ['kasbiy norma', 'kasbiy doza', 'профессиональная доза', '20 msv', '20 мсв'], uz: "Nurlanish bilan ishlaydigan xodim uchun yillik chegaraviy doza — 5 yil o'rtachasi bilan 20 mSv va bir yilda 50 mSv dan oshmasligi kerak (ICRP 103).", ru: 'Дозовой предел профессионала — среднегодовой 20 мЗв за 5 лет и не более 50 мЗв за один год (ICRP 103).' },
    { kw: ['chegaraviy doza', 'допустимая доза', 'пределная доза'], uz: "Chegaraviy doza — qonunchilik bilan belgilangan yuqori chegara; uni oshirish taqiqlanadi. Aholi uchun 1 mSv/yil, kasbiy uchun 20 mSv/yil.", ru: 'Предельная доза — верхний порог, установленный нормами; его превышение запрещено. Для населения 1 мЗв/год, для профессионалов 20 мЗв/год.' },
    /* --- tashkilotlar va modellar --- */
    { kw: ['icrp', 'icrp 103', 'icrp-103', 'международная комиссия радиологической защиты', 'xalqaro radiologiya'], uz: "ICRP — Xalqaro radiologiya himoya qo'mitasi. 103-rapport (2007) zamonaviy doza me'yorlarini belgiladi: aholi 1 mSv/yil, kasbiy 20 mSv/yil.", ru: 'МКРЗ (ICRP) — Международная комиссия по радиологической защиты. Доклад 103 (2007) задаёт современные нормы: население 1 мЗв/год, профессионалы 20 мЗв/год.' },
    { kw: ['beir', 'beir vii', 'beir-7'], uz: "BEIR VII — AQSh Fanlar akademiyasi hisoboti (2006): past dozalarda saraton xavfi LNT modeli bo'yicha doza bilan birga o'sadi.", ru: 'BEIR VII — доклад Национальной академии наук США (2006): при малых дозах риск рака растёт вместе с дозой по модели LNT.' },
    { kw: ['lnt', 'lnt modeli', 'chiziqli model', 'нулевой порог'], uz: "LNT — «chiziqli, nol chegarasiz» modeli: saraton xavfi doza bilan proporsional o'sadi va nolgacha tushadi, lekin xavf hech qachon nolga teng bo'lmaydi.", ru: 'LNT — линейная модель без порога: риск рака пропорционально растёт с дозой и убывает к нулю, но никогда не становится равным нулю.' },
    { kw: ['who', 'vsz', 'всемирная организация здравоохранения', 'сзс'], uz: "WHO (JSST) — Sog'liqni saqlash bo'yicha Jahon tashkiloti; nurlanish va yadroviy avariya xavflari bo'yicha tavsiyalar chiqaradi (masalan, 2017-yilgi qo'llanma).", ru: 'ВОЗ — Всемирная организация здравоохранения; издаёт рекомендации по рискам облучения и ядерных аварий (например, руководство 2017 года).' },
    { kw: ['dosimetriya', 'дозиметрия', 'o lchash nurlanish'], uz: "Dozimetriya — nurlanish dozasini o'lchash va baholash ilmi. Dozimetr yordamida doza tezligi va yig'ilgan doza aniqlanadi.", ru: 'Дозиметрия — измерение и оценка доз облучения. С помощью дозиметра определяют скорость дозы и накопленную дозу.' },
    { kw: ['dozimetr', 'дозиметр'], uz: "Dozimetr — nurlanishni o'lchovchi asbob: doza tezligini (µSv/soat) va yig'ilgan dozani ko'rsatadi. Shaxsiy dozimetrni ish davomida o'zida olib yurish kerak.", ru: 'Дозиметр — прибор для измерения излучения: показывает скорость дозы (мкЗв/ч) и накопленную дозу. Индивидуальный дозиметр носят с собой во время работы.' },
    { kw: ['skrining', 'скрининг'], uz: "Skrinning — aholini oddiy va tez tekshiruvdan o'tkazish. Maqsadi: xavf guruhini erta aniqlash. RadSkrin skriningini odatda olti oyda bir tavsiya qiladi.", ru: 'Скрининг — массовое быстрое обследование населения. Цель — раннее выявление группы риска. RadSkrin рекомендует повторять скрининг раз в шесть месяцев.' },
    { kw: ['kontrol doza', 'контрольная доза', 'nazorat doza'], uz: "Nazorat (kontrol) dozasi — kuzatuvchi doza: odatdagidan yuqori chiqsa, xavf haqida ogohlantiradi va qo'shimcha tekshiruv boshlanadi.", ru: 'Контрольная доза — наблюдательная доза: если она выше обычной, это сигнал тревоги и повод начать дополнительную проверку.' },
    { kw: ['kumulyativ', 'кумулятивная', 'yigilgan doza', 'jami doza', 'накопленная доза'], uz: "Kumulyativ (yig'ilgan) doza — vaqt davomida to'planib boradigan umumiy doza. Uzoq muddatli xavflarni (saraton, katarakta) baholashda aynan u asos bo'ladi.", ru: 'Кумулятивная (накопленная) доза — суммарная доза, растущая со временем. Именно она лежит в основе оценки отдалённых рисков (рак, катаракта).' },
    { kw: ['vaqt masofa', 'время расстояние', 'time distance', 'правило трёх'], uz: "Asosiy himoya qoidasi — vaqt, masofa, qobiq: manbada kamroq vaqt o'tkazing, uzoqroq turing, orada himoya to'sig'i bo'lsin. Masofa 2 barobar oshsa, ta'sir 4 barobar kamayadi.", ru: 'Главное правило защиты — время, расстояние, экран: меньше времени у источника, дальше от него, между вами — преграда. При удвоении расстояния воздействие падает в 4 раза.' },
    { kw: ['qobiq', 'экран', 'shielding', 'экранирование'], uz: "Qobiq (ekran) — qo'rg'oshin, beton yoki qalin material nurlanishni susaytiradi. Suv ham yaxshi ekran — reaktor bassiyalarida shu sabab ishlatiladi.", ru: 'Экран (защита) — свинец, бетон или толстый материал ослабляют излучение. Хорошим экраном служит и вода — поэтому ею заливают реакторные бассейны.' },
    { kw: ['respirator', 'респиратор'], uz: "Respirator — nafas organlarini chang va radioaktiv zarrachalardan himoya qiladi. Mahkam yopilgan va to'g'ri tanlangan bo'lsa samarali; bir martalik niqob yetarli emas.", ru: 'Респиратор защищает дыхательные пути от пыли и радиоактивных частиц. Эффективен, если плотно прилегает и подобран правильно; обычной маски мало.' },
    { kw: ['kozoynek', 'защитные очки', 'защита глаз'], uz: "Himoya ko'zoyneklari ko'z yuzasini chang va zarrachalardan himoya qiladi; tozalash va oqim ishlarida, shuningdek ifloslanishga shubha bo'lganda zarur.", ru: 'Защитные очки закрывают глаза от пыли и частиц; они необходимы при уборке, работах в потоке и при подозрении на загрязнение.' },
    { kw: ['yod profilaktika', 'йодная профилактика', 'калия йодид', 'yodli preparat', 'ki table'], uz: "Kaliy yodi (KI) — faqat radioyod (I-131) ichga kirganida qalqonsimon bezni himoya qiladi. Hodisaning birinchi soatlarida, shifokor ko'rsatmasi bilan ichiladi; boshqa nurlanishga yordam bermaydi.", ru: 'Йодид калия (KI) — защищает щитовидную железу только от радиоактивного йода (I-131). Принимают в первые часы по назначению врача; на другое излучение он не действует.' },
    { kw: ['dekontaminatsiya', 'деконтаминация', 'kyimni yechish', 'dush'], uz: "Ifloslanishga shubha bo'lsa: kiyimni yechish kontaminatsiyaning ~90% ini olib tashlaydi; terini sovun va suv bilan yuving (ko'zni ushqamang). Keyin mutaxassis baholaydi.", ru: 'При подозрении на заражение: снятие одежды убирает около 90% загрязнения; кожу моют водой с мылом (глаза не тереть). Затем оценивает специалист.' },
    { kw: ['chekish', 'курение', 'сигарет'], uz: "Chekish nurlanish ta'sirini kuchaytiradi: o'pka to'qimasida moddalar ko'proq to'planadi va saraton xavfi ortadi. Chekishni tashlash — eng arzon va samarali himoya.", ru: 'Курение усиливает действие облучения: в лёгочной ткани накапливается больше веществ и возрастает риск рака. Отказ от курения — самая доступная защита.' },
    /* --- organlar --- */
    { kw: ['koz buzog', 'хрусталик', 'linza ko z', 'катаракта нurlanish'], uz: "Ko'z buzog'i (lensa) — nurlanishga sezgir to'qima; u yerda hujayralar yangilanmaydi. Doza oshsa, katarakta (linza xiralashishi) xavfi ortadi. Kasbiy chegarasi — 20 mSv/yil (o'rtacha 5 yil).", ru: 'Хрусталик — чувствительная к излучению ткань, клетки в нём почти не обновляются. При росте дозы повышается риск катаракты. Профессиональный предел — 20 мЗв/год (среднее за 5 лет).' },
    { kw: ['qalqonsimon', 'щитовидная железа'], uz: "Qalqonsimon bez ayniqsa radioyod (I-131) uchun sezgir; zarar gormon ishlab chiqarish buzilishiga olib keladi. Bola va homiladorlarda sezgirlik yuqori, shuning uchun yod profilaktikasi aynan shu besga mo'ljallangan.", ru: 'Щитовидная железа особенно чувствительна к радиоактивному йоду (I-131); повреждение ведёт к сбоям гормонов. У детей и беременных чувствительность выше — отсюда и йодная профилактика.' },
    { kw: ['gemopoez', 'кроветворение', 'костный мозг', 'suyak iligi'], uz: "Gemopoez — qon hosil qilish jarayoni (suyak iligi). Nurlanishga juda sezgir: leykotsit va trombositlar tez kamayadi, immunitet pasayadi — shu sababli birinchi navbatda qon tahlili olinadi.", ru: 'Гемопоэз — кроветворение (костный мозг). Крайне чувствительно к облучению: быстро падают лейкоциты и тромбоциты, снижается иммунитет — поэтому первым делом сдают кровь.' },
    { kw: ['teri zarar', 'кожа облучение', 'dermatit nurlanish'], uz: "Teri himoya qatlamidir, lekin yuqori dozada qizarish, qichish va radiatsion dermatit beradi. Kasbiy doza chegarasi — yiliga 50 mSv; himoya kiyimi va vaqt chegarasi asos profilaktika.", ru: 'Кожа — барьер, но при высокой дозе краснеет, зудит и даёт лучевой дерматит. Профессиональный предел — 50 мЗв/год; защитная одежда и лимит времени — основа профилактики.' },
    { kw: ['bolar sezgir', 'дети облучение', 'чувствительность детей'], uz: "Bolalar nurlanishga sezgirroq: hujayralar tez bo'linadi, umr ko'rish davri uzoq — shu sababli bir xil dozadan xavf kattalarnikidan yuqori. Ularga me'yorlar qat'iyroq qo'llanadi.", ru: 'Дети чувствительнее: клетки быстро делятся, а продолжительность жизни велика — при одной и той же дозе риск выше, чем у взрослых. Нормы для них строже.' },
    { kw: ['infertillik', 'бесплодие', 'jinsiy hujayra'], uz: "Jinsiy hujayralar nurlanishga sezgir; yuqori doza vaqtincha yoki uzoq muddatli neytralizatsiyaga olib kelishi mumkin. Shu sababli reproduktiv organlar uchun doza chegaralari alohida belgilangan.", ru: 'Половые клетки чувствительны к облучению; высокая доза может привести к временному или длительному нарушению. Поэтому для репродуктивных органов действуют отдельные лимиты.' },
    { kw: ['mutatsiya', 'мутация'], uz: "Mutatsiya — DNKda ro'yxatdan o'tgan o'zgarish. Nurlanish DNKni to'g'ridan-to'g'ri uzura oladi va LNT modeli aynan shu mexanizmdan kelib chiqadi.", ru: 'Мутация — изменение в ДНК. Излучение может напрямую повреждать ДНК, и именно этот механизм лежит в основе модели LNT.' },
    /* --- kasalliklar --- */
    { kw: ['saraton', 'онкология', 'рак болезнь'], uz: "Saraton — nurlanishdan keyingi eng uzoq muddatli xavf. U darhol emas, o'nlab yillardan keyin namoyon bo'lishi mumkin; xavf doza bilan birga o'sadi (LNT).", ru: 'Рак — отдалённый риск облучения. Проявляется не сразу, а через десятилетия; риск растёт вместе с дозой (LNT).' },
    { kw: ['otkir radiatsiya', 'острая лучевая', 'ars kasallik'], uz: "O'tkir radiatsiya kasalligi (ARS) — bir martada yuqori doza olganda rivojlanadi: ich ketish, qusish, qon quyilishi. Bir necha soat-kun ichida boshlanadi va shifokor nazoratini talab qiladi.", ru: 'Острая лучевая болезнь (ОЛБ) развивается после единичной высокой дозы: понос, рвота, кровоточивость. Начинается в первые часы-дни и требует наблюдения врача.' },
    { kw: ['katarakta', 'катаракта'], uz: "Katarakta — ko'z linzasi xiralashishi. Nurlanish bilan bog'langan turi ko'z buzog'i dozasi oshganda rivojlanadi; asbob bilan operatsiya qilinadi va ko'rish tiklanadi.", ru: 'Катаракта — помутнение хрусталика. Радиационная форма связана с ростом дозы хрусталика; лечится хирургически с восстановлением зрения.' },
    { kw: ['dermatit', 'лучевой дерматит'], uz: "Radiatsion dermatit — teri qizarishi, qichishi va qulflanishi; doza oshganda sekin davolanadi. Himoya kiyimi va doza nazorati — asosiy profilaktika.", ru: 'Лучевой дерматит — покраснение, зуд и шелушение кожи; при высокой дозе заживает медленно. Основа профилактики — защитная одежда и контроль дозы.' },
    { kw: ['leykopeni', 'лейкопения'], uz: "Leykopeniya — oq qon hujayralari (leykotsit) sonining kamayishi. Immunitet pasayadi, infeksiya xavfi ortadi; gemogrammada (umumiy qon tahlili) aniqlanadi.", ru: 'Лейкопения — снижение лейкоцитов. Ослабляет иммунитет и повышает риск инфекций; выявляется по общему анализу крови.' },
    { kw: ['neytropeni', 'нейтропения'], uz: "Neytropeniya — neytrofil kamayishi: og'iz yarasi, isitma bilan namoyon bo'ladi. Immunitetning zaiflashuvining aniq belgisi, tez tahlil talab qiladi.", ru: 'Нейтропения — снижение нейтрофилов: язвочки во рту, температура. Явный признак ослабленного иммунитета, требует быстрого анализа крови.' },
    { kw: ['anemiya', 'анемия', 'gemoglobin kam'], uz: "Anemiya — qonda gemoglobin kamayishi: holsizlik, tez charchoq, teri ochishi bilan kechadi. Nurlanish gemopoezga ta'sir qilganda ham uchraydi.", ru: 'Анемия — снижение гемоглобина: слабость, быстрая утомляемость, бледность. Встречается и при воздействии на кроветворение.' },
    { kw: ['vsd', 'вегето-сосудистая', 'vegetativ distoniya'], uz: "Vegetativ-tomir distoniyasi — bosim, puls va holsizlikdagi buzilishlar guruhi. Past dozali sur'atli nurlanish bilan birga uchraydi, lekin ko'pinacha ish rejimi va stress bilan bog'liq.", ru: 'Вегето-сосудистая дистония — нарушения давления, пульса и самочувствия. Иногда сочетается с низким фоновым облучением, но чаще связана со стрессом и режимом работы.' },
    /* --- belgilar va muddatlar --- */
    { kw: ['erta belgilar', 'первыe признаки', 'признаки облучения', 'belgilar nurlanish'], uz: "Erta belgilar: ko'ngil aynish va qusish (birinchi soatlarda), ich ketish, teri qizarishi, holsizlik. Ular doza qanchalik yuqori ekanini bildiradi va shifokor ko'rigini talab qiladi.", ru: 'Ранние признаки: тошнота и рвота (первые часы), понос, покраснение кожи, слабость. Они указывают на высоту дозы и требуют осмотра врача.' },
    { kw: ['uzoq muddatli oqibat', 'отдалённые последствия', 'дальнейшие последствия'], uz: "Uzoq muddatli oqibatlar: saraton, katarakta, yurak-tomir va immunitet kasalliklari. Yillar o'tgandan keyin namoyon bo'ladi va kumulyativ dozaga bog'liq.", ru: 'Отдалённые последствия: рак, катаракта, болезни сердца и иммунитета. Проявляются через годы и зависят от накопленной дозы.' },
    { kw: ['qisqa muddatli ta sir', 'краткосрочное воздействие'], uz: "Qisqa muddatli ta'sir — odatda kamayuvchi: holsizlik, qon tahlili o'zgarishi. Ko'pchilik holatda gemopoez tiklanadi, ammo tibbiy nazorat davom etadi.", ru: 'Кратковременное воздействие обычно обратимо: утомляемость, изменения анализа крови. В большинстве случаев кроветворение восстанавливается, но наблюдение продолжается.' },
    { kw: ['nush belgisi', 'тошнота', 'ko ngil aynish'], uz: "Ko'ngil aynish — o'tkir davrning eng erta belgisi; doza taxminan 100 mSv dan yuqori bo'lganda paydo bo'lishi mumkin. Yolg'iz uchsa ham shifokorga ko'rsatish kerak.", ru: 'Тошнота — самый ранний признак острой фазы; может появиться при дозе выше ~100 мЗв. Даже в одиночку её должен оценить врач.' },
    /* --- tibbiy asboblar va texnologiya --- */
    { kw: ['tomografiya', 'компьютерная томография', 'kt nurlanish', 'ct nurlanish'], uz: "Kompyuter tomografiya (KT/CT) — aniq tasvir beradi, lekin rentgen nurlanishidan foydalanadi: bir tekshiruv bir necha mSv doza olishi mumkin. Shifokor faqat zarur holatda buyuradi.", ru: 'Компьютерная томография (КТ/СТ) даёт точную картину, но использует рентген: одно исследование может дать несколько мЗв. Назначают только при необходимости.' },
    { kw: ['магнитно-резонанс', 'mrt', 'mri'], uz: "MRI (MRT) — magnit maydon va radio to'lqinlardan foydalanadi, ionlovchi nurlanish yo'q. Shu sababli uni «nurlanishsiz tekshiruv» deydi (boshqa cheklovlari bor).", ru: 'МРТ (MRT) — использует магнитное поле и радиоволны, ионизирующего излучения нет. Поэтому его называют «исследованием без облучения» (есть другие ограничения).' },
    { kw: ['samolyot', 'перелёт', 'авиарейс', 'parvoz'], uz: "Samolyotda fon yuqoriroq: balandlikda kosmik nurlar ta'siri ortadi. Uzoq parvozda ham odatda bir necha mSv dan oshmaydi — bu kundalik me'yor uchun sezilarli qo'shimcha emas.", ru: 'На борту самолёта фон выше: на высоте усиливается космическое излучение. Даже долгий перелёт даёт обычно несколько мЗв — заметной прибавки к норме это не даёт.' },
    { kw: ['телефон излучение', 'telefon nurlanish', 'экран излучение', 'гаджет'], uz: "Telefonlar ionlovchi nurlanish manbasi emas — radioto'lqin chastotasida ishlaydi. «Telefon kuchli nurlanadi» degan gap odatda oshirib aytiladi.", ru: 'Телефоны не являются источником ионизирующего излучения — они работают в радиочастотном диапазоне. Утверждение о «сильном излучении телефона» обычно преувеличено.' },
    /* --- hayot tarzi --- */
    { kw: ['ovqatlanish', 'antioxidant', 'antioksidant', 'питание облучение'], uz: "Sog'lom ovqatlanish — meva-sabzavot, oqsil va A/C/E vitaminlari (antioxidantlar) gemopoez va himoya tizimiga yordam beradi. U nurlanishni «chiqarmaydi», lekin organizmni mustahkamlaydi.", ru: 'Правильное питание — овощи, фрукты, белок и витамины A/C/E (антиоксиданты) поддерживают кроветворение и защитные силы. Питание не «выводит» излучение, но укрепляет организм.' },
    { kw: ['suv ichish', 'вода пить', 'гидратация'], uz: "Yetarli suv ichish modda almashinuvini yaxshilaydi. Ichki ifloslanishga shubha bo'lsa — mutaxassis yo'riqnomasi bilan ichiladi; «suv nurlanishni chiqarib yuboradi» degan gap oshirilgan.", ru: 'Достаточное питьё улучшает обмен веществ. При подозрении на внутреннее заражение питьё назначает специалист; утверждение, что «вода выводит излучение», преувеличено.' },
    { kw: ['uyqu', 'отдых', 'исхудание режим'], uz: "To'liq uyqu va dam olish immunitet hamda gemopoez uchun zarur. Doimiy charchoq — ortiqcha ish rejimi va ko'plab kasalliklarning umumiy belgisi.", ru: 'Полноценный сон и отдых необходимы иммунитету и кроветворению. Постоянная усталость — общий признак перегрузки и многих заболеваний.' },
    { kw: ['витамин d', 'витамин в12', 'b12 vitamin'], uz: "D vitamini suyak va immunitet uchun, B12 esa qon hosil qilish uchun zarur. Kamchiligi anemiya va holsizlikni kuchaytiradi — tahlildan keyin shifokor buyuradi.", ru: 'Витамин D важен для костей и иммунитета, B12 — для кроветворения. Дефицит усиливает анемию и усталость; назначают после анализов.' },
    { kw: ['йодированная соль', 'yodli tuz', 'йод дефицит'], uz: "Yod yetishmovchiligi qalqonsimon bez kasalligini kuchaytiradi. Yodlangan tuz va dengiz mahsulotlari yordam beradi; radioyod hodisasida esa KI preparati alohida tartibda ichiladi.", ru: 'Дефицит йода усугубляет болезни щитовидной железы. Помогают йодированная соль и морепродукты; при аварии препарат KI принимают по отдельным правилам.' },
    /* --- favqulodda holat --- */
    { kw: ['авария', 'avariya', 'hodisa radiatsiya', 'чрезвычайная ситуация', 'avariya bo lsa'], uz: "Avariya bo'lsa: 1) ichkarida qoling va derazani yoping; 2) kiyimni yechib, yopiq joyga soling; 3) ko'z-ochin, burun-og'izni yuving; 4) radio yoki ogohlantirishni kuzating, tez yordamga qo'ng'iroq qiling.", ru: 'При аварии: 1) оставайтесь внутри и закройте окна; 2) снимите одежду и уберите её в закрытое место; 3) вымойте лицо, промойте нос и рот; 4) слушайте оповещения и вызовите скорую.' },
    { kw: ['yuqori fon', 'повышенный фон', 'высокий фон'], uz: "Yuqori fon aniqlansa: tezlikni dozimetrdan oling, hududdan uzoqlashing, himoya vositalari kiying, dozani hisobga olib vaqtni cheklang. Doza oshsa — tibbiy nazorat shart.", ru: 'При высоком фоне: снимите показания дозиметра, отойдите из зоны, наденьте средства защиты, ограничьте время с учётом дозы. При превышении — медицинский контроль.' },
    { kw: ['ichki ifloslanish', 'внутреннее заражение', 'radioaktiv modda ichga'], uz: "Ichki ifloslanish — radioaktiv modda nafas yoki ovqat bilan ichga kirganda. U tashqi nurlanishdan farqli: doza ichki organlarda davom etadi. Siydik va nafas tahlili bilan aniqlanadi.", ru: 'Внутреннее заражение — радиоактивные вещества попадают внутрь с дыханием или едой. Доза при этом продолжает действовать изнутри; выявляют по анализам мочи и выдыхаемого воздуха.' },
    /* --- ilova va AI --- */
    { kw: ['radskrin', 'bu dastur', 'bu ilova', 'программа radskrin'], uz: "RadSkrin — radiatsiya skriningi dasturi: kamera bilan belgilarni baholaydi, doza va xavfni hisoblaydi, xulosa hamda tavsiya beradi. Oflayn ishlaydi, o'zbek va rus tillarida.", ru: 'RadSkrin — программа радиационного скрининга: по камере оценивает признаки, считает дозу и риск, даёт заключение и рекомендации. Работает офлайн, на узбекском и русском.' },
    { kw: ['suniy intellekt', 'искусственный интеллект', 'ai tashxis'], uz: "Sun'iy intellekt bu yerda tashxis qo'ymaydi: u skrining darajasida xavfni baholaydi, savollarga javob beradi va tavsiya chiqaradi. Yakuniy tashxisni shifokor qo'yadi.", ru: 'Искусственный интеллект здесь не ставит диагноз: он оценивает риск на уровне скрининга, отвечает на вопросы и даёт рекомендации. Окончательный диагноз ставит врач.' },
    { kw: ['xavf darajasi', 'уровень риска', 'risk daraja'], uz: "Xavf darajalari — past, o'rta, yuqori, juda yuqori. Bu doza, belgilar va tahlil ballari asosidagi umumiy baholash; u tashxis emas, balki skrining ko'rsatkichi.", ru: 'Уровни риска — низкий, средний, высокий, очень высокий. Это обобщённая оценка по дозе, признакам и баллам; это показатель скрининга, а не диагноз.' },
    { kw: ['soglik yoqotish', 'потеря здоровья', 'foiz ko rsatkich'], uz: "«Sog'lik yo'qotish» — dasturning ichki ko'rsatkichi (0–100%): doza, belgilar va ko'rinish tahlili asosida hisoblanadi. 70% dan yuqori bo'lsa shifokor ko'rigi tavsiya etiladi.", ru: '«Потеря здоровья» — внутренний показатель программы (0–100%): считается по дозе, признакам и анализу вида. Выше 70% — рекомендован осмотр врача.' },
    { kw: ['face id', 'faceid', 'yuz aniqlash', 'распознавание лица'], uz: "Face ID — yuz orqali bemorni aniqlash: model brauzer o'zida ishlaydi (vendor/model), ma'lumot tashqi serverga yuborilmaydi.", ru: 'Face ID — определение пациента по лицу: модель работает внутри браузера (vendor/model), данные на внешний сервер не отправляются.' },
  ];

  /** Savolga eng mos ma'lumotni topadi (uzunroq kalit so'z ustunlik qiladi). */
  function findFact(t) {
    let best = null, bestScore = 0;
    for (const f of FACTS) {
      let s = 0;
      for (const k of f.kw) {
        const hit = k.length <= 3 ? hasWord(t, k) : t.includes(k);
        if (hit) s += k.length;
      }
      if (s > bestScore) { bestScore = s; best = f; }
    }
    return bestScore >= 3 ? best : null;
  }

  /* ====================== YORDAMCHI MATNLAR ======================== */

  function noDiag(L) {
    return L === 'ru'
      ? 'Обследование ещё не проводилось. Покажите лицо через Face ID или нажмите «Повторный анализ» — затем задайте вопрос.'
      : "Tahlil hali o'tkazilmagan. Avval yuzni ko'rsating yoki «Qayta tahlil qilish» tugmasini bosing — so'ng savolingizni bering.";
  }

  /* ======================== JAVOB KONSTRUKTORLARI =================== */

  const B = {};

  B.greet = (d, L) => {
    const nm = mem.name || (d && d.personName) || '';
    return L === 'ru'
      ? `Здравствуйте${nm ? ', ' + nm : ''}! Я — ИИ RadSkrin. ${d ? 'Обследование готово: спрашивайте о риске, дозе, заболеваниях и советах.' : 'Сначала пройдите обследование, затем задавайте вопросы.'}`
      : `Assalomu alaykum${nm ? ', ' + nm : ''}! Men RadSkrin sun'iy intellektiman. ${d ? "Tahlil tayyor: xavf, doza, kasallik va tavsiyalar haqida so'rang." : "Avval tahlil o'tkazing — so'ng savol bering."}`;
  };

  B.howareyou = (d, L) => L === 'ru'
    ? `Здравствуйте! Спасибо, всё хорошо! ${d ? `Ваше состояние: ${d.headlineRu || d.headline}, потеря здоровья ${d.health}%.` : 'Обследование ещё не проводилось.'} Чем помочь — риск, доза, советы?`
    : `Assalomu alaykum! Yaxshi, rahmat! ${d ? `Sizning holatingiz: ${d.headline}, sog'lik yo'qotish ${d.health}%.` : "Tahlil hali o'tkazilmagan."} Nima haqida so'rasiz — xavf, doza, tavsiya?`;

  B.name = (d, L, x) => {
    const m = x.t.match(/(?:^|\s)(?:mening\s+)?ismim\s+([a-zа-яё][a-zа-яё-]{0,20})/)
      || x.t.match(/(?:меня зовут|моё имя|мое имя)\s+([a-zа-яё][a-zа-яё-]{0,20})/);
    const nm = m ? m[1] : '';
    if (nm) mem.name = nm.charAt(0).toUpperCase() + nm.slice(1);
    return L === 'ru'
      ? (nm ? `Очень приятно, ${mem.name}! Я запомню ваше имя.` : 'Назовите имя: «Меня зовут …» — и я его запомню.')
      : (nm ? `Tanishganimdan xursandman, ${mem.name}! Ismingizni eslab qolaman.` : "Ismingizni ayting: «Mening ismim ...» deb boshlang — eslab qolaman.");
  };

  B.identity = (d, L, x) => {
    const self = has(x.t, ['men kim', 'kimman', 'meni kim', 'кто я']);
    if (self) {
      const p = (d && d.person) || null;
      const nm = mem.name || (d && d.personName) || (p && p.name) || '';
      const age = p && p.age ? (L === 'ru' ? `, ${p.age} лет` : `, ${p.age} yosh`) : '';
      const st = d
        ? (L === 'ru' ? `Обследование: ${d.headlineRu || d.headline}, риск — ${d.riskLabel}.` : `Tahlil: ${d.headline}, xavf — ${d.riskLabel}.`)
        : noDiag(L);
      return L === 'ru'
        ? `Это ${nm || 'пациент'}${age}. ${st}`
        : `Siz ${nm || 'bemor'}${age}. ${st}`;
    }
    return L === 'ru'
      ? 'Я — искусственный интеллект RadSkrin, помощник скрининга. Отвечаю на вопросы о риске, дозе облучения, признаках заболеваний и рекомендациях. Окончательный диагноз ставит врач.'
      : "Men RadSkrin sun'iy intellektiman — skrining yordamchisi. Xavf, nurlanish dozasi, kasallik belgilari va tavsiyalar haqida javob beraman. Yakuniy tashxisni shifokor qo'yadi.";
  };

  B.bye = (d, L, x) => {
    const th = has(x.t, ['rahmat', 'спасибо', 'thank']);
    return L === 'ru'
      ? (th ? 'Пожалуйста! Будьте здоровы — результат останется на странице.' : 'До свидания! Будьте здоровы — результат останется на странице.')
      : (th ? "Arzimaydi! Sog' bo'ling — tahlilni sahifada ko'rishingiz mumkin." : "Xayr! Sog' bo'ling — tahlil sahifada qoladi.");
  };

  B.yesok = (d, L) => L === 'ru'
    ? `Хорошо. ${d ? 'Могу продолжить: риск, доза, заболевания, советы — спрашивайте.' : 'Сначала пройдите обследование, затем я отвечу подробнее.'}`
    : `Yaxshi. ${d ? "Davom etamiz: xavf, doza, kasallik, tavsiya — qaysi biri?" : "Avval tahlil o'tkazing — keyin batafsil javob beraman."}`;

  B.emergency = (d, L) => {
    let s = L === 'ru'
      ? 'Экстренная помощь: вызовите «Скорую» (103/112) или обратитесь в приёмный покой. До осмотра не принимайте лекарства по совету окружающих.'
      : "Favqulodda yordam: «Tez yordam» (103) ga qo'ng'iroq qiling yoki qabul bo'limiga murojaat qiling. Ko'rikdan oldin ataylab dori ichmang.";
    if (d) {
      if (d.health > 69) s += L === 'ru' ? ' Потеря здоровья высокая — не откладывайте визит к врачу.' : " Sog'lik yo'qotish yuqori — shifokor ko'rigini kechiktirmang.";
      else if (d.rate > 6) s += L === 'ru' ? ` Фон ${d.rate} мкЗв/ч — выше нормы, покиньте зону и наденьте средства защиты.` : ` Fon ${d.rate} mikrosievert/soat — me'yoridan yuqori: hududdan chiqing va himoya vositalarini kiying.`;
    }
    return s;
  };

  B.report = (d, L) => {
    if (!d) return noDiag(L);
    if (L === 'ru') {
      const p = [`Обследование готово. ${d.headlineRu || d.headline}.`];
      p.push(`Уровень риска: ${d.riskLabel}, потеря здоровья ${d.health} процентов.`);
      if (d.counts.bor) {
        p.push('Обнаружены: ' + d.present.slice(0, 4).map((i) => i.nameRu || i.name).join(', ') + '.');
        const a = d.present[0] && (d.present[0].adviceRu || d.present[0].advice);
        if (a) p.push('Первый совет: ' + a);
      } else if (d.counts.shubha) {
        p.push('Есть подозрение: ' + d.suspect.slice(0, 3).map((i) => i.nameRu || i.name).join(', ') + '. Нужно дообследование.');
      } else p.push('Признаки заболеваний не обнаружены.');
      p.push(`Фоновое излучение ${d.rate} микросиверт в час — ${Math.round(d.dayPercent)} процентов суточной нормы.`);
      if (d.cancerRiskPercent != null) p.push(`Риск онкологии за жизнь ${d.cancerRiskPercent} процентов.`);
      p.push('Спрашивайте дальше: риск, доза, заболевания, советы.');
      return p.join(' ');
    }
    const p = [`Tahlil tayyor. ${d.headline}.`];
    p.push(`Xavf darajasi: ${d.riskLabel}, sog'lik yo'qotish ${d.health} foiz.`);
    if (d.counts.bor) {
      p.push(`Aniqlangan kasalliklar: ${d.present.slice(0, 4).map((i) => i.name).join(', ')}.`);
      const a = d.present[0] && d.present[0].advice;
      if (a) p.push(`Birinchi tavsiya: ${a}`);
    } else if (d.counts.shubha) {
      p.push(`Shubhali holatlar: ${d.suspect.slice(0, 3).map((i) => i.name).join(', ')}. Qo'shimcha tahlil kerak.`);
    } else p.push('Kasallik belgilari aniqlanmadi.');
    p.push(`Fon nurlanishi ${d.rate} mikrosievert soatiga — kunlik normaning ${Math.round(d.dayPercent)} foizi.`);
    if (d.cancerRiskPercent != null) p.push(`Sog'lom hayot davomida saraton xavfi ${d.cancerRiskPercent} foiz.`);
    p.push("Savolingiz bo'lsa davom eting: xavf, doza, kasallik, tavsiya.");
    return p.join(' ');
  };

  B.risk = (d, L) => {
    if (!d) return noDiag(L);
    const why = d.counts.bor
      ? (L === 'ru' ? `Основная причина: ${d.present[0].nameRu || d.present[0].name}.` : `Asosiy sabab: ${d.present[0].name}.`)
      : (L === 'ru' ? `Фон ${d.rate} мкЗв/ч.` : `Fon nurlanishi ${d.rate} mikrosievert/soat.`);
    return L === 'ru'
      ? `Уровень риска: ${d.riskLabel}. Потеря здоровья ${d.health}%${d.cancerRiskPercent != null ? `, риск онкологии ${d.cancerRiskPercent}%` : ''}. ${d.health > 69 ? 'Нужен осмотр врача.' : 'Оставайтесь под наблюдением.'} ${why}`
      : `Xavf darajasi: ${d.riskLabel}. Sog'lik yo'qotish ${d.health}%${d.cancerRiskPercent != null ? `, saraton xavfi ${d.cancerRiskPercent}%` : ''}. ${d.health > 69 ? "Shifokor ko'rigi zarur." : 'Nazoratda qoling.'} ${why}`;
  };

  B.dose = (d, L) => {
    if (!d) return noDiag(L);
    return L === 'ru'
      ? `Фоновое излучение ${d.rate} микросиверт в час — ${Math.round(d.dayPercent)} процентов суточной нормы. ${d.rate > 6 ? 'Выше нормы — нужно снизить: покиньте зону, наденьте респиратор.' : 'В пределах нормы.'}`
      : `Fon nurlanishi ${d.rate} mikrosievert soatiga — kunlik normaning ${Math.round(d.dayPercent)} foizi. ${d.rate > 6 ? "Normadan yuqori: hududdan chiqing, respirator kiying." : "Me'ycha ichida."}`;
  };

  B.disease = (d, L, x) => {
    if (!d) return noDiag(L);
    const neg = has(x.t, ['yoqmi', 'bor mi', 'нет ли', 'не было', 'есть ли']);
    if (d.counts.bor) {
      const names = d.present.slice(0, 5).map((i) => (L === 'ru' ? (i.nameRu || i.name) : i.name)).join(', ');
      return L === 'ru'
        ? `${neg ? 'К сожалению, да — ' : ''}Обнаружено: ${names} (всего ${d.counts.bor}). Дополнительные анализы назначит врач.`
        : `${neg ? 'Ha, afsuski — ' : ''}Aniqlangan kasalliklar: ${names} (jami ${d.counts.bor}). Qo'shimcha tahlilni shifokor belgilaydi.`;
    }
    if (d.counts.shubha) {
      const names = d.suspect.slice(0, 4).map((i) => (L === 'ru' ? (i.nameRu || i.name) : i.name)).join(', ');
      return L === 'ru'
        ? `${neg ? 'Точных заболеваний нет, но ' : ''}есть подозрение: ${names}. Нужно дообследование.`
        : `${neg ? "Aniq kasallik yo'q, " : ''}shubha bor: ${names}. Qo'shimcha tahlil o'tkazish kerak.`;
    }
    return L === 'ru'
      ? `${neg ? 'Нет — ' : ''}Признаки заболеваний не обнаружены — это хорошая новость. Повторный скрининг через шесть месяцев.`
      : `${neg ? "Yo'q — " : ''}Kasallik belgilari aniqlanmadi — bu yaxshi yangilik. Olti oydan keyin qayta skrining tavsiya etiladi.`;
  };

  B.health = (d, L) => {
    if (!d) return noDiag(L);
    return L === 'ru'
      ? `Ваше состояние: ${d.headlineRu || d.headline}. Потеря здоровья ${d.health}%, уровень риска — ${d.riskLabel}.`
      : `Sizning holatingiz: ${d.headline}. Sog'lik yo'qotish ${d.health}%, xavf darajasi — ${d.riskLabel}.`;
  };

  B.tests = (d, L) => {
    if (!d) return noDiag(L);
    const items = [...d.present, ...d.suspect].slice(0, 3);
    if (items.length) {
      const list = items.map((i) => (L === 'ru' ? (i.adviceRu || i.advice) : i.advice)).join(' ');
      return L === 'ru'
        ? `Рекомендуются анализы: ${list} Это определено по результатам скрининга.`
        : `Kerakli tahlillar: ${list} Ular skrining natijasiga ko'ra belgilandi.`;
    }
    return L === 'ru'
      ? 'Специфические анализы пока не требуются: достаточно общего анализа крови и фонового контроля. Повторный скрининг — через шесть месяцев.'
      : "Maxsus tahlil hozircha shart emas — umumiy qon tahlili va fon nazorati kifoya. Qayta skrining olti oydan keyin.";
  };

  B.explain = (d, L) => {
    if (!d) return noDiag(L);
    const item = (d.present && d.present[0]) || (d.suspect && d.suspect[0]) || null;
    if (!item) {
      return L === 'ru'
        ? `Явных отклонений нет — объяснять особо нечего. Фон ${d.rate} мкЗв/ч (${Math.round(d.dayPercent)}% суточной нормы), потеря здоровья ${d.health}%.`
        : `Aniq o'zgarish aniqlanmadi — tushuntiradigan asos yo'q. Fon nurlanishi ${d.rate} mikrosievert/soat (kunlik normaning ${Math.round(d.dayPercent)}%), sog'lik yo'qotish ${d.health}%.`;
    }
    const ev = (item.ev || []).slice(0, 3).join('; ');
    const st = item.status === 'bor'
      ? (L === 'ru' ? 'подтверждено' : 'aniqlandi')
      : (L === 'ru' ? 'подозрение' : 'shubha');
    return L === 'ru'
      ? `${item.nameRu || item.name}: ${ev || 'по совокупности показателей'}. Оценка ${item.score}/100 (${st}). ${item.adviceRu || item.advice}`
      : `${item.name}: ${ev || "ko'rsatkichlar to'plami bo'yicha"}. Baho ${item.score}/100 (${st}). ${item.advice}`;
  };

  B.repeat = (d, L, x) => {
    if (x.mem && x.mem.lastText) return x.mem.lastText;
    const h = x.hist || [];
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i] && h[i].role === 'ai' && h[i].text) return h[i].text;
    }
    return B.report(d, L);
  };

  B.advice = (d, L) => {
    if (!d) return noDiag(L);
    const first = d.counts.bor && d.present[0]
      ? (L === 'ru' ? (d.present[0].adviceRu || d.present[0].advice) : d.present[0].advice)
      : null;
    return L === 'ru'
      ? (first
        ? `Главный совет: ${first} Также снизьте фоновое излучение и пройдите повторную проверку через шесть месяцев.`
        : 'Регулярный скрининг, меньше излучения, питание и сон. Повторная проверка через шесть месяцев.')
      : (first
        ? `Asosiy tavsiya: ${first} Shuningdek fon nurlanishini kamaytiring va olti oyda qayta tekshiruvdan o'ting.`
        : "Muntazam skrining, kam nurlanish, oziq-ovqat va uyqu rejimiga e'tibor bering. Olti oydan keyin qayta tekshiruv.");
  };

  B.protection = (d, L) => {
    const hot = d && d.rate > 6;
    return L === 'ru'
      ? `Меры защиты: 1) при повышенном фоне — респиратор и очки; 2) носите индивидуальный дозиметр; 3) держитесь подальше от источника; 4) пейте достаточно воды, не курите.${hot ? ` Сейчас фон ${d.rate} мкЗв/ч — выше нормы, покиньте зону.` : ''}`
      : `Himoya choralari: 1) fon yuqori bo'lsa — respirator va ko'zoynek; 2) shaxsiy dozimetr taqing; 3) nurlanish manbaidan uzoqlashing; 4) ko'p suv iching, chekmang.${hot ? ` Hozir fon ${d.rate} mikrosievert/soat — me'yoridan yuqori, hududdan chiqing.` : ''}`;
  };

  B.treatment = (d, L) => {
    const first = d && d.counts.bor && d.present[0]
      ? (L === 'ru' ? (d.present[0].adviceRu || d.present[0].advice) : d.present[0].advice)
      : null;
    return L === 'ru'
      ? `Путь лечения определяет врач.${first ? ' Первое: ' + first : ''} Самолечение и случайные препараты недопустимы — лекарства только по назначению врача.`
      : `Davolash yo'lini shifokor belgilaydi.${first ? " Birinchi e'tibor: " + first : ''} O'z-o'zini davolash qilmang — dorilarni faqat shifokor retsepti bilan iching.`;
  };

  B.nutrition = (d, L) => {
    const hot = d && d.rate > 6;
    return L === 'ru'
      ? `Питание: больше овощей и фруктов, белковая пища, достаточно воды; витамины D и B12 полезны для кроветворения.${hot ? ' В зоне повышенного фона следите за йодным достатком.' : ''}`
      : `Oziq-ovqat: ko'proq meva-sabzavot, oqsilga boy ovqat, yetarli suv; D va B12 vitaminlari gemopoez uchun foydali.${hot ? " Yuqori fon hududida yod yetishmovchiligiga e'tibor bering." : ''}`;
  };

  B.sport = (d, L) => {
    if (!d) return noDiag(L);
    return L === 'ru'
      ? `Умеренные нагрузки (ходьба, плавание) укрепляют здоровье.${d.health > 69 ? ' Но сейчас тяжёлые тренировки и спорт в зоне облучения противопоказаны — сначала осмотр врача.' : ' При сильной усталости сократите нагрузку.'}`
      : `Yengil jismoniy mashqlar (yurish, suzish) sog'likni mustahkamlaydi.${d.health > 69 ? " Lekin hozir og'ir mashq va nurlanishli hududda sport qilmang — avval shifokor ko'rigi." : " Kuchli charchoq bo'lsa mashqni kamaytiring."}`;
  };

  B.doctor = (d, L) => {
    if (!d) return noDiag(L);
    return L === 'ru'
      ? `Состояние: ${d.headlineRu || d.headline}. ${d.health > 69 ? 'Осмотр врача обязателен.' : 'Наш врач запишет вас в очередь.'} Раздел «Направления» поможет.`
      : `Holat: ${d.headline}. ${d.health > 69 ? "Shifokor ko'rigi shubhasiz zarur." : "Shifokorimiz navbatga yozib qo'yadi."} Yo'llanma bo'limidan foydalaning.`;
  };

  B.when = (d, L) => {
    if (!d) return noDiag(L);
    const soon = d.counts.bor || d.counts.shubha;
    return L === 'ru'
      ? (soon
        ? 'Повторная проверка — через три месяца, после курса лечения. Сейчас обсудите с врачом.'
        : 'Повторный скрининг рекомендуется через шесть месяцев.')
      : (soon
        ? "Qayta tekshiruv — uch oydan so'ng, davolash kursidan keyin. Hozir shifokor bilan maslahatlashing."
        : "Qayta skrining olti oydan so'ng tavsiya etiladi.");
  };

  B.prognosis = (d, L) => {
    if (!d) return noDiag(L);
    const c = d.cancerRiskPercent != null
      ? (L === 'ru' ? `Риск онкологии за жизнь — ${d.cancerRiskPercent}%. ` : `Saraton xavfi — ${d.cancerRiskPercent}%. `)
      : '';
    return L === 'ru'
      ? (d.health > 69
        ? `Состояние серьёзное: ${d.headlineRu || d.headline}, потеря здоровья ${d.health}%. ${c}Прогноз улучшит регулярный контроль и лечение — их назначит врач.`
        : `Прогноз благоприятный: ${d.headlineRu || d.headline}, потеря здоровья ${d.health}%. ${c}Сохраняйте режим скрининга — и риск останется низким.`)
      : (d.health > 69
        ? `Holat jiddiy: ${d.headline}, sog'lik yo'qotish ${d.health}%. ${c}Prognozni yaxshilaydigan nazorat va davolashni shifokor belgilaydi.`
        : `Prognoz qoniqarli: ${d.headline}, sog'lik yo'qotish ${d.health}%. ${c}Skrining rejimini saqlasangiz, xavf past qoladi.`);
  };

  B.prevention = (d, L) => {
    const hot = d && d.rate > 6;
    return L === 'ru'
      ? `Профилактика: скрининг раз в 6 месяцев; контроль дозы (норма для населения — 1 мЗв в год); индивидуальные средства защиты; отказ от курения; режим питания и сна.${hot ? ' Сейчас фон повышен — держитесь в пределах нормы.' : ''}`
      : `Profilaktika: olti oyda bir skrining; doza nazorati (aholi uchun me'yor yiliga 1 mSv); shaxsiy himoya vositalari; chekmang; ovqat va uyqu rejimi.${hot ? " Hozir fon ko'tarilgan — me'yordan oshirmang." : ''}`;
  };

  B.children = (d, L) => L === 'ru'
    ? 'Дети и беременные чувствительны к радиации — для них нормы строже, а скрининг проходит под наблюдением врача. По конкретному случаю обсудите с терапевтом или акушером; я даю только данные скрининга.'
    : "Bolalar va homilador ayollar radiatsiyaga sezgirroq — ular uchun me'yorlar qat'iyroq, skrining shifokor nazoratida o'tkaziladi. Aniq holat bo'yicha terapevt yoki akusher bilan maslahatlashing; men faqat skrining ma'lumotini bera olaman.";

  /** Definitsion savolga bilimlar lug'atidan javob; topilmasa — qo'llanmalar. */
  B.fact = (d, L) => B.help(d, L);

  B.help = (d, L) => L === 'ru'
    ? `Я отвечаю на такие вопросы: «Какой риск?», «Какая доза?», «Что обнаружено?», «Что посоветуете?», «Когда на повторную проверку?», «Как защититься?», «Как это определяется?». Есть и справочные ответы: «Что такое микросиверт?», «Кто такой ICRP?», «Что такое радон?». ${d ? 'Ваше обследование готово.' : 'Сначала пройдите обследование.'}`
    : `Men bunday savollarga javob beraman: «Xavf qanday?», «Doza nechchi?», «Nima aniqlandi?», «Nima tavsiya qilasiz?», «Qachon qayta tekshiriladi?», «Qanday himoya qilinadi?», «Tahlil qanday aniqlanadi?». Ma'lumot savollari ham bor: «Mikrosievert nima ekan?», «ICRP kim?», «Radon nima?». ${d ? 'Tahlilingiz tayyor.' : "Avval tahlil o'tkazing."}`;

  B.unknown = (d, L) => {
    const s = d
      ? (L === 'ru'
        ? `Кратко: ${d.headlineRu || d.headline}, потеря здоровья ${d.health}%, фон ${d.rate} мкЗв/ч.`
        : `Qisqacha: ${d.headline}, sog'lik yo'qotish ${d.health}%, fon ${d.rate} mikrosievert/soat.`)
      : (L === 'ru' ? 'Обследование ещё не проводилось.' : "Tahlil hali o'tkazilmagan.");
    const ex = L === 'ru'
      ? 'Уточните, пожалуйста: «Какой риск?», «Какая доза?», «Что посоветуете?»'
      : "Aniqlashtiring: «Xavf qanday?», «Doza nechchi?», «Nima tavsiya qilasiz?»";
    return s + ' ' + ex;
  };

  /* =========================== DISPATCH ============================ */

  function answerFor(q, t, d, L, hist) {
    // 1) definitsion savol bo'lsa — avval bilimlar lug'atidan qidiramiz
    if (scoreOf(t, byId.fact) >= 4) {
      const f = findFact(t);
      if (f) { mem.topic = 'fact'; return L === 'ru' ? f.ru : f.uz; }
    }

    const matches = scoreAll(t);
    let top = matches[0] || { it: { id: 'unknown' }, score: 0 };

    // faqat umumiy so'zlardan iborat savol → tushunilmagan
    if (top.it.id === 'help' && top.score <= 2) top = { it: { id: 'unknown' }, score: 1 };

    const parts = [top];
    const joined = CONNECT.some((c) => t.includes(c));
    if (joined && JOINABLE.has(top.it.id)) {
      const second = matches.slice(1).find((m) => JOINABLE.has(m.it.id) && m.score >= 3);
      if (second) parts.push(second);
    }

    const x = { t, hist, mem };
    const texts = [];
    for (const p of parts) {
      let s = null;
      try { s = B[p.it.id](d, L, x); } catch { s = null; }
      if (!s) s = noDiag(L);
      if (CONTENT.has(p.it.id)) mem.topic = p.it.id;
      texts.push(s);
    }
    return texts.join(' ');
  }

  /* ============================== API ============================== */

  /**
   * Savolga javob qaytaradi.
   * @param {string} q    foydalanuvchi savoli (matn yoki ovoz)
   * @param {object} d    AI tahlil natijasi (state.aiDiag)
   * @param {string} [lang] majburiy til
   * @param {Array}  [history] suhbat tarixi (takrorlash uchun)
   * @returns {{lang: string, text: string}}
   */
  function ask(q, d, lang, history) {
    const L = detectLang(q, lang || langOf(d, d && d.person));
    const t = norm(q);
    if (!t) {
      return {
        lang: L,
        text: L === 'ru'
          ? 'Я вас слушаю. Спросите про риск, заболевания, дозу или советы.'
          : "Men sizni eshitmoqdaman. Xavf, kasallik, doza yoki tavsiya haqida so'rang."
      };
    }
    const text = answerFor(q, t, d, L, history);
    mem.lastText = text;
    return { lang: L, text };
  }

  window.AIChat = { ask, langOf, memory: mem, FACTS, INTENTS, builders: B };
})();
