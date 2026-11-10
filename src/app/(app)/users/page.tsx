import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { Badge, Card, PageHeader } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { NewUserForm } from "./UserForms";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requireAdmin();
  const users = await prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] });
  return (
    <>
      <PageHeader title="Utilizadores" />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Card bodyClassName="">
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Nome</th><th>Papel</th><th>Último acesso</th><th>Estado</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td><Link href={`/users/${u.id}`} className="link">{u.name}</Link><div className="text-xs text-slate-500">{u.email}</div></td>
                    <td>{u.role === "ADMIN" ? <Badge tone="blue">admin</Badge> : <Badge>utilizador</Badge>}</td>
                    <td className="text-slate-600">{dateTime(u.lastLoginAt)}</td>
                    <td>{u.active ? <Badge tone="green">ativo</Badge> : <Badge tone="red">inativo</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Novo utilizador"><NewUserForm /></Card>
      </div>
    </>
  );
}
