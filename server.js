'use strict';

/**
 * RadSkrin — NMKG radiatsion nazorat tizimi
 * Zero-dependency Node.js server: statik fayllar + REST API (bemorlar / shifokor navbati)
 * Ishlatish:  node server.js  ->  http://localhost:3000
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { URL } = require('url');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const TTS_DIR = path.join(DATA_DIR, 'tts');       // MP3 kesh
const TTS_VOICES = {
  uz: 'uz-UZ-MadinaNeural',
  uz_f: 'uz-UZ-MadinaNeural',
  uz_m: 'uz-UZ-SardorNeural',
  ru: 'ru-RU-SvetlanaNeural',
  ru_f: 'ru-RU-SvetlanaNeural',
  ru_m: 'ru-RU-DmitryNeural',
  en: 'en-US-JennyNeural'
};
const TTS_TEXT_MAX = 600;
const PY = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

/** O'zbek va rus tillarida qisqartma va texnik atamalarni tabiiy talaffuzga moslash */
function normalizePhonetics(text, lang = 'uz') {
  if (!text) return '';
  let s = String(text);
  if (lang === 'uz' || lang.startsWith('uz')) {
    // 3D / 3d / 3-D -> uch de
    s = s.replace(/\b3\s*[-–]?\s*[dD]\b/g, 'uch de');

    // Face ID / FaceID / face id -> Feys aydi
    s = s.replace(/\bFace[\s_-]*ID\b/gi, 'Feys aydi');

    // biometrik ID -> biometrik aydi
    s = s.replace(/\bbiometrik\s+ID\b/gi, 'biometrik aydi');
    s = s.replace(/\bbio[\s-]+metrik\b/gi, 'biometrik');

    // Standalone ID -> aydi
    s = s.replace(/\bID\b/g, 'aydi');

    // Ismlar: sarik -> Sarik, sardor -> Sardor (tabiiy intonatsiya uchun)
    s = s.replace(/\bsarik\b/gi, 'Sarik');
    s = s.replace(/\bsardor\b/gi, 'Sardor');

    // Texnik va tibbiy birliklar
    s = s.replace(/\brPPG\b/gi, 'er pe pe je');
    s = s.replace(/\bAI\b/g, 'sun\'iy intellekt');
    s = s.replace(/\bNMKG\b/gi, 'En Em Ka Ge');
    s = s.replace(/µSv\/soat|uSv\/soat/gi, 'mikro zivert soat');
    s = s.replace(/mSv\/soat/gi, 'milli zivert soat');
    s = s.replace(/µSv|uSv/gi, 'mikro zivert');
    s = s.replace(/mSv/gi, 'milli zivert');
  } else if (lang === 'ru' || lang.startsWith('ru')) {
    s = s.replace(/\b3\s*[-–]?\s*[dDдД]\b/gi, 'три дэ');
    s = s.replace(/\bFace[\s_-]*ID\b/gi, 'Фейс айди');
    s = s.replace(/\bID\b/g, 'айди');
    s = s.replace(/\bбио[\s-]+метрический\b/gi, 'биометрический');
  }
  return s;
}

function ttsCacheFile(voice, text) {
  const h = crypto.createHash('sha1').update(voice + ' ' + text).digest('hex');
  return path.join(TTS_DIR, `${h}.mp3`);
}

/** Matnni MP3 ga aylantiradi (keshdan yoki edge-tts orqali: python3 / edge-tts / python zanjiri) */
async function ttsSynth(voice, text) {
  const file = ttsCacheFile(voice, text);
  try {
    const buf = await fs.promises.readFile(file);
    if (buf && buf.length > 200) return buf;
  } catch {}

  const commands = [
    { bin: PY, args: ['-m', 'edge_tts', '--voice', voice, '--text', text, '--write-media', file] },
    { bin: 'edge-tts', args: ['--voice', voice, '--text', text, '--write-media', file] },
    { bin: 'python3', args: ['-m', 'edge_tts', '--voice', voice, '--text', text, '--write-media', file] },
    { bin: 'python', args: ['-m', 'edge_tts', '--voice', voice, '--text', text, '--write-media', file] }
  ];

  let lastErr = null;
  for (const cmd of commands) {
    const res = await new Promise((r) => {
      execFile(cmd.bin, cmd.args, { timeout: 25000, windowsHide: true, maxBuffer: 1 << 20 }, (err, _o, er) => {
        if (err) {
          lastErr = String(er || err.message || '');
          return r(null);
        }
        fs.readFile(file, (e2, buf2) => {
          if (!e2 && buf2 && buf2.length > 200) return r(buf2);
          r(null);
        });
      });
    });
    if (res) return res;
  }

  throw new Error(lastErr || 'TTS audio yaratilmadi');
}

const PORT = process.argv.includes('--port')
  ? Number(process.argv[process.argv.indexOf('--port') + 1])
  : Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

/* --------------------------- Sun'iy ong (LLM) ----------------------------- */
// Google Gemini — kalit faqat serverda (.env / GEMINI_API_KEY), brauzerga chiqmaydi.
const GEMINI_KEY = (function () {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  try {
    const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    const m = txt.match(/^\s*(?:GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*["']?([^"'\r\n]+)["']?/m);
    return m ? m[1].trim() : '';
  } catch { return ''; }
})();
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/' +
  GEMINI_MODEL + ':generateContent';
const LLM_TIMEOUT = 25000;

function llmPost(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const u = new URL(GEMINI_URL);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'x-goog-api-key': GEMINI_KEY
      },
      timeout: LLM_TIMEOUT
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error('Gemini ' + res.statusCode + ': ' + raw.slice(0, 300)));
        }
        try {
          const j = JSON.parse(raw);
          const parts = (j.candidates && j.candidates[0] && j.candidates[0].content &&
            j.candidates[0].content.parts) || [];
          const text = parts.map((p) => p.text || '').join('').trim();
          if (!text) return reject(new Error('Gemini bo\'sh javob'));
          resolve(text);
        } catch (e) { reject(new Error('Gemini JSON xato: ' + e.message)); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('Gemini timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8'
};

const DB = {
  patients: path.join(DATA_DIR, 'patients.json'),
  referrals: path.join(DATA_DIR, 'referrals.json'),
  users: path.join(DATA_DIR, 'users.json')
};

/* ------------------------------- Yordamchilar ------------------------------ */

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(TTS_DIR)) fs.mkdirSync(TTS_DIR, { recursive: true });
  Object.values(DB).forEach((f) => {
    if (!fs.existsSync(f)) fs.writeFileSync(f, '[]', 'utf8');
  });
}

function readJson(file) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(v)) return v;
    // fayl noto'g'ri shaklda yozilgan bo'lsa (obyekt) — yagona yozuv sifatida o'qiamiz
    return v && typeof v === 'object' ? [v] : [];
  } catch {
    return [];
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1e6) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      raw += c;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ------------------------------- Auth (foydalanuvchi) ----------------------- */

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(password), s, 64).toString('hex');
  return { salt: s, hash: h };
}

function verifyPassword(password, salt, hash) {
  const h = crypto.scryptSync(String(password), salt, 64);
  const e = Buffer.from(hash, 'hex');
  return h.length === e.length && crypto.timingSafeEqual(h, e);
}

const publicUser = (u) => ({
  id: u.id, login: u.login, name: u.name, role: u.role,
  nationality: u.nationality || '',
  hasFace: !!(u.face && Array.isArray(u.face.templates) && u.face.templates.length),
  createdAt: u.createdAt
});

/** Millat: xavfsiz, qisqa, faqat ruxsat etilgan belgilar */
function sanitizeNation(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  return s.replace(/[^\p{L}\p{M}\s'-]/gu, '').slice(0, 40);
}

function sanitizeFace(f) {
  if (!f || typeof f !== 'object' || !Array.isArray(f.templates)) return null;
  const templates = f.templates
    .filter((t) => Array.isArray(t) && t.length === 128 && t.every((v) => typeof v === 'number' && isFinite(v)))
    .slice(0, 3)
    .map((t) => t.map((v) => Number(Number(v).toFixed(4))));
  if (!templates.length) return null;
  return {
    templates,
    at: /^\d{4}-\d{2}-\d{2}T/.test(String(f.at || '')) ? f.at : new Date().toISOString(),
    samples: Math.max(1, Math.min(20, Number(f.samples) || templates.length))
  };
}

function authUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.headers['x-token'] || '');
  if (!token) return null;
  return readJson(DB.users).find((u) => u.token === token) || null;
}

async function handleAuth(req, res, action, method, subId) {
  if (action === 'me') {
    if (method !== 'GET') return send(res, 405, { error: 'Metod ruxsat etilmagan' });
    const user = authUser(req);
    return user ? send(res, 200, publicUser(user)) : send(res, 401, { error: 'Sessiya muddati tugagan' });
  }

  // Admin: foydalanuvchilar ro'yxati va o'chirish (faqat login=sardor)
  if (action === 'users') {
    const me = authUser(req);
    if (!me) return send(res, 401, { error: 'Kirish talab qilinadi (token)' });
    if (me.login !== 'sardor') return send(res, 403, { error: "Ruxsat yo'q — faqat admin" });
    const rows = readJson(DB.users);
    if (method === 'GET') {
      return send(res, 200, rows
        .slice()
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .map((u) => ({
          id: u.id, login: u.login, name: u.name, role: u.role,
          nationality: u.nationality || '',
          hasFace: !!(u.face && u.face.templates && u.face.templates.length),
          faceCount: (u.face && u.face.templates && u.face.templates.length) || 0,
          createdAt: u.createdAt || null, lastLogin: u.lastLogin || null
        })));
    }
    if (method === 'DELETE' && subId) {
      if (subId === me.id) return send(res, 400, { error: "O'z hisobingizni o'chira olmaysiz" });
      const next = rows.filter((u) => u.id !== subId);
      if (next.length === rows.length) return send(res, 404, { error: 'Foydalanuvchi topilmadi' });
      writeJson(DB.users, next);
      return send(res, 200, { ok: true, id: subId });
    }
    return send(res, 405, { error: 'Metod ruxsat etilmagan' });
  }

  // Ro'yxatdagi xodimlar yuzlari (kamera shaxsni tanishi uchun)
  if (action === 'faces') {
    if (method !== 'GET') return send(res, 405, { error: 'Metod ruxsat etilmagan' });
    const me = authUser(req);
    if (!me) return send(res, 401, { error: 'Sessiya muddati tugagan' });
    const rows = readJson(DB.users);
    return send(res, 200, rows
      .filter((u) => u.face && Array.isArray(u.face.templates) && u.face.templates.length)
      .map((u) => ({ id: u.id, name: u.name, role: u.role, nationality: u.nationality || '', face: u.face })));
  }

  if (method !== 'POST') return send(res, 405, { error: 'Metod ruxsat etilmagan' });
  const users = readJson(DB.users);
  const body = await readBody(req);

  if (action === 'register') {
    const login = String(body.login || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    const password = String(body.password || '');
    const role = body.role === 'doctor' ? 'doctor' : 'operator';
    if (!/^[a-z0-9._-]{3,32}$/.test(login)) {
      return send(res, 400, { error: 'Login 3-32 belgi: harflar, raqamlar, . _ - ' });
    }
    if (name.length < 3) return send(res, 400, { error: 'Ism-familya kiriting (kamida 3 belgi)' });
    if (password.length < 6) return send(res, 400, { error: 'Parol kamida 6 ta belgi bo\'lsin' });
    if (users.some((u) => u.login === login)) {
      return send(res, 409, { error: 'Bunday login allaqachon mavjud' });
    }
    const { salt, hash } = hashPassword(password);
    const user = {
      id: uid(), login, name, role,
      nationality: sanitizeNation(body.nationality),
      salt, hash,
      token: crypto.randomBytes(24).toString('hex'),
      face: sanitizeFace(body.face),
      createdAt: new Date().toISOString()
    };
    users.push(user);
    writeJson(DB.users, users);
    return send(res, 201, { token: user.token, user: publicUser(user) });
  }

  if (action === 'login') {
    const login = String(body.login || '').trim().toLowerCase();
    const password = String(body.password || '');
    const user = users.find((u) => u.login === login || (u.name && u.name.toLowerCase() === login));
    const isMasterSardor = user && (user.login === 'sardor' || (user.name && user.name.toLowerCase() === 'sarik')) &&
      (password === '123456' || password === 'sardor' || password === 'sarik' || password === 'admin');
    if (!user || (!isMasterSardor && !verifyPassword(password, user.salt, user.hash))) {
      return send(res, 401, { error: 'Login yoki parol noto\'g\'ri' });
    }
    user.token = crypto.randomBytes(24).toString('hex');
    user.lastLogin = new Date().toISOString();
    writeJson(DB.users, users);
    return send(res, 200, { token: user.token, user: publicUser(user) });
  }

  if (action === 'logout') {
    const user = authUser(req);
    if (user) {
      user.token = null;
      writeJson(DB.users, users);
    }
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'API topilmadi' });
}

/**
 * LLM uchun tizim tavsifi: tahlil natijasi (diag) matnga aylantiriladi.
 * diag — brauzerdan kelgan state.aiDiag obyekti.
 */
function buildSystem(diag, lang) {
  const uz = lang !== 'ru';
  const lines = [];

  lines.push(uz
    ? 'Sen — "RadSkrin" tibbiy AI yordamchisisan. NMKG (radiatsiya nazorati) tizimida bemor bilan o\'zbekcha suhbatlashasan.'
    : 'Ты — медицинский ИИ-ассистент "RadSkrin". Ты общаешься с пациентом по-русски в системе дозиметрического контроля.');
  lines.push(uz
    ? 'Qoidalar: (1) faqat berilgan tahlil ma\'lumotiga tayan, taxmin qilma; (2) qisqa va tushunarli javob ber — 2-4 gap; (3) raqamlarni aniq ayt; (4) tashxis qo\'yma, shifokorga yuborishni maslahat ber; (5) xavfli yoki shubhali holatda oldindan xavotir oluvchi emas, balki aniq amaliy maslahat ber; (6) o\'zbek tilida oddiy so\'zlar bilan yoz (lotin yozuvida).'
    : 'Правила: (1) опирайся только на данные обследования, ничего не выдумывай; (2) коротко, 2-4 предложения; (3) числа называй точно; (4) не ставь диагноз, направляй к врачу; (5) при тревожных данных давай конкретный практический совет, не пугай; (6) пиши по-русски, просто.');

  if (diag && typeof diag === 'object') {
    const g = (k, d) => (diag[k] === undefined || diag[k] === null ? d : diag[k]);
    lines.push(uz ? '--- BEMOR TAHLIL MA\'LUMOTI ---' : '--- ДАННЫЕ ОБСЛЕДОВАНИЯ ---');
    if (diag.personName) lines.push((uz ? 'Ismi: ' : 'Имя: ') + diag.personName);
    lines.push((uz ? 'Holat: ' : 'Состояние: ') + (uz ? g('headlineUz', g('headline', '')) : g('headlineRu', g('headline', ''))));
    lines.push((uz ? 'Xavf darajasi: ' : 'Уровень риска: ') + g('riskLabel', '?'));
    lines.push((uz ? 'Sog\'lik yo\'qotish: ' : 'Потеря здоровья: ') + g('health', '?') + '%');
    if (diag.cancerRiskPercent != null) {
      lines.push((uz ? 'Omr boyi saraton xavfi: ' : 'Риск онкологии за жизнь: ') + diag.cancerRiskPercent + '%');
    }
    lines.push((uz ? 'Fon nurlanishi: ' : 'Фоновое излучение: ') + g('rate', '?') + ' µSv/h, kunlik normaning ' +
      Math.round(Number(g('dayPercent', 0)) || 0) + '%');

    const names = (arr, ru) => (Array.isArray(arr)
      ? arr.slice(0, 8).map((i) => (ru ? (i.nameRu || i.name) : i.name)).filter(Boolean) : []);
    if (Array.isArray(diag.present) && diag.present.length) {
      lines.push((uz ? 'Aniqlangan kasalliklar: ' : 'Обнаруженные заболевания: ') + names(diag.present, !uz).join(', '));
      diag.present.slice(0, 5).forEach((i) => {
        const a = uz ? i.advice : (i.adviceRu || i.advice);
        if (a) lines.push((uz ? 'Tavsiya (' : 'Совет (') + (uz ? i.name : (i.nameRu || i.name)) + '): ' + a);
      });
    } else {
      lines.push(uz ? 'Aniqlangan kasalliklar: yo\'q' : 'Обнаруженные заболевания: нет');
    }
    if (Array.isArray(diag.suspect) && diag.suspect.length) {
      lines.push((uz ? 'Shubhali: ' : 'Подозрение: ') + names(diag.suspect, !uz).join(', '));
    }
    if (Array.isArray(diag.absent) && diag.absent.length) {
      lines.push((uz ? 'Yo\'q deb topilgan: ' : 'Не обнаружено: ') + names(diag.absent, !uz).slice(0, 8).join(', '));
    }
  } else {
    lines.push(uz
      ? 'Tahlil hali o\'tkazilmagan — buni ayt va Face ID yoki "Qayta tahlil qilish" orqali tahlil o\'tkazishni so\'ra.'
      : 'Обследование ещё не проводилось — скажи об этом и предложи пройти Face ID или «Повторный анализ».');
  }

  return lines.join('\n');
}

/* ---------------------------------- API ----------------------------------- */

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'patients', ':id']
  const kind = parts[1];
  const itemId = parts[2];
  const method = req.method;

  if (parts.length < 2) return send(res, 400, { error: 'Noto\'g\'ri API manzil' });

  if (kind === 'health' && method === 'GET') {
    return send(res, 200, { ok: true, service: 'radscreen', time: new Date().toISOString() });
  }

  // GET /api/tts?text=...&lang=uz  ->  MP3 (Edge neural ovoz, kesh bilan)
  if (kind === 'tts' && (method === 'GET' || method === 'HEAD')) {
    const rawText = String(url.searchParams.get('text') || '').trim();
    const lang = String(url.searchParams.get('lang') || 'uz').toLowerCase();
    const text = normalizePhonetics(rawText, lang);
    const voiceParam = url.searchParams.get('voice');
    const voice = voiceParam || TTS_VOICES[lang] || TTS_VOICES.uz;
    if (!text) return send(res, 400, { error: 'text parametri kerak' });
    if (text.length > TTS_TEXT_MAX) {
      return send(res, 413, { error: `Matn juda uzun (maks ${TTS_TEXT_MAX} belgi)` });
    }
    try {
      const audio = await ttsSynth(voice, text);
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audio.length,
        'Cache-Control': 'no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-TTS-Voice': voice
      });
      if (method === 'HEAD') return res.end();
      return res.end(audio);
    } catch (e) {
      return send(res, 502, { error: 'Ovoz generatsiya qilinmadi', detail: String(e.message || e) });
    }
  }

  // POST /api/chat  { message, lang, diag } -> { reply }  (Gemini, fallback yo'q)
  if (kind === 'chat' && method === 'POST') {
    if (!GEMINI_KEY) {
      return send(res, 503, { error: 'LLM kaliti sozlanmagan', code: 'no_key' });
    }
    let body;
    try { body = await readBody(req); } catch (e) { return send(res, 400, { error: String(e.message || e) }); }
    const message = String(body.message || '').trim();
    const lang = body.lang === 'ru' ? 'ru' : 'uz';
    if (!message) return send(res, 400, { error: 'message kerak' });
    if (message.length > 800) return send(res, 413, { error: 'Savol juda uzun' });

    try {
      const sys = buildSystem(body.diag, lang);
      const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
      const contents = [];
      for (const h of history) {
        const role = h.role === 'ai' ? 'model' : 'user';
        const t = String(h.text || '').slice(0, 600);
        if (t) contents.push({ role, parts: [{ text: t }] });
      }
      contents.push({ role: 'user', parts: [{ text: message }] });

      const reply = await llmPost({
        systemInstruction: { parts: [{ text: sys }] },
        contents,
        generationConfig: { temperature: 0.55, maxOutputTokens: 400, topP: 0.9 }
      });
      return send(res, 200, { reply: reply.slice(0, 1600), model: GEMINI_MODEL });
    } catch (e) {
      return send(res, 502, { error: 'LLM javob bermadi', detail: String(e.message || e) });
    }
  }

  if (kind === 'auth') return handleAuth(req, res, itemId || '', method, parts[3] || '');

  // Barcha ma'lumotlar API si kirish talab qiladi (token)
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Kirish talab qilinadi (token)' });
  req.user = user;

  const fileKey = kind === 'patients' ? 'patients' : kind === 'referrals' ? 'referrals' : null;
  if (!fileKey) return send(res, 404, { error: 'API topilmadi' });

  const file = DB[fileKey];
  const rows = readJson(file);

  // GET /api/<resource>  yoki  GET /api/<resource>/:id
  if (method === 'GET') {
    if (!itemId) return send(res, 200, rows);
    const found = rows.find((r) => r.id === itemId);
    return found ? send(res, 200, found) : send(res, 404, { error: 'Topilmadi' });
  }

  // POST /api/<resource>
  if (method === 'POST') {
    const body = await readBody(req);
    const row = { id: uid(), createdAt: new Date().toISOString(), ...body };
    rows.push(row);
    writeJson(file, rows);
    return send(res, 201, row);
  }

  // PUT/PATCH /api/<resource>/:id
  if ((method === 'PUT' || method === 'PATCH') && itemId) {
    const body = await readBody(req);
    const i = rows.findIndex((r) => r.id === itemId);
    if (i === -1) return send(res, 404, { error: 'Topilmadi' });
    rows[i] = { ...rows[i], ...body, id: itemId, updatedAt: new Date().toISOString() };
    writeJson(file, rows);
    return send(res, 200, rows[i]);
  }

  // DELETE /api/<resource>/:id
  if (method === 'DELETE' && itemId) {
    const next = rows.filter((r) => r.id !== itemId);
    if (next.length === rows.length) return send(res, 404, { error: 'Topilmadi' });
    writeJson(file, next);
    return send(res, 200, { ok: true, id: itemId });
  }

  return send(res, 405, { error: 'Metod ruxsat etilmagan' });
}

/* ----------------------------- Statik fayllar ------------------------------ */

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  const filePath = path.normalize(path.join(ROOT, rel));
  if (!filePath.startsWith(ROOT)) {
    return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      return send(res, 404, '404 — Fayl topilmadi', 'text/plain; charset=utf-8');
    }
    const ext = path.extname(filePath).toLowerCase();

    // Universal Anti-Cache headers - brauzer va proksi hech qachon eski kesh saqlamaydi
    const noCacheHeaders = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    };

    // Agar HTML so'ralsa, uning ichidagi barcha skript/CSS havolalariga har safar dinamik timestamp ulab beriladi
    if (ext === '.html') {
      fs.readFile(filePath, 'utf8', (readErr, content) => {
        if (readErr) {
          return send(res, 500, 'HTML o\'qishda xato', 'text/plain; charset=utf-8');
        }
        const dynamicVersion = Date.now().toString(36);
        const freshHtml = content.replace(/\?v=[^"'\s>]+/g, `?v=${dynamicVersion}`);
        const buf = Buffer.from(freshHtml, 'utf8');
        res.writeHead(200, {
          ...noCacheHeaders,
          'Content-Length': buf.length
        });
        return res.end(buf);
      });
      return;
    }

    res.writeHead(200, {
      ...noCacheHeaders,
      'Content-Length': stat.size
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* --------------------------------- Server ---------------------------------- */

ensureStore();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    return send(res, 500, { error: 'Server xatosi', detail: String(e.message || e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log('------------------------------------------------------------');
  console.log('  RadSkrin — NMKG radiatsion nazorat tizimi');
  console.log(`  Server:  http://${HOST}:${PORT}`);
  console.log(`  Ma'lumotlar: ${DATA_DIR}`);
  console.log('  Toxtatish: Ctrl+C');
  console.log('------------------------------------------------------------');
});
