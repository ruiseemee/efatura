import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { EditUserForm } from "../UserForms";

export const dynamic = "force-dynamic";

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = (await params).id;
  const [user, logs] = await Promise.all([
    prisma.user.findUnique({ where: { id }, include: { sessions: { orderBy: { lastSeenAt: "desc" } } } }),
    prisma.auditLog.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  if (!user) notFound();
  return (
    <>
      <PageHeader title={user.name} subtitle={user.email} back={{ href: "/users", label: "Utilizadores" }} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Conta"><EditUserForm user={user} /></Card>
        <div className="space-y-6">
          <Card title="Sessões ativas" bodyClassName="">
            <table className="table"><tbody>
              {user.sessions.map((s) => (<tr key={s.id}><td className="mono">{s.ip ?? "—"}</td><td className="max-w-56 truncate text-xs text-slate-500">{s.userAgent}</td><td className="text-xs whitespace-nowrap">{dateTime(s.lastSeenAt)}</td></tr>))}
              {user.sessions.length === 0 && <tr><td className="text-slate-500">Nenhuma.</td></tr>}
            </tbody></table>
          </Card>
          <Card title="Atividade" bodyClassName="">
            <table className="table"><tbody>
              {logs.map((l) => (<tr key={l.id}><td className="mono">{l.action}</td><td className="mono text-slate-500">{l.ip}</td><td className="text-xs whitespace-nowrap">{dateTime(l.createdAt)}</td></tr>))}
            </tbody></table>
          </Card>
        </div>
      </div>
    </>
  );
}
