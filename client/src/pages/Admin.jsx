import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { MIN_PANEL_LEVEL, ADMIN_ROLE_LEVEL, TOP_LEVEL } from '../constants.js';
import Avatar from '../components/Avatar.jsx';
import AdminTabs from '../components/AdminTabs.jsx';
import Icon from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';

const ERRORS = {
  no_authorize_permission: 'У вас нет права выдавать или снимать доступ пользователям.',
  no_role_permission: 'У вас нет права изменять роли.',
  no_name_permission: 'У вас нет права изменять имена.',
  above_your_level: 'Нельзя выдать уровень, равный вашему собственному или выше.',
  target_above_you: 'Нельзя изменять пользователя с уровнем выше вашего.',
  minister_via_transfer: 'Роль министра меняется только через передачу роли.',
  admin_via_minister: 'Назначать и снимать Администраторов может только министр.',
  admin_delete_minister_only: 'Удалить Администратора может только министр.',
  cannot_delete_self: 'Нельзя удалить самого себя.',
  cannot_delete_minister: 'Нельзя удалить министра — сначала передайте роль.',
  cannot_delete_protected: 'Этого пользователя нельзя удалить.',
};

export default function Admin() {
  const { user: me, refresh } = useAuth();
  const [users, setUsers] = useState(null);
  const [levels, setLevels] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null); // id редактируемого имени
  const [nameDraft, setNameDraft] = useState('');
  const [error, setError] = useState(null);

  const load = () => {
    Promise.all([api.adminUsers(), api.meta()])
      .then(([u, m]) => {
        setUsers(u.users);
        setLevels(m.levels);
      })
      .catch(() => setError('Не удалось загрузить данные.'));
  };

  useEffect(load, []);

  // Уровни, которые актор может назначить.
  const assignable = Object.entries(levels)
    .map(([v, l]) => ({ value: Number(v), ...l }))
    .filter(
      (l) =>
        l.value !== TOP_LEVEL &&
        (me.isSuperuser || l.value < me.accessLevel) &&
        (l.value !== ADMIN_ROLE_LEVEL || me.permissions.manageAdmins) &&
        (l.value >= MIN_PANEL_LEVEL || me.permissions.authorizeUsers),
    )
    .sort((a, b) => a.value - b.value);

  const canEditLevel = (t) => {
    if (!me.permissions.changeRoles) return false;
    if (t.accessLevel === TOP_LEVEL) return false; // министр — только через передачу
    if (me.isSuperuser) return true; // суперпользователь — без ограничений по уровню
    if (t.accessLevel === ADMIN_ROLE_LEVEL && !me.permissions.manageAdmins) return false; // админа меняет только министр
    if (t.accessLevel > me.accessLevel) return false;
    if (t.accessLevel < MIN_PANEL_LEVEL && !me.permissions.authorizeUsers) return false;
    return true;
  };

  // Полное удаление из базы — только при праве deleteUsers (министр/заместитель).
  const canDelete = (t) =>
    me.permissions.deleteUsers &&
    t.discordId !== me.discordId &&
    t.accessLevel !== TOP_LEVEL &&
    (t.accessLevel !== ADMIN_ROLE_LEVEL || me.permissions.manageAdmins) &&
    (me.isSuperuser || t.accessLevel <= me.accessLevel);

  const handleError = (e) => setError(ERRORS[e.message] || 'Не удалось выполнить действие.');

  const changeLevel = async (u, accessLevel) => {
    setBusyId(u.id);
    setError(null);
    try {
      await api.updateUser(u.id, { accessLevel: Number(accessLevel) });
      load();
      if (u.discordId === me.discordId) refresh();
    } catch (e) {
      handleError(e);
    } finally {
      setBusyId(null);
    }
  };

  const startEditName = (u) => {
    setEditing(u.id);
    setNameDraft(u.name);
    setError(null);
  };

  const saveName = async (u) => {
    setBusyId(u.id);
    setError(null);
    try {
      await api.updateUser(u.id, { name: nameDraft });
      setEditing(null);
      load();
      if (u.discordId === me.discordId) refresh();
    } catch (e) {
      handleError(e);
    } finally {
      setBusyId(null);
    }
  };

  const deleteUser = async (u) => {
    if (!confirm(`Полностью удалить «${u.name}» из системы? Пользователь исчезнет из списка.`)) return;
    setBusyId(u.id);
    setError(null);
    try {
      await api.deleteUser(u.id);
      load();
    } catch (e) {
      handleError(e);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Пользователи" crumbs={[{ label: 'Админ-панель' }]} />
      <AdminTabs />

      {error && <div className="card error-text">{error}</div>}
      {!users && !error && <div className="card empty-state">Загрузка…</div>}

      {users && (
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Все пользователи</h2>
            <span className="count-pill">{users.length}</span>
          </div>
          <p className="panel-note">
            Пользователь появляется здесь после первого входа через Discord.
            {me.permissions.changeNames
              ? ' Вы можете менять должности и имена.'
              : me.permissions.changeRoles
                ? ' Вы можете менять должности сотрудников.'
                : ''}
          </p>
          <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Discord ID</th>
                <th>Должность</th>
                {me.permissions.deleteUsers && <th>Действия</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="cell-user">
                      <Avatar user={u} size={36} />
                      {editing === u.id ? (
                        <div className="name-edit">
                          <input
                            className="name-input"
                            value={nameDraft}
                            autoFocus
                            placeholder="Имя из Discord"
                            disabled={busyId === u.id}
                            onChange={(e) => setNameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveName(u);
                              if (e.key === 'Escape') setEditing(null);
                            }}
                          />
                          <button className="mini-btn save" onClick={() => saveName(u)} disabled={busyId === u.id}
                            title="Сохранить имя" aria-label="Сохранить имя">
                            <Icon name="check" />
                          </button>
                          <button className="mini-btn" onClick={() => setEditing(null)} disabled={busyId === u.id}
                            title="Отмена" aria-label="Отмена">
                            <Icon name="close" />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="employee-name">
                            {u.name}
                            {me.permissions.changeNames && (
                              <button
                                className="edit-name-btn"
                                title="Изменить имя"
                                aria-label="Изменить имя"
                                onClick={() => startEditName(u)}
                              >
                                <Icon name="edit" />
                              </button>
                            )}
                          </div>
                          <div className="employee-tag">@{u.username}</div>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="mono">{u.discordId}</td>
                  <td>
                    {canEditLevel(u) ? (
                      <select
                        className="level-select"
                        value={u.accessLevel}
                        disabled={busyId === u.id}
                        onChange={(e) => changeLevel(u, e.target.value)}
                      >
                        {/* гарантируем наличие текущего значения в списке */}
                        {!assignable.some((l) => l.value === u.accessLevel) && (
                          <option value={u.accessLevel}>{u.levelName}</option>
                        )}
                        {assignable.map((l) => (
                          <option key={l.value} value={l.value}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="level-badge" style={{ color: u.levelColor }}>
                        {u.levelName}
                      </span>
                    )}
                  </td>
                  {me.permissions.deleteUsers && (
                    <td>
                      {canDelete(u) && (
                        <button
                          className="ghost-btn sm danger-text"
                          disabled={busyId === u.id}
                          onClick={() => deleteUser(u)}
                        >
                          <Icon name="trash" />
                          Удалить
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      )}
    </div>
  );
}
