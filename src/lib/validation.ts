import { z } from "zod";

export const PasswordSchema = z.string().min(12, "A password deve ter pelo menos 12 caracteres").max(200);

/** Converte campos vazios de formulários em undefined. */
export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export function formObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  return out;
}
