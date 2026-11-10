"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { endSession, hashPassword, requestIp, startSession, verifyPassword } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";

const LoginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

// Hash fictício para equalizar o tempo de resposta quando o utilizador não existe.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword(randomToken(16)));

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const parsed = LoginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Indique email e password." };
  const { email, password } = parsed.data;
  const ip = (await requestIp()) ?? "unknown";
  if (!rateLimit(`login:${ip}`, 20, 15 * 60_000) || !rateLimit(`login:${email}`, 8, 15 * 60_000)) {
    return { error: "Demasiadas tentativas. Aguarde alguns minutos." };
  }
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok || !user.active) {
    await audit({ userId: user?.id, action: "auth.login.failed", details: { email }, ip });
    return { error: "Credenciais inválidas." };
  }
  resetRateLimit(`login:${email}`);
  await startSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, action: "auth.login", ip });
  redirect("/companies");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
