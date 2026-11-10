import type { Prisma } from "@prisma/client";
import { monthlyRanges } from "./client";

export interface InvoiceFilterParams {
  dir?: string;
  from?: string;
  to?: string;
  q?: string;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Hoje em Portugal continental (AAAA-MM-DD). */
export function todayLisbon(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
}

/** Primeiro e último dia de um intervalo de meses (AAAA-MM). */
export function monthBounds(from: string, to: string): { startDate: string; endDate: string } {
  if (!MONTH.test(from) || !MONTH.test(to)) throw new Error("Indique os meses no formato AAAA-MM");
  const [y, m] = to.split("-").map(Number);
  const endDate = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const startDate = `${from}-01`;
  monthlyRanges(startDate, endDate); // valida a ordem
  return { startDate, endDate };
}

/** Filtro da listagem e da exportação de faturas de uma empresa. */
export function invoiceWhere(companyId: string, p: InvoiceFilterParams): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = { companyId, direction: p.dir === "issued" ? "ISSUED" : "RECEIVED" };
  const from = p.from && MONTH.test(p.from) ? p.from : undefined;
  const to = p.to && MONTH.test(p.to) ? p.to : undefined;
  if (from || to) {
    const date: Prisma.DateTimeFilter = {};
    if (from) date.gte = new Date(`${from}-01T00:00:00Z`);
    if (to) {
      const [y, m] = to.split("-").map(Number);
      date.lte = new Date(Date.UTC(y, m, 0));
    }
    where.invoiceDate = date;
  }
  const q = p.q?.trim();
  if (q) where.OR = [{ invoiceNo: { contains: q, mode: "insensitive" } }, { issuerNif: { contains: q } }, { customerNif: { contains: q } }, { atcud: { contains: q, mode: "insensitive" } }];
  return where;
}

/** Primeiro dia do mês anterior ao de uma data (AAAA-MM-DD). */
export function previousMonthStart(day: string): string {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
}
