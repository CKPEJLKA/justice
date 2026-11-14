import express from 'express';
import db from '../db.js';
import {
  ACCESS_LEVELS,
  MIN_PANEL_LEVEL,
  ADMIN_ROLE_LEVEL,
  ADVISOR_LEVEL,
  DEPUTY_LEVEL,
  ASSISTANT_LEVEL,
  PROSECUTOR_LEVEL,
  APPEAL_STATUSES,
  APPEAL_STATUS_ORDER,
  APPEAL_KINDS,
  APPEAL_KIND_ORDER,
  appealKindOf,
  permissionsFor,
} from '../config.js';
import { getForumStatus, extractCode } from '../forumSync.js';
import { requireLevel } from '../middleware/auth.js';
import { notifyAssignment } from '../assignNotify.js';
import { logAudit } from '../audit.js';

const router = express.Router();
// Управление обращениями — министр, заместитель, советник.
const requireManage = requireLevel(ADVISOR_LEVEL);

const avatarUrl = (u) =>
  u.avatar ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.avatar}.png?size=128` : null;
const userName = (u) => u.display_name || u.global_name || u.username;

function sanitizeForumUrl(u) {
  const s = String(u || '').trim();
  return /^https?:\/\//i.test(s) ? s.slice(0, 500) : null;
}

function userBrief(id) {
  if (!id) return null;
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) return null;
  return {
    id: u.id,
    name: userName(u),
    avatarUrl: avatarUrl(u),
    levelName: ACCESS_LEVELS[u.access_level]?.name || '',
    levelColor: ACCESS_LEVELS[u.access_level]?.color || '#888',
  };
}

// Через сколько после «архивного» статуса обращение уходит в архив.
const ARCHIVE_AFTER_MS = 24 * 60 * 60 * 1000;
// Статусы, после которых обращение архивируется: «Рассмотрено» и «Отказано».
const ARCHIVABLE_STATUSES = new Set(['reviewed', 'refused']);

function isArchived(a) {
  // reviewed_at — момент перехода в архивный статус.
  if (!ARCHIVABLE_STATUSES.has(a.status) || !a.reviewed_at) return false;
  const t = Date.parse(a.reviewed_at.replace(' ', 'T') + 'Z');
  return Number.isFinite(t) && Date.now() - t >= ARCHIVE_AFTER_MS;
}

function publicAppeal(a) {
  const st = APPEAL_STATUSES[a.status] || { label: a.status, color: '#888', inProgress: false };
  return {
    id: a.id,
    code: a.code,
    // Вкладка: по коду, а у старых записей без кода — по номеру в названии (по умолчанию CP).
    kind: appealKindOf(a.code || extractCode(a.title)),
    source: a.source,
    forumTitle: a.forum_title,
    forumContent: a.forum_content,
    title: a.title,
    forumUrl: a.forum_url,
    applicant: a.applicant,
    status: a.status,
    statusLabel: st.label,
    statusColor: st.color,
    inProgress: st.inProgress,
    archived: isArchived(a),
    assignedUser: userBrief(a.assigned_user_id),
    assistant: userBrief(a.assistant_user_id),
    note: a.note,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

// Кандидаты на роль основного исполнителя: прокуроры + руководящий состав.
// Администраторы скрыты — их нет в списках назначения.
function assigneeCandidates() {
  return db
    .prepare(
      'SELECT * FROM users WHERE access_level >= ? AND access_level != ? ORDER BY access_level DESC, username',
    )
    .all(PROSECUTOR_LEVEL, ADMIN_ROLE_LEVEL)
    .map((u) => userBrief(u.id));
}

// Кандидаты на роль помощника: помощники прокурора.
function assistantCandidates() {
  return db
    .prepare('SELECT * FROM users WHERE access_level = ? ORDER BY username')
    .all(ASSISTANT_LEVEL)
    .map((u) => userBrief(u.id));
}

const inProgressKeys = APPEAL_STATUS_ORDER.filter((k) => APPEAL_STATUSES[k].inProgress);

// Сотрудники (включая руководство) с числом обращений «в работе». Администраторы скрыты.
function prosecutorsWithCounts() {
  const rows = db
    .prepare(
      'SELECT * FROM users WHERE access_level >= ? AND access_level != ? ORDER BY access_level DESC, username',
    )
    .all(MIN_PANEL_LEVEL, ADMIN_ROLE_LEVEL);
  const placeholders = inProgressKeys.map(() => '?').join(',');
  // Считаем обращения «в работе», где человек назначен как прокурор ИЛИ как помощник.
  const countStmt = db.prepare(
    `SELECT COUNT(*) c FROM appeals
     WHERE (assigned_user_id = ? OR assistant_user_id = ?) AND status IN (${placeholders})`,
  );
  return rows.map((u) => ({
    id: u.id,
    name: userName(u),
    avatarUrl: avatarUrl(u),
    levelName: ACCESS_LEVELS[u.access_level]?.name || '',
    levelColor: ACCESS_LEVELS[u.access_level]?.color || '#888',
    inProgress: countStmt.get(u.id, u.id, ...inProgressKeys).c,
  }));
}

const statusList = () => APPEAL_STATUS_ORDER.map((key) => ({ key, ...APPEAL_STATUSES[key] }));

// --- Журнал: человекочитаемое описание изменений обращения ---
const nameById = (id) => {
  if (!id) return '—';
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return u ? userName(u) : `#${id}`;
};
const statusLabel = (s) => APPEAL_STATUSES[s]?.label || s || '—';

function describeAppealChanges(before, after) {
  const parts = [];
  if (before.title !== after.title) parts.push(`Название: «${before.title}» → «${after.title}»`);
  const kindBefore = appealKindOf(before.code || extractCode(before.title));
  const kindAfter = appealKindOf(after.code || extractCode(after.title));
  if (kindBefore !== kindAfter) {
    parts.push(`перенесено: ${APPEAL_KINDS[kindBefore].tab} → ${APPEAL_KINDS[kindAfter].tab}`);
  }
  if (before.status !== after.status) {
    parts.push(`Статус: ${statusLabel(before.status)} → ${statusLabel(after.status)}`);
  }
  if (before.assigned_user_id !== after.assigned_user_id) {
    parts.push(`Прокурор: ${nameById(before.assigned_user_id)} → ${nameById(after.assigned_user_id)}`);
  }
  if (before.assistant_user_id !== after.assistant_user_id) {
    parts.push(`Помощник: ${nameById(before.assistant_user_id)} → ${nameById(after.assistant_user_id)}`);
  }
  if ((before.applicant || '') !== (after.applicant || '')) {
    parts.push(`Заявитель: ${before.applicant || '—'} → ${after.applicant || '—'}`);
  }
  if ((before.forum_url || '') !== (after.forum_url || '')) parts.push('изменена ссылка на форум');
  if ((before.note || '') !== (after.note || '')) parts.push('изменена заметка');
  return parts;
}

// Дата сброса счётчика рассмотренных (после неё начинается новый отсчёт).
function statsResetAt() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'appeal_stats_reset_at'").get();
  return row ? row.value : null;
}

// Статистика обращений сотрудника как назначенного прокурора.
export function appealStatsFor(uid) {
  const ph = inProgressKeys.map(() => '?').join(',');
  const resetAt = statsResetAt();
  // «Рассмотрено» учитывает завершённые обращения: и «Рассмотрено», и «Отказано».
  const reviewed = resetAt
    ? db
        .prepare(
          "SELECT COUNT(*) c FROM appeals WHERE assigned_user_id = ? AND status IN ('reviewed', 'refused') AND reviewed_at > ?",
        )
        .get(uid, resetAt).c
    : db
        .prepare(
          "SELECT COUNT(*) c FROM appeals WHERE assigned_user_id = ? AND status IN ('reviewed', 'refused')",
        )
        .get(uid).c;
  const inProgress = db
    .prepare(`SELECT COUNT(*) c FROM appeals WHERE assigned_user_id = ? AND status IN (${ph})`)
    .get(uid, ...inProgressKeys).c;
  const total = db.prepare('SELECT COUNT(*) c FROM appeals WHERE assigned_user_id = ?').get(uid).c;
  return { reviewed, inProgress, total };
}

// Список обращений + прокуроры + справочник статусов.
router.get('/', requireLevel(MIN_PANEL_LEVEL), (req, res) => {
  // Новые темы форума сверху (id темы на форуме растёт со временем — независимо от
  // префикса CP/AP/PR и его нумерации). Добавленные вручную — после, по дате создания.
  const appeals = db
    .prepare(
      `SELECT * FROM appeals
       ORDER BY (forum_thread_id IS NULL),
                CAST(forum_thread_id AS INTEGER) DESC,
                created_at DESC`,
    )
    .all()
    .map(publicAppeal);
  res.json({
    appeals: appeals.filter((a) => !a.archived), // актуальные
    archived: appeals.filter((a) => a.archived), // «Рассмотрено» 24+ часа
    prosecutors: prosecutorsWithCounts(),
    assignees: assigneeCandidates(),
    assistants: assistantCandidates(),
    statuses: statusList(),
    kinds: APPEAL_KIND_ORDER.map((key) => ({ key, ...APPEAL_KINDS[key] })),
    // Состояние импорта с форума — только советникам и выше.
    ...(permissionsFor(req.user.access_level, req.user.isSuperuser).viewForumStatus
      ? { forumStatus: getForumStatus() }
      : {}),
  });
});

// Статистика обращений текущего пользователя (для своего профиля).
router.get('/my-stats', requireLevel(MIN_PANEL_LEVEL), (req, res) => {
  res.json({ stats: appealStatsFor(req.user.id) });
});

// Сброс счётчика рассмотренных у всех сотрудников — министр и заместители.
router.post('/reset-stats', requireLevel(DEPUTY_LEVEL), (req, res) => {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('appeal_stats_reset_at', datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = datetime('now')`,
  ).run();
  logAudit(req.user, 'appeal.reset_stats', 'Сбросил счётчик рассмотренных обращений у всех сотрудников');
  res.json({ ok: true });
});

// Профиль обращения.
router.get('/:id', requireLevel(MIN_PANEL_LEVEL), (req, res) => {
  const a = db.prepare('SELECT * FROM appeals WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'not_found' });
  res.json({
    appeal: publicAppeal(a),
    prosecutors: prosecutorsWithCounts(),
    assignees: assigneeCandidates(),
    assistants: assistantCandidates(),
    statuses: statusList(),
  });
});

const validUser = (id) => !!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id);

router.post('/', requireManage, (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 200);
  if (!title) return res.status(400).json({ error: 'empty_title' });
  const forumUrl = sanitizeForumUrl(req.body.forumUrl);
  const applicant = String(req.body.applicant || '').trim().slice(0, 120) || null;
  const status = APPEAL_STATUSES[req.body.status] ? req.body.status : 'not_taken';
  let assignedUserId = req.body.assignedUserId ? Number(req.body.assignedUserId) : null;
  if (assignedUserId && !validUser(assignedUserId)) assignedUserId = null;
  let assistantUserId = req.body.assistantUserId ? Number(req.body.assistantUserId) : null;
  if (assistantUserId && !validUser(assistantUserId)) assistantUserId = null;
  const note = String(req.body.note || '').slice(0, 5000) || null;

  const info = db
    .prepare(
      `INSERT INTO appeals (code, title, forum_url, applicant, status, assigned_user_id, assistant_user_id, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    // Номер (и вкладка CP/AP/PR) — из названия, если он там есть.
    .run(extractCode(title), title, forumUrl, applicant, status, assignedUserId, assistantUserId, note);
  if (ARCHIVABLE_STATUSES.has(status)) {
    db.prepare("UPDATE appeals SET reviewed_at = datetime('now') WHERE id = ?").run(info.lastInsertRowid);
  }
  logAudit(
    req.user,
    'appeal.create',
    `Создал обращение «${title}» (статус: ${statusLabel(status)}` +
      (assignedUserId ? `, прокурор: ${nameById(assignedUserId)}` : '') +
      ')',
  );
  res.json({ appeal: publicAppeal(db.prepare('SELECT * FROM appeals WHERE id = ?').get(info.lastInsertRowid)) });
});

router.patch('/:id', requireLevel(MIN_PANEL_LEVEL), (req, res) => {
  const a = db.prepare('SELECT * FROM appeals WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'not_found' });

  const canManage = req.user.isSuperuser || req.user.access_level >= ADVISOR_LEVEL;
  const isAssignedProsecutor = a.assigned_user_id && a.assigned_user_id === req.user.id;

  // Поля, доступные только руководству.
  const leadershipFields = ['title', 'forumUrl', 'applicant', 'assignedUserId', 'note'];
  const touchesLeadership = leadershipFields.some((f) => req.body[f] !== undefined);
  const touchesStatus = req.body.status !== undefined;
  const touchesAssistant = req.body.assistantUserId !== undefined;

  if (touchesLeadership && !canManage) return res.status(403).json({ error: 'forbidden' });
  // Статус и помощника может менять руководство ИЛИ прокурор, назначенный на это обращение.
  if (touchesStatus && !(canManage || isAssignedProsecutor)) {
    return res.status(403).json({ error: 'status_forbidden' });
  }
  if (touchesAssistant && !(canManage || isAssignedProsecutor)) {
    return res.status(403).json({ error: 'assistant_forbidden' });
  }

  const updates = [];
  const params = [];
  if (req.body.title !== undefined) {
    const t = String(req.body.title).trim().slice(0, 200);
    if (!t) return res.status(400).json({ error: 'empty_title' });
    updates.push('title = ?');
    params.push(t);
    // Переименовали, например, «Обращение №-6391» в «Обжалование AP-6391» — обновляем номер,
    // и обращение переходит во вкладку своего префикса. Нет номера в новом названии — номер прежний.
    const newCode = extractCode(t);
    if (newCode && newCode !== a.code) {
      updates.push('code = ?');
      params.push(newCode);
    }
  }
  if (req.body.forumUrl !== undefined) {
    updates.push('forum_url = ?');
    params.push(sanitizeForumUrl(req.body.forumUrl));
  }
  if (req.body.applicant !== undefined) {
    updates.push('applicant = ?');
    params.push(String(req.body.applicant).trim().slice(0, 120) || null);
  }
  if (req.body.status !== undefined) {
    if (!APPEAL_STATUSES[req.body.status]) return res.status(400).json({ error: 'invalid_status' });
    updates.push('status = ?');
    params.push(req.body.status);
    // Отсчёт архива начинается с момента перехода в архивный статус (reviewed/refused).
    if (ARCHIVABLE_STATUSES.has(req.body.status)) {
      if (req.body.status !== a.status) updates.push("reviewed_at = datetime('now')");
    } else {
      updates.push('reviewed_at = NULL');
    }
  }
  if (req.body.assignedUserId !== undefined) {
    let id = req.body.assignedUserId ? Number(req.body.assignedUserId) : null;
    if (id && !validUser(id)) id = null;
    updates.push('assigned_user_id = ?');
    params.push(id);
  }
  if (req.body.assistantUserId !== undefined) {
    let id = req.body.assistantUserId ? Number(req.body.assistantUserId) : null;
    if (id && !validUser(id)) id = null;
    updates.push('assistant_user_id = ?');
    params.push(id);
  }
  if (req.body.note !== undefined) {
    updates.push('note = ?');
    params.push(String(req.body.note).slice(0, 5000) || null);
  }
  if (!updates.length) return res.status(400).json({ error: 'nothing_to_update' });

  params.push(req.params.id);
  db.prepare(`UPDATE appeals SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(
    ...params,
  );
  const after = db.prepare('SELECT * FROM appeals WHERE id = ?').get(req.params.id);
  const changes = describeAppealChanges(a, after);
  if (changes.length) {
    logAudit(req.user, 'appeal.update', `Обращение «${after.title}»: ${changes.join('; ')}`);
  }
  res.json({ appeal: publicAppeal(after) });
});

// Взять обращение в работу — назначить себя (все, кроме помощников). Без уведомления.
// Можно только для статуса «Не взято в работу» и если прокурор ещё не назначен.
router.post('/:id/take', requireLevel(PROSECUTOR_LEVEL), (req, res) => {
  const a = db.prepare('SELECT * FROM appeals WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'not_found' });
  if (a.status !== 'not_taken' || a.assigned_user_id) {
    return res.status(400).json({ error: 'not_takeable' });
  }
  db.prepare(`UPDATE appeals SET assigned_user_id = ?, updated_at = datetime('now') WHERE id = ?`).run(
    req.user.id,
    req.params.id,
  );
  logAudit(req.user, 'appeal.take', `Взял в работу обращение «${a.title}»`);
  res.json({ appeal: publicAppeal(db.prepare('SELECT * FROM appeals WHERE id = ?').get(req.params.id)) });
});

// Уведомить ведущего прокурора вручную — только руководство (генеральная прокуратура).
router.post('/:id/notify', requireLevel(ADVISOR_LEVEL), (req, res) => {
  const a = db.prepare('SELECT * FROM appeals WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'not_found' });
  if (!a.assigned_user_id) return res.status(400).json({ error: 'no_assignee' });
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(a.assigned_user_id);
  if (!target) return res.status(400).json({ error: 'no_assignee' });

  notifyAssignment({
    appealId: a.id,
    appealTitle: a.title,
    assignerName: userName(req.user),
    assignerDiscordId: req.user.discord_id,
    prosecutorName: userName(target),
    prosecutorDiscordId: target.discord_id,
    forumUrl: a.forum_url,
  });
  logAudit(
    req.user,
    'appeal.notify',
    `Отправил уведомление в Discord ведущему прокурору ${userName(target)} по обращению «${a.title}»`,
  );
  res.json({ ok: true });
});

router.delete('/:id', requireManage, (req, res) => {
  const a = db.prepare('SELECT * FROM appeals WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM appeals WHERE id = ?').run(req.params.id);
  logAudit(req.user, 'appeal.delete', `Удалил обращение «${a.title}» (статус: ${statusLabel(a.status)})`);
  res.json({ ok: true });
});

export default router;
