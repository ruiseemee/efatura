import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function audit(entry: {
  userId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Prisma.InputJsonValue;
  ip?: string | null;
}) {
  try {
    await prisma.auditLog.create({ data: { ...entry, userId: entry.userId ?? undefined, ip: entry.ip ?? undefined } });
  } catch (e) {
    console.error("audit log failed", e);
  }
}
