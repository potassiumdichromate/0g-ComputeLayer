import { buildGameHtml, buildGameModule } from "../runtime/bundle.js";
import { engineStyle } from "../../styles/presets.js";
import { effectiveArt } from "./art.js";

// Publisher: assembles the final game in the exact shape creator-studio already
// stores and plays (gamePackage + refinement.generatedCode), writes the
// standalone HTML, and records a provenance ledger: which agent and model
// produced each step, with the sha256 of its output.

function totalUsage(run) {
  return Object.values(run.nodes).reduce((t, n) => ({
    prompt_tokens: t.prompt_tokens + (n.usage?.prompt_tokens ?? 0),
    completion_tokens: t.completion_tokens + (n.usage?.completion_tokens ?? 0)
  }), { prompt_tokens: 0, completion_tokens: 0 });
}

export const publisher = {
  async run(ctx) {
    const run = ctx.run;
    const design = ctx.out("design");
    const art = effectiveArt(ctx);
    const assets = ctx.out("assets") ?? run.base?.assets ?? { manifest: {}, catalog: [] };
    const qa = ctx.out("qa");
    const play = ctx.out("playtest");
    const cover = ctx.out("cover") ?? run.base?.cover ?? null;
    const copy = ctx.out("copy") ?? run.base?.copy ?? {};
    const gameCode = play?.code ?? qa.code;
    const style = engineStyle(art.style);
    const gameId = run.gameId;

    const provenance = run.order
      .map((id) => run.nodes[id])
      .filter((n) => n.hash && n.id !== "package")
      .map((n) => ({ node: n.id, agent: n.agent, models: n.models, sha256: n.hash }));

    const gamePackage = {
      id: gameId,
      tier: "prompt-agent",
      title: design.title,
      templateId: `kult-${design.recipe}`,
      templateName: `KULT Engine · ${design.recipe}`,
      category: copy.category || "Arcade",
      description: copy.description || design.pitch,
      tags: copy.tags ?? [],
      customization: { prompt: run.kind === "edit" ? run.base.prompt : run.input.prompt, theme: art.style.name, difficulty: "normal", level: "heavy", extra: "none" },
      gameplay: {
        mechanic: design.coreLoop,
        controls: design.controls?.hint || copy.howToPlay || "",
        tuning: design.tuning,
        states: ["menu", "play", "paused", "over"],
        scoring: design.scoring.join(" "),
        collision: "KULT Engine hitboxes"
      },
      visuals: { mood: art.style.name, colors: Object.values(style.palette), assets: assets.catalog.map((c) => c.name).join(", "), externalAssets: false },
      style,
      gameplayAssets: { status: Object.keys(assets.manifest).length ? "ready" : "none", source: "compute-layer", manifest: assets.manifest, catalog: assets.catalog },
      thumbnailUrl: cover?.url ?? null,
      build: { runtime: "browser", renderer: "canvas", engine: "kult-engine@1", preview: "playable-canvas", targetFps: 60, publishReady: true },
      refinement: {
        generatedCode: buildGameModule(gameCode),
        source: play?.status === "fixed" ? "playtest-fixed" : qa.source,
        model: ctx.out("code")?.model ?? ctx.out("code-edit")?.model ?? null,
        validation: [
          qa.report?.ok ? "Headless acceptance test passed" : "Headless acceptance test FAILED",
          qa.source === "recipe-fallback" ? "Shipped the tested recipe because generated code failed QA" : null,
          play?.status ? `Browser playtest: ${play.status}` : "Browser playtest skipped"
        ].filter(Boolean)
      },
      generation: {
        mode: "compute-layer",
        runId: run.id,
        parentRunId: run.parentRunId ?? null,
        qualityTier: run.input.tier,
        recipe: design.recipe,
        design,
        provenance
      },
      publish: { published: false, status: "draft" }
    };

    const html = await ctx.put("game.html", Buffer.from(buildGameHtml({ gamePackage, gameCode })));
    const pkgFile = await ctx.put("package.json", Buffer.from(JSON.stringify(gamePackage, null, 1)));
    await ctx.put("game.js", Buffer.from(gameCode));

    const quality = {
      codeSource: qa.source,
      acceptance: { ok: qa.report?.ok ?? false, warnings: qa.report?.warnings ?? [], metrics: qa.report?.metrics ?? null, repairs: (qa.history?.length ?? 1) - 1, rejected: qa.rejected ?? null },
      playtest: play?.skipped ? { status: "skipped", reason: play.reason ?? null } : { status: play?.status, verdict: play?.afterVerdict ?? play?.verdict, screenshots: play?.screenshots ?? [] }
    };
    run.result = {
      gameId,
      title: design.title,
      recipe: design.recipe,
      style: art.styleId,
      playUrl: html.url,
      packageUrl: pkgFile.url,
      coverUrl: cover?.url ?? null,
      quality,
      usage: totalUsage(run),
      durationMs: Date.now() - (run.startedAt ?? run.createdAt),
      package: gamePackage,
      gameCode
    };
    return { gameId, playUrl: html.url, packageUrl: pkgFile.url, quality };
  }
};
