import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'justice.db'));
db.pragma('journal_mode = WAL');

// Таблица пользователей. Идентификация — по discord_id.
// display_name — изменяемое на сайте имя; если пусто, берётся имя из Discord.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id   TEXT UNIQUE NOT NULL,
    username     TEXT,
    global_name  TEXT,
    display_name TEXT,
    avatar       TEXT,
    access_level INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Миграция для уже существующих БД: добавляем display_name, если его нет.
const columns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!columns.includes('display_name')) {
  db.exec('ALTER TABLE users ADD COLUMN display_name TEXT');
}

// Документы прокуратуры: категории и документы (хранятся в формате BB-Code).
// scope: 'prosecutor' (Прокуратура) | 'general' (Генеральная прокуратура)
db.exec(`
  CREATE TABLE IF NOT EXISTS doc_categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    scope      TEXT NOT NULL DEFAULT 'prosecutor',
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS documents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    scope       TEXT NOT NULL DEFAULT 'prosecutor',
    category_id INTEGER,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Миграция: добавляем scope в уже существующие таблицы.
for (const table of ['doc_categories', 'documents']) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes('scope')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN scope TEXT NOT NULL DEFAULT 'prosecutor'`);
  }
}

// Личные документы/шаблоны сотрудников (приватные, по user_id).
db.exec(`
  CREATE TABLE IF NOT EXISTS personal_doc_categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS personal_documents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    category_id INTEGER,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Обращения в прокуратуру (трекинг тем с игрового форума).
db.exec(`
  CREATE TABLE IF NOT EXISTS appeals (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    code             TEXT,
    title            TEXT NOT NULL,
    forum_url        TEXT,
    forum_thread_id  TEXT,
    forum_title      TEXT,
    forum_content    TEXT,
    applicant        TEXT,
    status           TEXT NOT NULL DEFAULT 'not_taken',
    reviewed_at      TEXT,
    assigned_user_id INTEGER,
    assistant_user_id INTEGER,
    note             TEXT,
    source           TEXT NOT NULL DEFAULT 'manual',
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Миграция для уже существующих таблиц appeals.
{
  const cols = db.prepare('PRAGMA table_info(appeals)').all().map((c) => c.name);
  const add = {
    code: 'TEXT',
    forum_thread_id: 'TEXT',
    forum_title: 'TEXT',
    source: "TEXT NOT NULL DEFAULT 'manual'",
    assistant_user_id: 'INTEGER',
    reviewed_at: 'TEXT',
    forum_content: 'TEXT',
  };
  for (const [name, ddl] of Object.entries(add)) {
    if (!cols.includes(name)) db.exec(`ALTER TABLE appeals ADD COLUMN ${name} ${ddl}`);
  }
  // Бэкфилл: у уже «рассмотренных»/«отказанных» обращений момент архивации = updated_at.
  db.exec(
    "UPDATE appeals SET reviewed_at = updated_at WHERE status IN ('reviewed', 'refused') AND reviewed_at IS NULL",
  );
}

export default db;
