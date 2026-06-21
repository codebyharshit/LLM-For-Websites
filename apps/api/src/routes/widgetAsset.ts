import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

const here = dirname(fileURLToPath(import.meta.url));
// Resolve the built widget bundle whether running from dist (prod) or via tsx (dev).
const candidates = [
  process.env.WIDGET_JS_PATH,
  join(here, "../../../../packages/widget/dist/widget.js"), // dist/routes -> repo root
  join(process.cwd(), "../../packages/widget/dist/widget.js"), // cwd=apps/api
].filter((p): p is string => Boolean(p));

let cache: string | null | undefined;
function loadWidgetJs(): string | null {
  if (cache !== undefined) return cache;
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        cache = readFileSync(p, "utf8");
        return cache;
      }
    } catch {
      // try the next candidate
    }
  }
  cache = null;
  return cache;
}

/** Serves the built embeddable widget bundle so the chat bubble can be hosted from the API itself. */
export async function widgetAssetRoutes(app: FastifyInstance): Promise<void> {
  app.get("/widget.js", async (_req, reply) => {
    const js = loadWidgetJs();
    if (!js) return reply.code(404).type("text/plain").send("widget.js not built");
    return reply
      .header("Content-Type", "application/javascript; charset=utf-8")
      .header("Cache-Control", "public, max-age=300")
      .send(js);
  });
}
