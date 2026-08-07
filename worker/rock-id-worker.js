// Cloudflare Worker: photo -> ranked mineral/rock suggestions via Claude vision.
// Holds the Anthropic API key as a secret; the static app never sees it.
//
// Deploy: see worker/README.md. Set the secret with:  wrangler secret put ANTHROPIC_API_KEY
//
// The app POSTs { image: <data-URL or base64>, mediaType, names: [candidate names] }.
// Returns { results: [{ name, confidence, reasoning, confirm_tests }] }.
//
// Honest framing baked into the prompt: photo ID of raw specimens is unreliable,
// so results are SUGGESTIONS that route the user into the diagnostic key.

const MODEL = "claude-opus-4-8"; // vision-strong. Switch to "claude-sonnet-5" or "claude-haiku-4-5" to cut cost.

const CORS = {
  "Access-Control-Allow-Origin": "*", // ponytail: lock to your Pages origin once deployed
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") return json({ error: "POST only" }, 405);

    let body;
    try { body = await request.json(); } catch { return json({ error: "bad JSON" }, 400); }

    const { image, mediaType = "image/jpeg", names } = body;
    if (!image || !Array.isArray(names) || !names.length) {
      return json({ error: "need { image, names[] }" }, 400);
    }
    const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!OK_TYPES.includes(mediaType)) return json({ error: "unsupported image type" }, 400);
    // strip a data-URL prefix if present; cap the candidate list defensively
    const data = String(image).replace(/^data:[^,]+,/, "");
    if (data.length > 7_000_000) return json({ error: "image too large (max ~5MB)" }, 413); // base64 ~1.33x
    const candidates = names.slice(0, 300).map(String);

    const system =
      "You are an expert mineralogist and petrologist helping identify a rock, mineral, or gem " +
      "from a single amateur photo of a hand specimen. Photo-only identification of raw specimens " +
      "is inherently unreliable — color and form mislead, and even experts cannot distinguish many " +
      "species by eye. Treat your answers as SUGGESTIONS to be confirmed with physical tests, never " +
      "as determinations. Choose only from the provided candidate list. For each pick, give the " +
      "physical tests (hardness, streak, cleavage, acid, heft, etc.) that would confirm or rule it out.";

    // Constrain output names to the candidate list via an enum — guarantees valid names.
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string", enum: candidates },
              confidence: { type: "number" },
              reasoning: { type: "string" },
              confirm_tests: { type: "string" },
            },
            required: ["name", "confidence", "reasoning", "confirm_tests"],
          },
        },
      },
      required: ["results"],
    };

    const anthropicReq = {
      model: MODEL,
      max_tokens: 1024,
      system,
      output_config: { format: { type: "json_schema", schema } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data } },
          { type: "text", text:
            `Identify the 3 most likely candidates for this specimen, most likely first, ` +
            `with a confidence 0-1 and the key confirming tests.\n\nCandidates: ${candidates.join(", ")}` },
        ],
      }],
    };

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicReq),
    });

    if (!r.ok) {
      console.error("anthropic upstream error", r.status, await r.text()); // server-side only (wrangler tail)
      return json({ error: "identification service failed" }, 502);        // no upstream detail to the client
    }
    const msg = await r.json();
    // structured output guarantees the first text block is valid JSON matching the schema
    const text = (msg.content || []).find(b => b.type === "text")?.text || "{}";
    let parsed;
    try { parsed = JSON.parse(text); } catch { return json({ error: "parse", raw: text }, 502); }
    return json(parsed, 200);
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}
