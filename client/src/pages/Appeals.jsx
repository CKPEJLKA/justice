import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { useSite } from '../context/SiteContext.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';

function StatusBadge({ label, color }) {
  return (
    <span className="level-badge" style={{ color }}>
      {label}
    </span>
  );
}

// Статус, который можно сменить прямо в таблице. Выглядит как обычная метка статуса,
// по нажатию открывается список статусов.
function StatusPicker({ appeal, statuses, busy, onChange }) {
  return (
    <select
      className="level-badge status-select"
      style={{ color: appeal.statusColor }}
      value={appeal.status}
      disabled={busy}
      title="Нажмите, чтобы сменить статус"
      aria-label={`Статус обращения ${appeal.title}`}
      onChange={(e) => onChange(appeal, e.target.value)}
    >
      {statuses.map((s) => (
        <option key={s.key} value={s.key}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

// canEditStatus(a) — может ли пользователь менять статус этого обращения
// (руководство — любого, прокурор — только своего).
function AppealsTable({ rows, statuses, canEditStatus, onStatusChange, busyId }) {
  return (
    <div className="table-wrap">
    <table className="data-table">
      <thead>
        <tr>
          <th>Обращение</th>
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
            <td>
              {canEditStatus(a) ? (
                <StatusPicker appeal={a} statuses={statuses} busy={busyId === a.id} onChange={onStatusChange} />
              ) : (
                <StatusBadge label={a.statusLabel} color={a.statusColor} />
              )}
            </td>
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
                <Link to={`/appeals/${a.id}`} className="ghost-btn sm">Открыть</Link>
                {a.forumUrl && (
                  <a className="ghost-btn sm" href={a.forumUrl} target="_blank" rel="noopener" title="Открыть тему на форуме">
                    <Icon name="external" />
                    Форум
                  </a>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

const FORUM_REASONS = {
  auth: 'форум требует вход — cookie форума не задан или устарел',
  network: 'нет связи с форумом (сеть или FlareSolverr)',
  http: 'форум отвечает ошибкой',
  format: 'форум отдаёт не RSS-ленту — возможно, неверная ссылка на раздел',
};

const fmtDateTime = (iso) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(new Date(iso));

// Подсказка «что делать» в индикаторе.
// full — суперпользователь (может всё, включая cookie); minister — министр (ссылка на раздел, но не cookie);
// none — остальные.
function ForumFixHint({ mode, reason }) {
  if (mode === 'full') {
    return (
      <>
        Обновите cookie или ссылку в <Link to="/admin/settings">настройках сайта</Link> и нажмите «Проверить
        доступ к форуму».
      </>
    );
  }
  if (mode === 'minister') {
    return reason === 'auth' ? (
      'Требуется обновить авторизацию сайта на форуме, обратитесь к администрации сайта.'
    ) : (
      <>
        Проверьте ссылку на раздел форума в <Link to="/admin/settings">настройках сайта</Link>. Если не
        поможет, обратитесь к администрации сайта.
      </>
    );
  }
  return 'Сообщите министру — исправить можно в настройках сайта.';
}

// Индикатор «Форум недоступен». Статус приходит с сервера только советникам и выше.
function ForumStatusBanner({ status, fixMode }) {
  if (!status || status.state !== 'error') return null;
  return (
    <div className="alert alert-danger" role="alert">
      <Icon name="warning" className="alert-icon" />
      <div>
        <div className="alert-title">Форум недоступен, новые обращения не импортируются</div>
        <div className="alert-text">
          Причина: {FORUM_REASONS[status.reason] || status.message || 'неизвестна'}.{' '}
          {status.lastOkAt
            ? `Последний успешный импорт: ${fmtDateTime(status.lastOkAt)} МСК.`
            : 'С момента запуска сервера импорт ни разу не прошёл успешно.'}
        </div>
        <div className="alert-text">
          <ForumFixHint mode={fixMode} reason={status.reason} />
        </div>
      </div>
    </div>
  );
}

export default function Appeals() {
  const { user } = useAuth();
  const { appealsForumUrl } = useSite();
  const navigate = useNavigate();
  const canManage = !!user.permissions?.manageAppeals;
  const [params, setParams] = useSearchParams();

  const [data, setData] = useState(null); // { appeals, prosecutors, statuses, kinds }
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null); // id прокурора, чей список раскрыт
  const [showArchive, setShowArchive] = useState(false);
  const [modal, setModal] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState(null); // обращение, у которого сейчас сохраняется статус

  // Статус прямо из таблицы: руководство — у любого обращения, прокурор — у своего
  // (так же проверяет сервер).
  const canEditStatus = (a) => canManage || (a.assignedUser && a.assignedUser.id === user.id);

  const changeStatus = async (appeal, status) => {
    if (status === appeal.status) return;
    setStatusBusyId(appeal.id);
    try {
      const { appeal: updated } = await api.updateAppeal(appeal.id, { status });
      const swap = (list) => list.map((x) => (x.id === updated.id ? updated : x));
      setData((d) => ({ ...d, appeals: swap(d.appeals), archived: swap(d.archived || []) }));
    } catch {
      alert(`Не удалось сменить статус обращения «${appeal.title}».`);
    } finally {
      setStatusBusyId(null);
    }
  };
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

  const header = (
    <PageHeader
      title="Обращения"
      actions={
        <>
          {appealsForumUrl && (
            <a className="ghost-btn" href={appealsForumUrl} target="_blank" rel="noopener">
              <Icon name="external" />
              Раздел на форуме
            </a>
          )}
          {canManage && data && (
            <button className="save-btn" onClick={() => setModal(true)}>
              <Icon name="add" />
              Новое обращение
            </button>
          )}
        </>
      }
    />
  );

  if (error) return <div className="page">{header}<div className="card error-text">{error}</div></div>;
  if (!data) return <div className="page">{header}<div className="card empty-state">Загрузка…</div></div>;

  const { appeals: allAppeals, archived: allArchived = [], prosecutors, assignees, assistants, statuses } = data;
  const kinds = data.kinds?.length ? data.kinds : [{ key: 'CP', tab: 'Обращения CP' }];
  // Вкладка из адреса (?tab=AP), по умолчанию — первая (CP).
  const kind = kinds.some((k) => k.key === params.get('tab')) ? params.get('tab') : kinds[0].key;
  const kindInfo = kinds.find((k) => k.key === kind);
  const appeals = allAppeals.filter((a) => a.kind === kind);
  const archived = allArchived.filter((a) => a.kind === kind);
  const countOf = (key) => allAppeals.filter((a) => a.kind === key).length;

  // Вкладка и фильтр статуса хранятся в адресе: /appeals?tab=AP&status=not_taken
  const updateParams = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };
  const setKind = (key) => updateParams({ tab: key === kinds[0].key ? '' : key });

  // Фильтр по статусу (действует на актуальные обращения вкладки и её архив).
  const statusFilter = statuses.some((s) => s.key === params.get('status')) ? params.get('status') : '';
  const setStatusFilter = (key) => updateParams({ status: key });
  const byStatus = (list) => (statusFilter ? list.filter((a) => a.status === statusFilter) : list);
  const shown = byStatus(appeals);
  const shownArchived = byStatus(archived);
  const statusCount = (key) => appeals.filter((a) => a.status === key).length;
  const filterLabel = statuses.find((s) => s.key === statusFilter)?.label;

  const tableProps = { statuses, canEditStatus, onStatusChange: changeStatus, busyId: statusBusyId };

  // «В работе у сотрудников» — по всем вкладкам сразу.
  const inProgressOf = (pid) =>
    allAppeals.filter((a) => (a.assignedUser?.id === pid || a.assistant?.id === pid) && a.inProgress);

  return (
    <div className="page">
      {header}

      <ForumStatusBanner
        status={data.forumStatus}
        fixMode={
          user.permissions?.manageForumCookie ? 'full' : user.permissions?.manageSettings ? 'minister' : 'none'
        }
      />

      {/* Загруженность прокуроров */}
      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">В работе у сотрудников</h2>
        </div>
        <p className="panel-note">Нажмите на число, чтобы увидеть обращения сотрудника.</p>

        {prosecutors.length === 0 && <div className="card empty-state">Нет сотрудников.</div>}

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
                    <div className="employee-tag">Нет обращений в работе.</div>
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

      {/* Вкладки по префиксу номера: CP / AP / PR */}
      <nav className="segmented" aria-label="Виды обращений">
        {kinds.map((k) => (
          <button
            key={k.key}
            type="button"
            className={'segmented-item' + (k.key === kind ? ' active' : '')}
            aria-pressed={k.key === kind}
            onClick={() => setKind(k.key)}
          >
            {k.tab}
            <span className="segmented-count">{countOf(k.key)}</span>
          </button>
        ))}
      </nav>

      {/* Актуальные обращения выбранной вкладки */}
      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">{kindInfo.tab}</h2>
          <div className="panel-tools">
            <label className="employee-tag" htmlFor="status-filter">
              Статус
            </label>
            <select
              id="status-filter"
              className={'level-select status-filter' + (statusFilter ? ' is-active' : '')}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Все статусы ({appeals.length})</option>
              {statuses.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label} ({statusCount(s.key)})
                </option>
              ))}
            </select>
            {statusFilter && (
              <button
                type="button"
                className="mini-btn"
                title="Сбросить фильтр"
                aria-label="Сбросить фильтр по статусу"
                onClick={() => setStatusFilter('')}
              >
                <Icon name="close" />
              </button>
            )}
            <span className="count-pill" title={statusFilter ? 'Показано с учётом фильтра' : undefined}>
              {shown.length}
            </span>
          </div>
        </div>
        {shown.length === 0 ? (
          <div className="card empty-state" style={{ border: 'none' }}>
            {statusFilter ? (
              <>
                Нет {kind === 'CP' ? 'обращений' : 'обжалований'} со статусом «{filterLabel}».{' '}
                <button type="button" className="ghost-btn sm" onClick={() => setStatusFilter('')}>
                  Показать все
                </button>
              </>
            ) : kind === 'CP' ? (
              'Актуальных обращений нет.'
            ) : (
              'Актуальных обжалований нет.'
            )}
          </div>
        ) : (
          <AppealsTable rows={shown} {...tableProps} />
        )}
      </section>

      {/* Архив вкладки: «Рассмотрено» и «Отказано» дольше 24 часов (с учётом фильтра) */}
      {shownArchived.length > 0 && (
        <section className="panel">
          <button
            className="archive-head"
            onClick={() => setShowArchive((v) => !v)}
            aria-expanded={showArchive}
          >
            <Icon name="archive" />
            <span>Архив</span>
            <span className="count-pill">{shownArchived.length}</span>
            <span className="archive-toggle">
              {showArchive ? 'Свернуть' : 'Показать'} <Icon name={showArchive ? 'collapse' : 'expand'} />
            </span>
          </button>
          {showArchive && <AppealsTable rows={shownArchived} {...tableProps} />}
        </section>
      )}

      {/* Модалка создания */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Новое обращение</h2>

            <label className="modal-label">Тема</label>
            <input className="name-input modal-select" autoFocus value={draft.title}
              placeholder={kind === 'CP' ? 'Обращение CP-6543' : `Обжалование ${kind}-15`}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <div className="form-hint">
              Вкладка определяется по номеру в теме: CP, AP или PR. Без номера обращение попадёт в CP.
            </div>

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
                Создать обращение
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
