import type { ReactNode } from "react";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <div className="center muted">{label}</div>;
}

export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      <div className="icon">{icon}</div>
      <p>
        <strong>{title}</strong>
      </p>
      {hint && <p className="small">{hint}</p>}
    </div>
  );
}

const STATUS: Record<string, [string, string]> = {
  pending: ["gray", "⏳ Queued"],
  syncing: ["blue", "↻ Syncing"],
  synced: ["green", "✓ Ready"],
  error: ["red", "⚠ Failed"],
};

export function StatusBadge({ status }: { status: string }) {
  const [cls, label] = STATUS[status] ?? ["gray", status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="card" style={{ borderColor: "#fca5a5", background: "#fef2f2" }}>
      <span className="error-text">{message}</span>
    </div>
  );
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h1>{title}</h1>
      {subtitle && <p className="muted">{subtitle}</p>}
    </div>
  );
}
