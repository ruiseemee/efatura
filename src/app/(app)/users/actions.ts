"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, requireAdmin } from "@/lib/auth";
import { bool, fail, log } from "@/lib/action-helpers";
import { formObject, PasswordSchema } from "@/lib/validation";
import type { ActionState } from "@/components/ActionForm";

const UserSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["ADMIN", "USER"]),
});

export async function createUser(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  try {
    const data = UserSchema.parse(formObject(fd));
    const password = PasswordSchema.parse(fd.get("password"));
    const user = await prisma.user.create({ data: { ...data, passwordHash: await hashPassword(password) } });
    await log(admin.id, "user.create", "user", user.id, { email: user.email, role: user.role });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/users");
  return { ok: "Utilizador criado. Comunique a password ao utilizador por um canal seguro." };
}

export async function updateUser(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = String(fd.get("id"));
  try {
    const data = UserSchema.parse(formObject(fd));
    const active = bool(fd.get("active"));
    if (id === admin.id && (!active || data.role !== "ADMIN")) return { error: "Não pode desativar nem retirar o papel de administrador à sua própria conta." };
    const pw = String(fd.get("password") ?? "");
    const passwordHash = pw ? await hashPassword(PasswordSchema.parse(pw)) : undefined;
    await prisma.user.update({ where: { id }, data: { ...data, active, ...(passwordHash ? { passwordHash } : {}) } });
    if (!active || passwordHash) await prisma.session.deleteMany({ where: { userId: id } });
    await log(admin.id, "user.update", "user", id, { email: data.email, role: data.role, active, passwordReset: !!passwordHash });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/users");
  return { ok: "Utilizador atualizado." };
}
