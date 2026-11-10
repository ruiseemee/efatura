/**
 * Simulador local do webservice de consulta de faturas da AT (apenas para desenvolvimento/demonstração).
 *
 *   npm run mock            # http://127.0.0.1:8708
 *
 * Aceita qualquer NIF de 9 dígitos com o subutilizador 1 e a senha "secret". `npm run demo:seed` aponta a
 * "Ligação à AT" para o simulador (lê a chave em .mock-at-key.pem) e cria duas empresas de exemplo.
 */
import { constants, createDecipheriv, privateDecrypt } from "node:crypto";
import { createServer } from "node:http";
import { mockAtPrivateKey } from "./mock-at-key";

const AT_PORT = Number(process.env.MOCK_AT_PORT ?? 8708);
const AT_NS = "http://factemi.at.min_financas.pt/fatshareInvoices";
const AT_PASSWORD = "secret";
const atKey = mockAtPrivateKey();
const tag = (xml: string, name: string) => xml.match(new RegExp(`<(?:\\w+:)?${name}>\\s*([^<]*?)\\s*</(?:\\w+:)?${name}>`))?.[1];

/** Valida o SOAP:Header como a AT: chave AES do pedido cifrada com RSA, senha e data cifradas com essa chave. */
function atAuthError(xml: string): string | null {
  try {
    // PKCS#1 v1.5 retirado à mão: o Node recusa privateDecrypt com esse padding (CVE-2023-46809).
    const block = privateDecrypt({ key: atKey, padding: constants.RSA_NO_PADDING }, Buffer.from(tag(xml, "Nonce") ?? "", "base64"));
    if (block[0] !== 0 || block[1] !== 2) return "Cabeçalho de segurança inválido";
    const key = block.subarray(block.indexOf(0, 2) + 1);
    const aes = (b64: string) => {
      const d = createDecipheriv("aes-128-ecb", key, null);
      return Buffer.concat([d.update(Buffer.from(b64, "base64")), d.final()]).toString("utf8");
    };
    if (!/^\d{9}\/1$/.test(tag(xml, "Username") ?? "") || aes(tag(xml, "Password") ?? "") !== AT_PASSWORD) return "Utilizador ou senha inválidos";
    if (Math.abs(Date.now() - new Date(aes(tag(xml, "Created") ?? "")).getTime()) > 5 * 60_000) return "Data de sistema fora da tolerância";
    return null;
  } catch {
    return "Cabeçalho de segurança inválido";
  }
}

/** Faturas determinísticas para um mês: 7 como adquirente, 3 como emitente. */
function atInvoices(nifIsIssuer: boolean, start: string, end: string) {
  const month = start.slice(0, 7);
  const out: string[] = [];
  for (let i = 1; i <= (nifIsIssuer ? 3 : 7); i++) {
    const date = `${month}-${String(i * 3).padStart(2, "0")}`;
    if (date < start || date > end) continue;
    const net = 100 * i + Number(month.slice(5));
    const tax = Math.round(net * 23) / 100;
    const party = nifIsIssuer ? `<CustomerTaxID>50${i}000000</CustomerTaxID><DocumentStatus>N</DocumentStatus>` : `<TaxRegistrationNumber>50${i}123456</TaxRegistrationNumber><Sector>C0${i}</Sector>`;
    out.push(
      `<Invoice><InvoiceNo>FT ${month.replace("-", "")}/${i}</InvoiceNo><ATCUD>MOCK${month.replace("-", "")}-${i}</ATCUD><InvoiceDate>${date}</InvoiceDate><InvoiceType>FT</InvoiceType>` +
        `<SelfBillingIndicator>0</SelfBillingIndicator>${party}<CashVATSchemeIndicator>0</CashVATSchemeIndicator>` +
        `<LineSummary><TaxPointDate>${date}</TaxPointDate><DebitCreditIndicator>C</DebitCreditIndicator><TaxAmount>${tax.toFixed(2)}</TaxAmount><NetAmount>${net.toFixed(2)}</NetAmount><GrossAmount>${(net + tax).toFixed(2)}</GrossAmount><TotalTaxBase>0.00</TotalTaxBase>` +
        `<Tax><TaxType>IVA</TaxType><TaxCountryRegion>PT</TaxCountryRegion><TaxCode>NOR</TaxCode><TaxPercentage>23.00</TaxPercentage></Tax></LineSummary>` +
        `<TaxPayable>${tax.toFixed(2)}</TaxPayable><NetTotal>${net.toFixed(2)}</NetTotal><GrossTotal>${(net + tax).toFixed(2)}</GrossTotal></Invoice>`,
    );
  }
  return out;
}

const at = createServer(async (req, res) => {
  let xml = "";
  for await (const c of req) xml += c;
  const soap = (status: number, inner: string) => {
    res.writeHead(status, { "Content-Type": "text/xml; charset=utf-8" });
    res.end(`<?xml version="1.0" encoding="UTF-8"?><S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body>${inner}</S:Body></S:Envelope>`);
  };
  const state = (code: number, desc: string, list = "") => soap(200, `<InvoicesResponse xmlns="${AT_NS}">${list}<estadoExecucao><EstadoOperacao>${code}</EstadoOperacao><Desc>${desc}</Desc></estadoExecucao></InvoicesResponse>`);
  const authError = atAuthError(xml);
  if (authError) return soap(500, `<S:Fault><faultcode>S:Client</faultcode><faultstring>${authError}</faultstring></S:Fault>`);
  if (!xml.includes(`"${AT_NS}"`)) return soap(500, `<S:Fault><faultcode>S:Client</faultcode><faultstring>Pedido sem InvoicesRequest no namespace esperado</faultstring></S:Fault>`);

  const issuer = tag(xml, "TaxRegistrationNumber");
  const customer = tag(xml, "CustomerTaxID");
  const start = tag(xml, "StartDate");
  const end = tag(xml, "EndDate");
  if (!issuer === !customer) return state(310, "Estrutura: Não foi indicado nenhum NIF (TaxRegistrationNumber ou CustomerTaxID)");
  if (!start) return state(320, "Estrutura: O campo data início (StartDate) não foi preenchido (YYYY-MM-DD)");
  if (!end) return state(330, "Estrutura: O campo data fim (EndDate) não foi preenchido (YYYY-MM-DD)");
  if ((issuer ?? customer) !== tag(xml, "Username")?.split("/")[0]) return state(414, "Conteúdo: O nif indicado não corresponde ao de login");
  if (end < start) return state(432, "Conteúdo: A data fim é inferior à data início");
  if (start.slice(0, 7) !== end.slice(0, 7)) return state(434, "Conteúdo: Período indicado superior a um mês (StartDate e EndDate)");
  const size = Number(tag(xml, "nDocsPage") ?? 300);
  const page = Number(tag(xml, "nPage") ?? 1);
  if (size > 5000) return state(454, "Conteúdo: O número de documentos por página é maior que o limite de 5000");
  const all = atInvoices(!!issuer, start, end);
  const pages = Math.ceil(all.length / size);
  if (page < 1) return state(440, "Conteúdo: O número da página é inferior a 1 (nPage)");
  if (pages > 0 && page > pages) return state(444, "Conteúdo: O número da página é maior que o número total de páginas (nPage e nDocsPage)");
  const sent = all.slice((page - 1) * size, page * size);
  state(200, "Operação efetuada com sucesso", `<InvoicesList>${sent.join("")}<PaginationTotal><totalDocs>${all.length}</totalDocs><totalDocsSent>${sent.length}</totalDocsSent><totalPages>${pages}</totalPages><nPage>${page}</nPage></PaginationTotal></InvoicesList>`);
});

at.listen(AT_PORT, "127.0.0.1", () => console.log(`Mock AT (consulta de faturas) em http://127.0.0.1:${AT_PORT} (qualquer NIF, subutilizador 1, senha ${AT_PASSWORD})`));
