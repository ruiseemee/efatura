import { z } from "zod";
import { audit } from "@/lib/audit";
import { requestIp } from "@/lib/auth";
import type { ActionState } from "@/components/ActionForm";

/** Converte uma exceção de uma server action numa mensagem para o formulário. */
export function fail(e: unknown): ActionState {
  if (e instanceof z.ZodError) return { error: e.issues.map((i) => `${i.path.join(".") || "campo"}: ${i.message}`).join("; ") };
  if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") return { error: "Já existe um registo com esse valor único." };
  if (e instanceof Error) return { error: e.message };
  return { error: "Erro desconhecido" };
}

export async function log(userId: string, action: string, targetType: string, targetId: string, details?: Record<string, unknown>) {
  await audit({ userId, action, targetType, targetId, details: details as never, ip: await requestIp() });
}

/** Valor de uma checkbox de formulário. */
export const bool = (v: unknown) => v === "on" || v === "true" || v === "1";
