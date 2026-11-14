import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';

export default function NoAccess() {
  const { user, logout } = useAuth();

  return (
    <div className="login-screen">
      <div className="panel login-card">
        <div className="panel-head">
          <h1 className="panel-title">Доступ ещё не выдан</h1>
        </div>
        <div className="panel-body">
          <div className="cell-user">
            <Avatar user={user} size={44} />
            <div>
              <div className="employee-name">{user.name}</div>
              <div className="employee-tag">@{user.username}</div>
            </div>
          </div>
          <p className="login-note">
            Вы вошли через Discord, но должность в министерстве вам пока не назначена. Передайте руководству
            министерства свой Discord ID, чтобы вам выдали доступ.
          </p>
          <div className="discord-id-box">Discord ID: {user.discordId}</div>
        </div>
        <div className="panel-foot">
          <button className="ghost-btn" onClick={logout}>
            Выйти
          </button>
        </div>
      </div>
    </div>
  );
}
