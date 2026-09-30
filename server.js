'use strict';

/**
 * RadSkrin — GMZ radiatsion nazorat tizimi
 * Zero-dependency Node.js server: statik fayllar + REST API (bemorlar / shifokor navbati)
 * Ishlatish:  node server.js  ->  http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PORT = process.argv.includes('--port')
  ? Number(process.argv[process.argv.indexOf('--port') + 1])
  : Number(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
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
    'Cache-Control': 'no-store',
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
  hasFace: !!(u.face && Array.isArray(u.face.templates) && u.face.templates.length),
  createdAt: u.createdAt
});

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

  // Admin: foydalanuvchilar ro'yxati va o'chirish
  if (action === 'users') {
    const me = authUser(req);
    if (!me) return send(res, 401, { error: 'Kirish talab qilinadi (token)' });
    const rows = readJson(DB.users);
    if (method === 'GET') {
      return send(res, 200, rows
        .slice()
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .map((u) => ({
          id: u.id, login: u.login, name: u.name, role: u.role,
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
      .map((u) => ({ id: u.id, name: u.name, role: u.role, face: u.face })));
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
    const user = users.find((u) => u.login === login);
    if (!user || !verifyPassword(password, user.salt, user.hash)) {
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
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
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

server.listen(PORT, () => {
  console.log('------------------------------------------------------------');
  console.log('  RadSkrin — GMZ radiatsion nazorat tizimi');
  console.log(`  Server:  http://localhost:${PORT}`);
  console.log(`  Ma'lumotlar: ${DATA_DIR}`);
  console.log('  Toxtatish: Ctrl+C');
  console.log('------------------------------------------------------------');
});
