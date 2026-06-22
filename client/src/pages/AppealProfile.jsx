import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';

function formatDate(s) {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Moscow' }).format(d);
}

export default function AppealProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = !!user.permissions?.manageAppeals;

  const [appeal, setAppeal] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [assistants, setAssistants] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [form, setForm] = useState(null);
  const [savedForm, setSavedForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const apply = (d) => {
    setAppeal(d.appeal);
    setAssignees(d.assignees);
    setAssistants(d.assistants);
    setStatuses(d.statuses);
    const f = {
      title: d.appeal.title,
      forumUrl: d.appeal.forumUrl || '',
      applicant: d.appeal.applicant || '',
      status: d.appeal.status,
      assignedUserId: d.appeal.assignedUser?.id ? String(d.appeal.assignedUser.id) : '',
      assistantUserId: d.appeal.assistant?.id ? String(d.appeal.assistant.id) : '',
      note: d.appeal.note || '',
    };
    setForm(f);
    setSavedForm(f);
  };

  useEffect(() => {
    api.appeal(id).then(apply).catch(() => setError('Не удалось загрузить обращение.'));
  }, [id]);

  // Помощника может менять руководство ИЛИ назначенный на обращение прокурор.
  const isAssignedProsecutor = appeal?.assignedUser && appeal.assignedUser.id === user.id;
  const canEditAssistant = canManage || isAssignedProsecutor;

  const dirty = form && savedForm && JSON.stringify(form) !== JSON.stringify(savedForm);
  const set = (k, v) => setForm({ ...form, [k]: v });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = canManage
        ? { ...form, assignedUserId: form.assignedUserId || null, assistantUserId: form.assistantUserId || null }
        : { status: form.status, assistantUserId: form.assistantUserId || null }; // прокурор меняет статус и помощника
      const { appeal: updated } = await api.updateAppeal(id, payload);
      setAppeal(updated);
      setSavedForm(form);
    } catch {
      setError('Не удалось сохранить изменения.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm('Удалить это обращение из системы?')) return;
    try {
      await api.deleteAppeal(id);
      navigate('/appeals');
    } catch {
      setError('Не удалось удалить обращение.');
    }
  };

  if (error && !appeal) return <div className="page"><div className="card empty-state error-text">{error}</div></div>;
  if (!appeal || !form) return <div className="page"><div className="card empty-state">Загрузка…</div></div>;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <Link to="/appeals" className="back-link">← Все обращения</Link>
          <h1 className="page-title" style={{ marginTop: 6 }}>{appeal.title}</h1>
        </div>
        <div className="doc-actions">
          {appeal.forumUrl ? (
            <a className="save-btn" href={appeal.forumUrl} target="_blank" rel="noopener">
              Перейти на обращение ↗
            </a>
          ) : (
            <button className="save-btn" disabled title="Ссылка не указана">Перейти на обращение</button>
          )}
        </div>
      </header>

      {error && <div className="card empty-state error-text">{error}</div>}

      <section className="card">
        {canManage ? (
          <div className="appeal-form">
            <label className="modal-label">Тема</label>
            <input className="name-input full" value={form.title} onChange={(e) => set('title', e.target.value)} />

            <label className="modal-label">Ссылка на тему форума</label>
            <input className="name-input full" value={form.forumUrl} onChange={(e) => set('forumUrl', e.target.value)}
              placeholder="https://forum.gta5rp.com/threads/..." />

            <label className="modal-label">Заявитель</label>
            <input className="name-input full" value={form.applicant} onChange={(e) => set('applicant', e.target.value)} />

            <div className="modal-row">
              <div style={{ flex: 1 }}>
                <label className="modal-label">Статус</label>
                <select className="level-select full" value={form.status} onChange={(e) => set('status', e.target.value)}>
                  {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <div className="modal-row">
              <div style={{ flex: 1 }}>
                <label className="modal-label">Прокурор</label>
                <select className="level-select full" value={form.assignedUserId} onChange={(e) => set('assignedUserId', e.target.value)}>
                  <option value="">— не назначен —</option>
                  {assignees.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.levelName})</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="modal-label">Помощник</label>
                <select className="level-select full" value={form.assistantUserId} onChange={(e) => set('assistantUserId', e.target.value)}>
                  <option value="">— не назначен —</option>
                  {assistants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            <label className="modal-label">Заметки</label>
            <textarea className="appeal-note" value={form.note} onChange={(e) => set('note', e.target.value)}
              placeholder="Внутренние заметки по обращению…" />

            <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
              <button className="ghost-btn sm danger-text" onClick={remove}>Удалить обращение</button>
              <button className="save-btn" onClick={save} disabled={saving || !dirty || !form.title.trim()}>
                {saving ? 'Сохранение…' : dirty ? 'Сохранить' : 'Сохранено'}
              </button>
            </div>
          </div>
        ) : (
          // Просмотр для рядовых сотрудников
          <>
            <dl className="info-list">
              <div className="info-row"><dt>Тема</dt><dd>{appeal.title}</dd></div>
              <div className="info-row"><dt>Статус</dt><dd>
                <span className="level-badge" style={{ borderColor: appeal.statusColor, color: appeal.statusColor }}>
                  {appeal.statusLabel}
                </span>
              </dd></div>
              <div className="info-row"><dt>Прокурор</dt><dd>
                {appeal.assignedUser ? (
                  <span className="cell-user"><Avatar user={appeal.assignedUser} size={26} /> {appeal.assignedUser.name}</span>
                ) : '—'}
              </dd></div>
              <div className="info-row"><dt>Помощник</dt><dd>
                {appeal.assistant ? (
                  <span className="cell-user"><Avatar user={appeal.assistant} size={26} /> {appeal.assistant.name}</span>
                ) : '—'}
              </dd></div>
              <div className="info-row"><dt>Заявитель</dt><dd>{appeal.applicant || '—'}</dd></div>
              {appeal.note && <div className="info-row"><dt>Заметки</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{appeal.note}</dd></div>}
              <div className="info-row"><dt>Обновлено</dt><dd>{formatDate(appeal.updatedAt)}</dd></div>
            </dl>

            {/* Назначенный прокурор может менять статус и назначать помощника */}
            {canEditAssistant && (
              <div className="assistant-editor">
                <label className="modal-label">Статус обращения</label>
                <select className="level-select full" value={form.status}
                  onChange={(e) => set('status', e.target.value)}>
                  {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>

                <label className="modal-label" style={{ marginTop: 14 }}>Помощник</label>
                <div className="assistant-row">
                  <select className="level-select" value={form.assistantUserId}
                    onChange={(e) => set('assistantUserId', e.target.value)}>
                    <option value="">— не назначен —</option>
                    {assistants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button className="save-btn" onClick={save} disabled={saving || !dirty}>
                    {saving ? 'Сохранение…' : dirty ? 'Сохранить' : 'Сохранено'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {appeal.forumContent && (
        <section className="card">
          <div className="section-eyebrow">ТЕКСТ ОБРАЩЕНИЯ</div>
          <div className="forum-content" dangerouslySetInnerHTML={{ __html: appeal.forumContent }} style={{ marginTop: 14 }} />
        </section>
      )}

      {canManage && (
        <div className="appeal-meta">
          Обновлено: {formatDate(appeal.updatedAt)}
        </div>
      )}
    </div>
  );
}
