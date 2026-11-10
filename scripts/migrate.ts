/**
 * Aplica as migrações SQL em prisma/migrations sem usar o motor nativo do Prisma
 * (que pode falhar com "Segmentation fault" em alguns CPUs virtuais).
 *
 * Compatível com `prisma migrate`: as migrações já registadas em _prisma_migrations são consideradas aplicadas.
 *   node dist/migrate.js
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";

const MIGRATIONS_DIR = path.resolve(process.env.MIGRATIONS_DIR ?? "prisma/migrations");
const LOCK_ID = 726354; // pg_advisory_lock: evita duas instâncias a migrar em simultâneo

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não definida");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS "_app_migrations" (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    const applied = new Set<string>((await client.query(`SELECT name FROM "_app_migrations"`)).rows.map((r) => r.name));
    const prismaTable = await client.query(`SELECT to_regclass('public._prisma_migrations') AS t`);
    if (prismaTable.rows[0].t) {
      const rows = await client.query(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`);
      for (const r of rows.rows) applied.add(r.migration_name);
    }

    const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(path.join(MIGRATIONS_DIR, d.name, "migration.sql")))
      .map((d) => d.name)
      .sort();

    let count = 0;
    for (const name of dirs) {
      if (applied.has(name)) continue;
      const sql = readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      console.log(`→ ${name}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(`INSERT INTO "_app_migrations" (name, checksum) VALUES ($1, $2)`, [name, checksum]);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error(`Migração ${name} falhou: ${e instanceof Error ? e.message : e}`);
      }
      count++;
    }
    console.log(count ? `${count} migração(ões) aplicada(s).` : "Base de dados atualizada (sem migrações pendentes).");
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => undefined);
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
