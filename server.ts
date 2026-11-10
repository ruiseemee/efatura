/**
 * Servidor HTTP: serve a aplicação Next.js e corre a descarga automática diária das faturas.
 */
import { createServer } from "node:http";
import next from "next";
import { startAutoSync } from "@/lib/at/auto-sync";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const upgradeNext = app.getUpgradeHandler();
  const server = createServer((req, res) => handle(req, res));
  server.on("upgrade", (req, socket, head) => upgradeNext(req, socket, head));
  server.listen(port, hostname, () => {
    console.log(`> e-Fatura em http://${hostname}:${port} (${dev ? "dev" : "produção"})`);
    startAutoSync();
  });
});
