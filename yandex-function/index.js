// Yandex Cloud Function — отправка embed в Discord через incoming webhook.
//
// Runtime: nodejs18 (есть глобальный fetch). Точка входа: index.handler
//
// Переменные окружения функции:
//   DISCORD_WEBHOOK_URL — URL вебхука Discord (обязательно)
//   AUTH_TOKEN          — (необязательно) общий секрет. Если задан, входящий
//                         запрос обязан содержать заголовок X-Auth-Token с этим
//                         значением — чтобы функцию не дёргал кто попало.
//
// Ожидаемое тело запроса (POST, JSON):
// {
//   "appealTitle":        "Обращение CP-185",
//   "assignerName":       "Christopher Florens",
//   "prosecutorName":     "Roland Cabrera",
//   "prosecutorDiscordId":"123456789012345678",   // необязательно — для пинга
//   "siteUrl":            "https://домен/appeals/21",
//   "forumUrl":           "https://forum.gta5rp.com/threads/..."
// }

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN;

function resp(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}

exports.handler = async (event) => {
  if (String(event.httpMethod || '').toUpperCase() !== 'POST') {
    return resp(405, { error: 'method_not_allowed' });
  }
  if (!WEBHOOK_URL) {
    return resp(500, { error: 'webhook_not_configured' });
  }

  // Проверка секрета (если задан в окружении).
  if (AUTH_TOKEN) {
    const h = event.headers || {};
    const token = h['X-Auth-Token'] || h['x-auth-token'];
    if (token !== AUTH_TOKEN) return resp(401, { error: 'unauthorized' });
  }

  // Тело может прийти в base64 (зависит от способа вызова функции).
  let payload;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : event.body || '{}';
    payload = JSON.parse(raw || '{}');
  } catch {
    return resp(400, { error: 'invalid_json' });
  }

  const {
    appealTitle = 'обращение',
    assignerName = '—',
    assignerDiscordId = '',
    prosecutorName = '',
    prosecutorDiscordId = '',
    siteUrl = '',
    forumUrl = '',
  } = payload;

  // Вебхуки не поддерживают кнопки, поэтому ссылки — кликабельным текстом в embed.
  const links = [];
  if (siteUrl) links.push(`[Открыть на сайте](${siteUrl})`);
  if (forumUrl) links.push(`[Открыть на форуме](${forumUrl})`);

  // В полях — упоминания по ID (кликабельны, ведут в профиль). Если ID нет — имя.
  const prosecutorValue = prosecutorDiscordId ? `<@${prosecutorDiscordId}>` : String(prosecutorName || '—');
  const assignerValue = assignerDiscordId ? `<@${assignerDiscordId}>` : String(assignerName || '—');

  const fields = [{ name: 'Обращение', value: String(appealTitle), inline: true }];
  fields.push({ name: 'Прокурор', value: prosecutorValue, inline: true });
  fields.push({ name: 'Назначил', value: assignerValue, inline: true });
  if (links.length) fields.push({ name: 'Ссылки', value: links.join('  ·  ') });

  const body = {
    embeds: [
      {
        title: '📨 Назначение на обращение',
        description: `Назначен ответственный по обращению **${appealTitle}**.`,
        color: 0xe8c660,
        fields,
        footer: { text: 'Министерство юстиции штата Senora' },
        timestamp: new Date().toISOString(),
      },
    ],
    // Пинг назначенного прокурора (если передан его Discord ID).
    allowed_mentions: {
      parse: [],
      users: prosecutorDiscordId ? [String(prosecutorDiscordId)] : [],
    },
  };
  if (prosecutorDiscordId) body.content = `<@${prosecutorDiscordId}>`;

  try {
    const r = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return resp(502, { error: 'discord_error', status: r.status, detail: text.slice(0, 500) });
    }
    return resp(200, { ok: true });
  } catch (e) {
    return resp(502, { error: 'fetch_failed', detail: String(e.message || e) });
  }
};
