/**
 * AIChat — offlayn suhbat dvijoki (tashqi API yo'q).
 * Foydalanuvchi savolini (matn yoki ovozdan olingan) tushunib,
 * joriy AI tahlil (diag) asosida qisqa javob qaytaradi.
 *
 *   const a = AIChat.ask(matn, window.RadSkrin.state.aiDiag);
 *   -> { text: '...', lang: 'uz'|'ru', speak: true }
 */
(function () {
  'use strict';

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

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[''`´]/g, '')
      .replace(/[.,!?;:…]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ------------------------------- lug'atlar ----------------------------- */

  const W = {
    greet: ['salom', 'assalomu alaykum', 'assalom', 'hello', 'hi', 'привет', 'здравствуйте', 'здорово', 'салом'],
    risk: ['xavf', 'xavfli', 'risk', 'риск', 'опасно', 'опасность', 'nechchi', 'foiz', 'процент'],
    disease: ['kasallik', 'kasal', 'bemor', 'tashxis', 'nima bor', 'belgi', 'simptom', 'что у меня', 'болезнь', 'заболеван', 'диагноз', 'признак'],
    dose: ['doza', 'nurlanish', 'sug', 'mikrosievert', 'мкз', 'доза', 'облучен', 'радиац', 'фон'],
    health: ['soglik', "sog'lik", 'holat', 'tanim', 'здоровь', 'состояни', 'samimi'],
    advice: ['tavsiya', 'nima qilay', 'qilay', 'ne qil', 'что делать', 'совет', 'рекомендац', 'yoqa', 'dorilar', 'доглед'],
    doctor: ['shifokor', 'vrach', 'доктор', 'клиника', 'navbat', 'очеред', 'etibor'],
    when: ['qachon', 'necha vaqt', 'keyin', 'yana', 'when', 'когда', 'снова', 'повторн', 'через'],
    name: ['ismim', 'men kim', 'kimman', 'kimsan', 'кто я', 'моё имя', 'мое имя'],
    help: ['yordam', 'nima', 'qanday', 'help', 'помощ', 'как', 'что'],
    bye: ['xayr', 'bye', 'до свидания', 'саломат', 'rahmat', 'спасибо', 'thank']
  };

  const has = (t, list) => list.some((w) => t.includes(w));

  /* -------------------------------- javoblar ----------------------------- */

  function fmtUz(d) {
    if (!d) return "Hozircha tahlil yo'q. Yuzni Face ID orqali ko'rsating yoki \"Qayta tahlil qilish\" tugmasini bosing — so'ng savolingizni bering.";

    const p = [];
    p.push('Tahlil tayyor.');

    p.push(`Xavf darajasi: ${d.riskLabel}, sog'lik yo'qotish ${d.health} foiz.`);

    if (d.counts.bor) {
      p.push(`Aniqlangan kasalliklar: ${d.present.slice(0, 4).map((i) => i.name).join(', ')}.`);
      const a = d.present[0] && d.present[0].advice;
      if (a) p.push(`Birinchi tavsiya: ${a}`);
    } else if (d.counts.shubha) {
      p.push(`Shubhali holatlar: ${d.suspect.slice(0, 3).map((i) => i.name).join(', ')}. Qo'shimcha tahlil kerak.`);
    } else {
      p.push('Kasallik belgilari aniqlanmadi.');
    }

    p.push(`Fon nurlanishi ${d.rate} mikrosievert soatiga — kunlik normaning ${Math.round(d.dayPercent)} foizi.`);
    if (d.cancerRiskPercent != null) p.push(`Sog'lom hayot davomida saraton xavfi ${d.cancerRiskPercent} foiz.`);
    p.push("Savolingiz bo'lsa, davom eting.");
    return p.join(' ');
  }

  function fmtRu(d) {
    if (!d) return 'Пока нет обследования. Покажите лицо через Face ID или нажмите «Повторный анализ» — затем задайте вопрос.';

    const p = ['Обследование готово.'];
    p.push(`Уровень риска: ${d.riskLabel}, потеря здоровья ${d.health} процентов.`);

    if (d.counts.bor) {
      p.push('Обнаружены: ' + d.present.slice(0, 4).map((i) => i.nameRu || i.name).join(', ') + '.');
      const a = d.present[0] && (d.present[0].adviceRu || d.present[0].advice);
      if (a) p.push('Первый совет: ' + a);
    } else if (d.counts.shubha) {
      p.push('Есть подозрение: ' + d.suspect.slice(0, 3).map((i) => i.nameRu || i.name).join(', ') + '. Нужно дообследование.');
    } else {
      p.push('Признаки заболеваний не обнаружены.');
    }

    p.push(`Фоновое излучение ${d.rate} микросиверт в час — ${Math.round(d.dayPercent)} процентов суточной нормы.`);
    if (d.cancerRiskPercent != null) p.push(`Риск онкологии за жизнь ${d.cancerRiskPercent} процентов.`);
    p.push('Если есть вопросы — продолжайте.');
    return p.join(' ');
  }

  function answerFor(t, d, lang) {
    const uz = lang !== 'ru';

    if (!d && !has(t, W.help)) {
      return uz
        ? "Tahlil hali o'tkazilmagan. Avval yuzni ko'rsating yoki «Qayta tahlil qilish» tugmasini bosing."
        : 'Обследование ещё не проводилось. Сначала покажите лицо или нажмите «Повторный анализ».';
    }

    if (has(t, W.greet) && t.split(' ').length <= 4) {
      const nm = (d && d.personName) || '';
      return uz
        ? `Assalomu alaykum${nm ? ', ' + nm : ''}! Men RadSkrin sun'iy intellektiman. Tahlil tayyor — xavf, kasallik, doza haqida so'rashingiz mumkin.`
        : `Здравствуйте${nm ? ', ' + nm : ''}! Я — искусственный интеллект RadSkrin. Обследование готово: спрашивайте о риске, заболеваниях, дозе.`;
    }

    if (has(t, W.risk)) {
      return uz
        ? `Xavf darajasi — ${d.riskLabel}. Sog'lik yo'qotish ${d.health} foiz, saraton xavfi ${d.cancerRiskPercent} foiz. ${d.health > 69 ? "Shifokor ko'rigi zarur." : 'Nazoratda qoling.'}`
        : `Уровень риска — ${d.riskLabel}. Потеря здоровья ${d.health} процентов, риск онкологии ${d.cancerRiskPercent} процентов. ${d.health > 69 ? 'Нужен осмотр врача.' : 'Оставайтесь под наблюдением.'}`;
    }

    if (has(t, W.dose)) {
      return uz
        ? `Fon nurlanishi ${d.rate} mikrosievert soatiga. Bu kunlik normaning ${Math.round(d.dayPercent)} foizi. ${d.rate > 6 ? 'Normadan yuqori — kamaytirish kerak.' : "Me'ycha ichida."}`
        : `Фоновое излучение ${d.rate} микросиверт в час, это ${Math.round(d.dayPercent)} процентов суточной нормы. ${d.rate > 6 ? 'Выше нормы — нужно снизить.' : 'В пределах нормы.'}`;
    }

    if (has(t, W.health)) {
      return uz
        ? `Sizning holatingiz: ${d.headline}. Sog'lik yo'qotish ${d.health} foiz.`
        : `Ваше состояние: ${d.headlineRu || d.headline}. Потеря здоровья ${d.health} процентов.`;
    }

    if (has(t, W.disease)) {
      if (d.counts.bor) {
        const names = d.present.slice(0, 5).map((i) => (uz ? i.name : (i.nameRu || i.name))).join(', ');
        return uz
          ? `Aniqlangan kasalliklar: ${names}. Jami ${d.counts.bor} ta. Qo'shimcha tahlil shifokor tomonidan belgilanadi.`
          : `Обнаруженные заболевания: ${names}. Всего ${d.counts.bor}. Дополнительные анализы назначит врач.`;
      }
      if (d.counts.shubha) {
        const names = d.suspect.slice(0, 4).map((i) => (uz ? i.name : (i.nameRu || i.name))).join(', ');
        return uz
          ? `Aniq kasallik yo'q, lekin shubha bor: ${names}. Qo'shimcha tahlil o'tkazish kerak.`
          : `Точных заболеваний нет, но есть подозрение: ${names}. Нужно дообследование.`;
      }
      return uz
        ? "Kasallik belgilari aniqlanmadi — bu yaxshi yangilik. Olti oydan keyin qayta skrining tavsiya etiladi."
        : 'Признаки заболеваний не обнаружены — это хорошая новость. Повторный скрининг через шесть месяцев.';
    }

    if (has(t, W.advice)) {
      const a = d.counts.bor && d.present[0]
        ? (uz ? d.present[0].advice : (d.present[0].adviceRu || d.present[0].advice))
        : null;
      return uz
        ? (a ? `Asosiy tavsiya: ${a} Shuningdek fon nurlanishini kamaytiring va olti oyda qayta tekshiruvdan o'ting.`
             : "Muntazam skrining, kam nurlanish, oziq-ovqat va uyqu rejimiga e'tibor bering. Olti oydan keyin qayta tekshiruv.")
        : (a ? `Главный совет: ${a} Также снизите фоновое излучение и пройдите повторную проверку через шесть месяцев.`
             : "Регулярный скрининг, меньше излучения, питание и сон. Повторная проверка через шесть месяцев.");
    }

    if (has(t, W.doctor)) {
      return uz
        ? `Holat: ${d.headline}. ${d.health > 69 ? "Shifokor ko'rigi shubhasiz zarur." : "Shifokorimiz navbatga yozib qo'yadi."} Yo'llanma bo'limidan foydalaning.`
        : `Состояние: ${d.headlineRu || d.headline}. ${d.health > 69 ? 'Осмотр врача обязателен.' : 'Наш врач запишет вас в очередь.'} Раздел «Направления» поможет.`;
    }

    if (has(t, W.when)) {
      return uz
        ? (d.counts.bor || d.counts.shubha
            ? 'Qayta tekshiruv — uch oydan so\'ng, davolash kursidan keyin. Hozir shifokor bilan maslahatlashing.'
            : 'Qayta skrining olti oydan so\'ng tavsiya etiladi.')
        : (d.counts.bor || d.counts.shubha
            ? 'Повторная проверка — через три месяца, после курса лечения. Сейчас обсудите с врачом.'
            : 'Повторный скрининг рекомендуется через шесть месяцев.');
    }

    if (has(t, W.bye)) {
      return uz ? "Arzimaydi! Sog' bo'ling — tahlilni sahifada ko'rishingiz mumkin." : 'Пожалуйста! Будьте здоровы — результат останется на странице.';
    }

    // umumiy javob
    return uz ? fmtUz(d) : fmtRu(d);
  }

  /* --------------------------------- API --------------------------------- */

  /**
   * Savolga javob qaytaradi.
   * @param {string} q   foydalanuvchi savoli (matn yoki ovoz)
   * @param {object} d   AI tahlil natijasi (state.aiDiag)
   * @param {string} [lang] majburiy til (ovozdan kelgan)
   */
  function ask(q, d, lang) {
    const L = lang || langOf(d, d && d.person);
    const t = norm(q);
    if (!t) {
      return {
        lang: L,
        text: L === 'ru'
          ? 'Я вас слушаю. Спросите про риск, заболевания, дозу или советы.'
          : 'Men sizni eshitmoqdamam. Xavf, kasallik, doza yoki tavsiya haqida so\'rang.'
      };
    }
    return { lang: L, text: answerFor(t, d, L) };
  }

  window.AIChat = { ask, langOf };
})();
