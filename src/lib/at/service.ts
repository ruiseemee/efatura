import { X509Certificate } from "node:crypto";
import type { AtSettings, Company, InvoiceDirection, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { AtClient, fetchInvoices, resolveAtEndpoint, type AtDirection, type AtInvoice, type AtTlsIdentity } from "./client";

export const SETTINGS_ID = "default";

export function getAtSettings(): Promise<AtSettings | null> {
  return prisma.atSettings.findUnique({ where: { id: SETTINGS_ID } });
}

export function atTlsFor(s: Pick<AtSettings, "tlsFormat" | "tlsCertEnc" | "tlsKeyEnc" | "tlsPassphraseEnc">): AtTlsIdentity | undefined {
  if (!s.tlsCertEnc) return undefined;
  const passphrase = s.tlsPassphraseEnc ? decrypt(s.tlsPassphraseEnc) : undefined;
  if (s.tlsFormat === "pfx") return { pfx: Buffer.from(decrypt(s.tlsCertEnc), "base64"), passphrase };
  if (!s.tlsKeyEnc) throw new Error("Falta a chave privada do certificado SSL");
  return { cert: decrypt(s.tlsCertEnc), key: decrypt(s.tlsKeyEnc), passphrase };
}

/** O que falta configurar para se poder ligar à AT (null se estiver tudo). */
export function settingsProblem(s: AtSettings | null): string | null {
  if (!s?.authPublicKey) return "Falta a chave pública do Sistema de Autenticação da AT. Configure-a em “Ligação à AT”.";
  if (!s.tlsCertEnc && resolveAtEndpoint(s.endpoint).startsWith("https://")) return "Falta o certificado SSL assinado pela AT. Configure-o em “Ligação à AT”.";
  return null;
}

export function atClientFor(settings: AtSettings | null, company: Pick<Company, "nif" | "subUser" | "passwordEnc">): AtClient {
  const problem = settingsProblem(settings);
  if (problem) throw new Error(problem);
  return new AtClient({
    endpoint: settings!.endpoint,
    nif: company.nif,
    subUser: company.subUser,
    password: decrypt(company.passwordEnc),
    authPublicKey: settings!.authPublicKey!,
    tls: atTlsFor(settings!),
  });
}

/** Fim da validade de um certificado PEM (null se não for possível determinar, p. ex. PKCS#12). */
export function certificateExpiry(pem: string): Date | null {
  try {
    return new X509Certificate(pem).validToDate;
  } catch {
    return null;
  }
}

const DIRECTION: Record<AtDirection, InvoiceDirection> = { issued: "ISSUED", received: "RECEIVED" };

/** Converte uma fatura devolvida pela AT no registo a guardar. */
export function invoiceRecord(companyNif: string, direction: AtDirection, inv: AtInvoice) {
  const { lines, eacCode, sector, softwareCertificateNumber } = inv;
  return {
    direction: DIRECTION[direction],
    // Como emitente, a AT não repete o NIF do próprio; como adquirente, não repete o do adquirente.
    issuerNif: direction === "issued" ? companyNif : (inv.issuerNif ?? ""),
    customerNif: direction === "received" ? companyNif : inv.customerNif,
    customerCountry: inv.customerCountry,
    invoiceNo: inv.invoiceNo,
    atcud: inv.atcud,
    invoiceDate: new Date(`${inv.invoiceDate}T00:00:00Z`),
    invoiceType: inv.invoiceType,
    status: inv.status,
    selfBilling: inv.selfBilling,
    cashVat: inv.cashVat,
    netTotal: inv.netTotal,
    taxPayable: inv.taxPayable,
    grossTotal: inv.grossTotal,
    details: { lines, eacCode, sector, softwareCertificateNumber } as unknown as Prisma.InputJsonValue,
  };
}

/**
 * Descarrega as faturas de uma empresa no intervalo e guarda-as (cria ou atualiza).
 * Devolve quantas recebeu por sentido. Regista o resultado na empresa (lastSyncAt / lastSyncError).
 */
export async function syncCompany(company: Company, directions: AtDirection[], startDate: string, endDate: string): Promise<Record<AtDirection, number>> {
  const counts: Record<AtDirection, number> = { issued: 0, received: 0 };
  try {
    const client = atClientFor(await getAtSettings(), company);
    try {
      for (const direction of directions) {
        const invoices = await fetchInvoices(client, direction, startDate, endDate);
        const fetchedAt = new Date();
        for (let i = 0; i < invoices.length; i += 100) {
          await prisma.$transaction(
            invoices.slice(i, i + 100).map((inv) => {
              const data = { ...invoiceRecord(company.nif, direction, inv), fetchedAt };
              const key = { companyId: company.id, direction: data.direction, issuerNif: data.issuerNif, invoiceNo: data.invoiceNo };
              return prisma.invoice.upsert({ where: { companyId_direction_issuerNif_invoiceNo: key }, create: { ...data, companyId: company.id }, update: data });
            }),
          );
        }
        counts[direction] = invoices.length;
      }
    } finally {
      await client.close();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.company.update({ where: { id: company.id }, data: { lastSyncError: message.slice(0, 500) } }).catch(() => undefined);
    throw e;
  }
  await prisma.company.update({ where: { id: company.id }, data: { lastSyncAt: new Date(), lastSyncError: null } });
  return counts;
}
