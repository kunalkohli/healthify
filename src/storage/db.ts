import { del, get, set } from "idb-keyval";
import type {
  ChatMessage,
  JournalEntry,
  MemoryFact,
  Profile,
} from "../core/schema/index.ts";
import type { ProviderConfig, ProviderSettings } from "../core/agent/providers/index.ts";
import { emptyProviderSettings } from "../core/agent/providers/index.ts";
import type { LabUnitSystem, UnitSystem } from "../core/units.ts";
import type { Verbosity } from "../core/agent/prompts.ts";
import {
  decryptValue,
  encryptValue,
  isCryptoAvailable,
  isEncrypted,
  type VaultMeta,
} from "./crypto.ts";

/**
 * Platform adapter. Browser-specific and deliberately thin — a native port
 * replaces this file and nothing in src/core/.
 *
 * Everything except the vault metadata and unit preferences is encrypted at
 * rest with the in-memory data key. The only outbound network call the app
 * makes is to the chosen AI provider from the chat screen.
 */

const K = {
  vault: "hc:vault",
  profile: "hc:profile",
  memories: "hc:memories",
  journal: "hc:journal",
  chat: "hc:chat",
  config: "hc:providerconfig",
  units: "hc:units",
  labUnits: "hc:labunits",
  verbosity: "hc:verbosity",
  onboarded: "hc:onboarded",
};

/** Encrypted keys. Unit prefs and the onboarded flag stay clear — they leak nothing. */
const SECRET_KEYS = [K.profile, K.memories, K.journal, K.chat, K.config];

// ---------- key state (memory only) ----------

let dek: CryptoKey | null = null;
/** Set when running without a secure context, e.g. a plain-http LAN dev server. */
let plaintextMode = false;

export function setDek(k: CryptoKey | null): void {
  dek = k;
}
/** The live data key, or null when locked. Needed to re-wrap it for Face ID. */
export function getDek(): CryptoKey | null {
  return dek;
}
export function isUnlocked(): boolean {
  return dek !== null || plaintextMode;
}
export function lockVault(): void {
  dek = null;
}
export function setPlaintextMode(on: boolean): void {
  plaintextMode = on;
}
export function isPlaintextMode(): boolean {
  return plaintextMode;
}
export function cryptoAvailable(): boolean {
  return isCryptoAvailable();
}

async function putSecret(key: string, value: unknown): Promise<void> {
  if (dek) await set(key, await encryptValue(dek, value));
  else await set(key, value); // plaintext mode only
}

async function getSecret<T>(key: string, fallback: T): Promise<T> {
  const raw = await get(key);
  if (raw === undefined) return fallback;
  if (isEncrypted(raw)) {
    if (!dek) return fallback; // locked
    try {
      return await decryptValue<T>(dek, raw);
    } catch {
      return fallback;
    }
  }
  return raw as T;
}

// ---------- vault ----------

export async function loadVaultMeta(): Promise<VaultMeta | null> {
  return (await get<VaultMeta>(K.vault)) ?? null;
}
export async function saveVaultMeta(m: VaultMeta): Promise<void> {
  await set(K.vault, m);
}

/**
 * Re-write everything under the new key. Used when a vault is first created on
 * top of data that was written before encryption existed.
 */
export async function encryptExistingData(): Promise<void> {
  if (!dek) return;
  for (const key of SECRET_KEYS) {
    const raw = await get(key);
    if (raw === undefined || isEncrypted(raw)) continue;
    await set(key, await encryptValue(dek, raw));
  }
}

export async function destroyVault(): Promise<void> {
  for (const key of Object.values(K)) await del(key);
  dek = null;
}

// ---------- records ----------

export async function loadProfile(): Promise<Profile | null> {
  return getSecret<Profile | null>(K.profile, null);
}
export async function saveProfile(p: Profile): Promise<void> {
  await putSecret(K.profile, { ...p, updatedAt: new Date().toISOString() });
}

export async function loadMemories(): Promise<MemoryFact[]> {
  return getSecret<MemoryFact[]>(K.memories, []);
}
export async function saveMemories(m: MemoryFact[]): Promise<void> {
  await putSecret(K.memories, m);
}

export async function loadJournal(): Promise<JournalEntry[]> {
  return getSecret<JournalEntry[]>(K.journal, []);
}
export async function saveJournal(j: JournalEntry[]): Promise<void> {
  await putSecret(K.journal, j);
}

export async function loadChat(): Promise<ChatMessage[]> {
  return getSecret<ChatMessage[]>(K.chat, []);
}
export async function saveChat(c: ChatMessage[]): Promise<void> {
  await putSecret(K.chat, c);
}

export async function loadProviderSettings(): Promise<ProviderSettings> {
  const raw = await getSecret<ProviderSettings | ProviderConfig | null>(K.config, null);
  if (!raw) return emptyProviderSettings();
  // Migrate the older single-config shape into the keyring.
  if ("provider" in raw && !("configs" in raw)) {
    const cfg = raw as ProviderConfig;
    return { active: cfg.provider, configs: { [cfg.provider]: cfg } };
  }
  return raw as ProviderSettings;
}
export async function saveProviderSettings(s: ProviderSettings): Promise<void> {
  await putSecret(K.config, s);
}

// ---------- clear preferences ----------

export async function loadUnits(): Promise<UnitSystem> {
  return (await get<UnitSystem>(K.units)) ?? guessUnits();
}
export async function saveUnits(u: UnitSystem): Promise<void> {
  await set(K.units, u);
}

export async function loadLabUnits(): Promise<LabUnitSystem> {
  return (await get<LabUnitSystem>(K.labUnits)) ?? (guessUnits() === "imperial" ? "us" : "si");
}
export async function saveLabUnits(u: LabUnitSystem): Promise<void> {
  await set(K.labUnits, u);
}

/** Default from the device locale rather than making the user pick blind. */
function guessUnits(): UnitSystem {
  const imperialLocales = ["US", "LR", "MM"];
  const region = (navigator.language ?? "en-US").split("-")[1]?.toUpperCase() ?? "US";
  return imperialLocales.includes(region) ? "imperial" : "metric";
}

export async function loadVerbosity(): Promise<Verbosity> {
  return (await get<Verbosity>(K.verbosity)) ?? "brief";
}
export async function saveVerbosity(v: Verbosity): Promise<void> {
  await set(K.verbosity, v);
}

export async function loadOnboarded(): Promise<boolean> {
  return (await get<boolean>(K.onboarded)) ?? false;
}
export async function saveOnboarded(v: boolean): Promise<void> {
  await set(K.onboarded, v);
}

/**
 * iOS evicts web-app storage under pressure unless persistence is granted.
 * Installed home-screen apps normally get it; ask explicitly anyway.
 */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted?.()) return true;
  return navigator.storage.persist();
}

// ---------- backup ----------

export async function collectAll(): Promise<Record<string, unknown>> {
  const [profile, memories, journal, chat, providers] = await Promise.all([
    loadProfile(),
    loadMemories(),
    loadJournal(),
    loadChat(),
    loadProviderSettings(),
  ]);
  return { version: 2, profile, memories, journal, chat, providers };
}

export async function restoreAll(d: any): Promise<void> {
  if (d.profile) await saveProfile(d.profile);
  if (d.memories) await saveMemories(d.memories);
  if (d.journal) await saveJournal(d.journal);
  if (d.chat) await saveChat(d.chat);
  if (d.providers) await saveProviderSettings(d.providers);
  await saveOnboarded(true);
}
