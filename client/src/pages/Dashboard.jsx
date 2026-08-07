import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { MINISTRY_NAME, STATE_NAME } from '../constants.js';
import Avatar from '../components/Avatar.jsx';
import Clock from '../components/Clock.jsx';
import StatCard from '../components/StatCard.jsx';
import TransferMinisterModal from '../components/TransferMinisterModal.jsx';

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const [stats, setStats] = useState(null);
  const [showTransfer, setShowTransfer] = useState(false);

  const loadStats = useCallback(() => {
    api.stats().then(setStats).catch(() => setStats(null));
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const onTransferDone = async () => {
    setShowTransfer(false);
    await refresh(); // права текущего пользователя изменились
    loadStats();
  };

  return (
    <div className="page">
      {/* Шапка с пользователем и временем */}
      <header className="hero card">
        <Avatar user={user} size={88} />
        <div className="hero-info">
          <div className="hero-eyebrow">{MINISTRY_NAME.toUpperCase()}</div>
          <h1 className="hero-name">{user.name}</h1>
          <div className="hero-role" style={{ color: user.levelColor }}>
            {user.levelName}
          </div>
          <div className="hero-tag">@{user.username}</div>
        </div>
        <Clock />
      </header>

      {/* Действующий министр юстиции */}
      <section className="card minister-card">
        <div className="minister-left">
          <div className="minister-crown">👑</div>
          <div>
            <div className="section-eyebrow">ГЕНЕРАЛЬНЫЙ ПРОКУРОР</div>
            <div className="minister-label">Министр юстиции</div>
            <div className="minister-name">{stats?.minister?.name || 'Должность вакантна'}</div>
          </div>
        </div>
        {user.permissions?.transferMinister && (
          <button className="danger-btn" onClick={() => setShowTransfer(true)}>
            Передать роль министра
          </button>
        )}
      </section>

      {/* Структура министерства */}
      <section className="card">
        <div className="section-eyebrow">СТРУКТУРА</div>
        <h2 className="section-title">{MINISTRY_NAME}</h2>
        <p className="section-sub">Актуальные данные по сотрудникам · {STATE_NAME}.</p>

        <div className="stat-grid">
          <StatCard icon="👥" label="Кол-во сотрудников" value={stats?.staff ?? '—'} />
          <StatCard icon="🥈" label="Заместителей" value={stats?.deputies ?? '—'} />
          <StatCard icon="🎖️" label="Советников" value={stats?.advisors ?? '—'} />
          <StatCard icon="⚖️" label="Прокуроров" value={stats?.prosecutors ?? '—'} />
          <StatCard icon="📋" label="Помощников" value={stats?.assistants ?? '—'} />
          {user.permissions?.seePending && (
            <StatCard icon="⏳" label="Ожидают доступа" value={stats?.pending ?? '—'} />
          )}
        </div>
      </section>

      {showTransfer && (
        <TransferMinisterModal
          currentUser={user}
          onClose={() => setShowTransfer(false)}
          onDone={onTransferDone}
        />
      )}
    </div>
  );
}
