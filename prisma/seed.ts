import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12) throw new Error("Defina SEED_ADMIN_PASSWORD (mínimo 12 caracteres)");
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Administrador ${email} já existe — nada a fazer.`);
    return;
  }
  await prisma.user.create({ data: { email, name: "Administrador", role: "ADMIN", passwordHash: await bcrypt.hash(password, 12) } });
  console.log(`Administrador ${email} criado.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
