export default function Avatar({ user, size = 40 }) {
  const initials = (user?.name || '?').trim().charAt(0).toUpperCase();
  const style = { width: size, height: size, fontSize: size * 0.42 };

  if (user?.avatarUrl) {
    return <img className="avatar" src={user.avatarUrl} alt={user.name} style={style} />;
  }
  return (
    <div className="avatar avatar-fallback" style={style}>
      {initials}
    </div>
  );
}
