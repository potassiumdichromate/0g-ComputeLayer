import { mkdir, readFile, readdir, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../config/env.js";

// Durable run state: every node transition is written to data/runs/<id>/run.json
// (debounced, atomic rename). On boot, unfinished runs are reloaded and the
// executor resumes them from their last completed node. Swap for Mongo by
// keeping the same four methods.

export class RunStore {
  constructor(dir = join(DATA_DIR, "runs")) {
    this.dir = dir;
    this.runs = new Map();
    this.timers = new Map();
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
    for (const id of await readdir(this.dir).catch(() => [])) {
      const file = join(this.dir, id, "run.json");
      if (!existsSync(file)) continue;
      try { this.runs.set(id, JSON.parse(await readFile(file, "utf8"))); } catch { /* corrupt run file */ }
    }
  }

  get(id) { return this.runs.get(id) ?? null; }

  list({ limit = 50 } = {}) {
    return [...this.runs.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  put(run) {
    this.runs.set(run.id, run);
    this.save(run);
    return run;
  }

  save(run, { immediate = false } = {}) {
    run.updatedAt = Date.now();
    clearTimeout(this.timers.get(run.id));
    const write = async () => {
      this.timers.delete(run.id);
      const dir = join(this.dir, run.id);
      await mkdir(dir, { recursive: true });
      const tmp = join(dir, "run.json.tmp");
      await writeFile(tmp, JSON.stringify(run));
      await rename(tmp, join(dir, "run.json"));
    };
    if (immediate) return write().catch((e) => console.error("run save failed", run.id, e.message));
    this.timers.set(run.id, setTimeout(() => write().catch((e) => console.error("run save failed", run.id, e.message)), 150));
    return undefined;
  }

  async flush() {
    await Promise.all([...this.timers.keys()].map((id) => this.save(this.runs.get(id), { immediate: true })));
  }
}
