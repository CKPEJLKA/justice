import express from 'express';
import db from '../db.js';
import {
  ACCESS_LEVELS,
  TOP_LEVEL,
  ADMIN_ROLE_LEVEL,
  DEPUTY_LEVEL,
  ADVISOR_LEVEL,
  PROSECUTOR_LEVEL,
  ASSISTANT_LEVEL,
  MIN_PANEL_LEVEL,
  ADMIN_LEVEL,
  permissionsFor,
  isSuperuserId,
} from '../config.js';
import { requireLevel } from '../middleware/auth.js';
import { appealStatsFor } from './appeals.js';
import { logAudit, displayName, levelName } from '../audit.js';
import { getSettings, updateSettings, SETTINGS_FIELDS } from '../siteSettings.js';
import { checkForumAccess, triggerForumSync } from '../forumSync.js';

const router = express.Router();

function avatarUrl(u) {
  if (u.avatar) {
    return `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.avatar}.png?size=128`;
  }
  return null;
}

function resolveName(u) {
  return u.display_name || u.global_name || u.username;
}

// Приводим запись из БД к безопасному для фронтенда виду.
function publicUser(u, { includePerms = false } = {}) {
  if (!u) return null;
  const lvl = ACCESS_LEVELS[u.access_level] || {
    name: `Уровень ${u.access_level}`,
    short: '',
    color: '#888',
  };
  const out = {
    id: u.id,
    discordId: u.discord_id,
    username: u.username,
    name: resolveName(u),
    customName: u.display_name || null,
    avatarUrl: avatarUrl(u),
    accessLevel: u.access_level,
    levelName: lvl.name,
    levelShort: lvl.short,
    levelColor: lvl.color,
    createdAt: u.created_at,
  };
  if (includePerms) {
    out.permissions = permissionsFor(u.access_level, u.isSuperuser);
    out.isSuperuser = !!u.isSuperuser;
  }
  return out;
}

const countAt = (level) =>
  db.prepare('SELECT COUNT(*) c FROM users WHERE access_level = ?').get(level).c;

// Текущий пользователь (с правами).
router.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user, { includePerms: true }) });
});

// Справочник уровней доступа.
router.get('/meta', (_req, res) => {
  res.json({ levels: ACCESS_LEVELS, topLevel: TOP_LEVEL, minPanelLevel: MIN_PANEL_LEVEL });
});

// Публичные настройки сайта (нужны и на странице входа): название сервера, раздел форума.
router.get('/site', (_req, res) => {
  const { serverName, appealsForumUrl } = getSettings();
  res.json({ serverName, appealsForumUrl });
});

// Статистика для главной + текущий министр.
// Администраторов нигде не показываем и не считаем (кроме админ-панели у министра).
router.get('/stats', requireLevel(MIN_PANEL_LEVEL), (_req, res) => {
  const staff = db
    .prepare('SELECT COUNT(*) c FROM users WHERE access_level >= ? AND access_level != ?')
    .get(MIN_PANEL_LEVEL, ADMIN_ROLE_LEVEL).c;
  const minister = db
    .prepare('SELECT * FROM users WHERE access_level = ? ORDER BY updated_at LIMIT 1')
    .get(TOP_LEVEL);

  res.json({
    staff,
    deputies: countAt(DEPUTY_LEVEL),
    advisors: countAt(ADVISOR_LEVEL),
    prosecutors: countAt(PROSECUTOR_LEVEL),
    assistants: countAt(ASSISTANT_LEVEL),
    pending: countAt(0),
    minister: minister
      ? { name: resolveName(minister), avatarUrl: avatarUrl(minister) }
      : null,
  });
});

// Список сотрудников (с доступом). Статистику обращений видят министр/заместитель/советник.
// Администраторы в структуру не попадают — их видно только в админ-панели у министра.
router.get('/employees', requireLevel(MIN_PANEL_LEVEL), (req, res) => {
  const rows = db
    .prepare(
      'SELECT * FROM users WHERE access_level >= ? AND access_level != ? ORDER BY access_level DESC, username',
    )
    .all(MIN_PANEL_LEVEL, ADMIN_ROLE_LEVEL);
  const canViewStats = req.user.isSuperuser || req.user.access_level >= ADVISOR_LEVEL;
  const employees = rows.map((u) => {
    const pu = publicUser(u);
    if (canViewStats) pu.appealStats = appealStatsFor(u.id);
    return pu;
  });
  res.json({ employees });
});

// --- Админ: пользователи (министр / заместитель / советник) ---
router.get('/admin/users', requireLevel(ADMIN_LEVEL), (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY access_level DESC, created_at').all();
  // Администраторов в списке видит только министр.
  const canSeeAdmins = permissionsFor(req.user.access_level, req.user.isSuperuser).manageAdmins;
  const visible = canSeeAdmins ? rows : rows.filter((u) => u.access_level !== ADMIN_ROLE_LEVEL);
  res.json({ users: visible.map((u) => publicUser(u)) });
});

// Изменение имени и/или уровня доступа.
router.patch('/admin/users/:id', requireLevel(ADMIN_LEVEL), (req, res) => {
  const actor = req.user;
  const perms = permissionsFor(actor.access_level, actor.isSuperuser);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'not_found' });

  const updates = [];
  const params = [];

  // --- Имя ---
  if (req.body.name !== undefined) {
    if (!perms.changeNames) return res.status(403).json({ error: 'no_name_permission' });
    const newName = String(req.body.name).trim().slice(0, 60);
    updates.push('display_name = ?');
    params.push(newName.length ? newName : null); // пусто => сброс к имени из Discord
  }

  // --- Уровень доступа ---
  if (req.body.accessLevel !== undefined) {
    const newLevel = Number(req.body.accessLevel);
    if (!(newLevel in ACCESS_LEVELS)) return res.status(400).json({ error: 'invalid_level' });
    if (!perms.changeRoles) return res.status(403).json({ error: 'no_role_permission' });
    // Роль министра выдаётся только через передачу.
    if (newLevel === TOP_LEVEL || target.access_level === TOP_LEVEL) {
      return res.status(400).json({ error: 'minister_via_transfer' });
    }
    // Уровень «Администратор» назначает и снимает только министр.
    if (
      (newLevel === ADMIN_ROLE_LEVEL || target.access_level === ADMIN_ROLE_LEVEL) &&
      !perms.manageAdmins
    ) {
      return res.status(403).json({ error: 'admin_via_minister' });
    }
    // Нельзя выдать уровень равный своему или выше, и нельзя трогать тех, кто выше тебя.
    // Суперпользователь этих ограничений не имеет.
    if (!actor.isSuperuser) {
      if (newLevel >= actor.access_level) return res.status(403).json({ error: 'above_your_level' });
      if (target.access_level > actor.access_level) {
        return res.status(403).json({ error: 'target_above_you' });
      }
    }
    // Выдача/снятие доступа (через порог сотрудника) требует права authorizeUsers.
    const crossesAccess =
      (target.access_level < MIN_PANEL_LEVEL && newLevel >= MIN_PANEL_LEVEL) ||
      (target.access_level >= MIN_PANEL_LEVEL && newLevel < MIN_PANEL_LEVEL);
    if (crossesAccess && !perms.authorizeUsers) {
      return res.status(403).json({ error: 'no_authorize_permission' });
    }
    updates.push('access_level = ?');
    params.push(newLevel);
  }

  if (!updates.length) return res.status(400).json({ error: 'nothing_to_update' });

  params.push(req.params.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(
    ...params,
  );
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

  // --- Журнал ---
  // Записи, касающиеся Администраторов, видны только министру/суперпользователю.
  const involvesAdmin = (lvl) => lvl === ADMIN_ROLE_LEVEL;
  if (req.body.name !== undefined && displayName(target) !== displayName(updated)) {
    logAudit(
      actor,
      'user.name',
      `Изменил имя: «${displayName(target)}» → «${displayName(updated)}»` +
        (updated.display_name ? '' : ' (сброс к имени из Discord)'),
      { sensitive: involvesAdmin(target.access_level) },
    );
  }
  if (req.body.accessLevel !== undefined && target.access_level !== updated.access_level) {
    const from = target.access_level;
    const to = updated.access_level;
    const who = `«${displayName(updated)}»`;
    let summary;
    if (from < MIN_PANEL_LEVEL && to >= MIN_PANEL_LEVEL) summary = `Выдал доступ ${who}: ${levelName(to)}`;
    else if (from >= MIN_PANEL_LEVEL && to < MIN_PANEL_LEVEL) summary = `Снял доступ ${who} (был: ${levelName(from)})`;
    else summary = `Изменил уровень доступа ${who}: ${levelName(from)} → ${levelName(to)}`;
    logAudit(actor, 'user.level', summary, { sensitive: involvesAdmin(from) || involvesAdmin(to) });
  }

  res.json({ user: publicUser(updated) });
});

// Передача роли министра (действующий министр или суперпользователь).
// Суперпользователь может назначить министром кого угодно, в т.ч. себя.
router.post('/admin/transfer-minister', requireLevel(TOP_LEVEL), (req, res) => {
  const targetId = Number(req.body.targetId);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'not_found' });
  if (target.access_level === TOP_LEVEL) {
    return res.status(400).json({ error: 'already_minister' });
  }
  const oldMinister = db.prepare('SELECT * FROM users WHERE access_level = ? LIMIT 1').get(TOP_LEVEL);

  const transfer = db.transaction(() => {
    // Действующий министр становится заместителем.
    db.prepare(`UPDATE users SET access_level = ?, updated_at = datetime('now') WHERE access_level = ?`).run(
      DEPUTY_LEVEL,
      TOP_LEVEL,
    );
    // Новый министр.
    db.prepare(`UPDATE users SET access_level = ?, updated_at = datetime('now') WHERE id = ?`).run(
      TOP_LEVEL,
      targetId,
    );
  });
  transfer();

  logAudit(
    req.user,
    'minister.transfer',
    oldMinister
      ? `Передал роль министра: «${displayName(oldMinister)}» → «${displayName(target)}» (прежний министр стал заместителем)`
      : `Назначил министром «${displayName(target)}»`,
    { sensitive: target.access_level === ADMIN_ROLE_LEVEL },
  );

  res.json({ ok: true, newMinister: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(targetId)) });
});

// Полное удаление пользователя из базы (полная деавторизация).
// Доступно министру и заместителю (право authorizeUsers).
router.delete('/admin/users/:id', requireLevel(DEPUTY_LEVEL), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'not_found' });
  if (target.discord_id === req.user.discord_id) {
    return res.status(400).json({ error: 'cannot_delete_self' });
  }
  if (target.access_level === TOP_LEVEL) {
    return res.status(400).json({ error: 'cannot_delete_minister' });
  }
  // Суперпользователя удалить нельзя никому (причину не раскрываем).
  if (isSuperuserId(target.discord_id)) {
    return res.status(403).json({ error: 'cannot_delete_protected' });
  }
  // Администратора может удалить только министр.
  if (
    target.access_level === ADMIN_ROLE_LEVEL &&
    req.user.access_level < TOP_LEVEL &&
    !req.user.isSuperuser
  ) {
    return res.status(403).json({ error: 'admin_delete_minister_only' });
  }
  if (!req.user.isSuperuser && target.access_level > req.user.access_level) {
    return res.status(403).json({ error: 'target_above_you' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  logAudit(req.user, 'user.delete', `Удалил пользователя «${displayName(target)}» (${levelName(target.access_level)})`, {
    sensitive: target.access_level === ADMIN_ROLE_LEVEL,
  });
  res.json({ ok: true });
});

// --- Настройки сайта (только министр; суперпользователь проходит requireLevel всегда) ---
// Поля superuserOnly (cookie форума) министру не отдаются вовсе — ни поле, ни значение.
const canManageCookie = (u) => permissionsFor(u.access_level, u.isSuperuser).manageForumCookie;

function settingsPayload(user) {
  const values = getSettings();
  const fields = Object.entries(SETTINGS_FIELDS)
    .filter(([, f]) => !f.superuserOnly || canManageCookie(user))
    .map(([key, f]) => ({
      key,
      label: f.label,
      secret: !!f.secret,
      value: values[key],
    }));
  return { fields };
}

router.get('/admin/settings', requireLevel(TOP_LEVEL), (req, res) => {
  res.json(settingsPayload(req.user));
});

router.patch('/admin/settings', requireLevel(TOP_LEVEL), (req, res) => {
  const forbidden = Object.keys(req.body || {}).some(
    (key) => SETTINGS_FIELDS[key]?.superuserOnly && !canManageCookie(req.user),
  );
  if (forbidden) return res.status(403).json({ error: 'forum_cookie_forbidden' });
  const before = getSettings();
  let changed;
  try {
    changed = updateSettings(req.body || {});
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  if (changed.length) {
    const after = getSettings();
    const parts = changed.map((key) => {
      const f = SETTINGS_FIELDS[key];
      if (f.secret) return `${f.label}: изменён`;
      return `${f.label}: «${before[key] || '—'}» → «${after[key] || '—'}»`;
    });
    logAudit(req.user, 'settings.update', `Изменил настройки сайта. ${parts.join('; ')}`);
    // Сменили раздел или cookie форума — сразу проверяем форум, не дожидаясь планового прогона.
    if (changed.includes('appealsForumUrl') || changed.includes('forumCookie')) triggerForumSync();
  }
  res.json({ ...settingsPayload(req.user), changed });
});

// Проверка доступа к форуму. Можно передать несохранённые значения из формы;
// не переданные берутся из сохранённых настроек. Ничего не сохраняет.
// Министр проверяет с сохранённым cookie; свой cookie передать может только суперпользователь.
router.post('/admin/settings/forum-check', requireLevel(TOP_LEVEL), async (req, res) => {
  if (req.body?.forumCookie !== undefined && !canManageCookie(req.user)) {
    return res.status(403).json({ error: 'forum_cookie_forbidden' });
  }
  const saved = getSettings();
  let forumUrl;
  let cookie;
  try {
    forumUrl =
      req.body?.appealsForumUrl !== undefined
        ? SETTINGS_FIELDS.appealsForumUrl.normalize(req.body.appealsForumUrl)
        : saved.appealsForumUrl;
    cookie =
      req.body?.forumCookie !== undefined
        ? SETTINGS_FIELDS.forumCookie.normalize(req.body.forumCookie)
        : saved.forumCookie;
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  res.json(await checkForumAccess({ forumUrl, cookie }));
});

export default router;
