import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { dateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; action?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = sp.action ? { action: { startsWith: sp.action } } : {};
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { user: true } }),
    prisma.auditLog.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => `?page=${p}${sp.action ? `&action=${encodeURIComponent(sp.action)}` : ""}`;
  return (
    <>
      <PageHeader title="Auditoria" subtitle={`${total} registos`} />
      <form className="mb-4"><input className="input max-w-sm" name="action" defaultValue={sp.action} placeholder="Filtrar por ação (ex.: invoice.sync, auth.login)" /></form>
      <Card bodyClassName="">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Data</th><th>Utilizador</th><th>Ação</th><th>Alvo</th><th>Detalhes</th><th>IP</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="text-xs whitespace-nowrap">{dateTime(l.createdAt)}</td>
                  <td className="text-slate-600">{l.user?.email ?? "—"}</td>
                  <td className="mono">{l.action}</td>
                  <td className="text-xs">{l.targetType === "company" ? <Link className="link" href={`/companies/${l.targetId}`}>empresa</Link> : l.targetType ?? ""}</td>
                  <td className="mono max-w-sm truncate text-xs text-slate-500">{l.details ? JSON.stringify(l.details) : ""}</td>
                  <td className="mono text-xs text-slate-500">{l.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="mt-4 flex items-center gap-3 text-sm">
        {page > 1 && <Link className="btn-secondary btn-sm" href={qs(page - 1)}>← Anterior</Link>}
        <span className="text-slate-500">Página {page} de {pages}</span>
        {page < pages && <Link className="btn-secondary btn-sm" href={qs(page + 1)}>Seguinte →</Link>}
      </div>
    </>
  );
}
