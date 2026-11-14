import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';

function formatDate(s) {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Moscow' }).format(d);
}

// Путь назад ведёт во вкладку обращения (CP / AP / PR).
const crumbsFor = (kind) => [
  { label: 'Обращения', to: kind && kind !== 'CP' ? `/appeals?tab=${kind}` : '/appeals' },
];

// Строка формы «подпись слева — поле справа».
function Row({ label, htmlFor, children }) {
  return (
    <div className="form-row">
      <label className="form-label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="form-control">{children}</div>
    </div>
  );
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
  const [actionMsg, setActionMsg] = useState(null);

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

  const load = () => api.appeal(id).then(apply).catch(() => setError('Не удалось загрузить обращение.'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Помощника может менять руководство ИЛИ назначенный на обращение прокурор.
  const isAssignedProsecutor = appeal?.assignedUser && appeal.assignedUser.id === user.id;
  const canEditAssistant = canManage || isAssignedProsecutor;
  // «Взять в работу» — все, кроме помощников; только для «Не взято в работу» и без назначенного прокурора.
  const canTake =
    user.permissions?.takeAppeals && appeal?.status === 'not_taken' && !appeal?.assignedUser;
  // «Уведомить ведущего прокурора» — руководство, если прокурор назначен.
  const canNotify = canManage && !!appeal?.assignedUser;

  const take = async () => {
    setActionMsg(null);
    setError(null);
    try {
      await api.takeAppeal(id);
      await load();
      setActionMsg('Вы назначены прокурором по обращению.');
    } catch {
      setError('Не удалось взять обращение в работу.');
    }
  };

  const notifyLead = async () => {
    setActionMsg(null);
    setError(null);
    try {
      await api.notifyAppeal(id);
      setActionMsg('Уведомление отправлено ведущему прокурору в Discord.');
    } catch {
      setError('Не удалось отправить уведомление.');
    }
  };

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

  if (error && !appeal) {
    return (
      <div className="page">
        <PageHeader title="Обращение" crumbs={crumbsFor(appeal?.kind)} />
        <div className="card error-text">{error}</div>
      </div>
    );
  }
  if (!appeal || !form) {
    return (
      <div className="page">
        <PageHeader title="Обращение" crumbs={crumbsFor(appeal?.kind)} />
        <div className="card empty-state">Загрузка…</div>
      </div>
    );
  }

  const saveLabel = saving ? 'Сохранение…' : dirty ? 'Сохранить' : 'Сохранено';

  return (
    <div className="page">
      <PageHeader
        title={appeal.title}
        crumbs={crumbsFor(appeal?.kind)}
        actions={
          <>
            {canNotify && (
              <button className="ghost-btn" onClick={notifyLead}>
                <Icon name="notify" />
                Уведомить ведущего прокурора
              </button>
            )}
            {appeal.forumUrl ? (
              <a className="save-btn" href={appeal.forumUrl} target="_blank" rel="noopener">
                <Icon name="external" />
                Открыть на форуме
              </a>
            ) : (
              <button className="save-btn" disabled title="Ссылка на тему не указана">
                Открыть на форуме
              </button>
            )}
          </>
        }
      />

      {actionMsg && <div className="card action-msg">{actionMsg}</div>}
      {error && <div className="card error-text">{error}</div>}

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Карточка обращения</h2>
          <span className="level-badge" style={{ color: appeal.statusColor }}>
            {appeal.statusLabel}
          </span>
        </div>

        {canManage ? (
          <>
            <Row label="Тема" htmlFor="ap-title">
              <input id="ap-title" className="name-input full" value={form.title} onChange={(e) => set('title', e.target.value)} />
            </Row>
            <Row label="Ссылка на тему форума" htmlFor="ap-url">
              <input id="ap-url" className="name-input full" value={form.forumUrl}
                onChange={(e) => set('forumUrl', e.target.value)} placeholder="https://forum.gta5rp.com/threads/..." />
            </Row>
            <Row label="Заявитель" htmlFor="ap-applicant">
              <input id="ap-applicant" className="name-input full" value={form.applicant}
                onChange={(e) => set('applicant', e.target.value)} />
            </Row>
            <Row label="Статус" htmlFor="ap-status">
              <select id="ap-status" className="level-select full" value={form.status} onChange={(e) => set('status', e.target.value)}>
                {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Row>
            <Row label="Прокурор" htmlFor="ap-pros">
              <select id="ap-pros" className="level-select full" value={form.assignedUserId} onChange={(e) => set('assignedUserId', e.target.value)}>
                <option value="">Не назначен</option>
                {assignees.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.levelName})</option>)}
              </select>
            </Row>
            <Row label="Помощник" htmlFor="ap-assist">
              <select id="ap-assist" className="level-select full" value={form.assistantUserId} onChange={(e) => set('assistantUserId', e.target.value)}>
                <option value="">Не назначен</option>
                {assistants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Row>
            <Row label="Заметки" htmlFor="ap-note">
              <textarea id="ap-note" className="appeal-note" value={form.note} onChange={(e) => set('note', e.target.value)}
                placeholder="Внутренние заметки по обращению, видны сотрудникам министерства" />
            </Row>
            <div className="panel-foot">
              <span className="employee-tag spacer">Обновлено {formatDate(appeal.updatedAt)}</span>
              <button className="ghost-btn danger-text" onClick={remove}>
                <Icon name="trash" />
                Удалить
              </button>
              <button className="save-btn" onClick={save} disabled={saving || !dirty || !form.title.trim()}>
                {saveLabel}
              </button>
            </div>
          </>
        ) : (
          // Просмотр для рядовых сотрудников
          <>
            <dl className="info-list">
              <div className="info-row"><dt>Прокурор</dt><dd>
                {appeal.assignedUser ? (
                  <span className="cell-user"><Avatar user={appeal.assignedUser} size={26} /> {appeal.assignedUser.name}</span>
                ) : <span className="muted-dash">Не назначен</span>}
              </dd></div>
              <div className="info-row"><dt>Помощник</dt><dd>
                {appeal.assistant ? (
                  <span className="cell-user"><Avatar user={appeal.assistant} size={26} /> {appeal.assistant.name}</span>
                ) : <span className="muted-dash">Не назначен</span>}
              </dd></div>
              <div className="info-row"><dt>Заявитель</dt><dd>{appeal.applicant || '—'}</dd></div>
              {appeal.note && <div className="info-row"><dt>Заметки</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{appeal.note}</dd></div>}
              <div className="info-row"><dt>Обновлено</dt><dd>{formatDate(appeal.updatedAt)}</dd></div>
            </dl>

            {/* Назначенный прокурор может менять статус и назначать помощника */}
            {canEditAssistant && (
              <>
                <div className="panel-sep" />
                <Row label="Статус" htmlFor="ap-status2">
                  <select id="ap-status2" className="level-select full" value={form.status}
                    onChange={(e) => set('status', e.target.value)}>
                    {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </Row>
                <Row label="Помощник" htmlFor="ap-assist2">
                  <select id="ap-assist2" className="level-select full" value={form.assistantUserId}
                    onChange={(e) => set('assistantUserId', e.target.value)}>
                    <option value="">Не назначен</option>
                    {assistants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Row>
                <div className="panel-foot">
                  <button className="save-btn" onClick={save} disabled={saving || !dirty}>
                    {saveLabel}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {canTake && (
          <div className="take-appeal-bar">
            <button className="take-btn" onClick={take}>Взять в работу</button>
          </div>
        )}
      </section>

      {appeal.forumContent && (
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Текст обращения</h2>
            {appeal.applicant && <span className="employee-tag">Автор: {appeal.applicant}</span>}
          </div>
          <div className="forum-content" dangerouslySetInnerHTML={{ __html: appeal.forumContent }} />
        </section>
      )}
    </div>
  );
}
