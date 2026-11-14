import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { TOP_LEVEL } from '../constants.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

export default function TransferMinisterModal({ currentUser, onClose, onDone }) {
  const [users, setUsers] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Суперпользователь может менять министра, не будучи министром.
  const iAmMinister = currentUser.accessLevel === TOP_LEVEL;

  useEffect(() => {
    // Кандидаты — все, кроме действующего министра (суперпользователь может выбрать и себя).
    api
      .adminUsers()
      .then((d) => setUsers(d.users.filter((u) => u.accessLevel !== TOP_LEVEL)))
      .catch(() => setError('Не удалось загрузить список пользователей.'));
  }, []);

  const submit = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await api.transferMinister(Number(selectedId));
      onDone();
    } catch {
      setError('Не удалось передать роль министра.');
      setBusy(false);
    }
  };

  const selected = users?.find((u) => String(u.id) === String(selectedId));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Передача роли министра юстиции</h2>
        <div className="modal-warn">
          <Icon name="warning" />
          <div>
            {iAmMinister ? (
              <>
                Вы передадите полномочия министра другому человеку и станете
                <b> Заместителем министра юстиции</b>. Вернуть роль сможет только новый министр.
              </>
            ) : (
              <>
                Действующий министр станет <b>Заместителем министра юстиции</b>, а выбранный сотрудник
                займёт его должность.
              </>
            )}
          </div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <label className="modal-label">Новый министр</label>
        <select
          className="level-select modal-select"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={!users || busy}
        >
          <option value="">Выберите сотрудника</option>
          {users?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} (@{u.username}), {u.levelName}
            </option>
          ))}
        </select>

        {selected && (
          <div className="modal-selected">
            <Avatar user={selected} size={40} />
            <div>
              <div className="employee-name">{selected.name}</div>
              <div className="employee-tag">@{selected.username}</div>
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button className="danger-btn" onClick={submit} disabled={!selectedId || busy}>
            {busy ? 'Передача…' : 'Передать роль'}
          </button>
        </div>
      </div>
    </div>
  );
}
