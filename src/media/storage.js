import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { DATA_DIR } from "../config/env.js";

// Artifact storage for a run. Local disk by default (served at /files/...).
// Swap this module for R2 / 0G Storage in production: callers only use
// put() → { url, path, sha256, bytes } and read().

const isLocalUrl = (url) => /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(String(url || ""));

// Base URL for every artifact URL handed to clients (sprites, covers, games).
// It must be reachable from creator-studio and players' browsers, so on a
// deployed service a localhost value is ignored in favor of the public URL
// (RENDER_EXTERNAL_URL is set automatically on Render web services).
export function publicBaseUrl() {
  const configured = process.env.PUBLIC_BASE_URL;
  const platform = process.env.RENDER_EXTERNAL_URL;
  const base = configured && !(isLocalUrl(configured) && platform) ? configured : platform || configured || `http://localhost:${process.env.PORT || 4100}`;
  return base.replace(/\/$/, "");
}

// A deployed service that hands out localhost URLs produces games whose art
// never loads. Reported on /health.
export function publicUrlProblem() {
  if (process.env.NODE_ENV !== "production" || !isLocalUrl(publicBaseUrl())) return null;
  return `Asset URLs point to ${publicBaseUrl()}, which players and creator-studio cannot reach. Set PUBLIC_BASE_URL to this service's public https URL.`;
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function putArtifact(runId, relPath, buffer) {
  const safeRel = relPath.replace(/\.\./g, "").replace(/^\/+/, "");
  const full = join(DATA_DIR, "runs", runId, "files", safeRel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, buffer);
  return {
    path: safeRel,
    url: `${publicBaseUrl()}/files/${encodeURIComponent(runId)}/${safeRel.split("/").map(encodeURIComponent).join("/")}`,
    sha256: sha256(buffer),
    bytes: buffer.length
  };
}

export async function readArtifact(runId, relPath) {
  return readFile(join(DATA_DIR, "runs", runId, "files", relPath));
}

// A file reference is "<runId>/<relative path>".
export async function readFileRef(ref) {
  const [runId, ...rest] = String(ref).split("/");
  return readArtifact(runId, rest.join("/"));
}

export function mimeFor(path) {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".js")) return "text/javascript";
  return "application/octet-stream";
}
