import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Alert, Badge, Card, Empty, PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { dateTime } from "@/lib/format";
import { invoiceWhere, todayLisbon, type InvoiceFilterParams } from "@/lib/at/filter";
import { deleteCompany, saveCompany, syncCompanyInvoices } from "../actions";
import { CompanyFields } from "../CompanyFields";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 200;
const euro = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<InvoiceFilterParams> }) {
  const { id } = await params;
  const filter = await searchParams;
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) notFound();

  const where = invoiceWhere(id, filter);
  const issued = filter.dir === "issued";
  const [invoices, totals] = await Promise.all([
    prisma.invoice.findMany({ where, orderBy: [{ invoiceDate: "desc" }, { invoiceNo: "desc" }], take: PAGE_SIZE }),
    prisma.invoice.aggregate({ where, _count: true, _sum: { netTotal: true, taxPayable: true, grossTotal: true } }),
  ]);
  const month = todayLisbon().slice(0, 7);
  const exportQuery = new URLSearchParams(Object.entries(filter).filter(([, v]) => typeof v === "string" && v) as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title={<>{company.name} {!company.active && <Badge tone="slate">inativa</Badge>}</>}
        subtitle={<>NIF <span className="mono">{company.nif}/{company.subUser}</span> · última descarga: {dateTime(company.lastSyncAt)}</>}
        back={{ href: "/companies", label: "Empresas" }}
      />
      {company.lastSyncError && <div className="mb-6"><Alert tone="red">A última descarga falhou: {company.lastSyncError}</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Descarregar faturas da AT">
          <ActionForm action={syncCompanyInvoices} submitLabel="Descarregar">
            <input type="hidden" name="id" value={id} />
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="sync-dir">Faturas</label>
                <select className="input" id="sync-dir" name="direction" defaultValue="both">
                  <option value="both">Recebidas e emitidas</option><option value="received">Recebidas (adquirente)</option><option value="issued">Emitidas (emitente)</option>
                </select>
              </div>
              <div><label className="label" htmlFor="sync-from">De</label><input className="input" id="sync-from" name="from" type="month" required defaultValue={month} max={month} /></div>
              <div><label className="label" htmlFor="sync-to">Até</label><input className="input" id="sync-to" name="to" type="month" required defaultValue={month} max={month} /></div>
            </div>
            <p className="text-xs text-slate-500">As faturas já descarregadas são atualizadas, não duplicadas. Máximo de 24 meses de cada vez.{company.autoSync && company.active ? " O mês corrente e o anterior são descarregados automaticamente todos os dias." : ""}</p>
          </ActionForm>
        </Card>
        <Card title="Dados e credenciais">
          <ActionForm action={saveCompany} submitLabel="Guardar e testar"><CompanyFields company={company} /></ActionForm>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <ActionForm action={deleteCompany} submitLabel="Remover empresa" submitClass="btn-danger btn-sm" confirm={`Remover ${company.name} e todas as faturas descarregadas?`}>
              <input type="hidden" name="id" value={id} />
            </ActionForm>
          </div>
        </Card>
      </div>

      <form className="mt-8 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="f-dir">Faturas</label>
          <select className="input" id="f-dir" name="dir" defaultValue={issued ? "issued" : "received"}><option value="received">Recebidas</option><option value="issued">Emitidas</option></select>
        </div>
        <div><label className="label" htmlFor="f-from">De</label><input className="input" id="f-from" name="from" type="month" defaultValue={filter.from} /></div>
        <div><label className="label" htmlFor="f-to">Até</label><input className="input" id="f-to" name="to" type="month" defaultValue={filter.to} /></div>
        <div><label className="label" htmlFor="f-q">Procurar</label><input className="input" id="f-q" name="q" defaultValue={filter.q} placeholder="N.º, NIF ou ATCUD…" /></div>
        <button className="btn-secondary">Filtrar</button>
        <a className="btn-secondary" href={`/companies/${id}/export${exportQuery ? `?${exportQuery}` : ""}`}>Exportar CSV</a>
      </form>

      <Card
        title={`${totals._count} fatura(s) ${issued ? "emitida(s)" : "recebida(s)"} · ${euro.format(Number(totals._sum.grossTotal ?? 0))} (IVA ${euro.format(Number(totals._sum.taxPayable ?? 0))})`}
        bodyClassName=""
      >
        {invoices.length === 0 ? <Empty>Sem faturas para este filtro. Use “Descarregar faturas da AT”.</Empty> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Data</th><th>Tipo</th><th>N.º</th><th>{issued ? "Adquirente" : "Emitente"}</th><th>ATCUD</th><th className="text-right">Sem IVA</th><th className="text-right">IVA</th><th className="text-right">Total</th><th>Estado</th></tr></thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap">{day(i.invoiceDate)}</td>
                    <td>{i.invoiceType}</td>
                    <td className="mono whitespace-nowrap">{i.invoiceNo}</td>
                    <td className="mono">{(issued ? i.customerNif ?? i.customerCountry : i.issuerNif) || "—"}</td>
                    <td className="mono text-slate-600">{i.atcud ?? "—"}</td>
                    <td className="text-right whitespace-nowrap">{euro.format(Number(i.netTotal))}</td>
                    <td className="text-right whitespace-nowrap">{euro.format(Number(i.taxPayable))}</td>
                    <td className="text-right whitespace-nowrap">{euro.format(Number(i.grossTotal))}</td>
                    <td>{i.status === "A" ? <Badge tone="red">anulada</Badge> : i.status ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {totals._count > PAGE_SIZE && <p className="mt-3 text-sm text-slate-500">A mostrar as {PAGE_SIZE} mais recentes. Refine o filtro ou exporte para CSV para ver todas.</p>}
    </>
  );
}
