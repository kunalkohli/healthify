import type { ToolDef } from "../tools.ts";

export type ProviderId = "anthropic" | "gemini" | "ollama" | "openai_compatible";

export type ProviderConfig = {
  provider: ProviderId;
  apiKey: string;
  model: string;
  /** Only used by ollama / openai_compatible. */
  baseUrl?: string;
};

export type ChatRequest = {
  system: string;
  /** Provider-native conversation history. Opaque to callers. */
  history: any[];
  userText: string;
  tools: ToolDef[];
  runTool: (name: string, input: Record<string, any>) => string;
  onToolCall?: (name: string) => void;
  maxRounds?: number;
  maxTokens?: number;
};

export type ChatResult = { text: string; history: any[] };

export type ModelOption = { id: string; label: string };

export interface LLMProvider {
  id: ProviderId;
  label: string;
  /** Shown in Settings so the tradeoffs are visible at the point of choosing. */
  blurb: string;
  /** Short quality/cost descriptor, shown only in the opened picker list. */
  tier: string;
  needsKey: boolean;
  keyUrl?: string;
  defaultModel: string;
  suggestedModels: string[];
  defaultBaseUrl?: string;
  chat(cfg: ProviderConfig, req: ChatRequest): Promise<ChatResult>;
  /** Single-shot completion, used for the memory-extraction pass. */
  complete(cfg: ProviderConfig, system: string, user: string): Promise<string>;
  /**
   * Ask the provider which models this key can actually use.
   * Hardcoded model IDs go stale and produce 404s, so the picker reads live.
   */
  listModels(cfg: ProviderConfig): Promise<ModelOption[]>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Turn a fetch failure into something a human can act on. */
export async function assertOk(res: Response, providerLabel: string): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => "");
  let detail = body.slice(0, 300);
  try {
    const j = JSON.parse(body);
    detail = j.error?.message ?? j.error?.[0]?.message ?? j.message ?? detail;
  } catch {
    /* keep raw */
  }
  const hint =
    res.status === 401 || res.status === 403
      ? " — check your API key."
      : res.status === 429
        ? " — rate limited or out of quota. Wait a moment, or check your plan."
        : res.status === 404
          ? " — that model name probably doesn't exist for this provider."
          : "";
  throw new ProviderError(`${providerLabel} error ${res.status}${hint}\n${detail}`, res.status);
}
