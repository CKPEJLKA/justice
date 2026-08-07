import db from './db.js';

// RSS-лента раздела «Обращения в прокуратуру» на игровом форуме (XenForo).
const RSS_URL =
  process.env.FORUM_APPEALS_RSS ||
  'https://forum.gta5rp.com/forums/obraschenija-v-prokuraturu.2082/index.rss';
const INTERVAL_MIN = Number(process.env.FORUM_SYNC_INTERVAL_MIN) || 5;
const DISABLED = process.env.FORUM_SYNC_DISABLED === '1';

// FlareSolverr для обхода Cloudflare-проверки форума. Если не задан — прямой fetch (в dev).
const FLARE_URL = process.env.FLARESOLVERR_URL || '';

async function flareRequest(url) {
  const res = await fetch(FLARE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmd: 'request.get', url, maxTimeout: 60000 }),
  });
  if (!res.ok) throw new Error(`flaresolverr HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error(`flaresolverr: ${data.message || data.status}`);
  return data.solution?.response || '';
}

function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// XML ленты: через FlareSolverr (браузер заворачивает XML в <pre> с энтити) или напрямую.
async function getRssXml() {
  if (FLARE_URL) {
    const html = await flareRequest(RSS_URL);
    const m = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    return decodeEntities(m ? m[1] : html);
  }
  const res = await fetch(RSS_URL, { headers: { 'User-Agent': 'JusticeBot/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// HTML страницы темы: через FlareSolverr или напрямую.
async function getThreadHtml(url) {
  try {
    if (FLARE_URL) return await flareRequest(url);
    const res = await fetch(url, { headers: { 'User-Agent': 'JusticeBot/1.0' } });
    if (!res.ok) return null;
    return await res.text();
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
async function fetchThreadContent(url) {
  const html = await getThreadHtml(url);
  if (!html) return null;
  const inner = extractFirstPost(html);
  return inner ? sanitizeHtml(inner) : null;
}

// Из заголовка «Обращение №CP-185» достаём код «CP-185».
function extractCode(title) {
  const m = String(title).match(/CP[-\s№]*(\d+)/i);
  return m ? `CP-${m[1]}` : null;
}

export async function syncForumAppeals() {
  let xml;
  try {
    xml = await getRssXml();
  } catch (e) {
    console.warn('[forum-sync] не удалось получить RSS:', e.message);
    return { created: 0 };
  }

  const items = parseItems(xml);
  const byThread = db.prepare('SELECT id, forum_content FROM appeals WHERE forum_thread_id = ?');
  const byCode = db.prepare('SELECT 1 FROM appeals WHERE code = ?');
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
        const content = await fetchThreadContent(it.link);
        if (content) {
          fillContent.run(content, existing.id);
          filled += 1;
        }
      }
      continue;
    }

    const code = extractCode(it.title);
    if (code && byCode.get(code)) continue; // уже есть (например, добавлено вручную)
    const title = code ? `Обращение ${code}` : it.title;
    // Полный текст берём со страницы темы; RSS — запасной (обрезанный) вариант.
    const content = (await fetchThreadContent(it.link)) || it.content || null;
    insert.run(code, title, it.link, tid, it.title, content, it.creator || null);
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
    const content = await fetchThreadContent(a.forum_url);
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

export function startForumSync() {
  if (DISABLED) {
    console.log('[forum-sync] отключена (FORUM_SYNC_DISABLED=1)');
    return;
  }
  syncForumAppeals(); // первый прогон при старте
  setInterval(syncForumAppeals, INTERVAL_MIN * 60 * 1000);
  console.log(`[forum-sync] автосинхронизация форума включена (каждые ${INTERVAL_MIN} мин)`);
}
