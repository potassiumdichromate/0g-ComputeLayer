import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { DATA_DIR } from "../config/env.js";

// Artifact storage for a run. Local disk by default (served at /files/...).
// Swap this module for R2 / 0G Storage in production: callers only use
// put() → { url, path, sha256, bytes } and read().

export function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 4100}`).replace(/\/$/, "");
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
