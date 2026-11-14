import { config } from './config.js';
import { getSettings } from './siteSettings.js';

// Вызывает облачную функцию, которая шлёт embed в Discord через вебхук.
// URL функции и (необязательный) токен для заголовка X-Auth-Token берутся из настроек
// сайта (админ-панель → Настройки) на каждый вызов.
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
  const { assignNotifyUrl: fnUrl, assignNotifyToken: fnToken, serverName } = getSettings();
  if (!fnUrl) {
    console.warn('[notify] URL Yandex-функции не задан (админ-панель → Настройки) — уведомление не отправлено.');
    return;
  }

  const siteUrl = `${String(config.clientUrl).replace(/\/$/, '')}/appeals/${appealId}`;
  const headers = { 'Content-Type': 'application/json' };
  if (fnToken) headers['X-Auth-Token'] = fnToken;

  const body = JSON.stringify({
    appealTitle,
    assignerName,
    assignerDiscordId: assignerDiscordId ? String(assignerDiscordId) : '',
    prosecutorName,
    prosecutorDiscordId: prosecutorDiscordId ? String(prosecutorDiscordId) : '',
    siteUrl,
    forumUrl: forumUrl || '',
    serverName,
  });

  fetch(fnUrl, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) })
    .then(async (r) => {
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        console.warn('[notify] функция вернула', r.status, text.slice(0, 300));
      }
    })
    .catch((e) => console.warn('[notify] не удалось вызвать функцию:', e.message));
}
