import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { APPEALS_FORUM_URL } from '../constants.js';
import Avatar from '../components/Avatar.jsx';

function StatusBadge({ label, color }) {
  return (
    <span className="level-badge" style={{ borderColor: color, color }}>
      {label}
    </span>
  );
}

function AppealsTable({ rows }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Тема</th>
          <th>Статус</th>
          <th>Прокурор</th>
          <th>Действия</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id}>
            <td>
              <Link to={`/appeals/${a.id}`} className="appeal-title-link">{a.title}</Link>
              {a.applicant && <div className="employee-tag">Заявитель: {a.applicant}</div>}
            </td>
            <td><StatusBadge label={a.statusLabel} color={a.statusColor} /></td>
            <td>
              {a.assignedUser ? (
                <div className="cell-user">
                  <Avatar user={a.assignedUser} size={28} />
                  <span>{a.assignedUser.name}</span>
                </div>
              ) : (
                <span className="muted-dash">—</span>
              )}
              {a.assistant && <div className="employee-tag">Помощник: {a.assistant.name}</div>}
            </td>
            <td>
              <div className="row-actions">
                <Link to={`/appeals/${a.id}`} className="ghost-btn sm">Профиль</Link>
                {a.forumUrl && (
                  <a className="ghost-btn sm" href={a.forumUrl} target="_blank" rel="noopener">
                    На обращение ↗
                  </a>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Appeals() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canManage = !!user.permissions?.manageAppeals;

  const [data, setData] = useState(null); // { appeals, prosecutors, statuses }
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null); // id прокурора, чей список раскрыт
  const [showArchive, setShowArchive] = useState(false);
  const [modal, setModal] = useState(false);
  const [draft, setDraft] = useState({
    title: '', forumUrl: '', applicant: '', status: 'not_taken', assignedUserId: '', assistantUserId: '',
  });

  const load = () =>
    api.appeals().then(setData).catch(() => setError('Не удалось загрузить обращения.'));

  useEffect(() => {
    load();
  }, []);

  const createAppeal = async () => {
    if (!draft.title.trim()) return;
    try {
      const { appeal } = await api.createAppeal({
        ...draft,
        assignedUserId: draft.assignedUserId || null,
        assistantUserId: draft.assistantUserId || null,
      });
      setModal(false);
      setDraft({ title: '', forumUrl: '', applicant: '', status: 'not_taken', assignedUserId: '', assistantUserId: '' });
      navigate(`/appeals/${appeal.id}`);
    } catch {
      setError('Не удалось создать обращение.');
    }
  };

  if (error) return <div className="page"><div className="card empty-state error-text">{error}</div></div>;
  if (!data) return <div className="page"><div className="card empty-state">Загрузка…</div></div>;

  const { appeals, archived = [], prosecutors, assignees, assistants, statuses } = data;
  const inProgressOf = (pid) =>
    appeals.filter((a) => (a.assignedUser?.id === pid || a.assistant?.id === pid) && a.inProgress);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="section-eyebrow">ПРОКУРАТУРА</div>
          <h1 className="page-title">Обращения</h1>
        </div>
        <div className="doc-actions">
          <a className="ghost-btn sm" href={APPEALS_FORUM_URL} target="_blank" rel="noopener">
            Раздел на форуме ↗
          </a>
          {canManage && (
            <button className="save-btn" onClick={() => setModal(true)}>
              + Обращение
            </button>
          )}
        </div>
      </header>

      {/* Загруженность прокуроров */}
      <section className="card">
        <div className="section-eyebrow">СОТРУДНИКИ</div>
        <h2 className="section-title">Обращения в работе</h2>
        <p className="section-sub">Нажмите на число, чтобы увидеть обращения в работе у сотрудника.</p>

        {prosecutors.length === 0 && <div className="empty-state">Нет сотрудников.</div>}

        <div className="pros-list">
          {prosecutors.map((p) => (
            <div className="pros-item" key={p.id}>
              <div className="pros-main">
                <Avatar user={p} size={38} />
                <div>
                  <div className="employee-name">{p.name}</div>
                  <div className="employee-tag" style={{ color: p.levelColor }}>{p.levelName}</div>
                </div>
              </div>
              <button
                className={'pros-count' + (expanded === p.id ? ' active' : '')}
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                disabled={p.inProgress === 0}
                title="Обращения в работе"
              >
                {p.inProgress}
              </button>

              {expanded === p.id && (
                <div className="pros-appeals">
                  {inProgressOf(p.id).length === 0 ? (
                    <div className="empty-state">Нет обращений в работе.</div>
                  ) : (
                    inProgressOf(p.id).map((a) => (
                      <Link key={a.id} to={`/appeals/${a.id}`} className="pros-appeal-link">
                        <StatusBadge label={a.statusLabel} color={a.statusColor} />
                        <span>{a.title}</span>
                      </Link>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Актуальные обращения */}
      <section className="card table-card">
        {appeals.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}>Актуальных обращений нет.</div>
        ) : (
          <AppealsTable rows={appeals} />
        )}
      </section>

      {/* Архив: «Рассмотрено» более 24 часов */}
      {archived.length > 0 && (
        <section className="card table-card archive-card">
          <button className="archive-head" onClick={() => setShowArchive((v) => !v)}>
            <span>🗄 Архив обращений</span>
            <span className="count-pill">{archived.length}</span>
            <span className="archive-toggle">{showArchive ? '▲' : '▼'}</span>
          </button>
          {showArchive && <AppealsTable rows={archived} />}
        </section>
      )}

      {/* Модалка создания */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Новое обращение</h2>

            <label className="modal-label">Тема</label>
            <input className="name-input modal-select" autoFocus value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })} />

            <label className="modal-label" style={{ marginTop: 12 }}>Ссылка на тему форума</label>
            <input className="name-input modal-select" placeholder="https://forum.gta5rp.com/threads/..."
              value={draft.forumUrl} onChange={(e) => setDraft({ ...draft, forumUrl: e.target.value })} />

            <label className="modal-label" style={{ marginTop: 12 }}>Заявитель (необязательно)</label>
            <input className="name-input modal-select" value={draft.applicant}
              onChange={(e) => setDraft({ ...draft, applicant: e.target.value })} />

            <div className="modal-row">
              <div style={{ flex: 1 }}>
                <label className="modal-label">Статус</label>
                <select className="level-select modal-select" value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                  {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <div className="modal-row">
              <div style={{ flex: 1 }}>
                <label className="modal-label">Прокурор</label>
                <select className="level-select modal-select" value={draft.assignedUserId}
                  onChange={(e) => setDraft({ ...draft, assignedUserId: e.target.value })}>
                  <option value="">— не назначен —</option>
                  {assignees.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.levelName})</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="modal-label">Помощник</label>
                <select className="level-select modal-select" value={draft.assistantUserId}
                  onChange={(e) => setDraft({ ...draft, assistantUserId: e.target.value })}>
                  <option value="">— не назначен —</option>
                  {assistants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            <div className="modal-actions">
              <button className="ghost-btn" onClick={() => setModal(false)}>Отмена</button>
              <button className="save-btn" onClick={createAppeal} disabled={!draft.title.trim()}>
                Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
