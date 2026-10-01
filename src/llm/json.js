// Structured output helper: ask for JSON, validate it against a zod schema,
// and if it does not validate, show the model its own reply plus the exact
// validation errors once and ask again. Only after that does the caller's
// fallback kick in.

export function extractJson(text) {
  const source = String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?/gi, "");
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in the reply");
  const body = source.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch (first) {
    // Forgive the two most common slips: trailing commas and smart quotes.
    const relaxed = body.replace(/,\s*([}\]])/g, "$1").replace(/[“”]/g, '"');
    try { return JSON.parse(relaxed); } catch { throw first; }
  }
}

function describeZodError(error) {
  return error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

export async function askJson({ llm, schema, messages, attempts = 2, ...options }) {
  const convo = [...messages];
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    // Structured replies are short; Claude models would otherwise spend the
    // max_tokens budget on hidden thinking and cut the JSON off.
    const reply = await llm.chat({ thinking: { type: "disabled" }, ...options, messages: convo });
    try {
      if (reply.finishReason === "length") throw new Error("the reply was cut off before the JSON finished — be more concise");
      const parsed = schema.safeParse(extractJson(reply.content));
      if (!parsed.success) throw new Error(describeZodError(parsed.error));
      return { value: parsed.data, model: reply.model };
    } catch (error) {
      lastError = error;
      convo.push(
        { role: "assistant", content: reply.content.slice(0, 12000) },
        { role: "user", content: `That reply was not valid: ${error.message}. Return the complete answer again as ONE strictly valid JSON object, no commentary, no trailing commas, no unescaped double quotes inside strings.` }
      );
    }
  }
  throw new Error(`Structured output invalid after ${attempts} attempts: ${lastError?.message}`);
}
