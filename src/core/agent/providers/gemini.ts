import { assertOk, type LLMProvider, type ModelOption, type ProviderConfig } from "./types.ts";
import type { ToolDef } from "../tools.ts";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Gemini uses an OpenAPI-subset schema and rejects a few things Anthropic
 * accepts — notably an empty `properties` object, and `additionalProperties`.
 */
function toGeminiTools(tools: ToolDef[]) {
  return [
    {
      function_declarations: tools.map((t) => {
        const props = t.input_schema.properties ?? {};
        const hasProps = Object.keys(props).length > 0;
        return {
          name: t.name,
          description: t.description,
          ...(hasProps
            ? {
                parameters: {
                  type: "OBJECT",
                  properties: Object.fromEntries(
                    Object.entries(props).map(([k, v]: [string, any]) => [
                      k,
                      {
                        type: (v.type ?? "string").toUpperCase(),
                        ...(v.description ? { description: v.description } : {}),
                        ...(v.enum ? { enum: v.enum } : {}),
                      },
                    ]),
                  ),
                  ...(t.input_schema.required?.length
                    ? { required: t.input_schema.required }
                    : {}),
                },
              }
            : {}),
        };
      }),
    },
  ];
}

function url(cfg: ProviderConfig, method: string) {
  return `${BASE}/${cfg.model}:${method}?key=${encodeURIComponent(cfg.apiKey)}`;
}

export const gemini: LLMProvider = {
  id: "gemini",
  label: "Google Gemini",
  blurb:
    "Has a genuinely free tier — no credit card, no prepaid credits. Rate limited but generous for one person. Reasoning is a step below Claude but well past adequate for this. The pragmatic default if you don't want to pay.",
  tier: "Good — free, no card needed",
  needsKey: true,
  keyUrl: "https://aistudio.google.com/apikey",
  defaultModel: "gemini-2.5-flash",
  suggestedModels: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],

  seedHistory(msgs) {
    // Gemini uses "model" rather than "assistant", and parts rather than content.
    return msgs.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));
  },

  async listModels(cfg): Promise<ModelOption[]> {
    const res = await fetch(
      `${BASE}?key=${encodeURIComponent(cfg.apiKey)}&pageSize=200`,
    );
    await assertOk(res, "Gemini");
    const data = await res.json();
    return (data.models ?? [])
      // Only models that can actually answer a chat turn.
      .filter((m: any) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m: any) => ({
        id: String(m.name).replace(/^models\//, ""),
        label: m.displayName ?? m.name,
      }));
  },

  async chat(cfg, req) {
    const contents = [...req.history, { role: "user", parts: [{ text: req.userText }] }];
    let text = "";

    for (let i = 0; i < (req.maxRounds ?? 6); i++) {
      const res = await fetch(url(cfg, "generateContent"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: req.system }] },
          contents,
          tools: toGeminiTools(req.tools),
          generationConfig: { maxOutputTokens: req.maxTokens ?? 1400 },
        }),
      });
      await assertOk(res, "Gemini");
      const data = await res.json();

      const parts: any[] = data.candidates?.[0]?.content?.parts ?? [];
      const roundText = parts
        .filter((p) => p.text)
        .map((p) => p.text)
        .join("");
      if (roundText) text += (text ? "\n\n" : "") + roundText;

      contents.push({ role: "model", parts });

      const calls = parts.filter((p) => p.functionCall);
      if (!calls.length) break;

      contents.push({
        role: "user",
        parts: calls.map((p) => {
          const name = p.functionCall.name;
          req.onToolCall?.(name);
          let out: string;
          try {
            out = req.runTool(name, p.functionCall.args ?? {});
          } catch (e) {
            out = `Tool error: ${e instanceof Error ? e.message : String(e)}`;
          }
          return { functionResponse: { name, response: { result: out } } };
        }),
      });
    }

    return { text, history: contents };
  },

  async complete(cfg, system, user) {
    const res = await fetch(url(cfg, "generateContent"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
      }),
    });
    await assertOk(res, "Gemini");
    const data = await res.json();
    return (data.candidates?.[0]?.content?.parts ?? [])
      .filter((p: any) => p.text)
      .map((p: any) => p.text)
      .join("");
  },
};
