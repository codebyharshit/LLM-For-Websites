import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

let loaded = false;

/**
 * Load the monorepo-root `.env` once. Scripts run from a package subdirectory (cwd =
 * packages/* or apps/*), so we walk up to find it. dotenv does NOT override variables
 * already set in the environment, so explicit env / CI values win.
 */
export function loadDotenv(): void {
  if (loaded) return;
  loaded = true;
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate)) {
      config({ path: candidate });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}
