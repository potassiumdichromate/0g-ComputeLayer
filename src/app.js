import express from "express";
import { z } from "zod";
import { join, normalize } from "node:path";
import { existsSync } from "node:fs";
import { DATA_DIR } from "./config/env.js";
import { isMockMode } from "./llm/client.js";
import { listStyles } from "../styles/presets.js";
import { listRecipes } from "../recipes/index.js";
import { harvest, listLibrary } from "./library/library.js";
import { findBrowser } from "./qa/browser.js";
import { tierConfig } from "./config/tiers.js";

const buildSchema = z.object({
  prompt: z.string().min(3).max(4000),
  tier: z.coerce.number().int().min(1).max(3),
  style: z.string().optional(),
  approval: z.boolean().optional(),
  gameId: z.string().regex(/^[a-zA-Z0-9_-]{4,40}$/).optional()
}).strict();

const editSchema = z.object({ request: z.string().min(2).max(2000), tier: z.coerce.number().int().min(1).max(3).optional() }).strict();
const approveSchema = z.object({ nodeId: z.string().default("approve-style"), feedback: z.string().max(800).optional(), style: z.string().optional() }).strict();
const harvestSchema = z.object({ rating: z.number().min(1).max(5), notes: z.string().max(500).optional() }).strict();

export function createApp(service) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Service-to-service auth: creator-studio's backend calls this layer with a
  // shared key. Open when COMPUTE_API_KEY is unset (local development).
  const key = process.env.COMPUTE_API_KEY;
  const auth = (req, res, next) => {
    if (!key || req.get("x-compute-key") === key) return next();
    res.status(401).json({ error: "Invalid x-compute-key" });
  };

  app.get("/health", (_req, res) => res.json({
    ok: true, service: "kult-compute-layer", mock: isMockMode(), browser: Boolean(findBrowser()),
    tiers: [1, 2, 3].map((t) => tierConfig(t))
  }));

  app.get("/v1/styles", (_req, res) => res.json({ styles: listStyles() }));
  app.get("/v1/recipes", (_req, res) => res.json({ recipes: listRecipes().map(({ id, name, summary }) => ({ id, name, summary })) }));

  app.post("/v1/runs", auth, (req, res, next) => {
    try {
      const run = service.createBuild(buildSchema.parse(req.body));
      res.status(202).json(service.executor.publicRun(run));
    } catch (error) { next(error); }
  });

  app.get("/v1/runs", auth, (req, res) => {
    res.json({ runs: service.store.list({ limit: Math.min(Number(req.query.limit) || 20, 100) }).map((r) => ({ id: r.id, kind: r.kind, status: r.status, title: r.result?.title ?? null, createdAt: r.createdAt, prompt: r.input.prompt })) });
  });

  app.get("/v1/runs/:id", auth, (req, res, next) => {
    try {
      const run = service.get(req.params.id);
      res.json(service.executor.publicRun(run, { outputs: req.query.outputs === "1" }));
    } catch (error) { next(error); }
  });

  // Live progress: Server-Sent Events of every node transition.
  app.get("/v1/runs/:id/events", auth, (req, res, next) => {
    let run;
    try { run = service.get(req.params.id); } catch (error) { next(error); return; }
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.flushHeaders?.();
    const send = (event) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    send({ type: "snapshot", run: service.executor.publicRun(run) });
    const unsubscribe = service.executor.subscribe(run.id, send);
    const ping = setInterval(() => res.write(": ping\n\n"), 20000);
    req.on("close", () => { clearInterval(ping); unsubscribe(); });
  });

  app.get("/v1/runs/:id/package", auth, (req, res, next) => {
    try {
      const run = service.get(req.params.id);
      if (!run.result?.package) { res.status(409).json({ error: `Run is ${run.status}` }); return; }
      res.json({ game: run.result.package, quality: run.result.quality, usage: run.result.usage, durationMs: run.result.durationMs });
    } catch (error) { next(error); }
  });

  app.post("/v1/runs/:id/approve", auth, (req, res, next) => {
    try {
      const { nodeId, ...decision } = approveSchema.parse(req.body ?? {});
      service.approve(req.params.id, nodeId, decision);
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  app.post("/v1/runs/:id/nodes/:nodeId/retry", auth, (req, res, next) => {
    try { res.json({ ok: true, reset: service.retry(req.params.id, req.params.nodeId) }); } catch (error) { next(error); }
  });

  app.post("/v1/runs/:id/cancel", auth, (req, res, next) => {
    try { service.cancel(req.params.id); res.json({ ok: true }); } catch (error) { next(error); }
  });

  app.post("/v1/runs/:id/edits", auth, (req, res, next) => {
    try {
      const { request, tier } = editSchema.parse(req.body);
      const run = service.createEdit({ parentRunId: req.params.id, request, tier });
      res.status(202).json(service.executor.publicRun(run));
    } catch (error) { next(error); }
  });

  app.post("/v1/runs/:id/harvest", auth, async (req, res, next) => {
    try {
      const { rating, notes } = harvestSchema.parse(req.body);
      res.json(await harvest({ run: service.get(req.params.id), rating, notes }));
    } catch (error) { next(error); }
  });

  app.get("/v1/library", auth, async (_req, res, next) => {
    try { res.json({ entries: await listLibrary() }); } catch (error) { next(error); }
  });

  // Run artifacts (sprites, covers, screenshots, game.html). Public so the
  // generated game can load its sprites; paths are confined to the run folder.
  app.get("/files/:runId/*", (req, res) => {
    const runId = req.params.runId;
    if (!/^run_[a-z0-9]+$/.test(runId)) { res.status(400).end(); return; }
    const base = join(DATA_DIR, "runs", runId, "files");
    const full = normalize(join(base, req.params[0]));
    if (!full.startsWith(base) || !existsSync(full)) { res.status(404).end(); return; }
    res.set("Cache-Control", "public, max-age=3600");
    res.set("Access-Control-Allow-Origin", "*");
    res.sendFile(full);
  });

  app.get("/play/:runId", (req, res) => res.redirect(302, `/files/${encodeURIComponent(req.params.runId)}/game.html`));

  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "Invalid request", issues: error.issues }); return; }
    res.status(error.status ?? 500).json({ error: error.message });
  });
  return app;
}
