import { Agent, fetch as undiciFetch } from "undici";
import { mockChat, mockImage } from "./mock.js";

// Node's built-in fetch gives up when response headers take over 5 minutes;
// a model that thinks for a long time before its first token (Opus writing a
// whole game) can take longer. Our own per-call timer is the limit instead.
const longCalls = new Agent({ headersTimeout: 0, bodyTimeout: 0, keepAliveTimeout: 30_000 });

// 0G router client. Claude models are served on the Anthropic Messages format
// (/messages); every other model on the OpenAI chat format. Responses are
// streamed so long generations never hit Node's 5-minute header timeout.

const DEFAULT_BASE_URL = "https://router-api.0g.ai/v1";

// Mock replies are for local development. In production (NODE_ENV=production,
// set by the Dockerfile) a missing key is an error, never a silent mock game.
export function isMockMode() {
  if (/^(1|true|yes|on)$/i.test(String(process.env.LLM_MOCK ?? ""))) return true;
  return !process.env.ZERO_G_API_KEY && process.env.NODE_ENV !== "production";
}

export function llmConfigError() {
  if (isMockMode() || process.env.ZERO_G_API_KEY) return null;
  return "ZERO_G_API_KEY is not set on the compute layer (set it in the service environment, or LLM_MOCK=1 to test offline)";
}

function clientConfig() {
  return {
    apiKey: process.env.ZERO_G_API_KEY,
    baseUrl: (process.env.ZERO_G_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "")
  };
}

const isAnthropic = (model) => /^claude-/i.test(String(model || ""));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function flattenText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p === "string" ? p : p?.text ?? "")).join("\n");
  return String(content ?? "");
}

function toAnthropicPart(part) {
  if (typeof part === "string") return { type: "text", text: part };
  if (part?.type === "image_url") {
    const url = String(part.image_url?.url ?? part.image_url ?? "");
    const m = url.match(/^data:([^;]+);base64,(.+)$/s);
    return m
      ? { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } }
      : { type: "image", source: { type: "url", url } };
  }
  return { type: "text", text: part?.text ?? "" };
}

// The router's Anthropic passthrough rejects a top-level `system`, so the
// system prompt is folded into the first user turn.
function toAnthropicBody({ model, messages, maxTokens, thinking }) {
  const system = [];
  const convo = [];
  for (const m of messages) {
    const hasImage = Array.isArray(m.content) && m.content.some((p) => p?.type === "image_url");
    if (m.role === "system") { system.push(flattenText(m.content)); continue; }
    const role = m.role === "assistant" ? "assistant" : "user";
    convo.push({ role, content: hasImage ? m.content.map(toAnthropicPart) : flattenText(m.content) });
  }
  const systemText = system.join("\n\n");
  if (systemText) {
    const first = convo.find((m) => m.role === "user");
    if (!first) convo.unshift({ role: "user", content: systemText });
    else if (Array.isArray(first.content)) first.content.unshift({ type: "text", text: systemText });
    else first.content = `${systemText}\n\n${first.content}`;
  }
  return { model, max_tokens: maxTokens, stream: true, ...(thinking ? { thinking } : {}), messages: convo };
}

async function readSse(response, onEvent) {
  const decoder = new TextDecoder();
  let buffer = "";
  let raw = "";
  let sawSse = false;
  for await (const chunk of response.body) {
    const text = decoder.decode(chunk, { stream: true });
    buffer += text;
    raw += text;
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      sawSse = true;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try { onEvent(JSON.parse(payload)); } catch { /* keepalive / partial */ }
    }
  }
  return { sawSse, raw };
}

async function streamOpenAI(response, onChunk) {
  let content = "", finishReason = null, usage = null;
  const { sawSse, raw } = await readSse(response, (chunk) => {
    const choice = chunk.choices?.[0];
    if (choice?.delta?.content) content += choice.delta.content;
    if (choice?.message?.content) content += choice.message.content;
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (chunk.usage) usage = chunk.usage;
    onChunk?.(content.length);
  });
  if (!sawSse) {
    const data = raw ? JSON.parse(raw) : {};
    const choice = data.choices?.[0];
    return { content: choice?.message?.content ?? "", finishReason: choice?.finish_reason ?? null, usage: data.usage ?? null };
  }
  return { content, finishReason, usage };
}

async function streamAnthropic(response, onChunk) {
  let content = "", finishReason = null, input = 0, output = 0;
  const mapStop = (r) => (r === "max_tokens" ? "length" : r === "end_turn" || r === "stop_sequence" ? "stop" : r ?? null);
  const { sawSse, raw } = await readSse(response, (evt) => {
    if (evt.type === "content_block_delta" && evt.delta?.text) { content += evt.delta.text; onChunk?.(content.length); }
    else if (evt.type === "message_start") input = evt.message?.usage?.input_tokens ?? input;
    else if (evt.type === "message_delta") {
      if (evt.delta?.stop_reason) finishReason = mapStop(evt.delta.stop_reason);
      if (evt.usage?.output_tokens) output = evt.usage.output_tokens;
    }
  });
  if (!sawSse) {
    const data = raw ? JSON.parse(raw) : {};
    const text = Array.isArray(data.content) ? data.content.filter((b) => b.type === "text").map((b) => b.text).join("") : "";
    return {
      content: text,
      finishReason: mapStop(data.stop_reason),
      usage: { prompt_tokens: data.usage?.input_tokens ?? 0, completion_tokens: data.usage?.output_tokens ?? 0, total_tokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0) }
    };
  }
  return { content, finishReason, usage: { prompt_tokens: input, completion_tokens: output, total_tokens: input + output } };
}

async function errorFromResponse(response) {
  const raw = await response.text().catch(() => "");
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { /* not json */ }
  const message = data?.error?.message || (typeof data?.error === "string" ? data.error : null) || `0G request failed with status ${response.status}`;
  const error = new Error(message);
  error.status = response.status;
  return error;
}

// Models that reject a temperature (or accept only 1) are remembered after
// their first refusal, so every later call is sent in the shape they accept.
const TEMPERATURE_RULES = new Map();
function temperatureFor(model, wanted) {
  const rule = TEMPERATURE_RULES.get(model);
  if (rule === "omit") return undefined;
  if (rule === "one") return 1;
  return wanted;
}
function learnTemperature(model, error) {
  const msg = String(error?.message ?? "");
  if (error?.status !== 400 || !/temperature/i.test(msg) || TEMPERATURE_RULES.has(model)) return false;
  TEMPERATURE_RULES.set(model, /only 1 is allowed|must be 1/i.test(msg) ? "one" : "omit");
  return true;
}

// Newer Claude models refuse `thinking: { type: "disabled" }` (they think
// adaptively, and the router rejects the request — for some only when the
// prompt is long). For them the setting is dropped and max_tokens gets
// headroom for the hidden reasoning, so JSON and code are never cut off.
const THINKS_ALWAYS = /^claude-(opus|sonnet|haiku|fable)-5[.-]5|^claude-fable-/i;
const NO_DISABLE = new Set();
// Models that always think spend part of max_tokens on thinking before the
// first word of the answer, so they get headroom on top of the answer budget:
// a whole game from Opus once used all 32K on thinking and returned no code.
function thinkingFor(model, thinking, maxTokens) {
  const thinks = THINKS_ALWAYS.test(model) || NO_DISABLE.has(model);
  const headroom = thinks ? Math.min(128000, maxTokens + Math.max(8000, Math.min(maxTokens, 32000))) : maxTokens;
  if (thinking?.type === "disabled" && thinks) return { thinking: undefined, maxTokens: headroom };
  return { thinking, maxTokens: thinks ? headroom : maxTokens };
}
function learnThinking(model, thinking, error) {
  if (error?.status !== 400 || thinking?.type !== "disabled" || NO_DISABLE.has(model)) return false;
  NO_DISABLE.add(model);
  return true;
}

const retriable = (error) => !error.status || error.status === 408 || error.status === 429 || error.status >= 500;

/**
 * chat({ model, messages, purpose, maxTokens, temperature, timeoutMs, retries, thinking, onChunk, signal })
 * → { model, content, finishReason, usage, ms }
 * `purpose` names the calling agent; it drives mock responses and usage logs.
 */
export async function chat(options) {
  const { model, messages, purpose = "chat", temperature = 0.4, maxTokens = 4000, timeoutMs = 180000, retries = 2, thinking, onChunk, signal } = options;
  const started = Date.now();
  if (isMockMode()) {
    const content = await mockChat({ purpose, messages, model });
    return { model: `mock:${model}`, content, finishReason: "stop", usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, ms: Date.now() - started };
  }
  const { apiKey, baseUrl } = clientConfig();
  let lastError;
  let budget = maxTokens;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal?.aborted) throw new Error("Cancelled");
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener?.("abort", onAbort);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const anthropic = isAnthropic(model);
      const response = await undiciFetch(`${baseUrl}${anthropic ? "/messages" : "/chat/completions"}`, {
        method: "POST",
        dispatcher: longCalls,
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(anthropic ? { "anthropic-version": "2023-06-01" } : {}) },
        body: JSON.stringify(anthropic
          ? toAnthropicBody({ model, messages, ...thinkingFor(model, thinking, budget) })
          : { model, messages, temperature: temperatureFor(model, temperature), max_tokens: budget, stream: true })
      });
      if (!response.ok) throw await errorFromResponse(response);
      const result = anthropic ? await streamAnthropic(response, onChunk) : await streamOpenAI(response, onChunk);
      if (!result.content) { const e = new Error(`0G returned no message content (stop: ${result.finishReason ?? "unknown"})`); e.status = result.finishReason === "refusal" ? 422 : 502; throw e; }
      return { model, ...result, ms: Date.now() - started };
    } catch (original) {
      let error = original;
      // undici reports a dropped stream as "fetch failed" / "terminated"; keep the cause.
      if (error?.cause && /fetch failed|terminated/i.test(error.message)) error = new Error(`${error.message}: ${error.cause.code || error.cause.message || error.cause}`);
      if (error.name === "AbortError") { error = new Error(signal?.aborted ? "Cancelled" : `0G request timed out after ${timeoutMs}ms`); error.status = signal?.aborted ? 499 : 504; }
      lastError = error;
      if (learnTemperature(model, error)) { attempt -= 1; continue; }
      if (isAnthropic(model) && learnThinking(model, thinking, error)) { attempt -= 1; continue; }
      // All of the budget went on thinking: the same request would fail the same way, so double it.
      if (/no message content \(stop: length\)/.test(error.message) && budget < 64000) { budget = Math.min(64000, budget * 2); attempt -= 1; continue; }
      if (attempt >= retries || !retriable(error) || signal?.aborted) throw error;
      await sleep(1000 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
    }
  }
  throw lastError;
}

/** generateImage({ model, prompt, size }) → Buffer (PNG/JPEG bytes) */
export async function generateImage({ model, prompt, size = "1024x1024", timeoutMs = 90000, attempts = 3 }) {
  if (isMockMode()) return mockImage({ prompt, size });
  const { apiKey, baseUrl } = clientConfig();
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/images/generations`, {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, size, n: 1 })
      });
      if (!response.ok) throw await errorFromResponse(response);
      const data = await response.json();
      const image = data.data?.[0];
      if (image?.b64_json) return Buffer.from(image.b64_json, "base64");
      if (image?.url) {
        const img = await fetch(image.url, { signal: controller.signal });
        if (!img.ok) throw new Error(`Image download failed (${img.status})`);
        return Buffer.from(await img.arrayBuffer());
      }
      throw new Error("Image model returned no image");
    } catch (error) {
      lastError = error.name === "AbortError" ? new Error(`Image request timed out after ${timeoutMs}ms`) : error;
      if (attempt < attempts) await sleep(1500 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}
