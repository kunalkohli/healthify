import {
  assertOk,
  type ChatResult,
  type LLMProvider,
  type ModelOption,
  type ProviderConfig,
} from "./types.ts";

const URL_ = "https://api.anthropic.com/v1/messages";

function headers(cfg: ProviderConfig) {
  return {
    "content-type": "application/json",
    "x-api-key": cfg.apiKey,
    "anthropic-version": "2023-06-01",
    // Required to call the API straight from a browser.
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

export const anthropic: LLMProvider = {
  id: "anthropic",
  label: "Anthropic (Claude)",
  blurb:
    "Best reasoning quality. Requires prepaid API credits — a free claude.ai account does not include API access. Minimum top-up is $5, which lasts a long time at personal usage.",
  tier: "Best — needs $5 of prepaid credit",
  needsKey: true,
  keyUrl: "https://console.anthropic.com/settings/keys",
  // Undated aliases resolve to the current snapshot and don't rot.
  defaultModel: "claude-sonnet-4-6",
  suggestedModels: ["claude-sonnet-4-6", "claude-opus-4-5", "claude-haiku-4-5"],

  seedHistory(msgs) {
    return msgs.map((m) => ({ role: m.role, content: m.content }));
  },

  async listModels(cfg): Promise<ModelOption[]> {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: headers(cfg),
    });
    await assertOk(res, "Anthropic");
    const data = await res.json();
    return (data.data ?? []).map((m: any) => ({
      id: m.id,
      label: m.display_name ?? m.id,
    }));
  },

  async chat(cfg, req): Promise<ChatResult> {
    const messages = [...req.history, { role: "user", content: req.userText }];
    let text = "";

    for (let i = 0; i < (req.maxRounds ?? 6); i++) {
      const res = await fetch(URL_, {
        method: "POST",
        headers: headers(cfg),
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: req.maxTokens ?? 1400,
          // The profile / family history / risk docs are identical every turn.
          // Marking them cacheable bills repeat reads at ~10% of input price
          // and keeps them out of the ITPM rate limit.
          system: [
            { type: "text", text: req.system, cache_control: { type: "ephemeral" } },
          ],
          tools: req.tools,
          messages,
        }),
      });
      await assertOk(res, "Anthropic");
      const data = await res.json();
      const blocks: any[] = data.content ?? [];

      const roundText = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (roundText) text += (text ? "\n\n" : "") + roundText;

      messages.push({ role: "assistant", content: blocks });

      const toolUses = blocks.filter((b) => b.type === "tool_use");
      if (!toolUses.length) break;

      messages.push({
        role: "user",
        content: toolUses.map((tu) => {
          req.onToolCall?.(tu.name);
          let out: string;
          try {
            out = req.runTool(tu.name, tu.input ?? {});
          } catch (e) {
            out = `Tool error: ${e instanceof Error ? e.message : String(e)}`;
          }
          return { type: "tool_result", tool_use_id: tu.id, content: out };
        }),
      });
    }

    return { text, history: messages };
  },

  async complete(cfg, system, user) {
    const res = await fetch(URL_, {
      method: "POST",
      headers: headers(cfg),
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    await assertOk(res, "Anthropic");
    const data = await res.json();
    return (data.content ?? []).find((b: any) => b.type === "text")?.text ?? "";
  },
};
