// Quality benchmark: run a fixed prompt set through the full DAG and report
// routing (recipe, fit, known game), acceptance, the fidelity review against
// the prompt, playtest verdicts, fallbacks, time and tokens. Run it before and
// after any prompt/model/engine change to see whether quality actually moved.
//
//   node scripts/eval.mjs [tier] [limit] [concurrency] [filter]   (LLM_MOCK=1 to run offline)
import "../src/config/env.js";
import { writeFile } from "node:fs/promises";
import { ComputeService } from "../src/orchestration/service.js";
import { isMockMode } from "../src/llm/client.js";

// Known games with fixed rules, from-scratch genres no recipe covers, and
// themed action games a recipe should carry.
const PROMPTS = [
  "make a chess game",
  "sudoku puzzle game with 3 difficulty levels",
  "a cat that jumps over cucumbers on a rooftop",
  "snake game but you are a hungry dragon eating gold coins",
  "a cozy farming game where you plant seeds, water them and harvest crops to sell",
  "space shooter where you defend earth from jelly aliens",
  "basketball free throw game, flick the ball into the hoop",
  "wordle style word guessing game about animals",
  "connect four against a robot",
  "klondike solitaire card game",
  "catch falling sushi and avoid the wasabi bombs",
  "a top-down racing game around a city track with drifting",
  "a 3D endless runner where a ninja dodges trains on rooftops",
  "stack the swinging blocks as high as you can, one tap to drop"
];

const tier = Number(process.argv[2]) || 1;
const limit = Number(process.argv[3]) || PROMPTS.length;
const concurrency = Math.max(1, Number(process.argv[4]) || 1);
const filter = process.argv[5] ? new RegExp(process.argv[5], "i") : null;
const service = new ComputeService();
await service.init();
const prompts = PROMPTS.filter((p) => !filter || filter.test(p)).slice(0, limit);
console.log(`eval: tier ${tier}, ${prompts.length} prompts, concurrency ${concurrency}, ${isMockMode() ? "MOCK LLM" : "0G router"}\n`);

const rows = new Array(prompts.length);
async function one(prompt, i) {
  const run = service.createBuild({ prompt, tier });
  await service.executor.active.get(run.id)?.promise;
  const r = run.result;
  const q = r?.quality;
  const design = run.nodes.design?.output;
  const degraded = Object.values(run.nodes).filter((n) => n.status === "degraded" || n.status === "failed").map((n) => `${n.id}:${n.status}`);
  const pv = q?.playtest?.verdict;
  rows[i] = {
    prompt: prompt.slice(0, 40),
    status: run.status,
    recipe: design?.recipe ?? "-",
    fit: design?.fit ?? "-",
    known: design?.knownGame ?? "-",
    code: q?.codeSource ?? "-",
    accept: q?.acceptance?.ok ? "pass" : "FAIL",
    fidelity: q?.fidelity ? `${q.fidelity.score}${q.fidelity.matches ? "" : "!"}` : "-",
    playtest: q?.playtest?.status ?? "-",
    look: pv ? `${pv.scores.visuals}/${pv.scores.readability}/${pv.scores.fidelity}` : "-",
    min: r ? Math.round(r.durationMs / 6000) / 10 : "-",
    ktok: r ? Math.round((r.usage.prompt_tokens + r.usage.completion_tokens) / 1000) : 0,
    degraded: degraded.join(" ") || "-",
    runId: run.id,
    playUrl: r?.playUrl ?? null,
    gameIs: q?.fidelity?.gameIs ?? run.error ?? ""
  };
  console.log(`${run.status.padEnd(8)} ${prompt.slice(0, 50).padEnd(50)} ${r?.playUrl ?? run.error ?? ""}`);
}

let next = 0;
await Promise.all(Array.from({ length: Math.min(concurrency, prompts.length) }, async () => {
  while (next < prompts.length) { const i = next++; await one(prompts[i], i).catch((e) => { rows[i] = { prompt: prompts[i].slice(0, 40), status: "error", gameIs: e.message }; }); }
}));

console.log("");
console.table(rows.map(({ runId, playUrl, gameIs, ...rest }) => rest));
for (const r of rows) console.log(`- ${r.prompt}: ${r.gameIs}`);
const ok = rows.filter((r) => r.accept === "pass" && r.code !== "recipe-fallback" && !String(r.fidelity).includes("!")).length;
console.log(`\nGames that pass acceptance AND match their prompt: ${ok}/${rows.length}`);
await writeFile(`data/eval-tier${tier}-${Date.now()}.json`, JSON.stringify(rows, null, 1)).catch(() => {});
await service.store.flush();
process.exit(0);
