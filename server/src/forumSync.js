import db from './db.js';
import { getSettings } from './siteSettings.js';
import { APPEAL_KINDS, appealKindOf } from './config.js';
import { logAudit } from './audit.js';

// Импорт обращений с игрового форума (XenForo).
// Раздел форума и cookie авторизации берутся из настроек сайта (админ-панель → Настройки)
// и читаются заново на каждом прогоне. Разделы обращений закрыты для гостей,
// поэтому запросы идут с cookie аккаунта, вошедшего на форум.
const INTERVAL_MIN = Number(process.env.FORUM_SYNC_INTERVAL_MIN) || 5;
const DISABLED = process.env.FORUM_SYNC_DISABLED === '1';

// FlareSolverr для обхода Cloudflare-проверки форума. Если не задан — прямой fetch (в dev).
const FLARE_URL = process.env.FLARESOLVERR_URL || '';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

// Ошибка доступа к форуму с кодом причины: auth | http | network | format.
class ForumError extends Error {
  constructor(reason, message, httpStatus = null) {
    super(message);
    this.reason = reason;
    this.httpStatus = httpStatus;
  }
}

// Родительский домен для cookie: forum.gta5rp.com → .gta5rp.com
function cookieDomain(url) {
  const host = new URL(url).hostname;
  const parts = host.split('.');
  return parts.length > 2 ? `.${parts.slice(1).join('.')}` : host;
}

// «a=1; b=2» → [{ name, value, domain, path }] для FlareSolverr.
// Домен ставим явно на весь сайт (.gta5rp.com): FlareSolverr сначала открывает страницу
// без cookie, а форум уводит гостя со страниц на gta5rp.com/login-forum — без явного домена
// cookie попали бы на gta5rp.com, и повторная загрузка форума шла бы без авторизации.
function parseCookie(str, url) {
  const domain = cookieDomain(url);
  return String(str || '')
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p.includes('='))
    .map((p) => {
      const i = p.indexOf('=');
      return { name: p.slice(0, i).trim(), value: p.slice(i + 1).trim(), domain, path: '/' };
    })
    .filter((c) => c.name);
}

// Ответ — проверка Cloudflare («Just a moment…»), а не страница форума?
function isCloudflareChallenge(status, headers, body) {
  if (status !== 403 && status !== 503 && status !== 429) return false;
  if (String(headers.get?.('cf-mitigated') || '').toLowerCase() === 'challenge') return true;
  return /<title>\s*Just a moment|_cf_chl_opt|cf-chl-|challenges\.cloudflare\.com/i.test(body);
}

// Если Cloudflare недавно требовал проверку — какое-то время сразу идём через FlareSolverr.
const CF_STICKY_MS = 30 * 60 * 1000;
let cfChallengedUntil = 0;

async function directGet(url, cookie) {
  const headers = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
  };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  const body = await res.text();
  return { status: res.status, url: res.url || url, body, headers: res.headers, via: 'direct' };
}

async function flareGet(url, cookie) {
  let res;
  try {
    res = await fetch(FLARE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cmd: 'request.get',
        url,
        maxTimeout: 60000,
        ...(cookie ? { cookies: parseCookie(cookie, url) } : {}),
      }),
      signal: AbortSignal.timeout(90000),
    });
  } catch (e) {
    throw new ForumError('network', `FlareSolverr недоступен: ${e.message}`);
  }
  if (!res.ok) throw new ForumError('network', `FlareSolverr HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok') throw new ForumError('network', `FlareSolverr: ${data.message || data.status}`);
  const s = data.solution || {};
  return { status: s.status || 200, url: s.url || url, body: s.response || '', via: 'flare' };
}

// GET страницы форума. Возвращает { status, url, body, via: 'direct' | 'flare' }.
// Сначала прямой запрос (cookie передаётся точно как есть); FlareSolverr — только если
// Cloudflare требует проверку браузером, либо прямой запрос не прошёл по сети.
async function forumGet(url, cookie) {
  if (FLARE_URL && Date.now() < cfChallengedUntil) return flareGet(url, cookie);
  try {
    const r = await directGet(url, cookie);
    if (FLARE_URL && isCloudflareChallenge(r.status, r.headers, r.body)) {
      cfChallengedUntil = Date.now() + CF_STICKY_MS;
      return flareGet(url, cookie);
    }
    return r;
  } catch (e) {
    if (FLARE_URL) return flareGet(url, cookie);
    throw new ForumError('network', `Форум недоступен: ${e.message}`);
  }
}

// Ответ — страница входа / «нужно войти на форум»?
function looksLikeLogin(r) {
  return (
    r.status === 401 ||
    r.status === 403 ||
    /\/login/i.test(new URL(r.url, 'https://x/').pathname) ||
    /data-logged-in="false"|data-template="login"|нужно сначала войти на форум|reason=anonymous/i.test(r.body)
  );
}

function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// XML RSS-ленты раздела. FlareSolverr (браузер) заворачивает XML в <pre> с энтити.
async function getRssXml({ forumUrl, cookie }) {
  const r = await forumGet(`${forumUrl}index.rss`, cookie);
  let xml = r.body;
  if (r.via === 'flare' && !/<rss[\s>]/i.test(xml)) {
    const m = xml.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (m) xml = decodeEntities(m[1]);
  }
  if (/<rss[\s>]/i.test(xml)) return xml;
  if (looksLikeLogin(r)) {
    throw new ForumError(
      'auth',
      cookie ? 'Форум требует вход: cookie устарел или недействителен' : 'Форум требует вход: cookie не задан',
      r.status,
    );
  }
  if (r.status >= 400) throw new ForumError('http', `Форум ответил HTTP ${r.status}`, r.status);
  throw new ForumError('format', 'Ответ форума не похож на RSS-ленту', r.status);
}

// HTML страницы темы (для полного текста). Ошибки не критичны — вернётся null.
async function getThreadHtml(url, cookie) {
  try {
    const r = await forumGet(url, cookie);
    if (r.status >= 400 || looksLikeLogin(r)) return null;
    return r.body;
  } catch {
    return null;
  }
}

function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .trim();
}

// Базовая очистка HTML от опасных элементов (тело поста с форума).
function sanitizeHtml(html) {
  return String(html || '')
    .replace(/<\s*(script|style|iframe|object|embed)\b[\s\S]*?<\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1=$2#$2')
    .slice(0, 20000)
    .trim();
}

function parseItems(xml) {
  const items = [];
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const block of blocks) {
    const title = decode((block.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]);
    const link = decode((block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1]);
    const creator = decode(
      (block.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/i) || [])[1] ||
        (block.match(/<author>([\s\S]*?)<\/author>/i) || [])[1] ||
        '',
    );
    // Тело первого поста (XenForo кладёт его в content:encoded; иногда в description).
    const rawContent =
      (block.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/i) || [])[1] ||
      (block.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] ||
      '';
    const content = sanitizeHtml(decode(rawContent));
    if (title && link) items.push({ title, link, creator, content });
  }
  return items;
}

// Из ссылки вида /threads/...-185.3407980/ достаём id темы (3407980).
function threadId(url) {
  const m = String(url).match(/\.(\d+)\/?(?:[?#]|$)/);
  return m ? m[1] : null;
}

// Извлекает HTML первого поста (содержимое первого <div class="bbWrapper">)
// со страницы темы XenForo, учитывая вложенные <div> (цитаты, спойлеры).
function extractFirstPost(html) {
  const open = html.match(/<div[^>]*class="[^"]*bbWrapper[^"]*"[^>]*>/i);
  if (!open) return null;
  const start = open.index + open[0].length;
  const re = /<\/?div\b[^>]*>/gi;
  re.lastIndex = start;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    if (m[0][1] === '/') {
      depth -= 1;
      if (depth === 0) return html.slice(start, m.index);
    } else {
      depth += 1;
    }
  }
  return null;
}

// Признак «огрызка» из RSS: пусто или есть ссылка «Читать далее»/«Read more».
const isStub = (c) => !c || /Читать далее|Read more/i.test(c);

// Загружает полный текст обращения со страницы темы форума.
async function fetchThreadContent(url, cookie) {
  const html = await getThreadHtml(url, cookie);
  if (!html) return null;
  const inner = extractFirstPost(html);
  return inner ? sanitizeHtml(inner) : null;
}

// Кириллические буквы, неотличимые от латинских: «СР-12» и «АР-15», набранные по-русски.
const HOMOGLYPHS = { А: 'A', а: 'a', С: 'C', с: 'c', Р: 'P', р: 'p' };

// Номер обращения из заголовка: «Обращение №CP-185» → «CP-185», «Обжалование №AP-15» → «AP-15».
// Префиксы: CP (обращения), AP и PR (обжалования); берётся первый найденный.
// Опечатка без префикса («Обращение №-6391», «№ 6391») считается CP.
// Темы без номера (закреплённая «Форма подачи…» и т.п.) — не обращения: null.
export function extractCode(title) {
  const s = String(title).replace(/[АаСсРр]/g, (ch) => HOMOGLYPHS[ch]);
  const m = s.match(/(?:^|[^A-Za-zА-Яа-яЁё])(CP|AP|PR)\s*[-–—№#]*\s*(\d+)/i);
  if (m) return `${m[1].toUpperCase()}-${m[2]}`;
  const n = s.match(/№\s*[-–—#]?\s*(\d+)/);
  return n ? `CP-${n[1]}` : null;
}

// --- Состояние импорта (для индикатора «Форум недоступен») ---
let status = { state: 'unknown', checkedAt: null, lastOkAt: null, reason: null, message: null, httpStatus: null };
export const getForumStatus = () => ({ ...status });

function setStatus(next) {
  const prev = status.state;
  status = { ...status, ...next, checkedAt: new Date().toISOString() };
  if (next.state === 'ok') status.lastOkAt = status.checkedAt;
  // В журнал пишем только смену состояния, а не каждый прогон.
  if (prev !== next.state && next.state === 'error') {
    console.warn(`[forum-sync] нет доступа к форуму: ${next.message}`);
    logAudit(null, 'forum.error', `Импорт обращений остановлен: ${next.message}`);
  } else if (prev === 'error' && next.state === 'ok') {
    console.log('[forum-sync] доступ к форуму восстановлен');
    logAudit(null, 'forum.ok', 'Доступ к форуму восстановлен, импорт обращений возобновлён');
  }
}

let running = false;

export async function syncForumAppeals() {
  if (running) return { skipped: true };
  running = true;
  try {
    return await runSync();
  } finally {
    running = false;
  }
}

async function runSync() {
  const { appealsForumUrl: forumUrl, forumCookie: cookie } = getSettings();
  let xml;
  try {
    xml = await getRssXml({ forumUrl, cookie });
  } catch (e) {
    setStatus({ state: 'error', reason: e.reason || 'network', message: e.message, httpStatus: e.httpStatus ?? null });
    return { created: 0, error: e.message };
  }
  setStatus({ state: 'ok', reason: null, message: null, httpStatus: null });

  const items = parseItems(xml);
  const byThread = db.prepare('SELECT id, forum_content FROM appeals WHERE forum_thread_id = ?');
  // Дубль по номеру проверяем только среди добавленных вручную: темы форума уникальны по id темы,
  // а номера разных игровых серверов могут совпадать.
  const byCode = db.prepare("SELECT 1 FROM appeals WHERE code = ? AND source = 'manual'");
  const insert = db.prepare(
    `INSERT INTO appeals (code, title, forum_url, forum_thread_id, forum_title, forum_content, applicant, status, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'not_taken', 'forum')`,
  );
  const fillContent = db.prepare('UPDATE appeals SET forum_content = ? WHERE id = ?');

  let created = 0;
  let filled = 0;
  for (const it of items) {
    const tid = threadId(it.link);
    if (!tid) continue;
    const existing = byThread.get(tid);

    if (existing) {
      // Уже импортировано — заменяем «огрызок» полным текстом со страницы темы.
      if (isStub(existing.forum_content)) {
        const content = await fetchThreadContent(it.link, cookie);
        if (content) {
          fillContent.run(content, existing.id);
          filled += 1;
        }
      }
      continue;
    }

    const code = extractCode(it.title);
    if (!code) continue; // не обращение (закреплённая инструкция и т.п.)
    if (byCode.get(code)) continue; // уже добавлено вручную
    // Полный текст берём со страницы темы; RSS — запасной (обрезанный) вариант.
    const content = (await fetchThreadContent(it.link, cookie)) || it.content || null;
    const noun = APPEAL_KINDS[appealKindOf(code)].noun; // «Обращение CP-…» / «Обжалование AP-…»
    insert.run(code, `${noun} ${code}`, it.link, tid, it.title, content, it.creator || null);
    created += 1;
  }
  // Догружаем полный текст для ранее импортированных обращений без него —
  // по 10 за прогон, чтобы постепенно покрыть и старые темы (вне RSS-ленты).
  const missing = db
    .prepare(
      `SELECT id, forum_url FROM appeals
       WHERE source = 'forum' AND forum_url IS NOT NULL
         AND (forum_content IS NULL OR forum_content = ''
              OR forum_content LIKE '%Читать далее%' OR forum_content LIKE '%Read more%')
       ORDER BY id DESC LIMIT 10`,
    )
    .all();
  for (const a of missing) {
    const content = await fetchThreadContent(a.forum_url, cookie);
    if (content) {
      fillContent.run(content, a.id);
      filled += 1;
    }
  }

  if (created || filled) {
    console.log(`[forum-sync] новых: ${created}, дополнено текстом: ${filled}`);
  }
  return { created, filled };
}

// Проверка доступа для кнопки «Проверить доступ к форуму» (значения можно передать
// несохранённые — из формы). Ничего не записывает в базу.
export async function checkForumAccess({ forumUrl, cookie }) {
  const result = {
    ok: false,
    loggedIn: false,
    username: null,
    via: null, // 'direct' | 'flare' — как реально идут запросы к форуму
    itemCount: 0,
    recognized: 0,
    threadText: null, // открывается ли полный текст темы (нужно импорту)
    sample: [],
    reason: null,
    message: null,
  };

  // Параллельно: страница раздела (вошли ли и под каким ником) и RSS-лента (то, что читает импорт).
  const [page, rss] = await Promise.allSettled([forumGet(forumUrl, cookie), getRssXml({ forumUrl, cookie })]);

  if (page.status === 'fulfilled') {
    result.via = page.value.via;
    result.loggedIn = /data-logged-in="true"/i.test(page.value.body);
    const nick = page.value.body.match(/p-navgroup-link--user[^>]*\stitle="([^"]+)"/i);
    if (nick) result.username = decodeEntities(nick[1]);
  }

  if (rss.status === 'fulfilled') {
    const items = parseItems(rss.value);
    result.itemCount = items.length;
    const withCode = items.map((it) => ({ title: it.title, code: extractCode(it.title) }));
    result.recognized = withCode.filter((x) => x.code).length;
    result.sample = withCode.slice(0, 5);
    result.ok = true;
    // Полный текст берётся со страницы темы — проверяем на первой теме ленты.
    const first = items.find((it) => extractCode(it.title)) || items[0];
    if (first) {
      const html = await getThreadHtml(first.link, cookie);
      result.threadText = !!(html && extractFirstPost(html));
    }
  } else {
    result.reason = rss.reason?.reason || 'network';
    result.message = rss.reason?.message || 'Не удалось получить RSS-ленту';
  }
  return result;
}

// Запускает внеочередной прогон (например, после смены настроек форума).
export function triggerForumSync() {
  if (DISABLED) return;
  syncForumAppeals().catch((e) => console.warn('[forum-sync] ошибка:', e.message));
}

export function startForumSync() {
  if (DISABLED) {
    console.log('[forum-sync] отключена (FORUM_SYNC_DISABLED=1)');
    return;
  }
  syncForumAppeals(); // первый прогон при старте
  setInterval(syncForumAppeals, INTERVAL_MIN * 60 * 1000);
  console.log(`[forum-sync] автосинхронизация форума включена (каждые ${INTERVAL_MIN} мин)`);
}
