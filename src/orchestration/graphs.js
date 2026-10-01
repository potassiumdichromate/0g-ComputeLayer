// Graph templates. Nodes are data (see executor.js); tier features switch
// behavior inside agents (a disabled step returns { skipped: true }) so every
// tier runs the same shape and the UI can always show the same pipeline.
//
// Build graph — note that the Engineer depends on the Art Director's CATALOG,
// not on finished sprites: code and art are produced in parallel and only meet
// at the Playtester.
//
//   brief → design ─┬─ art ─┬─ keyart → approve-style ─┬─ sprites ⇉ sprite:* ─┐
//                   │       │                           ├─ environment ────────┼─ assets ─┐
//                   │       │                           └─ cover               │          │
//                   │       └─ code → qa ─────────────────────────────────────┴──────────┴─ playtest → package
//                   └─ copy ──────────────────────────────────────────────────────────────────────────┘

export function buildGraph() {
  return [
    { id: "brief", agent: "brief", label: "Producer · brief", critical: true },
    { id: "design", agent: "designer", label: "Game Designer · GDD", deps: ["brief"], critical: true },
    { id: "art", agent: "artDirector", label: "Art Director · style + catalog", deps: ["design"], critical: true },
    { id: "keyart", agent: "illustrator", label: "Illustrator · key art (player)", params: { name: "player" }, deps: ["art"] },
    { id: "approve-style", agent: "gate", label: "Style approval", deps: ["keyart"] },
    { id: "sprites", agent: "spritePlan", label: "Sprite fan-out", deps: ["approve-style"] },
    { id: "environment", agent: "environmentArtist", label: "Environment Artist", deps: ["approve-style"] },
    { id: "cover", agent: "coverArtist", label: "Cover Artist", deps: ["approve-style", "keyart"] },
    { id: "assets", agent: "assetPack", label: "Asset pack", deps: ["keyart", "sprites", "group:sprite", "environment"] },
    { id: "code", agent: "engineer", label: "Engineer · game code", deps: ["design", "art"], critical: true },
    { id: "qa", agent: "codeQA", label: "Code QA · acceptance + repair", params: { from: "code" }, deps: ["code"], critical: true },
    { id: "copy", agent: "copywriter", label: "Copywriter", deps: ["design"] },
    { id: "playtest", agent: "playtester", label: "Playtester · browser + vision", deps: ["qa", "assets"] },
    { id: "package", agent: "publisher", label: "Publisher · package + provenance", deps: ["playtest", "cover", "copy", "assets"], critical: true }
  ];
}

// Edit graph — the router decides which specialists run: an art-only change
// never rewrites code, a gameplay change never redraws art.
export function editGraph() {
  return [
    { id: "edit-plan", agent: "editRouter", label: "Producer · route edit", critical: true },
    { id: "edit-sprites", agent: "spriteEditPlan", label: "Sprite changes", deps: ["edit-plan"] },
    { id: "code-edit", agent: "engineerEdit", label: "Engineer · apply change", deps: ["edit-plan", "edit-sprites"], critical: true },
    { id: "qa", agent: "codeQA", label: "Code QA · acceptance + repair", params: { from: "code-edit" }, deps: ["code-edit"], critical: true },
    { id: "assets", agent: "assetPack", label: "Asset pack", deps: ["edit-sprites", "group:sprite"] },
    { id: "playtest", agent: "playtester", label: "Playtester · browser + vision", deps: ["qa", "assets"] },
    { id: "package", agent: "publisher", label: "Publisher · package + provenance", deps: ["playtest", "assets"], critical: true }
  ];
}
