import db from './db.js';
import { ACCESS_LEVELS } from './config.js';

// Категории журнала (префикс action → подпись в интерфейсе).
export const AUDIT_CATEGORIES = {
  user: 'Пользователи',
  minister: 'Министр',
  appeal: 'Обращения',
  doc: 'Документы',
  settings: 'Настройки',
  forum: 'Форум',
};

export const displayName = (u) => (u ? u.display_name || u.global_name || u.username || `#${u.id}` : '—');
export const levelName = (lvl) => ACCESS_LEVELS[lvl]?.name || `Уровень ${lvl}`;

const insert = db.prepare(
  'INSERT INTO audit_log (actor_id, actor_name, action, summary, sensitive) VALUES (?, ?, ?, ?, ?)',
);

// Записывает действие в журнал. Ошибки записи не должны ронять основной запрос.
// actor — строка users (req.user) или null для системных событий.
export function logAudit(actor, action, summary, { sensitive = false } = {}) {
  try {
    insert.run(
      actor?.id ?? null,
      actor ? displayName(actor) : 'Система',
      action,
      String(summary).slice(0, 1000),
      sensitive ? 1 : 0,
    );
  } catch (e) {
    console.warn('[audit] не удалось записать:', e.message);
  }
}
