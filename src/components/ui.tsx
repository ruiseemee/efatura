import Link from "next/link";

export function PageHeader({ title, subtitle, actions, back }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-block text-sm text-slate-500 hover:text-slate-700">← {back.label}</Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, actions, children, className = "", bodyClassName = "card-body" }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-header">
          <h2 className="card-title">{title}</h2>
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

const STATE_STYLE: Record<string, { label: string; cls: string; dot: string }> = {
  running: { label: "Em execução", cls: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  paused: { label: "Em pausa", cls: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  stopped: { label: "Desligada", cls: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  locked: { label: "Ocupada", cls: "bg-blue-50 text-blue-700", dot: "bg-blue-500 animate-pulse" },
  unknown: { label: "Indisponível", cls: "bg-red-50 text-red-700", dot: "bg-red-500" },
};

export function StateBadge({ state }: { state: string }) {
  const s = STATE_STYLE[state] ?? STATE_STYLE.unknown;
  return (
    <span className={`badge ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "red" | "amber" | "blue" }) {
  const tones = { slate: "bg-slate-100 text-slate-700", green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700", amber: "bg-amber-50 text-amber-800", blue: "bg-blue-50 text-blue-700" };
  return <span className={`badge ${tones[tone]}`}>{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-10 text-center text-sm text-slate-500">{children}</div>;
}

export function Alert({ tone = "red", children }: { tone?: "red" | "amber" | "blue" | "green"; children: React.ReactNode }) {
  const tones = { red: "border-red-200 bg-red-50 text-red-800", amber: "border-amber-200 bg-amber-50 text-amber-900", blue: "border-blue-200 bg-blue-50 text-blue-800", green: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  return <div className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function DescList({ items }: { items: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[minmax(0,10rem)_1fr]">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-slate-500">{k}</dt>
          <dd className="min-w-0 break-words text-slate-900">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Meter({ value, max, label }: { value?: number; max?: number; label: string }) {
  const pct = value !== undefined && max ? Math.min(100, (value / max) * 100) : 0;
  const color = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-brand-500";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-500"><span>{label}</span><span>{max ? `${pct.toFixed(0)}%` : "—"}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
