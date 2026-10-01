import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR } from "../config/env.js";

// The harvest loop (what Phaser does with human-verified parts): when a
// creator or reviewer rates a finished game highly, its code is stored as an
// example for its recipe family. The Engineer sees the best-rated example next
// to the seed recipe, so the studio's output improves with every good build.

const LIB_DIR = join(DATA_DIR, "library");

export async function harvest({ run, rating, notes = "" }) {
  const pkg = run.result?.package;
  const code = run.result?.gameCode;
  if (!pkg || !code) throw Object.assign(new Error("Run has no finished game to harvest"), { status: 409 });
  const recipe = run.result.recipe;
  const dir = join(LIB_DIR, recipe);
  await mkdir(dir, { recursive: true });
  const entry = { runId: run.id, recipe, title: pkg.title, prompt: run.input.prompt, rating: Number(rating), notes, code, createdAt: Date.now() };
  await writeFile(join(dir, `${run.id}.json`), JSON.stringify(entry));
  return { recipe, runId: run.id, rating: entry.rating };
}

export async function bestExample(recipe, { minRating = 4 } = {}) {
  const dir = join(LIB_DIR, recipe);
  let best = null;
  for (const file of await readdir(dir).catch(() => [])) {
    try {
      const entry = JSON.parse(await readFile(join(dir, file), "utf8"));
      if (entry.rating >= minRating && (!best || entry.rating > best.rating || (entry.rating === best.rating && entry.createdAt > best.createdAt))) best = entry;
    } catch { /* skip bad entry */ }
  }
  return best;
}

export async function listLibrary() {
  const out = [];
  for (const recipe of await readdir(LIB_DIR).catch(() => [])) {
    for (const file of await readdir(join(LIB_DIR, recipe)).catch(() => [])) {
      try {
        const { code, ...meta } = JSON.parse(await readFile(join(LIB_DIR, recipe, file), "utf8"));
        out.push({ ...meta, lines: String(code).split("\n").length });
      } catch { /* skip */ }
    }
  }
  return out.sort((a, b) => b.rating - a.rating);
}
