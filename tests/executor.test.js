import test from "node:test";
import assert from "node:assert/strict";
import { Executor } from "../src/orchestration/executor.js";

class MemoryStore {
  save() {}
}

function makeRun(graph, executor) {
  const run = { id: `run_test${Math.random().toString(36).slice(2, 8)}`, kind: "build", input: { tier: 1, prompt: "x" }, status: "queued", createdAt: Date.now(), nodes: {}, order: [] };
  executor.addNodes(run, graph);
  return run;
}

test("runs nodes in dependency order and passes outputs downstream", async () => {
  const seen = [];
  const agents = {
    a: { run: async () => { seen.push("a"); return { v: 1 }; } },
    b: { run: async (ctx) => { seen.push("b"); return { v: ctx.out("a").v + 1 }; } }
  };
  const ex = new Executor({ store: new MemoryStore(), agents });
  const run = makeRun([{ id: "a", agent: "a" }, { id: "b", agent: "b", deps: ["a"], critical: true }], ex);
  await ex.start(run);
  assert.deepEqual(seen, ["a", "b"]);
  assert.equal(run.nodes.b.output.v, 2);
  assert.equal(run.status, "complete");
  assert.match(run.nodes.b.hash, /^[0-9a-f]{64}$/);
});

test("fan-out: a group dependency waits for every expanded node, tolerating failures", async () => {
  const agents = {
    plan: { run: async () => ({ names: ["x", "y", "z"] }), expand: (out) => out.names.map((n) => ({ id: `s:${n}`, agent: "draw", params: { n }, deps: ["plan"], group: "s" })) },
    draw: { run: async (ctx) => { if (ctx.params.n === "y") throw new Error("boom"); return { n: ctx.params.n }; } },
    join: { run: async (ctx) => ({ got: ctx.group("s").filter((m) => m.status === "done").map((m) => m.output.n).sort() }) }
  };
  const ex = new Executor({ store: new MemoryStore(), agents });
  const run = makeRun([{ id: "plan", agent: "plan" }, { id: "join", agent: "join", deps: ["plan", "group:s"], critical: true }], ex);
  await ex.start(run);
  assert.deepEqual(run.nodes.join.output.got, ["x", "z"]);
  assert.equal(run.nodes["s:y"].status, "failed");
  assert.equal(run.status, "complete");
});

test("fallback marks a node degraded; a failure without fallback blocks dependents and fails the run", async () => {
  const agents = {
    soft: { run: async () => { throw new Error("nope"); }, fallback: async () => ({ fallback: true }) },
    hard: { run: async () => { throw new Error("hard fail"); } },
    after: { run: async () => ({ ok: true }) }
  };
  const ex = new Executor({ store: new MemoryStore(), agents });
  const run = makeRun([
    { id: "soft", agent: "soft" },
    { id: "hard", agent: "hard", critical: true },
    { id: "after", agent: "after", deps: ["hard"], critical: true }
  ], ex);
  await ex.start(run);
  assert.equal(run.nodes.soft.status, "degraded");
  assert.equal(run.nodes.soft.output.fallback, true);
  assert.equal(run.nodes.hard.status, "failed");
  assert.equal(run.nodes.after.status, "blocked");
  assert.equal(run.status, "failed");
});

test("independent branches run in parallel", async () => {
  let running = 0, peak = 0;
  const slow = { run: async () => { running += 1; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 30)); running -= 1; return {}; } };
  const ex = new Executor({ store: new MemoryStore(), agents: { slow } });
  const run = makeRun([{ id: "a", agent: "slow" }, { id: "b", agent: "slow" }, { id: "c", agent: "slow" }], ex);
  await ex.start(run);
  assert.equal(peak, 3);
});

test("approval gate pauses the branch until approved, other branches continue", async () => {
  const order = [];
  const agents = {
    gate: { run: async (ctx) => { const d = await ctx.waitForApproval(); order.push("gate"); return d; } },
    other: { run: async () => { order.push("other"); return {}; } }
  };
  const ex = new Executor({ store: new MemoryStore(), agents });
  const run = makeRun([{ id: "g", agent: "gate" }, { id: "o", agent: "other" }], ex);
  const done = ex.start(run);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(run.status, "awaiting-approval");
  assert.deepEqual(order, ["other"]);
  assert.equal(ex.approve(run.id, "g", { feedback: "brighter" }), true);
  await done;
  assert.equal(run.nodes.g.output.feedback, "brighter");
  assert.equal(run.status, "complete");
});

test("resetFrom re-runs a node and everything downstream, dropping its expansions", async () => {
  let calls = 0;
  const agents = {
    plan: { run: async () => { calls += 1; return { n: calls }; }, expand: (out) => [{ id: `child${out.n}`, agent: "leaf", deps: ["plan"], group: "c" }] },
    leaf: { run: async () => ({}) },
    tail: { run: async (ctx) => ({ n: ctx.out("plan").n }) }
  };
  const ex = new Executor({ store: new MemoryStore(), agents });
  const run = makeRun([{ id: "plan", agent: "plan" }, { id: "tail", agent: "tail", deps: ["plan", "group:c"] }], ex);
  await ex.start(run);
  assert.ok(run.nodes.child1);
  ex.resetFrom(run, "plan");
  assert.equal(run.nodes.child1, undefined);
  await ex.start(run);
  assert.equal(run.nodes.tail.output.n, 2);
  assert.ok(run.nodes.child2);
});
