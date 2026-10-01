import { captureGame } from "../qa/browser.js";
import { smokeTest } from "../qa/smoke.js";
import { JudgeVerdict } from "../contracts/index.js";
import { askJson } from "../llm/json.js";
import { readFileRef } from "../media/storage.js";
import { engineApiReference } from "../runtime/bundle.js";
import { effectiveArt } from "./art.js";
import { engineStyle } from "../../styles/presets.js";

// Playtester: real browser screenshots → vision QA lead → one targeted fix pass
// that is kept only if the same reviewer rates the result better.

export async function inlineManifest(assets) {
  const manifest = {};
  for (const [name, ref] of Object.entries(assets?.files ?? {})) {
    if (name.endsWith(".svg")) continue;
    try {
      const buf = await readFileRef(ref);
      const mime = ref.endsWith(".jpg") ? "image/jpeg" : "image/png";
      manifest[name] = `data:${mime};base64,${buf.toString("base64")}`;
    } catch { /* missing file: skip */ }
  }
  return manifest;
}

async function judge(ctx, capture, design, catalog) {
  const content = [
    {
      type: "text",
      text: [
        `Game: ${design.title} — ${design.pitch}`,
        `Core loop: ${design.coreLoop}`,
        `Controls: ${design.controls?.hint ?? ""}`,
        `Entities that should be visible: ${design.entities.map((e) => `${e.name} (${e.role})`).join(", ")}`,
        catalog.length ? `Drawn sprites: ${catalog.map((c) => c.name).join(", ")}` : "No sprites: entities are drawn as styled shapes.",
        `Screenshots in order: ${capture.shots.map((s, i) => `${i + 1}) ${s.label}`).join("; ")}.`,
        capture.blank ? "Automatic check: the last screenshot is nearly uniform (possibly blank)." : "",
        capture.errors.length ? `Runtime errors:\n${capture.errors.join("\n")}` : "Runtime errors: none."
      ].filter(Boolean).join("\n")
    },
    ...capture.shots.map((s) => ({ type: "image_url", image_url: { url: `data:image/png;base64,${s.png.toString("base64")}` } }))
  ];
  const { value } = await askJson({
    llm: ctx.llm, role: "judge", purpose: "judge", schema: JudgeVerdict, maxTokens: 1200, temperature: 0.1,
    messages: [
      {
        role: "system",
        content: [
          "You are the QA lead of a mobile game studio reviewing screenshots of a game on a 390x844 phone.",
          "Score visuals (polish, cohesion), readability (can a player tell what is what, is the HUD clear) and fidelity (does it look like the described game) from 0-10.",
          "List ONLY real, fixable problems a player would clearly notice: blank or frozen screen, nothing happening after start, key entities missing or unreadable, sprites stretched/tiny/facing wrong, overlapping or cut-off text, things off-screen, visible glitches, runtime errors that break play.",
          "Do not report taste or balance. pass = true when there are no such problems.",
          'Reply ONLY with JSON: {"pass":true|false,"scores":{"visuals":0-10,"readability":0-10,"fidelity":0-10},"issues":["specific, fixable"]}'
        ].join("\n")
      },
      { role: "user", content }
    ]
  });
  return value;
}

const quality = (v) => (v.pass ? 100 : 0) + v.scores.visuals + v.scores.readability + v.scores.fidelity - v.issues.length * 3;

export const playtester = {
  retries: 0,
  timeoutMs: 15 * 60_000,
  async run(ctx) {
    const qa = ctx.out("qa");
    if (!ctx.config.features.playtest) return { skipped: true, code: qa.code };
    const design = ctx.out("design");
    const assets = ctx.out("assets");
    const art = effectiveArt(ctx);
    const gamePackage = {
      title: design.title,
      style: engineStyle(art.style),
      gameplayAssets: { manifest: await inlineManifest(assets), catalog: assets.catalog }
    };
    const first = await captureGame({ gamePackage, gameCode: qa.code });
    if (first.skipped) return { skipped: true, reason: first.reason, code: qa.code };
    const screenshots = [];
    for (const [i, s] of first.shots.entries()) screenshots.push({ label: s.label, url: (await ctx.put(`playtest/${i + 1}.png`, s.png)).url });
    const verdict = await judge(ctx, first, design, assets.catalog);
    const hardErrors = first.errors.filter((e) => e.startsWith("Uncaught") || e.startsWith("Engine"));
    const base = { screenshots, verdict, errors: first.errors, state: first.state };
    if (verdict.pass && !hardErrors.length && !first.blank) return { ...base, status: "passed", code: qa.code };

    const issues = [...verdict.issues, ...hardErrors, ...(first.blank ? ["The screen is blank during play"] : [])];
    if (!issues.length) return { ...base, status: "failed", code: qa.code };
    ctx.progress({ stage: "fixing playtest issues", issues: issues.length });
    const reply = await ctx.llm.chat({
      role: "repair", purpose: "repair", maxTokens: 16000, temperature: 0.3, timeoutMs: 10 * 60_000,
      messages: [
        { role: "system", content: ["You fix a KULT Engine game after a visual playtest on a phone. Fix ONLY the listed problems; keep all gameplay, entities and features. Return the complete corrected code only, no fences.", "", engineApiReference()].join("\n") },
        { role: "user", content: ["PLAYTEST PROBLEMS:", ...issues.map((i) => `- ${i}`), "", "CODE:", "```js", qa.code, "```"].join("\n") }
      ]
    }).catch((error) => ({ error }));
    if (reply.error) return { ...base, status: "failed", fixError: reply.error.message, code: qa.code };
    const fixed = String(reply.content).replace(/^```(?:js|javascript)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    if (!smokeTest(fixed, { gamePackage: { title: design.title } }).ok) return { ...base, status: "fix-rejected", code: qa.code };
    const second = await captureGame({ gamePackage, gameCode: fixed });
    const after = await judge(ctx, second, design, assets.catalog);
    const keep = !second.blank && !second.errors.some((e) => e.startsWith("Uncaught")) && quality(after) > quality(verdict);
    if (keep) for (const [i, s] of second.shots.entries()) screenshots.push({ label: `after fix: ${s.label}`, url: (await ctx.put(`playtest/fix-${i + 1}.png`, s.png)).url });
    return { ...base, status: keep ? "fixed" : "fix-reverted", afterVerdict: after, code: keep ? fixed : qa.code };
  },
  async fallback(ctx, error) {
    return { skipped: true, reason: error.message, code: ctx.out("qa").code };
  }
};
