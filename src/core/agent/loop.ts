import { TOOLS, runTool, type ToolContext } from "./tools.ts";
import { getProvider, type ProviderConfig } from "./providers/index.ts";

/**
 * Thin façade over the provider adapters. Everything above this line is
 * provider-agnostic; everything below knows about one specific API shape.
 */

/**
 * How many prior turns to keep in the conversation sent to the model.
 *
 * Storage is cheap — a few thousand messages is about a megabyte. Tokens are
 * not: every turn resends the whole array, so an unbounded session bills more
 * on each message than the last. Durable facts survive trimming because they
 * are distilled into memory and re-injected via the system prompt.
 */
export const MAX_HISTORY_ENTRIES = 24;

/**
 * A tool result whose originating tool call has been trimmed away is a hard
 * API error on every provider, so after slicing we drop leading entries until
 * the history starts on a clean user turn.
 */
function startsCleanly(entry: any): boolean {
  if (!entry || entry.role === "tool") return false;
  const role = entry.role;
  if (role !== "user") return false;
  const c = entry.content;
  if (typeof c === "string") return true;
  if (Array.isArray(c)) return !c.some((b: any) => b?.type === "tool_result");
  if (Array.isArray(entry.parts)) return !entry.parts.some((b: any) => b?.functionResponse);
  return false;
}

export function trimHistory(history: any[], max = MAX_HISTORY_ENTRIES): any[] {
  if (history.length <= max) return history;
  let cut = history.slice(-max);
  while (cut.length && !startsCleanly(cut[0])) cut = cut.slice(1);
  // If nothing qualified, start fresh rather than send a malformed array.
  return cut;
}

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
    history: trimHistory(opts.history),
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
