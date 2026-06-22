import { useEffect, useState } from 'react';

// Всё время — по часовому поясу Москвы (МСК, UTC+3).
const MSK = 'Europe/Moscow';
const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: MSK,
});
const TIME_FMT = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: MSK,
});

export default function Clock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="clock">
      <div className="clock-date">{DATE_FMT.format(now)}</div>
      <div className="clock-time">
        {TIME_FMT.format(now)} <span className="clock-tz">МСК</span>
      </div>
    </div>
  );
}
