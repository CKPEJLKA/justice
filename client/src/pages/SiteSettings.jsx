import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useSite } from '../context/SiteContext.jsx';
import AdminTabs from '../components/AdminTabs.jsx';
import Icon from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';

const ERRORS = {
  empty_server_name: 'Название сервера не может быть пустым.',
  invalid_forum_url: 'Ссылка на раздел форума должна начинаться с http:// или https://.',
  invalid_notify_url: 'URL функции должен начинаться с http:// или https:// (или оставьте поле пустым).',
  forum_cookie_forbidden: 'Недостаточно прав для изменения cookie форума.',
};

// Подсказки к полям (ключи — из server/src/siteSettings.js).
const HINTS = {
  serverName: 'Выводится как «штат <название>» в меню, на странице входа и в уведомлениях Discord.',
  appealsForumUrl:
    'Раздел форума, где подают обращения, например https://forum.gta5rp.com/forums/obrashcheniya-v-prokuraturu.812/. Новые темы импортируются отсюда со следующей проверки форума.',
  forumCookie:
    'Разделы обращений закрыты для гостей, поэтому импорт заходит на форум под аккаунтом. Войдите на форум отдельным аккаунтом с отметкой «Запомнить меня» и откройте раздел. В DevTools на вкладке Network выберите первый запрос и скопируйте заголовок cookie из Request Headers целиком. Не выходите из аккаунта в том браузере: выход сделает cookie недействительным.',
  assignNotifyUrl: 'Адрес Yandex Cloud Function, которая отправляет уведомление в Discord. Пустое поле отключает уведомления.',
  assignNotifyToken: 'Секрет для заголовка X-Auth-Token. Должен совпадать с AUTH_TOKEN в настройках функции.',
};

const CHECK_REASONS = {
  auth: 'Форум требует вход: cookie не задан, устарел или недействителен.',
  network: 'Не удалось связаться с форумом (сеть или FlareSolverr).',
  http: 'Форум ответил ошибкой.',
  format: 'Форум ответил, но это не RSS-лента. Проверьте ссылку на раздел.',
};

const Ok = () => <Icon name="ok" className="icon-ok" />;
const Fail = () => <Icon name="fail" className="icon-fail" />;

// Результат кнопки «Проверить доступ к форуму».
function ForumCheckResult({ r }) {
  if (r.error) {
    return (
      <div className="forum-check bad">
        <div className="forum-check-line"><Fail /> {r.error}</div>
      </div>
    );
  }
  return (
    <div className={'forum-check ' + (r.ok ? 'good' : 'bad')}>
      <div className="forum-check-line">
        {r.loggedIn ? (
          <><Ok /> <span>Вход выполнен{r.username ? <> как <b>{r.username}</b></> : ''}</span></>
        ) : (
          <><Fail /> <span>Не авторизован на форуме</span></>
        )}
      </div>
      {r.ok ? (
        <>
          <div className="forum-check-line">
            <Ok />
            <span>
              RSS-лента доступна: тем <b>{r.itemCount}</b>, распознано обращений <b>{r.recognized}</b>
            </span>
          </div>
          {r.sample.length > 0 && (
            <ul className="forum-check-sample">
              {r.sample.map((s, i) => (
                <li key={i}>
                  <span className="mono">{s.code || 'пропуск'}</span>: {s.title}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="forum-check-line">
          <Fail />
          <span>
            {CHECK_REASONS[r.reason] || 'Нет доступа к ленте.'}
            {r.message && <span className="forum-check-detail"> ({r.message})</span>}
          </span>
        </div>
      )}
    </div>
  );
}

export default function SiteSettings() {
  const { refreshSite } = useSite();
  const [fields, setFields] = useState(null);
  const [form, setForm] = useState({});
  const [saved, setSaved] = useState({});
  const [reveal, setReveal] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState(null);
  // Поле cookie сервер присылает только суперпользователю.
  const hasCookieField = !!fields?.some((f) => f.key === 'forumCookie');
  const checkAfterKey = hasCookieField ? 'forumCookie' : 'appealsForumUrl';

  // Проверяем то, что сейчас в форме (даже если ещё не сохранено).
  const runForumCheck = async () => {
    setChecking(true);
    setCheck(null);
    try {
      // forumCookie есть в форме только у суперпользователя; у министра проверка идёт с сохранённым.
      setCheck(
        await api.forumCheck({
          appealsForumUrl: form.appealsForumUrl,
          ...(hasCookieField ? { forumCookie: form.forumCookie } : {}),
        }),
      );
    } catch (e) {
      setCheck({ error: ERRORS[e.message] || 'Проверка не удалась (сервер не ответил).' });
    } finally {
      setChecking(false);
    }
  };

  const apply = (d) => {
    setFields(d.fields);
    const values = Object.fromEntries(d.fields.map((f) => [f.key, f.value]));
    setForm(values);
    setSaved(values);
  };

  useEffect(() => {
    api
      .adminSettings()
      .then(apply)
      .catch(() => setError('Не удалось загрузить настройки.'));
  }, []);

  const dirty = fields && fields.some((f) => form[f.key] !== saved[f.key]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setMsg(null);
    // Отправляем только изменённые поля.
    const patch = Object.fromEntries(
      fields.filter((f) => form[f.key] !== saved[f.key]).map((f) => [f.key, form[f.key]]),
    );
    try {
      const d = await api.updateAdminSettings(patch);
      apply(d);
      await refreshSite();
      setMsg(d.changed.length ? 'Настройки сохранены.' : 'Изменений нет.');
    } catch (e) {
      setError(ERRORS[e.message] || 'Не удалось сохранить настройки.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Настройки сайта" crumbs={[{ label: 'Админ-панель', to: '/admin' }]} />
      <AdminTabs />

      {error && <div className="card error-text">{error}</div>}
      {msg && <div className="card action-msg">{msg}</div>}
      {!fields && !error && <div className="card empty-state">Загрузка…</div>}

      {fields && (
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Игровой сервер</h2>
          </div>
          <p className="panel-note">
            Меняется при переходе на другой сервер. Применяется сразу, перезапуск сайта не нужен.
          </p>

          {fields.map((f) => (
            <div className="form-row" key={f.key}>
              <label className="form-label" htmlFor={`set-${f.key}`}>
                {f.label}
              </label>
              <div className="form-control">
                <div className="form-inline">
                  <input
                    id={`set-${f.key}`}
                    className="name-input full"
                    type={f.secret && !reveal[f.key] ? 'password' : 'text'}
                    autoComplete="off"
                    spellCheck={false}
                    value={form[f.key] ?? ''}
                    disabled={busy}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  />
                  {f.secret && (
                    <button
                      type="button"
                      className="mini-btn"
                      style={{ width: 34, height: 34 }}
                      title={reveal[f.key] ? 'Скрыть' : 'Показать'}
                      aria-label={reveal[f.key] ? 'Скрыть значение' : 'Показать значение'}
                      onClick={() => setReveal({ ...reveal, [f.key]: !reveal[f.key] })}
                    >
                      <Icon name={reveal[f.key] ? 'hide' : 'show'} />
                    </button>
                  )}
                </div>
                {HINTS[f.key] && <div className="form-hint">{HINTS[f.key]}</div>}
                {f.key === checkAfterKey && (
                  <div style={{ marginTop: 10 }}>
                    <button className="ghost-btn sm" onClick={runForumCheck} disabled={checking || busy}>
                      <Icon name="search" />
                      {checking ? 'Проверка, это может занять до минуты…' : 'Проверить доступ к форуму'}
                    </button>
                    {check && <ForumCheckResult r={check} />}
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="panel-foot">
            {dirty && (
              <button className="ghost-btn" disabled={busy} onClick={() => setForm(saved)}>
                Отменить изменения
              </button>
            )}
            <button className="save-btn" disabled={!dirty || busy} onClick={save}>
              {busy ? 'Сохранение…' : 'Сохранить настройки'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
