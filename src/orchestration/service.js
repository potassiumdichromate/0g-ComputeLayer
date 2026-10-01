import { randomUUID } from "node:crypto";
import { customAlphabet } from "nanoid";
import { RunStore } from "./runStore.js";
import { Executor } from "./executor.js";
import { buildGraph, editGraph } from "./graphs.js";
import { AGENTS } from "../agents/index.js";
import { normalizeTier } from "../config/tiers.js";
import { getStyle } from "../../styles/presets.js";
import { llmConfigError } from "../llm/client.js";

const gameIdFor = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 12);

export class ComputeService {
  constructor() {
    this.store = new RunStore();
    this.executor = new Executor({
      store: this.store,
      agents: AGENTS,
      concurrency: Number(process.env.RUN_CONCURRENCY) || 6,
      approvalTimeoutMs: Number(process.env.APPROVAL_TIMEOUT_MS) || 15 * 60 * 1000
    });
  }

  async init() {
    await this.store.init();
    // Resume runs the previous process did not finish.
    for (const run of this.store.list({ limit: 10_000 })) {
      if (!["queued", "running", "awaiting-approval"].includes(run.status)) continue;
      for (const node of Object.values(run.nodes)) if (node.status === "running" || node.status === "waiting") node.status = "pending";
      console.info(`[compute] resuming run ${run.id}`);
      this.executor.start(run);
    }
  }

  newRun({ kind, input, gameId, parentRunId = null, base = null, graph }) {
    const run = {
      id: `run_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      kind, input, gameId, parentRunId, base,
      status: "queued", createdAt: Date.now(), nodes: {}, order: [], result: null, error: null
    };
    this.executor.addNodes(run, graph);
    this.store.put(run);
    this.executor.start(run);
    return run;
  }

  createBuild({ prompt, tier, style, approval = false, gameId }) {
    const configError = llmConfigError();
    if (configError) throw Object.assign(new Error(configError), { status: 503 });
    const t = normalizeTier(tier);
    if (!t) throw Object.assign(new Error("tier must be 1, 2 or 3"), { status: 400 });
    if (!String(prompt || "").trim()) throw Object.assign(new Error("prompt is required"), { status: 400 });
    if (style && !getStyle(style)) throw Object.assign(new Error(`Unknown style "${style}"`), { status: 400 });
    return this.newRun({
      kind: "build",
      input: { prompt: String(prompt).slice(0, 4000), tier: t, style: style ?? null, approval: Boolean(approval) },
      gameId: gameId || gameIdFor(),
      graph: buildGraph()
    });
  }

  createEdit({ parentRunId, request, tier }) {
    const configError = llmConfigError();
    if (configError) throw Object.assign(new Error(configError), { status: 503 });
    const parent = this.store.get(parentRunId);
    if (!parent) throw Object.assign(new Error("Parent run not found"), { status: 404 });
    if (parent.status !== "complete" || !parent.result) throw Object.assign(new Error("Parent run has no finished game"), { status: 409 });
    if (!String(request || "").trim()) throw Object.assign(new Error("request is required"), { status: 400 });
    const out = (id) => parent.nodes[id]?.output ?? parent.base?.[id] ?? null;
    const base = {
      prompt: parent.kind === "edit" ? parent.base.prompt : parent.input.prompt,
      design: out("design"),
      art: { ...out("art"), ...(out("sprites")?.style ? { style: out("sprites").style, styleId: out("sprites").styleId } : {}), ...(out("edit-sprites")?.style ? { style: out("edit-sprites").style, styleId: out("edit-sprites").styleId } : {}) },
      assets: out("assets"),
      cover: out("cover"),
      copy: out("copy"),
      gameCode: parent.result.gameCode
    };
    return this.newRun({
      kind: "edit",
      input: { prompt: String(request).slice(0, 2000), tier: normalizeTier(tier) ?? parent.input.tier, approval: false },
      gameId: parent.gameId,
      parentRunId,
      base,
      graph: editGraph()
    });
  }

  get(id) {
    const run = this.store.get(id);
    if (!run) throw Object.assign(new Error("Run not found"), { status: 404 });
    return run;
  }

  approve(runId, nodeId, decision) {
    const run = this.get(runId);
    if (!this.executor.approve(run.id, nodeId, decision)) throw Object.assign(new Error(`Node "${nodeId}" is not waiting for approval`), { status: 409 });
  }

  retry(runId, nodeId) {
    const run = this.get(runId);
    if (this.executor.active.has(run.id)) throw Object.assign(new Error("Run is still executing; cancel it first or wait"), { status: 409 });
    const reset = this.executor.resetFrom(run, nodeId);
    this.store.save(run);
    this.executor.start(run);
    return reset;
  }

  cancel(runId) {
    this.get(runId);
    this.executor.cancel(runId);
  }
}
