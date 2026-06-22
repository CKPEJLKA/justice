import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';

export default function NoAccess() {
  const { user, logout } = useAuth();

  return (
    <div className="login-screen">
      <div className="login-card">
        <Avatar user={user} size={64} />
        <h1 className="login-title" style={{ marginTop: 16 }}>
          Ожидание доступа
        </h1>
        <p className="login-sub">{user.name}</p>
        <p className="login-note">
          Вы успешно вошли через Discord, но у вашей учётной записи пока нет уровня доступа.
          Обратитесь к руководству министерства для выдачи доступа.
        </p>
        <div className="discord-id-box">Discord ID: {user.discordId}</div>
        <button className="ghost-btn" onClick={logout}>
          Выйти
        </button>
      </div>
    </div>
  );
}
