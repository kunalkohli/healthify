import { anthropic } from "./anthropic.ts";
import { gemini } from "./gemini.ts";
import { ollama, openaiCompatible } from "./openaiCompat.ts";
import type { LLMProvider, ProviderConfig, ProviderId } from "./types.ts";

export * from "./types.ts";

/** Order matters — this is the order shown in Settings. Free options first. */
export const PROVIDERS: LLMProvider[] = [gemini, anthropic, ollama, openaiCompatible];

export function getProvider(id: ProviderId): LLMProvider {
  return PROVIDERS.find((p) => p.id === id) ?? gemini;
}

export function defaultConfig(id: ProviderId): ProviderConfig {
  const p = getProvider(id);
  return {
    provider: id,
    apiKey: "",
    model: p.defaultModel,
    baseUrl: p.defaultBaseUrl,
  };
}

/**
 * Settings hold one config PER vendor, plus which one is active.
 *
 * Keeping a keyring rather than a single config means switching from Anthropic
 * to Gemini and back doesn't discard your Anthropic key — the previous design
 * reset to defaults on every vendor change.
 */
export type ProviderSettings = {
  active: ProviderId;
  configs: Partial<Record<ProviderId, ProviderConfig>>;
};

export function emptyProviderSettings(): ProviderSettings {
  return { active: "gemini", configs: {} };
}

export function activeConfig(s: ProviderSettings): ProviderConfig {
  return s.configs[s.active] ?? defaultConfig(s.active);
}

export function selectProvider(s: ProviderSettings, id: ProviderId): ProviderSettings {
  return {
    active: id,
    // Preserve whatever was already entered for this vendor.
    configs: { ...s.configs, [id]: s.configs[id] ?? defaultConfig(id) },
  };
}

export function updateActiveConfig(s: ProviderSettings, cfg: ProviderConfig): ProviderSettings {
  return { active: cfg.provider, configs: { ...s.configs, [cfg.provider]: cfg } };
}

/** Has this vendor been given everything it needs? Drives the picker ticks. */
export function isConfigured(s: ProviderSettings, id: ProviderId): boolean {
  const cfg = s.configs[id];
  return !!cfg && configProblem(cfg) === null;
}

/** Is this config usable, and if not, why? */
export function configProblem(cfg: ProviderConfig): string | null {
  const p = getProvider(cfg.provider);
  if (p.needsKey && !cfg.apiKey.trim()) return `Add your ${p.label} API key.`;
  if (!cfg.model.trim()) return "Pick a model.";
  if ((p.id === "ollama" || p.id === "openai_compatible") && !cfg.baseUrl?.trim())
    return "Set the server URL.";
  return null;
}
