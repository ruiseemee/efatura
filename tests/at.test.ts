import { describe, expect, it } from "vitest";
import { constants, createDecipheriv, generateKeyPairSync, privateDecrypt } from "node:crypto";
import { AtApiError, buildInvoicesRequest, buildSecurityHeader, monthlyRanges, parseAuthPublicKey, parseInvoicesResponse, resolveAtEndpoint } from "@/lib/at/client";
import { invoiceRecord } from "@/lib/at/service";
import { decrypt, encrypt } from "@/lib/crypto";
import { invoiceWhere, monthBounds, previousMonthStart } from "@/lib/at/filter";
import { settingsProblem } from "@/lib/at/service";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

const envelope = (body: string) => `<?xml version="1.0"?><S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body>${body}</S:Body></S:Envelope>`;
const response = (list: string, code = 200, desc = "Operação efetuada com sucesso") =>
  envelope(`<ns2:InvoicesResponse xmlns:ns2="http://factemi.at.min_financas.pt/fatshareInvoices">${list}<ns2:estadoExecucao><ns2:EstadoOperacao>${code}</ns2:EstadoOperacao><ns2:Desc>${desc}</ns2:Desc></ns2:estadoExecucao></ns2:InvoicesResponse>`);
const invoiceXml = (no: string) =>
  `<ns2:Invoice><ns2:InvoiceNo>${no}</ns2:InvoiceNo><ns2:ATCUD>ABCD1234-1</ns2:ATCUD><ns2:InvoiceDate>2024-01-15</ns2:InvoiceDate><ns2:InvoiceType>FT</ns2:InvoiceType>` +
  `<ns2:SelfBillingIndicator>0</ns2:SelfBillingIndicator><ns2:TaxRegistrationNumber>501234567</ns2:TaxRegistrationNumber><ns2:CashVATSchemeIndicator>1</ns2:CashVATSchemeIndicator><ns2:Sector>null</ns2:Sector>` +
  `<ns2:LineSummary><ns2:TaxPointDate>2024-01-15</ns2:TaxPointDate><ns2:TaxAmount>23.00</ns2:TaxAmount><ns2:NetAmount>100.00</ns2:NetAmount><ns2:GrossAmount>123.00</ns2:GrossAmount>` +
  `<ns2:Tax><ns2:TaxType>IVA</ns2:TaxType><ns2:TaxCountryRegion>PT</ns2:TaxCountryRegion><ns2:TaxCode>NOR</ns2:TaxCode><ns2:TaxPercentage>23.00</ns2:TaxPercentage></ns2:Tax></ns2:LineSummary>` +
  `<ns2:TaxPayable>23.00</ns2:TaxPayable><ns2:NetTotal>100.00</ns2:NetTotal><ns2:GrossTotal>123.00</ns2:GrossTotal></ns2:Invoice>`;
const pagination = (docs: number, pages: number) =>
  `<ns2:PaginationTotal><ns2:totalDocs>${docs}</ns2:totalDocs><ns2:totalDocsSent>${docs}</ns2:totalDocsSent><ns2:totalPages>${pages}</ns2:totalPages><ns2:nPage>1</ns2:nPage></ns2:PaginationTotal>`;

describe("AT: cabeçalho de segurança", () => {
  it("cifra a senha e a data com a chave do pedido, e a chave com a chave pública da AT", () => {
    const now = new Date("2026-11-10T12:00:00.000Z");
    const h = buildSecurityHeader({ username: "599999993/37", password: "sênha-PF", publicKey, now });
    // PKCS#1 v1.5, como o Sistema de Autenticação espera (retirado à mão: o Node recusa-o em privateDecrypt).
    const block = privateDecrypt({ key: privateKey, padding: constants.RSA_NO_PADDING }, Buffer.from(h.nonce, "base64"));
    expect([block[0], block[1]]).toEqual([0, 2]);
    const key = block.subarray(block.indexOf(0, 2) + 1);
    expect(key.length).toBe(16);
    const aes = (b64: string) => {
      const d = createDecipheriv("aes-128-ecb", key, null);
      return Buffer.concat([d.update(Buffer.from(b64, "base64")), d.final()]).toString("utf8");
    };
    expect(h.username).toBe("599999993/37");
    expect(aes(h.password)).toBe("sênha-PF");
    expect(aes(h.created)).toBe("2026-11-10T12:00:00.000Z");
  });
  it("usa uma chave diferente em cada pedido", () => {
    const a = buildSecurityHeader({ username: "u", password: "p", publicKey });
    const b = buildSecurityHeader({ username: "u", password: "p", publicKey });
    expect(a.password).not.toBe(b.password);
  });
  it("aceita a chave pública em PEM e recusa lixo", () => {
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(parseAuthPublicKey(pem).equals(publicKey)).toBe(true);
    expect(parseAuthPublicKey(publicKey.export({ type: "spki", format: "der" })).equals(publicKey)).toBe(true);
    expect(() => parseAuthPublicKey("não é uma chave")).toThrow(/Chave pública da AT inválida/);
  });
});

describe("AT: pedido", () => {
  const header = { username: "599999993/1", password: "PW==", nonce: "NONCE==", created: "CREATED==" };
  it("consulta como adquirente com CustomerTaxID", () => {
    const xml = buildInvoicesRequest(header, "599999993", { direction: "received", startDate: "2024-01-01", endDate: "2024-01-31", page: 2, pageSize: 300 });
    expect(xml).toContain('xmlns:fat="http://factemi.at.min_financas.pt/fatshareInvoices"');
    expect(xml).toContain("<wss:Username>599999993/1</wss:Username><wss:Password>PW==</wss:Password><wss:Nonce>NONCE==</wss:Nonce><wss:Created>CREATED==</wss:Created>");
    expect(xml).toContain(
      "<fat:InvoicesRequest><fat:CustomerTaxID>599999993</fat:CustomerTaxID><fat:StartDate>2024-01-01</fat:StartDate><fat:EndDate>2024-01-31</fat:EndDate>" +
        "<fat:Pagination><fat:nPage>2</fat:nPage><fat:nDocsPage>300</fat:nDocsPage></fat:Pagination></fat:InvoicesRequest>",
    );
    expect(xml).not.toContain("TaxRegistrationNumber");
  });
  it("consulta como emitente com TaxRegistrationNumber", () => {
    const xml = buildInvoicesRequest(header, "599999993", { direction: "issued", startDate: "2024-01-01", endDate: "2024-01-31" });
    expect(xml).toContain("<fat:TaxRegistrationNumber>599999993</fat:TaxRegistrationNumber>");
    expect(xml).not.toContain("CustomerTaxID");
    expect(xml).not.toContain("Pagination");
  });
  it("resolve ambientes", () => {
    expect(resolveAtEndpoint("prod")).toBe("https://servicos.portaldasfinancas.gov.pt:425/fatshare/ws/fatshareFaturas");
    expect(resolveAtEndpoint("test")).toContain(":725/");
    expect(resolveAtEndpoint("http://127.0.0.1:8708")).toBe("http://127.0.0.1:8708");
    expect(() => resolveAtEndpoint("xpto")).toThrow();
  });
});

describe("AT: resposta", () => {
  it("lê faturas, linhas e paginação", () => {
    const page = parseInvoicesResponse(response(`<ns2:InvoicesList>${invoiceXml("FT A/1")}${invoiceXml("FT A/2")}${pagination(2, 1)}</ns2:InvoicesList>`));
    expect(page).toMatchObject({ totalDocs: 2, totalPages: 1, page: 1 });
    expect(page.invoices).toHaveLength(2);
    expect(page.invoices[0]).toMatchObject({ invoiceNo: "FT A/1", atcud: "ABCD1234-1", invoiceDate: "2024-01-15", invoiceType: "FT", issuerNif: "501234567", customerNif: null, sector: null, selfBilling: false, cashVat: true, netTotal: "100.00", taxPayable: "23.00", grossTotal: "123.00" });
    expect(page.invoices[0].lines).toEqual([expect.objectContaining({ netAmount: "100.00", taxType: "IVA", taxCode: "NOR", taxPercentage: "23.00" })]);
  });
  it("uma única fatura não é confundida com uma lista vazia", () => {
    expect(parseInvoicesResponse(response(`<ns2:InvoicesList>${invoiceXml("FT A/1")}${pagination(1, 1)}</ns2:InvoicesList>`)).invoices).toHaveLength(1);
  });
  it("aceita um período sem faturas", () => {
    expect(parseInvoicesResponse(response(`<ns2:InvoicesList>${pagination(0, 0)}</ns2:InvoicesList>`))).toMatchObject({ invoices: [], totalDocs: 0, totalPages: 0 });
    expect(parseInvoicesResponse(response("")).invoices).toEqual([]);
  });
  it("converte os códigos de erro da AT", () => {
    const err = (() => {
      try {
        parseInvoicesResponse(response("", 434, "Conteúdo: Período indicado superior a um mês"));
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(AtApiError);
    expect((err as AtApiError).code).toBe(434);
    expect((err as AtApiError).message).toContain("superior a um mês");
  });
  it("converte SOAP Faults e respostas ilegíveis", () => {
    expect(() => parseInvoicesResponse(envelope("<S:Fault><faultcode>33</faultcode><faultstring>CustomerTaxID may not be empty</faultstring></S:Fault>"))).toThrow(/may not be empty/);
    expect(() => parseInvoicesResponse(envelope("<outra/>"))).toThrow(/sem InvoicesResponse/);
    expect(() => parseInvoicesResponse(response(`<ns2:InvoicesList><ns2:Invoice><ns2:InvoiceType>FT</ns2:InvoiceType></ns2:Invoice></ns2:InvoicesList>`))).toThrow(/sem número/);
  });
});

describe("AT: períodos e registos", () => {
  it("divide o intervalo por meses civis", () => {
    expect(monthlyRanges("2024-01-15", "2024-03-10")).toEqual([
      { startDate: "2024-01-15", endDate: "2024-01-31" },
      { startDate: "2024-02-01", endDate: "2024-02-29" },
      { startDate: "2024-03-01", endDate: "2024-03-10" },
    ]);
    expect(monthlyRanges("2025-12-31", "2026-01-01")).toHaveLength(2);
    expect(monthlyRanges("2024-05-05", "2024-05-05")).toEqual([{ startDate: "2024-05-05", endDate: "2024-05-05" }]);
    expect(() => monthlyRanges("2024-02-01", "2024-01-01")).toThrow();
    expect(() => monthlyRanges("x", "2024-01-01")).toThrow();
  });
  it("limites de um intervalo de meses", () => {
    expect(monthBounds("2024-02", "2024-02")).toEqual({ startDate: "2024-02-01", endDate: "2024-02-29" });
    expect(monthBounds("2025-11", "2026-01")).toEqual({ startDate: "2025-11-01", endDate: "2026-01-31" });
    expect(() => monthBounds("2024-13", "2024-12")).toThrow();
    expect(() => monthBounds("2024-05", "2024-04")).toThrow();
  });
  it("preenche o NIF da própria conta consoante o sentido", () => {
    const inv = parseInvoicesResponse(response(`<ns2:InvoicesList>${invoiceXml("FT A/1")}</ns2:InvoicesList>`)).invoices[0];
    expect(invoiceRecord("599999993", "received", inv)).toMatchObject({ direction: "RECEIVED", issuerNif: "501234567", customerNif: "599999993", invoiceDate: new Date("2024-01-15T00:00:00Z") });
    expect(invoiceRecord("599999993", "issued", { ...inv, issuerNif: null, customerNif: "501234567" })).toMatchObject({ direction: "ISSUED", issuerNif: "599999993", customerNif: "501234567" });
  });
  it("filtro da listagem", () => {
    expect(invoiceWhere("a1", {})).toEqual({ companyId: "a1", direction: "RECEIVED" });
    expect(invoiceWhere("a1", { dir: "issued", from: "2024-02", to: "2024-02", q: " FT " })).toMatchObject({
      direction: "ISSUED",
      invoiceDate: { gte: new Date("2024-02-01T00:00:00Z"), lte: new Date("2024-02-29T00:00:00Z") },
      OR: expect.arrayContaining([{ invoiceNo: { contains: "FT", mode: "insensitive" } }]),
    });
    expect(invoiceWhere("a1", { from: "lixo" })).not.toHaveProperty("invoiceDate");
  });
  it("mês anterior para a descarga automática", () => {
    expect(previousMonthStart("2026-11-10")).toBe("2026-10-01");
    expect(previousMonthStart("2026-01-31")).toBe("2025-12-01");
    expect(previousMonthStart("2026-03-31")).toBe("2026-02-01");
  });
  it("diz o que falta na ligação à AT", () => {
    const base = { id: "default", endpoint: "prod", tlsFormat: null, tlsCertEnc: null, tlsKeyEnc: null, tlsPassphraseEnc: null, tlsCertExpiresAt: null, authPublicKey: null, lastAutoSyncDay: null, updatedAt: new Date() };
    expect(settingsProblem(null)).toMatch(/chave pública/);
    expect(settingsProblem({ ...base, authPublicKey: "pem" })).toMatch(/certificado SSL/);
    expect(settingsProblem({ ...base, authPublicKey: "pem", tlsCertEnc: "x" })).toBeNull();
    // O simulador local (http) não precisa de certificado.
    expect(settingsProblem({ ...base, authPublicKey: "pem", endpoint: "http://127.0.0.1:8708" })).toBeNull();
  });
});

describe("crypto", () => {
  it("cifra e decifra, e deteta adulteração", () => {
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const enc = encrypt("senha-do-subutilizador");
    expect(enc).not.toContain("senha");
    expect(decrypt(enc)).toBe("senha-do-subutilizador");
    const parts = enc.split(":");
    parts[3] = Buffer.from("y").toString("base64");
    expect(() => decrypt(parts.join(":"))).toThrow();
  });
});
