const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Railway Volume auto-detect: agar DATA_DIR berilmagan bo'lsa,
// /app/data papkasi borligini tekshiradi (Railway Volume mount).
// Bu baza restart'dan keyin saqlanib qolishini ta'minlaydi.
let dataDir;
if (process.env.DATA_DIR) {
  dataDir = process.env.DATA_DIR;
} else if (fs.existsSync('/app/data')) {
  dataDir = '/app/data';
} else {
  dataDir = path.join(__dirname, '..');
}
console.log('DATA_DIR:', dataDir, '| ENV:', process.env.DATA_DIR || '(yo\'q)');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'data.db');
console.log('DB yo\'li:', dbPath);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    language TEXT DEFAULT 'uz',
    is_blocked INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS surveys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER,
    full_name TEXT,
    destination TEXT,
    hotel_stars TEXT,
    travel_date TEXT,
    people_count TEXT,
    has_children INTEGER,
    children_count TEXT,
    children_ages TEXT,
    payment_type TEXT,
    contact_time TEXT,
    phone TEXT,
    manager TEXT,
    language TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admins (
    telegram_id INTEGER PRIMARY KEY,
    is_super INTEGER DEFAULT 0,
    added_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS texts (
    lang TEXT,
    key TEXT,
    value TEXT,
    PRIMARY KEY (lang, key)
  );

  CREATE TABLE IF NOT EXISTS contact_times (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS managers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    sort_order INTEGER DEFAULT 0
  );
`);

// Eski jadvalga yangi ustunlarni qo'shish (agar bo'lmasa).
// Mavjud yozuvlarda NULL bo'lib qoladi — ma'lumot yo'qolmaydi.
try { db.exec('ALTER TABLE surveys ADD COLUMN manager TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE surveys ADD COLUMN campaign_code TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE surveys ADD COLUMN service_type TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE surveys ADD COLUMN route TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE surveys ADD COLUMN payment_type TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE surveys ADD COLUMN hotel_stars TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE surveys ADD COLUMN hotel_stars TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE surveys ADD COLUMN payment_type TEXT'); } catch (e) {}

function seedAdmins() {
  const superAdmin = parseInt(process.env.SUPER_ADMIN_ID);
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => parseInt(s.trim())).filter(Boolean);
  const insert = db.prepare('INSERT OR IGNORE INTO admins (telegram_id, is_super) VALUES (?, ?)');
  if (superAdmin) insert.run(superAdmin, 1);
  for (const id of adminIds) insert.run(id, id === superAdmin ? 1 : 0);
}

function seedContactTimes() {
  const count = db.prepare('SELECT COUNT(*) as c FROM contact_times').get().c;
  if (count === 0) {
    const insert = db.prepare('INSERT INTO contact_times (label, sort_order) VALUES (?, ?)');
    insert.run('10:00 - 11:00', 1);
    insert.run('13:00 - 14:00', 2);
    insert.run('16:00 - 18:00', 3);
    insert.run('18:00 - 21:00', 4);
  }
}

function seedManagers() {
  // Yangi to'g'ri ro'yxat — bot ishga tushganda sinxronlanadi
  const desired = ['Tur Agent 1', 'Tur Agent 2', 'Tur Agent 3'];
  const current = db.prepare('SELECT name FROM managers ORDER BY sort_order ASC, id ASC').all().map(r => r.name);
  const same = current.length === desired.length && current.every((n, i) => n === desired[i]);
  if (!same) {
    db.prepare('DELETE FROM managers').run();
    const insert = db.prepare('INSERT INTO managers (name, sort_order) VALUES (?, ?)');
    desired.forEach((name, i) => insert.run(name, i + 1));
    // Counter'ni 0 ga qaytarish (yangi ro'yxatdan boshlash)
    db.prepare("INSERT INTO settings (key, value) VALUES ('manager_counter', '0') ON CONFLICT(key) DO UPDATE SET value = '0'").run();
    console.log('Menejerlar ro\'yxati yangilandi:', desired.join(', '));
  }
}

function seedSettings() {
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insert.run('group_id', process.env.GROUP_ID || '');
  insert.run('bot_active', '1');
  insert.run('manager_counter', '0');
}

// ============ VAQT YORDAMCHILARI ============
// Server UTC da ishlaydi, biz esa Toshkent vaqtida hisoblaymiz (UTC+5, DST yo'q).
const TZ_OFFSET_MIN = parseInt(process.env.TZ_OFFSET_MINUTES || '300');

// Hozirgi Toshkent vaqti — UTC maydonlari Toshkent devor-soatini bildiradi
function tashkentNow() {
  return new Date(Date.now() + TZ_OFFSET_MIN * 60000);
}

// Toshkent sana/vaqtini SQLite created_at formatiga (UTC) o'giradi
function sqlUtc(year, month, day, hour = 0) {
  const ms = Date.UTC(year, month, day, hour) - TZ_OFFSET_MIN * 60000;
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

const dbApi = {
  tashkentNow,
  sqlUtc,

  upsertUser(user) {
    db.prepare(`
      INSERT INTO users (telegram_id, username, first_name, language)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name
    `).run(user.id, user.username || null, user.first_name || null, 'uz');
  },
  setUserLanguage(telegramId, lang) {
    db.prepare('UPDATE users SET language = ? WHERE telegram_id = ?').run(lang, telegramId);
  },
  getUserLanguage(telegramId) {
    const row = db.prepare('SELECT language FROM users WHERE telegram_id = ?').get(telegramId);
    return row ? row.language : 'uz';
  },
  isBlocked(telegramId) {
    const row = db.prepare('SELECT is_blocked FROM users WHERE telegram_id = ?').get(telegramId);
    return row ? !!row.is_blocked : false;
  },
  blockUser(telegramId) {
    db.prepare('UPDATE users SET is_blocked = 1 WHERE telegram_id = ?').run(telegramId);
  },
  unblockUser(telegramId) {
    db.prepare('UPDATE users SET is_blocked = 0 WHERE telegram_id = ?').run(telegramId);
  },
  getBlockedUsers() {
    return db.prepare('SELECT telegram_id, username, first_name FROM users WHERE is_blocked = 1').all();
  },
  getAllUserIds() {
    return db.prepare('SELECT telegram_id FROM users WHERE is_blocked = 0').all().map(r => r.telegram_id);
  },
  countUsers() {
    return db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  },

  saveSurvey(data) {
    return db.prepare(`
      INSERT INTO surveys (telegram_id, full_name, service_type, route, destination, hotel_stars, travel_date, people_count, has_children, children_count, children_ages, payment_type, contact_time, phone, manager, campaign_code, language)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.telegram_id, data.full_name || null, data.service_type || null, data.route || null,
      data.destination || null, data.hotel_stars || null,
      data.travel_date || null, data.people_count || null, data.has_children ? 1 : 0, data.children_count || null,
      data.children_ages || null, data.payment_type || null, data.contact_time, data.phone,
      data.manager || null, data.campaign_code || null, data.language
    );
  },
  getAllSurveys() {
    return db.prepare('SELECT * FROM surveys ORDER BY created_at DESC').all();
  },
  getStats() {
    // DIQQAT: created_at SQLite formatida — "YYYY-MM-DD HH:MM:SS" (UTC).
    // toISOString() ishlatilsa "T" ajratuvchisi tufayli taqqoslash buziladi.
    const tz = tashkentNow();
    const todayStart = sqlUtc(tz.getUTCFullYear(), tz.getUTCMonth(), tz.getUTCDate());
    const weekStart = sqlUtc(tz.getUTCFullYear(), tz.getUTCMonth(), tz.getUTCDate() - 6);
    const monthStart = sqlUtc(tz.getUTCFullYear(), tz.getUTCMonth(), 1);
    return {
      total: db.prepare('SELECT COUNT(*) as c FROM surveys').get().c,
      today: db.prepare("SELECT COUNT(*) as c FROM surveys WHERE created_at >= ?").get(todayStart).c,
      week: db.prepare("SELECT COUNT(*) as c FROM surveys WHERE created_at >= ?").get(weekStart).c,
      month: db.prepare("SELECT COUNT(*) as c FROM surveys WHERE created_at >= ?").get(monthStart).c,
      services: db.prepare('SELECT service_type, COUNT(*) as c FROM surveys WHERE service_type IS NOT NULL GROUP BY service_type ORDER BY c DESC').all(),
      destinations: db.prepare('SELECT destination, COUNT(*) as c FROM surveys WHERE destination IS NOT NULL GROUP BY destination ORDER BY c DESC LIMIT 5').all(),
      stars: db.prepare('SELECT hotel_stars, COUNT(*) as c FROM surveys WHERE hotel_stars IS NOT NULL GROUP BY hotel_stars ORDER BY hotel_stars ASC').all(),
      payments: db.prepare('SELECT payment_type, COUNT(*) as c FROM surveys WHERE payment_type IS NOT NULL GROUP BY payment_type ORDER BY c DESC').all(),
      times: db.prepare('SELECT contact_time, COUNT(*) as c FROM surveys GROUP BY contact_time ORDER BY c DESC').all(),
      languages: db.prepare('SELECT language, COUNT(*) as c FROM surveys GROUP BY language').all(),
      managers: db.prepare('SELECT manager, COUNT(*) as c FROM surveys WHERE manager IS NOT NULL GROUP BY manager ORDER BY c DESC').all(),
      campaigns: db.prepare('SELECT campaign_code, COUNT(*) as c FROM surveys WHERE campaign_code IS NOT NULL GROUP BY campaign_code ORDER BY c DESC LIMIT 10').all(),
      totalUsers: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
      blockedUsers: db.prepare('SELECT COUNT(*) as c FROM users WHERE is_blocked = 1').get().c,
    };
  },

  // ============ DAVR BO'YICHA (oylik hisobot uchun) ============
  // start/end — sqlUtc() formatida, [start, end) oralig'i
  getSurveysBetween(start, end) {
    return db.prepare(
      'SELECT * FROM surveys WHERE created_at >= ? AND created_at < ? ORDER BY created_at ASC'
    ).all(start, end);
  },
  getStatsBetween(start, end) {
    const q = (sql) => db.prepare(sql).all(start, end);
    return {
      total: db.prepare('SELECT COUNT(*) as c FROM surveys WHERE created_at >= ? AND created_at < ?').get(start, end).c,
      services: q('SELECT service_type, COUNT(*) as c FROM surveys WHERE created_at >= ? AND created_at < ? AND service_type IS NOT NULL GROUP BY service_type ORDER BY c DESC'),
      destinations: q('SELECT destination, COUNT(*) as c FROM surveys WHERE created_at >= ? AND created_at < ? AND destination IS NOT NULL GROUP BY destination ORDER BY c DESC LIMIT 10'),
      stars: q('SELECT hotel_stars, COUNT(*) as c FROM surveys WHERE created_at >= ? AND created_at < ? AND hotel_stars IS NOT NULL GROUP BY hotel_stars ORDER BY hotel_stars ASC'),
      payments: q('SELECT payment_type, COUNT(*) as c FROM surveys WHERE created_at >= ? AND created_at < ? AND payment_type IS NOT NULL GROUP BY payment_type ORDER BY c DESC'),
      times: q('SELECT contact_time, COUNT(*) as c FROM surveys WHERE created_at >= ? AND created_at < ? GROUP BY contact_time ORDER BY c DESC'),
      languages: q('SELECT language, COUNT(*) as c FROM surveys WHERE created_at >= ? AND created_at < ? GROUP BY language'),
      managers: q('SELECT manager, COUNT(*) as c FROM surveys WHERE created_at >= ? AND created_at < ? AND manager IS NOT NULL GROUP BY manager ORDER BY c DESC'),
      campaigns: q('SELECT campaign_code, COUNT(*) as c FROM surveys WHERE created_at >= ? AND created_at < ? AND campaign_code IS NOT NULL GROUP BY campaign_code ORDER BY c DESC'),
      withChildren: db.prepare('SELECT COUNT(*) as c FROM surveys WHERE created_at >= ? AND created_at < ? AND has_children = 1').get(start, end).c,
      newUsers: db.prepare('SELECT COUNT(*) as c FROM users WHERE created_at >= ? AND created_at < ?').get(start, end).c,
    };
  },

  getAdmins() {
    return db.prepare('SELECT telegram_id, is_super, added_at FROM admins ORDER BY is_super DESC, added_at ASC').all();
  },
  isAdmin(telegramId) {
    return !!db.prepare('SELECT telegram_id FROM admins WHERE telegram_id = ?').get(telegramId);
  },
  isSuperAdmin(telegramId) {
    const row = db.prepare('SELECT is_super FROM admins WHERE telegram_id = ?').get(telegramId);
    return row ? !!row.is_super : false;
  },
  addAdmin(telegramId) {
    db.prepare('INSERT OR IGNORE INTO admins (telegram_id, is_super) VALUES (?, 0)').run(telegramId);
  },
  removeAdmin(telegramId) {
    db.prepare('DELETE FROM admins WHERE telegram_id = ? AND is_super = 0').run(telegramId);
  },

  getSetting(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  },
  setSetting(key, value) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  },

  getTextOverride(lang, key) {
    const row = db.prepare('SELECT value FROM texts WHERE lang = ? AND key = ?').get(lang, key);
    return row ? row.value : null;
  },
  setTextOverride(lang, key, value) {
    db.prepare('INSERT INTO texts (lang, key, value) VALUES (?, ?, ?) ON CONFLICT(lang, key) DO UPDATE SET value = excluded.value').run(lang, key, value);
  },
  resetTextOverride(lang, key) {
    db.prepare('DELETE FROM texts WHERE lang = ? AND key = ?').run(lang, key);
  },
  getAllTextOverrides() {
    return db.prepare('SELECT lang, key, value FROM texts').all();
  },

  getContactTimes() {
    return db.prepare('SELECT id, label, sort_order FROM contact_times ORDER BY sort_order ASC, id ASC').all();
  },
  addContactTime(label) {
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM contact_times').get().m;
    db.prepare('INSERT INTO contact_times (label, sort_order) VALUES (?, ?)').run(label, max + 1);
  },
  removeContactTime(id) {
    db.prepare('DELETE FROM contact_times WHERE id = ?').run(id);
  },

  // ============ MANAGERS ============
  getManagers() {
    return db.prepare('SELECT id, name, sort_order FROM managers ORDER BY sort_order ASC, id ASC').all();
  },
  addManager(name) {
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM managers').get().m;
    db.prepare('INSERT INTO managers (name, sort_order) VALUES (?, ?)').run(name, max + 1);
  },
  removeManager(id) {
    db.prepare('DELETE FROM managers WHERE id = ?').run(id);
  },
  // Navbatdagi menejerni olish va counter'ni oshirish
  getNextManager() {
    const managers = this.getManagers();
    if (managers.length === 0) return null;
    const counter = parseInt(this.getSetting('manager_counter') || '0');
    const idx = counter % managers.length;
    const manager = managers[idx];
    const newCounter = String((counter + 1) % managers.length);
    this.setSetting('manager_counter', newCounter);
    console.log(`📋 Menejer navbati: counter=${counter} idx=${idx} → ${manager.name} (keyingi counter=${newCounter})`);
    return manager.name;
  },
};

function init() {
  seedAdmins();
  seedContactTimes();
  seedManagers();
  seedSettings();
}

module.exports = { db, dbApi, init };
