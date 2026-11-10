import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getAtSettings, settingsProblem, SETTINGS_ID, syncCompany } from "./service";
import { previousMonthStart, todayLisbon } from "./filter";

/** Hora (de Lisboa) a partir da qual corre a descarga automática diária. */
const AUTO_SYNC_HOUR = Number(process.env.AUTO_SYNC_HOUR ?? 6);
const CHECK_INTERVAL_MS = 15 * 60_000;

let running = false;

function lisbonHour(): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", hour12: false }).format(new Date()));
}

/**
 * Descarga automática: uma vez por dia, mês corrente e mês anterior (emitidas e recebidas) de todas as empresas
 * ativas com descarga automática. Uma empresa que falhe não impede as restantes; o erro fica registado na empresa.
 */
export async function runAutoSync(force = false): Promise<{ ok: number; failed: number } | null> {
  if (running) return null;
  running = true;
  try {
    const today = todayLisbon();
    const settings = await getAtSettings();
    if (settingsProblem(settings)) return null;
    if (!force && (settings!.lastAutoSyncDay === today || lisbonHour() < AUTO_SYNC_HOUR)) return null;
    // Marca o dia antes de começar: se o processo reiniciar a meio, não repete a descarga inteira no mesmo dia.
    await prisma.atSettings.update({ where: { id: SETTINGS_ID }, data: { lastAutoSyncDay: today } });

    const companies = await prisma.company.findMany({ where: { active: true, autoSync: true }, orderBy: { name: "asc" } });
    let ok = 0;
    let failed = 0;
    for (const company of companies) {
      try {
        await syncCompany(company, ["received", "issued"], previousMonthStart(today), today);
        ok++;
      } catch (e) {
        failed++;
        console.error(`[auto-sync] ${company.nif} ${company.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
    await audit({ action: "invoice.autosync", details: { day: today, companies: companies.length, ok, failed } });
    console.log(`[auto-sync] ${today}: ${ok} empresa(s) descarregada(s), ${failed} com erro`);
    return { ok, failed };
  } catch (e) {
    console.error("[auto-sync] falhou", e);
    return null;
  } finally {
    running = false;
  }
}

export function startAutoSync() {
  if (process.env.AUTO_SYNC === "off") return;
  const tick = () => void runAutoSync();
  setTimeout(tick, 30_000);
  setInterval(tick, CHECK_INTERVAL_MS).unref();
}
