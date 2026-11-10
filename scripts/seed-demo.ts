/**
 * Dados de demonstração que apontam para o simulador (npm run mock). NÃO usar em produção.
 *   npm run demo:seed
 */
import { encrypt } from "../src/lib/crypto";
import { prisma } from "../src/lib/db";
import { mockAtPublicKeyPem } from "./mock-at-key";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Não executar em produção");
  const settings = { endpoint: "http://127.0.0.1:8708", authPublicKey: mockAtPublicKeyPem() };
  await prisma.atSettings.upsert({ where: { id: "default" }, create: { id: "default", ...settings }, update: settings });
  for (const c of [
    { name: "Empresa Exemplo A, Lda", nif: "599999993" },
    { name: "Empresa Exemplo B, SA", nif: "598888884" },
  ]) {
    await prisma.company.upsert({ where: { nif: c.nif }, create: { ...c, subUser: "1", passwordEnc: encrypt("secret") }, update: {} });
  }
  console.log("Demo criada: ligação à AT a apontar para o simulador e duas empresas (subutilizador 1, senha secret).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
