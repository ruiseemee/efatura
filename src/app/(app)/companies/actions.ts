"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { bool, fail, log } from "@/lib/action-helpers";
import { encrypt } from "@/lib/crypto";
import { formObject, optionalText } from "@/lib/validation";
import { monthlyRanges, type AtDirection } from "@/lib/at/client";
import { atClientFor, getAtSettings, syncCompany } from "@/lib/at/service";
import { monthBounds, todayLisbon } from "@/lib/at/filter";
import type { ActionState } from "@/components/ActionForm";

const MAX_SYNC_MONTHS = 24;

const CompanySchema = z.object({
  name: z.string().trim().min(2).max(200),
  nif: z.string().trim().regex(/^\d{9}$/, "O NIF tem 9 dígitos"),
  email: z.union([z.literal(""), z.string().trim().email()]).transform((v) => v || null),
  notes: optionalText(5000),
  // Aceita "555555555/1" ou só "1".
  subUser: z
    .string()
    .trim()
    .transform((v) => v.replace(/^\d{9}\//, ""))
    .pipe(z.string().regex(/^\d{1,6}$/, "Indique o número do subutilizador (ex.: 1)")),
  password: z.string(),
});

export async function saveCompany(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(fd.get("id") ?? "");
  let companyId = id;
  let test: number | Error | null = null;
  try {
    const d = CompanySchema.parse(formObject(fd));
    if (!id && !d.password) return { error: "A senha do subutilizador é obrigatória." };
    const data = {
      name: d.name,
      nif: d.nif,
      email: d.email,
      notes: d.notes,
      subUser: d.subUser,
      autoSync: bool(fd.get("autoSync")),
      active: id ? bool(fd.get("active")) : true,
      ...(d.password ? { passwordEnc: encrypt(d.password) } : {}),
    };
    const duplicate = await prisma.company.findFirst({ where: { nif: d.nif, NOT: id ? { id } : undefined }, select: { name: true } });
    if (duplicate) return { error: `Já existe uma empresa com o NIF ${d.nif} (${duplicate.name}).` };
    const company = id ? await prisma.company.update({ where: { id }, data }) : await prisma.company.create({ data: data as typeof data & { passwordEnc: string } });
    companyId = company.id;
    await log(user.id, id ? "company.update" : "company.create", "company", company.id, { name: company.name, nif: company.nif, passwordChanged: !!d.password });

    // Teste de ligação com as credenciais da empresa: uma fatura do mês corrente, como adquirente.
    const today = todayLisbon();
    try {
      const client = atClientFor(await getAtSettings(), company);
      test = await client
        .queryInvoices({ direction: "received", startDate: `${today.slice(0, 7)}-01`, endDate: today, page: 1, pageSize: 1 })
        .then((r) => r.totalDocs)
        .finally(() => client.close());
    } catch (e) {
      test = e instanceof Error ? e : new Error(String(e));
    }
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/companies");
  if (!id) redirect(`/companies/${companyId}`);
  if (test instanceof Error) return { error: `Guardado, mas o teste ao webservice da AT falhou: ${test.message}` };
  return { ok: `Guardado. Ligação à AT OK (${test} fatura(s) como adquirente este mês).` };
}

export async function syncCompanyInvoices(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(fd.get("id"));
  try {
    const company = await prisma.company.findUniqueOrThrow({ where: { id } });
    const which = String(fd.get("direction") ?? "both");
    const directions: AtDirection[] = which === "issued" ? ["issued"] : which === "received" ? ["received"] : ["received", "issued"];
    const bounds = monthBounds(String(fd.get("from") ?? ""), String(fd.get("to") ?? ""));
    const today = todayLisbon();
    if (bounds.startDate > today) return { error: "O período ainda não começou." };
    const endDate = bounds.endDate > today ? today : bounds.endDate;
    if (monthlyRanges(bounds.startDate, endDate).length > MAX_SYNC_MONTHS) return { error: `Descarregue no máximo ${MAX_SYNC_MONTHS} meses de cada vez.` };

    const counts = await syncCompany(company, directions, bounds.startDate, endDate).finally(() => revalidatePath(`/companies/${id}`));
    const result = directions.map((d) => `${counts[d]} ${d === "issued" ? "emitida(s)" : "recebida(s)"}`);
    await log(user.id, "invoice.sync", "company", id, { directions, startDate: bounds.startDate, endDate, result });
    return { ok: `Descarregadas ${result.join(" e ")} de ${bounds.startDate} a ${endDate}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCompany(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(fd.get("id"));
  try {
    const company = await prisma.company.delete({ where: { id } });
    await log(user.id, "company.delete", "company", id, { name: company.name, nif: company.nif });
  } catch (e) {
    return fail(e);
  }
  redirect("/companies");
}
