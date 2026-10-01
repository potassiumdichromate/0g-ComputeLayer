import { mockChat, mockImage } from "./mock.js";

// 0G router client. Claude models are served on the Anthropic Messages format
// (/messages); every other model on the OpenAI chat format. Responses are
// streamed so long generations never hit Node's 5-minute header timeout.

const DEFAULT_BASE_URL = "https://router-api.0g.ai/v1";

export function isMockMode() {
  return /^(1|true|yes|on)$/i.test(String(process.env.LLM_MOCK ?? "")) || !process.env.ZERO_G_API_KEY;
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
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal?.aborted) throw new Error("Cancelled");
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener?.("abort", onAbort);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const anthropic = isAnthropic(model);
      const response = await fetch(`${baseUrl}${anthropic ? "/messages" : "/chat/completions"}`, {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(anthropic ? { "anthropic-version": "2023-06-01" } : {}) },
        body: JSON.stringify(anthropic
          ? toAnthropicBody({ model, messages, maxTokens, thinking })
          : { model, messages, temperature, max_tokens: maxTokens, stream: true })
      });
      if (!response.ok) throw await errorFromResponse(response);
      const result = anthropic ? await streamAnthropic(response, onChunk) : await streamOpenAI(response, onChunk);
      if (!result.content) { const e = new Error("0G returned no message content"); e.status = 502; throw e; }
      return { model, ...result, ms: Date.now() - started };
    } catch (original) {
      let error = original;
      if (error.name === "AbortError") { error = new Error(signal?.aborted ? "Cancelled" : `0G request timed out after ${timeoutMs}ms`); error.status = signal?.aborted ? 499 : 504; }
      lastError = error;
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
