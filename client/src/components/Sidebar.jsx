import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { MINISTRY_NAME, STATE_NAME } from '../constants.js';
import Avatar from './Avatar.jsx';

const NAV = [
  { to: '/', label: 'Главная', icon: '🏛️', end: true },
  { to: '/profile', label: 'Профиль', icon: '👤' },
  { to: '/my-templates', label: 'Мои шаблоны', icon: '📝' },
  { to: '/employees', label: 'Сотрудники', icon: '👥' },
  { to: '/prosecutor', label: 'Прокуратура', icon: '📜' },
  { to: '/appeals', label: 'Обращения', icon: '📨' },
  { to: '/general-prosecutor', label: 'Генеральная прокуратура', icon: '⚜️', perm: 'viewGeneral' },
  { to: '/admin', label: 'Админ-панель', icon: '⚖️', perm: 'accessAdmin' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">⚖</div>
        <div className="brand-text">
          <div className="brand-title">{MINISTRY_NAME}</div>
          <div className="brand-sub">{STATE_NAME}</div>
        </div>
      </div>

      <nav className="nav">
        {NAV.filter((i) => !i.perm || user.permissions?.[i.perm]).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button className="nav-item nav-logout" onClick={handleLogout}>
          <span className="nav-icon">🚪</span>
          <span>Выйти</span>
        </button>
      </nav>

      <div className="sidebar-user">
        <Avatar user={user} size={42} />
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">{user.name}</div>
          <div className="sidebar-user-role" style={{ color: user.levelColor }}>
            {user.levelName}
          </div>
        </div>
      </div>
    </aside>
  );
}
