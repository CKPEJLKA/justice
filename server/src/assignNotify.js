import { config } from './config.js';

// URL Yandex Cloud Function и (необязательный) секрет для заголовка X-Auth-Token.
const FN_URL = process.env.ASSIGN_NOTIFY_URL;
const FN_TOKEN = process.env.ASSIGN_NOTIFY_TOKEN;

let warned = false;

// Вызывает облачную функцию, которая шлёт embed в Discord через вебхук.
// Работает в фоне (fire-and-forget): не ждёт ответа и не роняет основной запрос.
export function notifyAssignment({
  appealId,
  appealTitle,
  assignerName,
  assignerDiscordId,
  prosecutorName,
  prosecutorDiscordId,
  forumUrl,
}) {
  if (!FN_URL) {
    if (!warned) {
      console.warn('[notify] ASSIGN_NOTIFY_URL не задан — уведомления о назначении отключены.');
      warned = true;
    }
    return;
  }

  const siteUrl = `${String(config.clientUrl).replace(/\/$/, '')}/appeals/${appealId}`;
  const headers = { 'Content-Type': 'application/json' };
  if (FN_TOKEN) headers['X-Auth-Token'] = FN_TOKEN;

  const body = JSON.stringify({
    appealTitle,
    assignerName,
    assignerDiscordId: assignerDiscordId ? String(assignerDiscordId) : '',
    prosecutorName,
    prosecutorDiscordId: prosecutorDiscordId ? String(prosecutorDiscordId) : '',
    siteUrl,
    forumUrl: forumUrl || '',
  });

  fetch(FN_URL, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) })
    .then(async (r) => {
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        console.warn('[notify] функция вернула', r.status, text.slice(0, 300));
      }
    })
    .catch((e) => console.warn('[notify] не удалось вызвать функцию:', e.message));
}
