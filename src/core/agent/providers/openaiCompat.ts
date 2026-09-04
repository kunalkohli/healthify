import { assertOk, type LLMProvider, type ModelOption, type ProviderConfig } from "./types.ts";
import type { ToolDef } from "../tools.ts";

/**
 * One implementation covering every OpenAI-shaped API: Ollama, LM Studio,
 * Groq, OpenRouter, Together, and OpenAI itself. They differ only in base URL
 * and whether a key is required.
 */
function toOpenAITools(tools: ToolDef[]) {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

async function run(
  cfg: ProviderConfig,
  label: string,
  body: Record<string, unknown>,
): Promise<any> {
  const base = (cfg.baseUrl ?? "").replace(/\/$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: cfg.model, ...body }),
  });
  await assertOk(res, label);
  return res.json();
}

function makeProvider(
  id: "ollama" | "openai_compatible",
  label: string,
  blurb: string,
  opts: {
    tier: string;
    needsKey: boolean;
    keyUrl?: string;
    defaultModel: string;
    suggestedModels: string[];
    defaultBaseUrl: string;
  },
): LLMProvider {
  return {
    id,
    label,
    blurb,
    tier: opts.tier,
    needsKey: opts.needsKey,
    keyUrl: opts.keyUrl,
    defaultModel: opts.defaultModel,
    suggestedModels: opts.suggestedModels,
    defaultBaseUrl: opts.defaultBaseUrl,

    async listModels(cfg): Promise<ModelOption[]> {
      const base = (cfg.baseUrl ?? "").replace(/\/$/, "");
      const res = await fetch(`${base}/models`, {
        headers: cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {},
      });
      await assertOk(res, label);
      const data = await res.json();
      return (data.data ?? []).map((m: any) => ({ id: m.id, label: m.id }));
    },

    async chat(cfg, req) {
      const messages = [
        { role: "system", content: req.system },
        ...req.history,
        { role: "user", content: req.userText },
      ];
      let text = "";

      for (let i = 0; i < (req.maxRounds ?? 6); i++) {
        const data = await run(cfg, label, {
          messages,
          tools: toOpenAITools(req.tools),
          max_tokens: req.maxTokens ?? 1400,
        });
        const msg = data.choices?.[0]?.message;
        if (!msg) break;

        if (msg.content) text += (text ? "\n\n" : "") + msg.content;
        messages.push(msg);

        const calls = msg.tool_calls ?? [];
        if (!calls.length) break;

        for (const c of calls) {
          const name = c.function?.name;
          req.onToolCall?.(name);
          let args: Record<string, any> = {};
          try {
            args = JSON.parse(c.function?.arguments || "{}");
          } catch {
            /* model emitted malformed JSON; run with empty args */
          }
          let out: string;
          try {
            out = req.runTool(name, args);
          } catch (e) {
            out = `Tool error: ${e instanceof Error ? e.message : String(e)}`;
          }
          messages.push({ role: "tool", tool_call_id: c.id, content: out });
        }
      }

      // Drop the system message — it's regenerated fresh each turn.
      return { text, history: messages.slice(1) };
    },

    async complete(cfg, system, user) {
      const data = await run(cfg, label, {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 1024,
      });
      return data.choices?.[0]?.message?.content ?? "";
    },
  };
}

export const ollama = makeProvider(
  "ollama",
  "Ollama (on your Mac)",
  "Completely free and fully private — your health data never leaves your home network. Downside: your Mac must be awake and on the same Wi-Fi, and a small local model reasons noticeably worse than Claude or Gemini. Run `OLLAMA_ORIGINS='*' ollama serve` so the browser is allowed to connect.",
  {
    tier: "Basic — free, runs on your Mac, fully private",
    needsKey: false,
    defaultModel: "llama3.2",
    suggestedModels: ["llama3.2", "qwen2.5:7b", "mistral-nemo", "gpt-oss:20b"],
    defaultBaseUrl: "http://localhost:11434/v1",
  },
);

export const openaiCompatible = makeProvider(
  "openai_compatible",
  "Other (OpenAI-compatible)",
  "Any OpenAI-shaped endpoint: Groq and OpenRouter both have free tiers, or point it at OpenAI, Together, or LM Studio.",
  {
    tier: "Varies — Groq and OpenRouter have free tiers",
    needsKey: true,
    defaultModel: "llama-3.3-70b-versatile",
    suggestedModels: [
      "llama-3.3-70b-versatile",
      "openai/gpt-oss-120b",
      "deepseek/deepseek-chat-v3.1:free",
    ],
    defaultBaseUrl: "https://api.groq.com/openai/v1",
  },
);
