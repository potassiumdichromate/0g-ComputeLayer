# KULT Compute Layer

One prompt → a polished, tested mobile game. A multi-agent DAG on 0G Compute that
builds games on an AI-first engine. It runs as a standalone service that
`creator-studio` calls through its compute-layer adapter.

```bash
npm install
cp .env.example .env        # add ZERO_G_API_KEY (without it, a mock LLM runs everything offline)
npm start                   # http://localhost:4100
npm test                    # executor + acceptance-test suite
npm run test:recipes        # every recipe must pass the headless acceptance test
npm run eval -- 3           # quality benchmark: 8 fixed prompts through the full DAG at tier 3
node scripts/preview-recipes.mjs   # real-browser screenshots of every recipe × art style
```

## Why the quality goes up

Phaser's Game Agent and Higgsfield Games get good games from one sentence by not
asking the model to write a game engine. This layer does the same:

| Lever | What it is here |
|---|---|
| **AI-first engine** | [`engine/kult-engine.js`](engine/kult-engine.js): a verb-based runtime (`g.spawn`, `e.moves("runner")`, `e.shoots()`, `g.onHit`, `g.every`, `g.addScore`, `g.burst`, `g.shake`, `g.sfx`, …). Menus, pause, mute, HUD, restart, input, scaling, particles, sound, sprite flip/animation and collisions are written once and tested. The model writes 150–450 lines of *game rules* instead of 18K characters of boilerplate. The API contract the model sees is [`engine/API.md`](engine/API.md). |
| **Tested recipes** | [`recipes/`](recipes): 8 genre games on the engine (flappy, runner, jumper, shooter, lanes, breakout, arena, catcher). The Engineer adapts the closest one instead of starting from a blank page. |
| **Art-style presets** | [`styles/presets.js`](styles/presets.js): 7 locked styles (palette, outline, font, SVG rules, image prompt) shared by every art agent and by the engine's procedural shapes, so the whole game is visually consistent. |
| **Design before code** | The Game Designer writes a typed GDD (entities, rules, tuning numbers, progression, juice moments), and both art and code implement that one contract. |
| **Staged approval** | Optional: the run pauses after the key art so the creator approves or redirects the look (feedback text or a different style), Higgsfield-style. Code keeps building meanwhile. |
| **Acceptance tests** | [`src/qa/smoke.js`](src/qa/smoke.js): a bot plays every build headlessly (start → taps, swipes and keys → game over → must not auto-restart → restart must reset → idle run). Failures go back to a repair agent; only strictly better repairs are kept; if it still fails, the tested recipe ships instead of a broken game. |
| **Browser playtest** | [`src/agents/playtest.js`](src/agents/playtest.js): real Chrome/Edge on a phone viewport, screenshots judged by a vision model, one fix pass that is kept only if the same judge scores it higher. |
| **Harvest loop** | `POST /v1/runs/:id/harvest {rating}` stores a great game as a reference for its genre; the Engineer sees the best-rated one next time, so output improves with every good build. |

## The DAG

```
brief → design ─┬─ art ─┬─ keyart → approve-style ─┬─ sprites ⇉ sprite:* ─┐
                │       │                           ├─ environment ────────┼─ assets ─┐
                │       │                           └─ cover               │          │
                │       └─ code → qa ─────────────────────────────────────┴──────────┴─ playtest → package
                └─ copy ────────────────────────────────────────────────────────────────────────┘
```

The Engineer depends on the Art Director's **catalog** (sprite names and sizes), not
on finished sprites. Code and art are produced in parallel and meet only at the
Playtester.

| Agent | Role | Output contract |
|---|---|---|
| `brief` | Producer: route the idea to a recipe + style, title it | `Brief` |
| `designer` | Game Designer: the full buildable design | `GameDesign` |
| `artDirector` | Palette tuning, sprite catalog, environment/cover direction | `ArtDirection` |
| `illustrator` ×N | One sprite each: SVG via LLM (sanitized → rasterized → self-checked) or image model + cut-out | sprite PNG (+SVG) |
| `gate` | Optional human style approval | decision |
| `environmentArtist` / `coverArtist` | Background / store cover (deterministic fallback cover) | image |
| `assetPack` | Joins sprites into the manifest the engine loads | manifest + catalog |
| `engineer` | Game code on the engine, adapted from the closest recipe | code |
| `codeQA` | Acceptance test → repair loop → recipe fallback | code + report |
| `playtester` | Browser screenshots → vision verdict → guarded fix | verdict + screenshots |
| `copywriter` | Listing copy | `Copy` |
| `publisher` | creator-studio-compatible `gamePackage`, standalone HTML, provenance ledger | package |

**Edit graph.** `editRouter` decides which specialists a change request needs. An
art-only change ("make the player a cat") redraws only that sprite and does not
touch code. A gameplay change does not redraw art. A broken edit reverts to the
previous working version.

**Executor** ([`src/orchestration/executor.js`](src/orchestration/executor.js)):

- dependency scheduling with bounded concurrency
- dynamic fan-out (`expand`) and `group:` joins that tolerate individual failures
- per-node retries, timeouts and `fallback` (the node is marked `degraded`, never silently)
- approval gates
- `resetFrom` for per-node retry
- durable run state with resume after a restart
- SSE events
- a sha256 of every node's output for provenance

**Tiers** ([`src/config/tiers.js`](src/config/tiers.js)): one model per agent role per tier,
plus features (sprites none|svg|image, environment, cover, playtest, repair
attempts). Every value can be overridden from env (`AGENT_ENGINEER_TIER3=…`,
`TIER1_SPRITES=svg`).

## API

All `/v1` routes take `x-compute-key: $COMPUTE_API_KEY` when one is set.

| Method | Path | |
|---|---|---|
| `POST` | `/v1/runs` | `{ prompt, tier: 1-3, style?, approval?, gameId? }` → run (202) |
| `GET` | `/v1/runs/:id` | run + node states (`?outputs=1` for node outputs) |
| `GET` | `/v1/runs/:id/events` | SSE: `snapshot`, `node`, `progress`, `log`, `run` |
| `POST` | `/v1/runs/:id/approve` | `{ feedback?, style? }` releases the style gate |
| `POST` | `/v1/runs/:id/edits` | `{ request }` → new edit run for the same `gameId` |
| `POST` | `/v1/runs/:id/nodes/:nodeId/retry` | re-run one step and everything downstream |
| `POST` | `/v1/runs/:id/cancel` | cancel |
| `GET` | `/v1/runs/:id/package` | the finished `gamePackage` + quality report |
| `POST` | `/v1/runs/:id/harvest` | `{ rating: 1-5, notes? }` add to the genre library |
| `GET` | `/v1/styles`, `/v1/recipes`, `/v1/library`, `/health` | |
| `GET` | `/play/:runId` | the playable standalone game |

## Using it from creator-studio

The published `gamePackage` already has the shape creator-studio stores and plays:
`refinement.generatedCode` is one module (engine + game) that reads
`gamePackage.gameplayAssets.manifest` and `gamePackage.style`, uses `#game`, and
calls `window.reportScore`. The existing sandboxed player runs it as-is.

creator-studio's adapter (`src/services/computeLayerService.js`, branch
`compute-layer-adapter`) is off until you set these in creator-studio's `.env`:

```
COMPUTE_LAYER_URL=http://localhost:4100
COMPUTE_LAYER_KEY=<same value as COMPUTE_API_KEY here>
COMPUTE_LAYER_TIERS=3          # tiers routed here
COMPUTE_LAYER_FALLBACK=true    # use the in-process pipeline if a run fails
```

Once they are set:

- `POST /agents/code` and full `POST /games/generate-from-prompt` builds run here,
  with the same response and job-result shapes as before.
- Sprites and the cover are copied into creator-studio's R2/Mongo storage, with 0G
  provenance recorded.
- Edits come here only when this layer built the exact code being edited, so a
  creator's hand edits are never overwritten.

`generation.provenance` lists every agent, model and output hash, ready to pin to 0G.

## Layout

```
engine/        kult-engine.js (runtime), API.md (the model's contract)
recipes/       tested genre games + index (metadata, matching)
styles/        art-style presets
src/agents/    planning.js, art.js, code.js, playtest.js, publish.js, index.js
src/orchestration/  executor.js, graphs.js, runStore.js, service.js
src/qa/        smoke.js (headless acceptance), browser.js (Chrome/Edge capture)
src/llm/       client.js (0G router: OpenAI + Anthropic formats, streaming), json.js, mock.js
src/media/     svg.js, image.js, storage.js
src/library/   harvest loop
scripts/       eval.mjs, test-recipes.mjs, preview-recipes.mjs
tests/         executor + quality tests
```

## Not done yet

- Storage is local disk (`src/media/storage.js`). Swap in R2 + 0G Storage for production.
- The run store is JSON files. Use Mongo, plus a queue (Redis/BullMQ) to scale across workers.
- No live 0G calls have been made yet. Everything was verified with the mock
  provider and real headless Edge. Run `npm run eval` with a key to benchmark
  real models.
- Only 8 genre recipes so far. Puzzle/grid games (match-3, 2048, sokoban) need recipes
  and a grid helper in the engine.
