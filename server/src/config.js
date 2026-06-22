import 'dotenv/config';

// Публичный адрес сайта (откуда его открывают пользователи).
// В одно-портовом режиме это домен:порт, на котором работает сервер.
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

export const config = {
  port: Number(process.env.PORT) || 3001,
  clientUrl,
  sessionSecret: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    // Если не задан явно — берётся от CLIENT_URL (тот же адрес + /api/auth/discord/callback).
    redirectUri: process.env.DISCORD_REDIRECT_URI || `${clientUrl}/api/auth/discord/callback`,
  },
  adminDiscordIds: (process.env.ADMIN_DISCORD_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

// --- Уровни доступа (числом, чем выше — тем больше прав) ---
export const TOP_LEVEL = 100; // Министр юстиции (единственный)
export const DEPUTY_LEVEL = 90; // Заместитель министра юстиции
export const ADVISOR_LEVEL = 80; // Советник министра юстиции
export const PROSECUTOR_LEVEL = 50; // Прокурор
export const ASSISTANT_LEVEL = 40; // Помощник прокурора

export const MIN_PANEL_LEVEL = 1; // минимальный уровень = «сотрудник с доступом»
export const ADMIN_LEVEL = ADVISOR_LEVEL; // минимум для доступа к админ-панели

// Справочник уровней доступа.
export const ACCESS_LEVELS = {
  0: { name: 'Без доступа', short: 'Гость', color: '#6b7280' },
  40: { name: 'Помощник прокурора', short: 'Помощник', color: '#7da3c9' },
  50: { name: 'Прокурор', short: 'Прокурор', color: '#5b8fc9' },
  80: { name: 'Советник министра юстиции', short: 'Советник', color: '#a98bd6' },
  90: { name: 'Заместитель министра юстиции', short: 'Заместитель', color: '#d99a52' },
  100: { name: 'Министр юстиции', short: 'Министр', color: '#e8c660' },
};

// Права, вычисляемые по уровню доступа.
export function permissionsFor(level) {
  return {
    accessAdmin: level >= ADMIN_LEVEL, // министр, заместитель, советник
    changeRoles: level >= ADVISOR_LEVEL, // министр, заместитель, советник
    authorizeUsers: level >= DEPUTY_LEVEL, // министр, заместитель (выдача/снятие доступа)
    changeNames: level >= DEPUTY_LEVEL, // министр, заместитель
    transferMinister: level >= TOP_LEVEL, // только министр
    seePending: level >= ADVISOR_LEVEL, // министр, заместитель, советник
    manageDocs: level >= DEPUTY_LEVEL, // министр, заместитель — категории и документы
    viewGeneral: level >= ADVISOR_LEVEL, // министр, заместитель, советник — Ген. прокуратура
    manageAppeals: level >= ADVISOR_LEVEL, // министр, заместитель, советник — обращения
  };
}

// --- Обращения в прокуратуру ---
// Статусы обращения. inProgress: считается ли «в работе».
export const APPEAL_STATUSES = {
  not_taken: { label: 'Не взято в работу', color: '#8a8a94', inProgress: false },
  assigned: { label: 'Назначен прокурор', color: '#5b8fc9', inProgress: true },
  reviewing: { label: 'На рассмотрении', color: '#d99a52', inProgress: true },
  refused: { label: 'Отказано', color: '#e26b6b', inProgress: false },
  reviewed: { label: 'Рассмотрено', color: '#6cc18e', inProgress: false },
};
export const APPEAL_STATUS_ORDER = ['not_taken', 'assigned', 'reviewing', 'refused', 'reviewed'];
