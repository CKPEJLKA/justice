import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { MINISTRY_NAME, STATE_NAME } from '../constants.js';

const ERRORS = {
  state: 'Ошибка безопасности (state). Попробуйте войти заново.',
  oauth: 'Не удалось авторизоваться через Discord. Попробуйте ещё раз.',
  not_configured: 'Discord OAuth не настроен на сервере. Заполните server/.env.',
};

export default function Login() {
  const [params] = useSearchParams();
  const error = params.get('error');

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">⚖</div>
        <h1 className="login-title">{MINISTRY_NAME}</h1>
        <p className="login-sub">{STATE_NAME} · GTA5RP</p>

        {error && <div className="login-error">{ERRORS[error] || 'Произошла ошибка.'}</div>}

        <a className="discord-btn" href={api.loginUrl}>
          <svg width="22" height="22" viewBox="0 0 127 96" fill="currentColor" aria-hidden="true">
            <path d="M107 8A105 105 0 0 0 80.7 0c-1.2 2-2.5 4.8-3.4 7a97 97 0 0 0-28.7 0C47.7 4.8 46.3 2 45.1 0A105 105 0 0 0 18.8 8C2.1 33 .4 57.2 1.3 81a106 106 0 0 0 32 16c2.6-3.5 5-7.3 6.9-11.2-3.8-1.4-7.4-3.2-10.9-5.3.9-.7 1.8-1.4 2.6-2.1a75 75 0 0 0 64 0c.9.7 1.7 1.4 2.6 2.1-3.5 2-7.1 3.8-10.9 5.3 2 3.9 4.3 7.7 6.9 11.2a106 106 0 0 0 32-16c1.1-27.6-1.7-51.6-19-73zM42.8 65.5c-6.3 0-11.5-5.8-11.5-13s5.1-13 11.5-13 11.6 5.9 11.5 13c0 7.2-5.1 13-11.5 13zm41.5 0c-6.3 0-11.5-5.8-11.5-13s5.1-13 11.5-13 11.6 5.9 11.5 13c0 7.2-5.1 13-11.5 13z" />
          </svg>
          Войти через Discord
        </a>

        <p className="login-note">
          Доступ к панели предоставляется генеральной прокуратурой. После входа вам выдадут доступ.
        </p>
      </div>
    </div>
  );
}
