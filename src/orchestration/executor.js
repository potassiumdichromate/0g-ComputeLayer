import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { chat, generateImage } from "../llm/client.js";
import { putArtifact } from "../media/storage.js";
import { tierConfig } from "../config/tiers.js";

// DAG executor.
//
// A node is plain data: { id, agent, params, deps, group, critical, expandedBy }.
// The agent registry supplies the behavior: run(ctx), optional fallback(ctx, err),
// optional expand(output, ctx) → more node specs (dynamic fan-out), retries and
// timeoutMs. Because nodes are data, a run can be persisted and resumed.
//
// Dependency rules:
//   "nodeId"      — satisfied when that node is done / degraded / skipped;
//                   if it failed, this node is blocked.
//   "group:name"  — satisfied when every node in that group has finished in any
//                   state (one failed sprite must not sink the game).

const TERMINAL = new Set(["done", "degraded", "skipped", "failed", "blocked"]);
const SUCCESS = new Set(["done", "degraded", "skipped"]);

const hashOf = (value) => createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");

function withTimeout(promise, ms, label) {
  if (!ms) return promise;
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`), { status: 504 })), ms); })
  ]).finally(() => clearTimeout(timer));
}

const addUsage = (a, b) => ({
  prompt_tokens: (a?.prompt_tokens ?? 0) + (b?.prompt_tokens ?? 0),
  completion_tokens: (a?.completion_tokens ?? 0) + (b?.completion_tokens ?? 0)
});

export class Executor {
  constructor({ store, agents, concurrency = 6, approvalTimeoutMs = 15 * 60 * 1000 }) {
    this.store = store;
    this.agents = agents;
    this.concurrency = concurrency;
    this.approvalTimeoutMs = approvalTimeoutMs;
    this.emitters = new Map();
    this.active = new Map(); // runId → { promise, controller }
    this.approvals = new Map(); // `${runId}:${nodeId}` → resolve
  }

  // ------------------------------------------------------------- events
  emitter(runId) {
    if (!this.emitters.has(runId)) { const e = new EventEmitter(); e.setMaxListeners(50); this.emitters.set(runId, e); }
    return this.emitters.get(runId);
  }
  emit(run, type, data = {}) {
    this.emitter(run.id).emit("event", { type, runId: run.id, at: Date.now(), ...data });
    // Server log: one line per run status change and per finished/failed node.
    if (type === "run") console.info(`[run ${run.id}] ${data.status}${data.error ? " — " + data.error : ""}${run.kind ? " (" + run.kind + ", tier " + run.input?.tier + ")" : ""}`);
    if (type === "node" && data.node && ["done", "degraded", "failed", "skipped", "blocked"].includes(data.node.status)) {
      const n = data.node;
      console.info(`[run ${run.id}] ${n.id} ${n.status} ${Math.round((n.ms ?? 0) / 1000)}s ${(n.models ?? []).join(",")}${n.error ? " — " + String(n.error).slice(0, 200) : ""}`);
    }
  }
  subscribe(runId, fn) { const e = this.emitter(runId); e.on("event", fn); return () => e.off("event", fn); }

  // --------------------------------------------------------------- graph
  addNodes(run, specs, expandedBy = null) {
    for (const spec of specs) {
      if (run.nodes[spec.id]) continue;
      run.nodes[spec.id] = {
        id: spec.id, agent: spec.agent, params: spec.params ?? {}, deps: spec.deps ?? [], group: spec.group ?? null,
        critical: spec.critical ?? false, expandedBy, label: spec.label ?? spec.id,
        status: "pending", attempts: 0, output: null, error: null, models: [], usage: null, hash: null,
        startedAt: null, finishedAt: null, ms: null, progress: null, artifacts: []
      };
      run.order.push(spec.id);
      this.emit(run, "node", { node: this.publicNode(run.nodes[spec.id]) });
    }
  }

  depState(run, node) {
    let blocked = false;
    let ready = true;
    for (const dep of node.deps) {
      if (dep.startsWith("group:")) {
        const name = dep.slice(6);
        const members = Object.values(run.nodes).filter((n) => n.group === name);
        if (members.some((n) => !TERMINAL.has(n.status))) ready = false;
        continue;
      }
      const d = run.nodes[dep];
      if (!d) { ready = false; continue; }
      if (d.status === "failed" || d.status === "blocked") blocked = true;
      else if (!SUCCESS.has(d.status)) ready = false;
    }
    return { ready: ready && !blocked, blocked };
  }

  // -------------------------------------------------------------- running
  start(run) {
    if (this.active.has(run.id)) return this.active.get(run.id).promise;
    const controller = new AbortController();
    const promise = this.execute(run, controller.signal)
      .catch((error) => {
        run.status = "failed";
        run.error = error.message;
        this.emit(run, "run", { status: run.status, error: run.error });
      })
      .finally(() => {
        this.active.delete(run.id);
        return this.store.save(run, { immediate: true });
      });
    this.active.set(run.id, { promise, controller });
    return promise;
  }

  cancel(runId) {
    const entry = this.active.get(runId);
    if (entry) entry.controller.abort();
    for (const [key, resolve] of this.approvals) if (key.startsWith(`${runId}:`)) resolve({ approved: false, cancelled: true });
  }

  async execute(run, signal) {
    run.status = "running";
    run.startedAt ??= Date.now();
    this.emit(run, "run", { status: run.status });
    const running = new Map();
    for (;;) {
      if (signal.aborted) break;
      for (const node of Object.values(run.nodes)) {
        if (node.status !== "pending") continue;
        if (this.depState(run, node).blocked) {
          node.status = "blocked";
          node.error = "An upstream step failed";
          this.emit(run, "node", { node: this.publicNode(node) });
        }
      }
      const ready = run.order.map((id) => run.nodes[id]).filter((n) => n.status === "pending" && this.depState(run, n).ready);
      for (const node of ready) {
        if (running.size >= this.concurrency) break;
        running.set(node.id, this.runNode(run, node, signal).finally(() => running.delete(node.id)));
      }
      this.updateRunStatus(run);
      if (running.size === 0) break;
      await Promise.race(running.values());
    }
    await Promise.allSettled(running.values());
    if (signal.aborted) {
      run.status = "cancelled";
    } else {
      const bad = Object.values(run.nodes).filter((n) => n.critical && (n.status === "failed" || n.status === "blocked"));
      run.status = bad.length ? "failed" : "complete";
      if (bad.length) run.error = bad.map((n) => `${n.id}: ${n.error}`).join("; ");
    }
    run.finishedAt = Date.now();
    this.emit(run, "run", { status: run.status, error: run.error ?? null });
  }

  updateRunStatus(run) {
    const waiting = Object.values(run.nodes).some((n) => n.status === "waiting");
    const next = waiting ? "awaiting-approval" : "running";
    if (run.status !== next && (run.status === "running" || run.status === "awaiting-approval")) {
      run.status = next;
      this.emit(run, "run", { status: next });
    }
    this.store.save(run);
  }

  makeContext(run, node, signal) {
    const config = tierConfig(run.input.tier);
    let lastProgressEmit = 0;
    const ctx = {
      run, node, signal, config,
      runId: run.id,
      input: run.input,
      params: node.params,
      // Edit runs inherit the parent's outputs (design, art, assets, …) as `base`.
      out: (id) => run.nodes[id]?.output ?? run.base?.[id] ?? null,
      status: (id) => run.nodes[id]?.status ?? null,
      group: (name) => Object.values(run.nodes).filter((n) => n.group === name).map((n) => ({ id: n.id, status: n.status, output: n.output, error: n.error })),
      progress: (progress) => {
        node.progress = progress;
        const now = Date.now();
        if (now - lastProgressEmit > 400) { lastProgressEmit = now; this.emit(run, "progress", { nodeId: node.id, progress }); }
      },
      log: (message) => this.emit(run, "log", { nodeId: node.id, message }),
      llm: {
        chat: async (opts) => {
          const model = opts.model ?? config.models[opts.role] ?? config.models.designer;
          const reply = await chat({ ...opts, model, signal, onChunk: (chars) => ctx.progress({ stage: opts.purpose ?? "thinking", chars }) });
          node.usage = addUsage(node.usage, reply.usage);
          if (!node.models.includes(reply.model)) node.models.push(reply.model);
          return reply;
        }
      },
      image: async (opts) => {
        const model = opts.model ?? config.models.image;
        if (!node.models.includes(model)) node.models.push(model);
        return generateImage({ ...opts, model });
      },
      put: async (relPath, buffer) => {
        const artifact = await putArtifact(run.id, relPath, buffer);
        node.artifacts.push({ path: artifact.path, sha256: artifact.sha256, bytes: artifact.bytes });
        return artifact;
      },
      waitForApproval: () => new Promise((resolve) => {
        const key = `${run.id}:${node.id}`;
        node.status = "waiting";
        this.emit(run, "node", { node: this.publicNode(node) });
        this.updateRunStatus(run);
        const timer = setTimeout(() => finish({ approved: true, auto: true }), this.approvalTimeoutMs);
        const finish = (decision) => {
          clearTimeout(timer);
          this.approvals.delete(key);
          node.status = "running";
          this.emit(run, "node", { node: this.publicNode(node) });
          this.updateRunStatus(run);
          resolve(decision);
        };
        this.approvals.set(key, finish);
      })
    };
    return ctx;
  }

  approve(runId, nodeId, decision) {
    const resolve = this.approvals.get(`${runId}:${nodeId}`);
    if (!resolve) return false;
    resolve({ approved: true, ...decision });
    return true;
  }

  async runNode(run, node, signal) {
    const agent = this.agents[node.agent];
    node.status = "running";
    node.startedAt = Date.now();
    node.error = null;
    this.emit(run, "node", { node: this.publicNode(node) });
    const ctx = this.makeContext(run, node, signal);
    if (!agent) {
      node.status = "failed";
      node.error = `Unknown agent "${node.agent}"`;
    } else {
      const attempts = 1 + (agent.retries ?? 0);
      let output;
      let lastError = null;
      for (let attempt = 1; attempt <= attempts && !signal.aborted; attempt += 1) {
        node.attempts = attempt;
        try {
          output = await withTimeout(agent.run(ctx), agent.timeoutMs, node.id);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          this.emit(run, "log", { nodeId: node.id, message: `attempt ${attempt} failed: ${error.message}` });
        }
      }
      if (!lastError && output?.skipped) {
        node.status = "skipped";
        node.output = output;
      } else if (!lastError) {
        node.status = "done";
        node.output = output ?? null;
      } else if (agent.fallback && !signal.aborted) {
        try {
          node.output = await agent.fallback(ctx, lastError);
          node.status = "degraded";
          node.error = lastError.message;
        } catch (fallbackError) {
          node.status = "failed";
          node.error = `${lastError.message} (fallback also failed: ${fallbackError.message})`;
        }
      } else {
        node.status = "failed";
        node.error = lastError.message;
      }
      if (SUCCESS.has(node.status) && agent.expand) {
        try { this.addNodes(run, agent.expand(node.output, ctx) ?? [], node.id); } catch (error) {
          node.status = "failed";
          node.error = `expand failed: ${error.message}`;
        }
      }
    }
    node.finishedAt = Date.now();
    node.ms = node.finishedAt - node.startedAt;
    node.hash = SUCCESS.has(node.status) ? hashOf(node.output) : null;
    this.emit(run, "node", { node: this.publicNode(node) });
    this.store.save(run);
  }

  // Re-run one node and everything downstream of it.
  resetFrom(run, nodeId) {
    const target = run.nodes[nodeId];
    if (!target) throw Object.assign(new Error(`No node "${nodeId}"`), { status: 404 });
    const reset = new Set([nodeId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of Object.values(run.nodes)) {
        if (reset.has(n.id)) continue;
        const dependsOnReset = n.deps.some((d) => reset.has(d) || (d.startsWith("group:") && Object.values(run.nodes).some((m) => m.group === d.slice(6) && reset.has(m.id))));
        if (dependsOnReset || (n.expandedBy && reset.has(n.expandedBy))) { reset.add(n.id); grew = true; }
      }
    }
    for (const id of reset) {
      const n = run.nodes[id];
      if (n.expandedBy && reset.has(n.expandedBy)) {
        delete run.nodes[id];
        run.order = run.order.filter((x) => x !== id);
        continue;
      }
      Object.assign(n, { status: "pending", output: null, error: null, attempts: 0, hash: null, usage: null, models: [], startedAt: null, finishedAt: null, ms: null, progress: null, artifacts: [] });
    }
    run.status = "queued";
    run.error = null;
    run.finishedAt = null;
    return [...reset];
  }

  publicNode(n) {
    return {
      id: n.id, label: n.label, agent: n.agent, group: n.group, deps: n.deps, status: n.status, attempts: n.attempts,
      error: n.error, models: n.models, usage: n.usage, ms: n.ms, hash: n.hash, progress: n.progress,
      startedAt: n.startedAt, finishedAt: n.finishedAt
    };
  }

  publicRun(run, { outputs = false } = {}) {
    return {
      id: run.id, kind: run.kind, parentRunId: run.parentRunId ?? null, status: run.status, error: run.error ?? null,
      input: run.input, createdAt: run.createdAt, startedAt: run.startedAt ?? null, finishedAt: run.finishedAt ?? null,
      nodes: run.order.map((id) => ({ ...this.publicNode(run.nodes[id]), ...(outputs ? { output: run.nodes[id].output } : {}) })),
      result: run.result ?? null
    };
  }
}
