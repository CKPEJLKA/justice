export default function StatCard({ icon, label, value, accent }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={accent ? { color: accent } : undefined}>
        {icon}
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
