// Quality benchmark: run a fixed prompt set through the full DAG and report
// acceptance, playtest verdicts, fallbacks, time and tokens. Run it before and
// after any prompt/model/engine change to see whether quality actually moved.
//
//   node scripts/eval.mjs [tier] [limit]        (LLM_MOCK=1 to run offline)
import "../src/config/env.js";
import { ComputeService } from "../src/orchestration/service.js";
import { isMockMode } from "../src/llm/client.js";

const PROMPTS = [
  "a cat that jumps over cucumbers on a rooftop",
  "space shooter where you defend earth from jelly aliens",
  "flappy bird but you are a tiny dragon dodging castle towers",
  "doodle jump style game climbing a giant beanstalk",
  "catch falling sushi and avoid the wasabi bombs",
  "top-down zombie survival in a neon city",
  "dodge traffic as a delivery scooter on a 3 lane highway",
  "brick breaker with candy blocks"
];

const tier = Number(process.argv[2]) || 1;
const limit = Number(process.argv[3]) || PROMPTS.length;
const service = new ComputeService();
await service.init();
console.log(`eval: tier ${tier}, ${Math.min(limit, PROMPTS.length)} prompts, ${isMockMode() ? "MOCK LLM" : "0G router"}\n`);

const rows = [];
for (const prompt of PROMPTS.slice(0, limit)) {
  const run = service.createBuild({ prompt, tier });
  await service.executor.active.get(run.id)?.promise;
  const r = run.result;
  const q = r?.quality;
  const degraded = Object.values(run.nodes).filter((n) => n.status === "degraded" || n.status === "failed").map((n) => `${n.id}:${n.status}`);
  rows.push({
    prompt: prompt.slice(0, 44),
    status: run.status,
    recipe: r?.recipe ?? "-",
    code: q?.codeSource ?? "-",
    accept: q?.acceptance?.ok ? "pass" : "FAIL",
    repairs: q?.acceptance?.repairs ?? 0,
    playtest: q?.playtest?.status ?? "-",
    score: q?.playtest?.verdict ? Object.values(q.playtest.verdict.scores).reduce((a, b) => a + b, 0) : "-",
    sec: r ? Math.round(r.durationMs / 1000) : "-",
    tokens: r ? r.usage.prompt_tokens + r.usage.completion_tokens : 0,
    degraded: degraded.join(" ") || "-"
  });
  console.log(`${run.status.padEnd(8)} ${prompt.slice(0, 50).padEnd(50)} ${r?.playUrl ?? run.error ?? ""}`);
}
console.log("");
console.table(rows);
const ok = rows.filter((r) => r.accept === "pass" && r.code !== "recipe-fallback").length;
console.log(`\nGenerated games passing acceptance without fallback: ${ok}/${rows.length}`);
await service.store.flush();
process.exit(0);
