import express from 'express';
import db from '../db.js';
import {
  ACCESS_LEVELS,
  MIN_PANEL_LEVEL,
  ADVISOR_LEVEL,
  ASSISTANT_LEVEL,
  PROSECUTOR_LEVEL,
  APPEAL_STATUSES,
  APPEAL_STATUS_ORDER,
} from '../config.js';
import { requireLevel } from '../middleware/auth.js';

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
function assigneeCandidates() {
  return db
    .prepare('SELECT * FROM users WHERE access_level >= ? ORDER BY access_level DESC, username')
    .all(PROSECUTOR_LEVEL)
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

// Сотрудники (включая руководство) с числом обращений «в работе».
function prosecutorsWithCounts() {
  const rows = db
    .prepare('SELECT * FROM users WHERE access_level >= ? ORDER BY access_level DESC, username')
    .all(MIN_PANEL_LEVEL);
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

// Статистика обращений сотрудника как назначенного прокурора.
export function appealStatsFor(uid) {
  const ph = inProgressKeys.map(() => '?').join(',');
  const reviewed = db
    .prepare("SELECT COUNT(*) c FROM appeals WHERE assigned_user_id = ? AND status = 'reviewed'")
    .get(uid).c;
  const inProgress = db
    .prepare(`SELECT COUNT(*) c FROM appeals WHERE assigned_user_id = ? AND status IN (${ph})`)
    .get(uid, ...inProgressKeys).c;
  const total = db.prepare('SELECT COUNT(*) c FROM appeals WHERE assigned_user_id = ?').get(uid).c;
  return { reviewed, inProgress, total };
}

// Список обращений + прокуроры + справочник статусов.
router.get('/', requireLevel(MIN_PANEL_LEVEL), (_req, res) => {
  // Сортировка по номеру CP (по убыванию). Обращения без кода (созданные
  // вручную) идут после — по дате создания.
  const appeals = db
    .prepare(
      `SELECT * FROM appeals
       ORDER BY (code IS NULL),
                CAST(REPLACE(code, 'CP-', '') AS INTEGER) DESC,
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
  });
});

// Статистика обращений текущего пользователя (для своего профиля).
router.get('/my-stats', requireLevel(MIN_PANEL_LEVEL), (req, res) => {
  res.json({ stats: appealStatsFor(req.user.id) });
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
      `INSERT INTO appeals (title, forum_url, applicant, status, assigned_user_id, assistant_user_id, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(title, forumUrl, applicant, status, assignedUserId, assistantUserId, note);
  if (ARCHIVABLE_STATUSES.has(status)) {
    db.prepare("UPDATE appeals SET reviewed_at = datetime('now') WHERE id = ?").run(info.lastInsertRowid);
  }
  res.json({ appeal: publicAppeal(db.prepare('SELECT * FROM appeals WHERE id = ?').get(info.lastInsertRowid)) });
});

router.patch('/:id', requireLevel(MIN_PANEL_LEVEL), (req, res) => {
  const a = db.prepare('SELECT * FROM appeals WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'not_found' });

  const canManage = req.user.access_level >= ADVISOR_LEVEL;
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
  res.json({ appeal: publicAppeal(db.prepare('SELECT * FROM appeals WHERE id = ?').get(req.params.id)) });
});

router.delete('/:id', requireManage, (req, res) => {
  db.prepare('DELETE FROM appeals WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
