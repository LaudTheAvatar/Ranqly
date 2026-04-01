/**
 * Single process: Express API (/api/*, /health) + Next.js on PORT (default 3000).
 */
import path from "path";
import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import { createServer } from "http";
import { parse } from "url";

function loadRootEnv(): void {
  const root = process.cwd();
  for (const name of [".env.local", ".env", path.join("backend", ".env")]) {
    const p = path.resolve(root, name);
    if (existsSync(p)) loadEnv({ path: p });
  }
}

loadRootEnv();

async function main(): Promise<void> {
  const next = (await import("next")).default;
  const { createApiApp } = await import("./backend/src/createApiApp");

  const dev = process.env.NODE_ENV !== "production";
  // Never use HOSTNAME for bind — Linux/PaaS set it to the container hostname and
  // the proxy cannot reach the process (502 / gateway timeout).
  const listenHost = process.env.LISTEN_HOST?.trim() || "0.0.0.0";
  const port = Number(process.env.PORT ?? 3000);

  const nextApp = next({ dev, dir: process.cwd() });
  await nextApp.prepare();
  const handle = nextApp.getRequestHandler();

  const apiApp = createApiApp();

  createServer((req, res) => {
    try {
      const parsed = parse(req.url ?? "", true);
      const pathname = parsed.pathname ?? "";
      if (pathname.startsWith("/api") || pathname === "/health") {
        apiApp(req, res);
        return;
      }
      void handle(req, res, parsed);
    } catch (err) {
      console.error("Request error", err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  }).listen(port, listenHost, () => {
    console.log(
      `Ranqly ready at http://${listenHost === "0.0.0.0" ? "localhost" : listenHost}:${port} (Next.js + API)`
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
