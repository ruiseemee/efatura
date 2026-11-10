import { constants, createCipheriv, createPublicKey, publicEncrypt, randomBytes, X509Certificate, type KeyObject } from "node:crypto";
import { createSecureContext } from "node:tls";
import { Agent, fetch as undiciFetch } from "undici";
import { XMLParser } from "fast-xml-parser";

/**
 * Cliente do webservice de consulta de faturas do e-Fatura (AT), serviço "fatshare".
 * Referência: "Manual de Integração de Software – e-Fatura: Comunicação por Webservice" (aspetos genéricos e
 * específicos, outubro de 2025), operação 2.1.10 "Consultar faturas" (InvoicesRequest / InvoicesResponse).
 */

export const AT_ENDPOINTS: Record<string, string> = {
  prod: "https://servicos.portaldasfinancas.gov.pt:425/fatshare/ws/fatshareFaturas",
  test: "https://servicos.portaldasfinancas.gov.pt:725/fatshare/ws/fatshareFaturas",
};

export const AT_NAMESPACE = "http://factemi.at.min_financas.pt/fatshareInvoices";
const SOAP_NS = "http://schemas.xmlsoap.org/soap/envelope/";
const WSS_NS = "http://schemas.xmlsoap.org/ws/2002/12/secext";

/** Limite da AT: 5000 documentos por página. */
export const AT_MAX_PAGE_SIZE = 5000;

/** Certificado SSL de cliente assinado pela AT: PEM (certificado + chave privada) ou PKCS#12 (.pfx). */
export type AtTlsIdentity = { cert: string; key: string; passphrase?: string } | { pfx: Buffer; passphrase?: string };

export interface AtCredentials {
  /** "prod" | "test" ou um URL completo (útil para testes). */
  endpoint: string;
  /** NIF do sujeito passivo. */
  nif: string;
  /** Número do subutilizador (a parte depois da barra em 555555555/1). */
  subUser: string;
  password: string;
  /** Chave pública do Sistema de Autenticação do Portal das Finanças (certificado ou chave, PEM). */
  authPublicKey: string;
  /** Opcional apenas para endpoints http:// locais (simulador). */
  tls?: AtTlsIdentity;
  /** Namespace dos elementos do pedido; por omissão AT_NAMESPACE. */
  namespace?: string;
}

/** issued = faturas em que o NIF é emitente; received = faturas em que o NIF é adquirente. */
export type AtDirection = "issued" | "received";

export interface AtInvoicesQuery {
  direction: AtDirection;
  /** AAAA-MM-DD. O intervalo não pode exceder um mês. */
  startDate: string;
  endDate: string;
  page?: number;
  pageSize?: number;
}

export interface AtInvoiceLine {
  taxPointDate: string | null;
  debitCreditIndicator: string | null;
  taxAmount: string | null;
  netAmount: string | null;
  grossAmount: string | null;
  totalTaxBase: string | null;
  taxType: string | null;
  taxCountryRegion: string | null;
  taxCode: string | null;
  taxPercentage: string | null;
  totalTaxAmount: string | null;
  taxExemptionCode: string | null;
}

export interface AtInvoice {
  invoiceNo: string;
  atcud: string | null;
  invoiceDate: string;
  invoiceType: string;
  selfBilling: boolean;
  /** Preenchido nas consultas como adquirente. */
  issuerNif: string | null;
  /** Preenchidos nas consultas como emitente. */
  customerNif: string | null;
  customerCountry: string | null;
  status: string | null;
  cashVat: boolean;
  eacCode: string | null;
  sector: string | null;
  softwareCertificateNumber: string | null;
  taxPayable: string;
  netTotal: string;
  grossTotal: string;
  lines: AtInvoiceLine[];
}

export interface AtInvoicesPage {
  invoices: AtInvoice[];
  totalDocs: number;
  totalPages: number;
  page: number;
}

export class AtApiError extends Error {
  constructor(
    /** Código devolvido pela AT (EstadoOperacao), estado HTTP, ou 0 se a ligação falhou. */
    public code: number,
    message: string,
  ) {
    super(message);
    this.name = "AtApiError";
  }
}

export function resolveAtEndpoint(endpoint: string): string {
  if (/^https?:\/\//.test(endpoint)) return endpoint;
  const url = AT_ENDPOINTS[endpoint];
  if (!url) throw new Error(`Ambiente AT desconhecido: ${endpoint}`);
  return url;
}

/** Aceita um certificado X.509 (PEM ou DER, como o .cer enviado pela AT) ou uma chave pública (PEM ou DER). */
export function parseAuthPublicKey(input: string | Buffer): KeyObject {
  try {
    return new X509Certificate(input).publicKey;
  } catch {
    // não é um certificado: tentar como chave pública
  }
  try {
    return createPublicKey(input);
  } catch {
    // não é PEM
  }
  try {
    return createPublicKey({ key: Buffer.isBuffer(input) ? input : Buffer.from(input, "base64"), format: "der", type: "spki" });
  } catch {
    throw new Error("Chave pública da AT inválida: esperado um certificado (.cer/.pem) ou uma chave pública PEM");
  }
}

export interface SecurityHeader {
  username: string;
  password: string;
  nonce: string;
  created: string;
}

/**
 * Campos do SOAP:Header (secção 2.2.1 do manual): a chave simétrica AES-128 do pedido vai cifrada com RSA na
 * chave pública do Sistema de Autenticação (Nonce) e cifra a senha e a data de sistema (AES/ECB/PKCS5).
 */
export function buildSecurityHeader(opts: { username: string; password: string; publicKey: KeyObject; now?: Date; symmetricKey?: Buffer }): SecurityHeader {
  const key = opts.symmetricKey ?? randomBytes(16);
  if (key.length !== 16) throw new Error("A chave simétrica do pedido tem de ter 128 bits");
  const aes = (plain: string) => {
    const cipher = createCipheriv("aes-128-ecb", key, null);
    return Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]).toString("base64");
  };
  return {
    username: opts.username,
    password: aes(opts.password),
    nonce: publicEncrypt({ key: opts.publicKey, padding: constants.RSA_PKCS1_PADDING }, key).toString("base64"),
    created: aes((opts.now ?? new Date()).toISOString()),
  };
}

const xmlEscape = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export function buildInvoicesRequest(header: SecurityHeader, nif: string, query: AtInvoicesQuery, namespace = AT_NAMESPACE): string {
  const nifField = query.direction === "issued" ? "TaxRegistrationNumber" : "CustomerTaxID";
  const pagination =
    query.page !== undefined || query.pageSize !== undefined
      ? `<fat:Pagination><fat:nPage>${query.page ?? 1}</fat:nPage><fat:nDocsPage>${query.pageSize ?? AT_MAX_PAGE_SIZE}</fat:nDocsPage></fat:Pagination>`
      : "";
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<S:Envelope xmlns:S="${SOAP_NS}" xmlns:fat="${xmlEscape(namespace)}">` +
    `<S:Header><wss:Security xmlns:wss="${WSS_NS}"><wss:UsernameToken>` +
    `<wss:Username>${xmlEscape(header.username)}</wss:Username>` +
    `<wss:Password>${header.password}</wss:Password>` +
    `<wss:Nonce>${header.nonce}</wss:Nonce>` +
    `<wss:Created>${header.created}</wss:Created>` +
    `</wss:UsernameToken></wss:Security></S:Header>` +
    `<S:Body><fat:InvoicesRequest>` +
    `<fat:${nifField}>${xmlEscape(nif)}</fat:${nifField}>` +
    `<fat:StartDate>${xmlEscape(query.startDate)}</fat:StartDate>` +
    `<fat:EndDate>${xmlEscape(query.endDate)}</fat:EndDate>` +
    pagination +
    `</fat:InvoicesRequest></S:Body></S:Envelope>`
  );
}

// ------------------------------------------------------------------ resposta

type Node = Record<string, unknown>;

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true });

/** Procura um filho ignorando maiúsculas/minúsculas (o manual não é consistente: StartDate/startDate, nPage…). */
function child(node: unknown, name: string): unknown {
  if (!node || typeof node !== "object") return undefined;
  const wanted = name.toLowerCase();
  for (const [k, v] of Object.entries(node as Node)) if (k.toLowerCase() === wanted) return v;
  return undefined;
}

function list(value: unknown): unknown[] {
  if (value === undefined || value === null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function text(node: unknown, name: string): string | null {
  const v = child(node, name);
  if (v === undefined || v === null || typeof v === "object") return null;
  const s = String(v).trim();
  return s === "" || s === "null" ? null : s;
}

const flag = (node: unknown, name: string) => text(node, name) === "1";
const int = (node: unknown, name: string) => Number(text(node, name) ?? 0) || 0;

function parseLine(line: unknown): AtInvoiceLine {
  const tax = list(child(line, "Tax"))[0];
  return {
    taxPointDate: text(line, "TaxPointDate"),
    debitCreditIndicator: text(line, "DebitCreditIndicator"),
    taxAmount: text(line, "TaxAmount"),
    netAmount: text(line, "NetAmount"),
    grossAmount: text(line, "GrossAmount"),
    totalTaxBase: text(line, "TotalTaxBase"),
    taxType: text(tax, "TaxType"),
    taxCountryRegion: text(tax, "TaxCountryRegion"),
    taxCode: text(tax, "TaxCode"),
    taxPercentage: text(tax, "TaxPercentage"),
    totalTaxAmount: text(tax, "TotalTaxAmount"),
    taxExemptionCode: text(tax, "TaxExemptionCode"),
  };
}

function parseInvoice(inv: unknown): AtInvoice {
  const invoiceNo = text(inv, "InvoiceNo");
  const invoiceDate = text(inv, "InvoiceDate");
  if (!invoiceNo || !invoiceDate) throw new AtApiError(0, "Resposta da AT com uma fatura sem número ou sem data");
  return {
    invoiceNo,
    atcud: text(inv, "ATCUD"),
    invoiceDate: invoiceDate.slice(0, 10),
    invoiceType: text(inv, "InvoiceType") ?? "",
    selfBilling: flag(inv, "SelfBillingIndicator"),
    issuerNif: text(inv, "TaxRegistrationNumber"),
    customerNif: text(inv, "CustomerTaxID"),
    customerCountry: text(inv, "CustomerTaxIDCountry"),
    status: text(inv, "DocumentStatus"),
    cashVat: flag(inv, "CashVATSchemeIndicator"),
    eacCode: text(inv, "EACCode"),
    sector: text(inv, "Sector"),
    softwareCertificateNumber: text(inv, "SoftwareCertificateNumber"),
    taxPayable: text(inv, "TaxPayable") ?? "0",
    netTotal: text(inv, "NetTotal") ?? "0",
    grossTotal: text(inv, "GrossTotal") ?? "0",
    lines: list(child(inv, "LineSummary")).map(parseLine),
  };
}

/** Interpreta o envelope SOAP devolvido pela AT. Lança AtApiError se não for uma resposta de sucesso (código 200). */
export function parseInvoicesResponse(xml: string): AtInvoicesPage {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new AtApiError(0, "Resposta da AT ilegível (XML inválido)");
  }
  const body = child(child(doc, "Envelope"), "Body");
  const fault = child(body, "Fault");
  if (fault) throw new AtApiError(0, `AT recusou o pedido: ${text(fault, "faultstring") ?? "SOAP Fault"}`);
  const res = child(body, "InvoicesResponse");
  if (res === undefined) throw new AtApiError(0, "Resposta da AT sem InvoicesResponse");

  // O manual coloca o estado de execução ao nível da resposta; aceitar também dentro da lista.
  const invoicesList = child(res, "InvoicesList");
  const state = child(res, "estadoExecucao") ?? child(invoicesList, "estadoExecucao");
  const code = int(state, "EstadoOperacao");
  if (code !== 200) throw new AtApiError(code, `AT ${code || "?"}: ${text(state, "Desc") ?? "resposta sem estado de execução"}`);

  const invoices = list(child(invoicesList, "Invoice")).map(parseInvoice);
  const total = child(invoicesList, "PaginationTotal") ?? child(res, "PaginationTotal");
  return {
    invoices,
    totalDocs: total ? int(total, "totalDocs") : invoices.length,
    totalPages: total ? int(total, "totalPages") : 1,
    page: total ? int(total, "nPage") || 1 : 1,
  };
}

// ------------------------------------------------------------------ cliente

/** Valida o par certificado/chave (ou o PKCS#12 e a sua senha). Lança um erro legível se não corresponderem. */
export function assertTlsIdentity(tls: AtTlsIdentity) {
  try {
    createSecureContext(tls);
  } catch (e) {
    throw new Error(`Certificado SSL inválido: ${e instanceof Error ? e.message : e}`);
  }
}

export class AtClient {
  readonly url: string;
  private publicKey: KeyObject;
  private agent: Agent;

  constructor(private creds: AtCredentials) {
    this.url = resolveAtEndpoint(creds.endpoint);
    this.publicKey = parseAuthPublicKey(creds.authPublicKey);
    if (!creds.tls && this.url.startsWith("https://")) throw new Error("A AT só aceita ligações com o certificado SSL de cliente");
    if (creds.tls) assertTlsIdentity(creds.tls);
    this.agent = new Agent({ connect: { ...creds.tls, timeout: 15_000 } });
  }

  async queryInvoices(query: AtInvoicesQuery): Promise<AtInvoicesPage> {
    const header = buildSecurityHeader({ username: `${this.creds.nif}/${this.creds.subUser}`, password: this.creds.password, publicKey: this.publicKey });
    const body = buildInvoicesRequest(header, this.creds.nif, query, this.creds.namespace);
    let status: number;
    let xml: string;
    try {
      const res = await undiciFetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""', Accept: "text/xml" },
        body,
        dispatcher: this.agent,
        signal: AbortSignal.timeout(120_000),
      });
      status = res.status;
      xml = await res.text();
    } catch (e) {
      const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : e instanceof Error ? e.message : String(e);
      throw new AtApiError(0, `Webservice da AT inacessível (${new URL(this.url).host}): ${cause}`);
    }
    // Os erros SOAP chegam com HTTP 500 e um envelope com Fault: interpretar o corpo antes de olhar para o estado.
    if (/<[\w:]*Envelope[\s>]/.test(xml)) return parseInvoicesResponse(xml);
    throw new AtApiError(status, `AT respondeu HTTP ${status}${xml ? `: ${xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200)}` : ""}`);
  }

  async close() {
    await this.agent.close();
  }
}

// ------------------------------------------------------------------ períodos

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Divide um intervalo em períodos dentro do mesmo mês civil (a AT recusa períodos superiores a um mês). */
export function monthlyRanges(startDate: string, endDate: string): { startDate: string; endDate: string }[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error("Datas inválidas (AAAA-MM-DD)");
  if (end < start) throw new Error("A data de fim é anterior à data de início");
  const out: { startDate: string; endDate: string }[] = [];
  let from = start;
  while (from <= end) {
    const lastOfMonth = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
    const to = lastOfMonth < end ? lastOfMonth : end;
    out.push({ startDate: iso(from), endDate: iso(to) });
    from = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  }
  return out;
}

/** Descarrega todas as faturas de um intervalo, mês a mês e página a página. */
export async function fetchInvoices(client: AtClient, direction: AtDirection, startDate: string, endDate: string, pageSize = 1000): Promise<AtInvoice[]> {
  const all: AtInvoice[] = [];
  for (const range of monthlyRanges(startDate, endDate)) {
    for (let page = 1; ; page++) {
      const res = await client.queryInvoices({ direction, ...range, page, pageSize });
      all.push(...res.invoices);
      if (page >= res.totalPages || res.invoices.length === 0) break;
    }
  }
  return all;
}
