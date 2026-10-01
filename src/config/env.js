import dotenv from "dotenv";
import { accessSync, constants, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: join(root, ".env") });

function writable(dir) {
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

// DATA_DIR usually points at a persistent disk (e.g. /var/data on Render). If
// that disk is not mounted the directory cannot be created, so fall back to
// ./data and warn instead of crashing on boot. Data there is lost on redeploy.
function resolveDataDir() {
  const fallback = join(root, "data");
  const wanted = resolve(process.env.DATA_DIR || fallback);
  if (wanted === fallback || writable(wanted)) return { dir: wanted, problem: null };
  const problem = `DATA_DIR "${wanted}" is not writable (is the persistent disk mounted?) — using ${fallback}, which is wiped on every redeploy`;
  console.warn(`[compute] WARNING: ${problem}`);
  return { dir: fallback, problem };
}

const data = resolveDataDir();
export const ROOT_DIR = root;
export const DATA_DIR = data.dir;
export const DATA_DIR_PROBLEM = data.problem;
