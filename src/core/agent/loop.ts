import { TOOLS, runTool, type ToolContext } from "./tools.ts";
import { getProvider, type ProviderConfig } from "./providers/index.ts";

/**
 * Thin façade over the provider adapters. Everything above this line is
 * provider-agnostic; everything below knows about one specific API shape.
 */

export type ChatOptions = {
  config: ProviderConfig;
  system: string;
  /** Provider-native history from the previous call. Start with []. */
  history: any[];
  userText: string;
  toolContext: ToolContext;
  onToolCall?: (name: string) => void;
  maxRounds?: number;
  maxTokens?: number;
};

export async function chat(opts: ChatOptions): Promise<{ text: string; history: any[] }> {
  const provider = getProvider(opts.config.provider);
  return provider.chat(opts.config, {
    system: opts.system,
    history: opts.history,
    userText: opts.userText,
    tools: TOOLS,
    runTool: (name, input) => runTool(name, input, opts.toolContext),
    onToolCall: opts.onToolCall,
    maxRounds: opts.maxRounds,
    maxTokens: opts.maxTokens,
  });
}

/** Cheap second pass that distils durable facts from a transcript. */
export async function extractMemories(
  config: ProviderConfig,
  transcript: string,
  prompt: string,
): Promise<{ text: string; category: string }[]> {
  const provider = getProvider(config.provider);
  try {
    const text = await provider.complete(config, prompt, transcript);
    const m = text.match(/\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : [];
  } catch {
    return [];
  }
}
