import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Настройки сайта, которые меняются при переезде на другой игровой сервер.
// Хранятся в server/data/site-settings.json (папка в .gitignore) и редактируются
// в админ-панели. Если файла/поля нет — значение берётся из .env, затем по умолчанию.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'site-settings.json');

const DEFAULT_FORUM_URL = 'https://forum.gta5rp.com/forums/obraschenija-v-prokuraturu.2082/';

// Старая переменная FORUM_APPEALS_RSS указывала на ленту — превращаем в адрес раздела.
const envForumUrl = () =>
  process.env.FORUM_APPEALS_URL ||
  (process.env.FORUM_APPEALS_RSS ? process.env.FORUM_APPEALS_RSS.replace(/index\.rss\/?$/i, '') : '');

const isHttpUrl = (s) => /^https?:\/\/[^\s]+$/i.test(s);

// Описание полей: значение по умолчанию и валидация (возвращает нормализованное значение или кидает ошибку).
export const SETTINGS_FIELDS = {
  serverName: {
    label: 'Название сервера',
    fallback: () => process.env.SERVER_NAME || 'Senora',
    normalize: (v) => {
      const s = String(v ?? '').trim().slice(0, 40);
      if (!s) throw new Error('empty_server_name');
      return s;
    },
  },
  appealsForumUrl: {
    label: 'Раздел обращений на форуме',
    fallback: () => envForumUrl() || DEFAULT_FORUM_URL,
    normalize: (v) => {
      const s = String(v ?? '').trim();
      if (!isHttpUrl(s)) throw new Error('invalid_forum_url');
      // Если вставили ссылку на RSS — убираем хвост; приводим к виду «.../»
      return s.replace(/index\.rss\/?$/i, '').replace(/\/?$/, '/');
    },
  },
  forumCookie: {
    label: 'Cookie форума',
    secret: true,
    superuserOnly: true, // видит и меняет только суперпользователь (право manageForumCookie)
    fallback: () => process.env.FORUM_COOKIE || '',
    // Значение заголовка Cookie из браузера, где выполнен вход на форум.
    // Допускаем вставку вместе с «Cookie:» и переносами строк.
    normalize: (v) =>
      String(v ?? '')
        .replace(/^\s*cookie\s*:\s*/i, '')
        .replace(/[\r\n]+/g, ' ')
        .trim()
        .slice(0, 8000),
  },
  assignNotifyUrl: {
    label: 'URL Yandex-функции уведомлений',
    fallback: () => process.env.ASSIGN_NOTIFY_URL || '',
    normalize: (v) => {
      const s = String(v ?? '').trim();
      if (s && !isHttpUrl(s)) throw new Error('invalid_notify_url');
      return s;
    },
  },
  assignNotifyToken: {
    label: 'Токен Yandex-функции',
    secret: true,
    fallback: () => process.env.ASSIGN_NOTIFY_TOKEN || '',
    normalize: (v) => String(v ?? '').trim().slice(0, 500),
  },
};

let stored = {};
try {
  stored = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
} catch {
  stored = {}; // файла ещё нет — работаем на значениях из .env/по умолчанию
}

export function getSettings() {
  const out = {};
  for (const [key, f] of Object.entries(SETTINGS_FIELDS)) {
    out[key] = typeof stored[key] === 'string' ? stored[key] : f.fallback();
  }
  return out;
}

export const getSetting = (key) => getSettings()[key];

// Применяет изменения. Возвращает список реально изменённых ключей.
// Кидает Error(code) при невалидном значении — ничего не сохраняется.
export function updateSettings(patch) {
  const current = getSettings();
  const next = { ...current };
  const changed = [];
  for (const [key, f] of Object.entries(SETTINGS_FIELDS)) {
    if (patch[key] === undefined) continue;
    const value = f.normalize(patch[key]);
    if (value !== current[key]) {
      next[key] = value;
      changed.push(key);
    }
  }
  if (changed.length) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(tmp, FILE); // атомарная замена
    stored = next;
  }
  return changed;
}
