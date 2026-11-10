import { prisma } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";

/** Módulo sem dependências de next/* (pode ser usado fora dos pedidos HTTP). */
export const SESSION_COOKIE = "efatura_session";
export const SESSION_MAX_AGE_S = 7 * 24 * 3600;
export const SESSION_IDLE_S = 12 * 3600;

export async function createSessionRecord(userId: string, ip?: string | null, userAgent?: string | null) {
  const token = randomToken(32);
  await prisma.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      ip: ip ?? undefined,
      userAgent: userAgent?.slice(0, 300) ?? undefined,
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE_S * 1000),
    },
  });
  return token;
}

export async function findSessionUser(token: string | undefined | null) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session) return null;
  const now = Date.now();
  const idleExpired = now - session.lastSeenAt.getTime() > SESSION_IDLE_S * 1000;
  if (session.expiresAt.getTime() < now || idleExpired || !session.user.active) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (now - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return { session, user: session.user };
}
