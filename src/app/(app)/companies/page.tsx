import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { Alert, Badge, Card, Empty, PageHeader } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { getAtSettings, settingsProblem } from "@/lib/at/service";

export const metadata: Metadata = { title: "Empresas" };
export const dynamic = "force-dynamic";

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q?.trim();
  const [companies, settings] = await Promise.all([
    prisma.company.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { nif: { contains: q } }] } : undefined,
      include: { _count: { select: { invoices: true } } },
      orderBy: { name: "asc" },
    }),
    getAtSettings(),
  ]);
  const problem = settingsProblem(settings);
  return (
    <>
      <PageHeader title="Empresas" subtitle="Empresas cujas faturas são descarregadas do e-Fatura." actions={<Link href="/companies/new" className="btn-primary">Nova empresa</Link>} />
      {problem && <div className="mb-4"><Alert tone="amber">{problem}</Alert></div>}
      <form className="mb-4"><input className="input max-w-sm" name="q" defaultValue={q} placeholder="Procurar por nome ou NIF…" /></form>
      <Card bodyClassName="">
        {companies.length === 0 ? <Empty>{q ? "Nenhuma empresa encontrada." : "Ainda não há empresas. Comece por “Nova empresa”."}</Empty> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Empresa</th><th>NIF / subutilizador</th><th>Faturas</th><th>Última descarga</th><th>Estado</th></tr></thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td><Link href={`/companies/${c.id}`} className="link">{c.name}</Link></td>
                    <td className="mono">{c.nif}/{c.subUser}</td>
                    <td>{c._count.invoices}</td>
                    <td className="text-slate-600">{dateTime(c.lastSyncAt)}{c.autoSync && c.active ? <span className="ml-2 text-xs text-slate-400">auto</span> : null}</td>
                    <td>{!c.active ? <Badge tone="slate">inativa</Badge> : c.lastSyncError ? <Badge tone="red">erro na descarga</Badge> : c.lastSyncAt ? <Badge tone="green">ok</Badge> : <Badge tone="amber">por descarregar</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
