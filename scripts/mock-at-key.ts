/** Chave RSA do simulador da AT (faz de "Sistema de Autenticação"). Gerada na primeira utilização; só para desenvolvimento. */
import { createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const FILE = ".mock-at-key.pem";

export function mockAtPrivateKey(): KeyObject {
  if (!existsSync(FILE)) {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    writeFileSync(FILE, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  }
  return createPrivateKey(readFileSync(FILE));
}

export function mockAtPublicKeyPem(): string {
  return createPublicKey(mockAtPrivateKey()).export({ type: "spki", format: "pem" }).toString();
}
