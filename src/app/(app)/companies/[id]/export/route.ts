import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { invoiceWhere } from "@/lib/at/filter";

/** Exporta as faturas filtradas em CSV (separador ";" e vírgula decimal, como o Excel em português espera). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada" }, { status: 401 });
  
  const { id } = await params;
  const company = await prisma.company.findUnique({ where: { id }, select: { nif: true } });
  if (!company) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });

  const filter = Object.fromEntries(req.nextUrl.searchParams);
  const invoices = await prisma.invoice.findMany({ where: invoiceWhere(id, filter), orderBy: [{ invoiceDate: "asc" }, { invoiceNo: "asc" }] });

  // Aspas em todos os campos de texto; o apóstrofo inicial neutraliza fórmulas em folhas de cálculo.
  const cell = (v: string | null) => {
    const s = v ?? "";
    return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const money = (v: unknown) => String(v).replace(".", ",");
  const rows = [
    ["Data", "Tipo", "Numero", "ATCUD", "NIF emitente", "NIF adquirente", "Pais adquirente", "Estado", "Autofaturacao", "IVA de caixa", "Total sem IVA", "IVA", "Total"].join(";"),
    ...invoices.map((i) =>
      [
        i.invoiceDate.toISOString().slice(0, 10),
        cell(i.invoiceType),
        cell(i.invoiceNo),
        cell(i.atcud),
        cell(i.issuerNif),
        cell(i.customerNif),
        cell(i.customerCountry),
        cell(i.status),
        i.selfBilling ? "S" : "N",
        i.cashVat ? "S" : "N",
        money(i.netTotal),
        money(i.taxPayable),
        money(i.grossTotal),
      ].join(";"),
    ),
  ];
  const name = `faturas-${company.nif}-${filter.dir === "issued" ? "emitidas" : "recebidas"}.csv`;
  return new NextResponse("﻿" + rows.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
