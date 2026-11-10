"use server";

import { PasswordSchema } from "@/lib/validation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { hashPassword, requestIp, requireUser, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sha256 } from "@/lib/crypto";
import { SESSION_COOKIE } from "@/lib/session";
import type { ActionState } from "@/components/ActionForm";

export async function changePassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const current = String(fd.get("current") ?? "");
  const next = PasswordSchema.safeParse(fd.get("password"));
  if (!next.success) return { error: next.error.issues[0].message };
  if (next.data !== fd.get("confirm")) return { error: "As passwords não coincidem" };
  if (!(await verifyPassword(current, user.passwordHash))) return { error: "Password atual incorreta" };
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next.data) } });
  // Termina as outras sessões
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  await prisma.session.deleteMany({ where: { userId: user.id, NOT: { tokenHash: sha256(token) } } });
  await audit({ userId: user.id, action: "user.password.change", targetType: "user", targetId: user.id, ip: await requestIp() });
  return { ok: "Password alterada. As outras sessões foram terminadas." };
}
