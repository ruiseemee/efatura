"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, log } from "@/lib/action-helpers";
import { encrypt } from "@/lib/crypto";
import { formObject } from "@/lib/validation";
import { assertTlsIdentity, parseAuthPublicKey, resolveAtEndpoint } from "@/lib/at/client";
import { certificateExpiry, getAtSettings, SETTINGS_ID } from "@/lib/at/service";
import type { ActionState } from "@/components/ActionForm";

const SettingsSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .refine((v) => v === "prod" || v === "test" || /^https:\/\//.test(v) || /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(v), "Ambiente inválido"),
  tlsPassphrase: z.string(),
});

async function fileBuffer(fd: FormData, name: string): Promise<Buffer | null> {
  const f = fd.get(name);
  if (!(f instanceof File) || f.size === 0) return null;
  if (f.size > 100_000) throw new Error("Ficheiro demasiado grande para um certificado ou chave");
  return Buffer.from(await f.arrayBuffer());
}

const isPem = (b: Buffer) => b.includes("-----BEGIN");

/** Campos TLS a guardar a partir dos ficheiros enviados (certificado PEM + chave, ou PKCS#12). */
function tlsData(cert: Buffer, key: Buffer | null, passphrase: string) {
  const passEnc = passphrase ? encrypt(passphrase) : null;
  if (!isPem(cert)) {
    assertTlsIdentity({ pfx: cert, passphrase: passphrase || undefined });
    return { tlsFormat: "pfx", tlsCertEnc: encrypt(cert.toString("base64")), tlsKeyEnc: null, tlsPassphraseEnc: passEnc, tlsCertExpiresAt: null };
  }
  const certPem = cert.toString("utf8");
  // O ficheiro do certificado pode já incluir a chave privada.
  const keyPem = key ? key.toString("utf8") : certPem.includes("PRIVATE KEY-----") ? certPem : null;
  if (!keyPem) throw new Error("Envie também a chave privada (PEM) com que gerou o CSR, ou um ficheiro .pfx que a inclua");
  assertTlsIdentity({ cert: certPem, key: keyPem, passphrase: passphrase || undefined });
  return { tlsFormat: "pem", tlsCertEnc: encrypt(certPem), tlsKeyEnc: encrypt(keyPem), tlsPassphraseEnc: passEnc, tlsCertExpiresAt: certificateExpiry(certPem) };
}

export async function saveAtSettings(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  try {
    const d = SettingsSchema.parse(formObject(fd));
    const [cert, key, authKey] = await Promise.all([fileBuffer(fd, "certFile"), fileBuffer(fd, "keyFile"), fileBuffer(fd, "authKeyFile")]);
    const existing = await getAtSettings();
    if (key && !cert) return { error: "Envie a chave privada juntamente com o certificado a que pertence." };
    if (!authKey && !existing?.authPublicKey) return { error: "Envie a chave pública do Sistema de Autenticação fornecida pela AT." };
    if (resolveAtEndpoint(d.endpoint).startsWith("https://") && !cert && !existing?.tlsCertEnc) return { error: "Envie o certificado SSL assinado pela AT." };

    const data = {
      endpoint: d.endpoint,
      ...(authKey ? { authPublicKey: parseAuthPublicKey(isPem(authKey) ? authKey.toString("utf8") : authKey).export({ type: "spki", format: "pem" }).toString() } : {}),
      ...(cert ? tlsData(cert, key, d.tlsPassphrase) : {}),
    };
    await prisma.atSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, ...data }, update: data });
    await log(admin.id, "settings.at.update", "atSettings", SETTINGS_ID, { endpoint: d.endpoint, certificateReplaced: !!cert, authKeyReplaced: !!authKey });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/settings");
  revalidatePath("/companies");
  return { ok: "Ligação à AT guardada. Teste-a guardando ou descarregando uma empresa." };
}
