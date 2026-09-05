import { useEffect, useState } from "react";
import type { MemoryFact, Profile } from "../core/schema/index.ts";
import {
  PROVIDERS,
  activeConfig,
  configProblem,
  getProvider,
  isConfigured,
  selectProvider,
  updateActiveConfig,
  type ModelOption,
  type ProviderId,
  type ProviderSettings,
} from "../core/agent/providers/index.ts";
import type { LabUnitSystem, UnitSystem } from "../core/units.ts";
import type { Verbosity } from "../core/agent/prompts.ts";
import * as db from "../storage/db.ts";
import {
  changePassphrase,
  decryptExport,
  encryptExport,
  enrollFaceId,
  isPlatformAuthenticatorAvailable,
  removeFaceId,
  unlockWithPassphrase,
  type VaultMeta,
} from "../storage/crypto.ts";
import { IconChevron } from "./icons.tsx";
import {
  Button,
  Card,
  Field,
  H1,
  Picker,
  Screen,
  Segmented,
  Select,
  Sub,
  TextInput,
} from "./primitives.tsx";

export function Settings({
  vault,
  onVault,
  onLock,
  providers,
  onProviders,
  units,
  onUnits,
  labUnits,
  onLabUnits,
  verbosity,
  onVerbosity,
  chatDays,
  onChatDays,
  onClearChat,
  memories,
  onMemories,
  profile,
  onEditProfile,
  onReset,
}: {
  vault: VaultMeta | null;
  onVault: (v: VaultMeta | null) => void;
  onLock: () => void;
  providers: ProviderSettings;
  onProviders: (s: ProviderSettings) => void;
  units: UnitSystem;
  onUnits: (u: UnitSystem) => void;
  labUnits: LabUnitSystem;
  onLabUnits: (u: LabUnitSystem) => void;
  verbosity: Verbosity;
  onVerbosity: (v: Verbosity) => void;
  chatDays: db.ChatRetention;
  onChatDays: (d: db.ChatRetention) => void;
  onClearChat: () => void;
  memories: MemoryFact[];
  onMemories: (m: MemoryFact[]) => void;
  profile: Profile;
  onEditProfile: () => void;
  onReset: () => void;
}) {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [faceIdPossible, setFaceIdPossible] = useState(false);
  const [secNote, setSecNote] = useState<string | null>(null);
  const [secErr, setSecErr] = useState<string | null>(null);

  useEffect(() => {
    isPlatformAuthenticatorAvailable().then(setFaceIdPossible);
  }, []);

  const config = activeConfig(providers);
  const provider = getProvider(config.provider);
  const problem = configProblem(config);
  const onConfig = (c: typeof config) => onProviders(updateActiveConfig(providers, c));

  // ---- live model list ----
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  async function fetchModels() {
    if (configProblem({ ...config, model: "x" })) return; // key/url still missing
    setLoadingModels(true);
    setModelError(null);
    try {
      const list = await provider.listModels(config);
      setModels(list);
      // If the saved model isn't in the account's list, switch to the first one
      // rather than letting the user discover it via a 404 mid-conversation.
      if (list.length && !list.some((m) => m.id === config.model)) {
        onConfig({ ...config, model: list[0].id });
      }
    } catch (e) {
      setModels(null);
      setModelError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingModels(false);
    }
  }

  // Reset the list whenever the vendor changes.
  useEffect(() => {
    setModels(null);
    setModelError(null);
  }, [config.provider]);

  /** Encrypted with a passphrase you choose, so the file is safe to AirDrop or email. */
  async function doExport() {
    setSecErr(null);
    const pass = prompt(
      "Passphrase to encrypt this backup.\n\nYou'll need it to restore on another device.",
    );
    if (!pass) return;
    try {
      const payload = await db.collectAll();
      const file = await encryptExport(pass, payload);
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `health-vault-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSecNote("Backup saved. Keep the passphrase somewhere safe.");
    } catch (e) {
      setSecErr(e instanceof Error ? e.message : String(e));
    }
  }

  function doImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      setSecErr(null);
      try {
        const parsed = JSON.parse(await f.text());
        if (parsed?.format === "health-coach-encrypted") {
          const pass = prompt("Passphrase for this backup file:");
          if (!pass) return;
          await db.restoreAll(await decryptExport<any>(pass, parsed));
        } else {
          // Older unencrypted export.
          await db.restoreAll(parsed);
        }
        location.reload();
      } catch {
        setSecErr("Couldn't read that file — wrong passphrase, or not a backup.");
      }
    };
    input.click();
  }

  async function doEnrollFaceId() {
    if (!vault) return;
    setSecErr(null);
    setSecNote(null);
    try {
      const next = await enrollFaceId(vault, requireDek());
      await db.saveVaultMeta(next);
      onVault(next);
      setSecNote("Face ID enabled on this device.");
    } catch (e) {
      setSecErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function doRemoveFaceId() {
    if (!vault) return;
    const next = removeFaceId(vault);
    await db.saveVaultMeta(next);
    onVault(next);
    setSecNote("Face ID removed. Passphrase still works.");
  }

  async function doChangePassphrase() {
    if (!vault) return;
    setSecErr(null);
    setSecNote(null);
    const current = prompt("Current passphrase:");
    if (!current) return;
    const next = prompt("New passphrase (min 8 characters):");
    if (!next) return;
    if (next.length < 8) return setSecErr("Use at least 8 characters.");
    try {
      const dek = await unlockWithPassphrase(vault, current);
      const updated = await changePassphrase(vault, dek, next);
      await db.saveVaultMeta(updated);
      onVault(updated);
      setSecNote("Passphrase changed.");
    } catch {
      setSecErr("Current passphrase was wrong.");
    }
  }

  /** Face ID enrolment re-wraps the existing data key rather than minting a new one. */
  function requireDek(): CryptoKey {
    const k = db.getDek();
    if (!k) throw new Error("Vault is locked.");
    return k;
  }

  const approved = memories.filter((m) => m.approved);

  return (
    <Screen>
      <H1>Settings</H1>
      <Sub>Your data never leaves this device except in messages you send to the coach.</Sub>

      <h2 className="text-[13px] uppercase tracking-wide text-[var(--color-muted)] mb-3">Units</h2>
      <Card>
        <Field label="Height & weight">
          <Segmented
            value={units}
            onChange={onUnits}
            options={[
              { value: "metric", label: "cm / kg" },
              { value: "imperial", label: "ft·in / lb" },
            ]}
          />
        </Field>
        <Field
          label="Lab results"
          hint="US uses mg/dL and HbA1c %. SI uses mmol/L and mmol/mol — standard in Canada, the UK, and most of Europe."
        >
          <Segmented
            value={labUnits}
            onChange={onLabUnits}
            options={[
              { value: "us", label: "mg/dL" },
              { value: "si", label: "mmol/L" },
            ]}
          />
        </Field>
      </Card>

      <h2 className="text-[13px] uppercase tracking-wide text-[var(--color-muted)] mt-8 mb-3">
        AI provider
      </h2>

      <Card>
        <Field label="Vendor">
          <Picker
            title="Choose a provider"
            value={config.provider}
            onChange={(v: ProviderId) => onProviders(selectProvider(providers, v))}
            options={PROVIDERS.map((p) => ({
              value: p.id,
              label: p.label,
              // Tradeoffs surface only when the list is open.
              note: p.tier,
              // Each vendor keeps its own key, so switching is lossless.
              badge: isConfigured(providers, p.id) ? "key saved" : undefined,
            }))}
          />
        </Field>

        <p className="text-[14px] text-[var(--color-muted)] leading-relaxed -mt-2 mb-5">
          {provider.blurb}
        </p>

        {provider.needsKey && (
          <Field label="API key">
            <div className="flex gap-2">
              <div className="flex-1">
                <TextInput
                  type={showKey ? "text" : "password"}
                  value={config.apiKey}
                  onChange={(e) => onConfig({ ...config, apiKey: e.target.value })}
                  placeholder="Paste your key"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              <button
                onClick={() => setShowKey(!showKey)}
                className="px-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-line)] text-[13px] text-[var(--color-muted)]"
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
            {provider.keyUrl && (
              <a
                href={provider.keyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-[13px] text-[var(--color-accent-ink)] mt-2 underline"
              >
                Get a key →
              </a>
            )}
          </Field>
        )}

        {(provider.id === "ollama" || provider.id === "openai_compatible") && (
          <Field
            label="Server URL"
            hint={
              provider.id === "ollama"
                ? "From your phone this must be your Mac's LAN address, not localhost — e.g. http://192.168.1.177:11434/v1"
                : undefined
            }
          >
            <TextInput
              value={config.baseUrl ?? ""}
              onChange={(e) => onConfig({ ...config, baseUrl: e.target.value })}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>
        )}

        <Field
          label="Model"
          hint={
            models
              ? `${models.length} models available on this key.`
              : "Load the list so you pick an ID that actually exists — model names change over time."
          }
        >
          {models && models.length > 0 ? (
            <Select
              value={config.model}
              onChange={(v) => onConfig({ ...config, model: v })}
              options={models.map((m) => ({ value: m.id, label: m.label }))}
            />
          ) : (
            <>
              <TextInput
                value={config.model}
                onChange={(e) => onConfig({ ...config, model: e.target.value })}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {provider.suggestedModels.map((m) => (
                  <button
                    key={m}
                    onClick={() => onConfig({ ...config, model: m })}
                    className={`px-3 py-1.5 rounded-full text-[13px] border ${
                      config.model === m
                        ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                        : "bg-white border-[var(--color-line)] text-[var(--color-muted)]"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mt-3">
            <Button variant="ghost" onClick={fetchModels} disabled={loadingModels}>
              {loadingModels
                ? "Checking…"
                : models
                  ? "Refresh model list"
                  : "Load models & test key"}
            </Button>
          </div>

          {modelError && (
            <div className="mt-2 rounded-xl border border-red-200 bg-[var(--color-danger-soft)] px-3 py-2.5 text-[13px] text-[var(--color-danger)] leading-relaxed whitespace-pre-wrap">
              {modelError}
            </div>
          )}
        </Field>

        <Field
          label="Keep chat transcripts for"
          hint="Old conversations are cleared automatically. Nothing important is lost — durable facts and your current plan are stored separately and carried forward."
        >
          <Segmented
            value={String(chatDays)}
            onChange={(v) => onChatDays(Number(v) as db.ChatRetention)}
            options={[
              { value: "1", label: "1 day" },
              { value: "2", label: "2 days" },
              { value: "7", label: "1 week" },
              { value: "0", label: "Forever" },
            ]}
          />
          <div className="mt-3">
            <Button
              variant="ghost"
              onClick={() => {
                if (confirm("Clear the chat transcript now? Saved facts and your plan stay.")) {
                  onClearChat();
                }
              }}
            >
              Clear chat transcript now
            </Button>
          </div>
        </Field>

        <Field
          label="Reply length"
          hint="Output tokens cost about 5x what input tokens do, so this is the main lever on your bill. Brief keeps answers to a few sentences."
        >
          <Segmented
            value={verbosity}
            onChange={onVerbosity}
            options={[
              { value: "brief", label: "Brief" },
              { value: "normal", label: "Normal" },
              { value: "detailed", label: "Detailed" },
            ]}
          />
        </Field>

        <div
          className={`rounded-xl px-3 py-2.5 text-[14px] ${
            problem
              ? "bg-[var(--color-warn-soft)] text-[var(--color-warn)]"
              : "bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]"
          }`}
        >
          {problem ?? `Ready — using ${config.model}.`}
        </div>
      </Card>

      <h2 className="text-[13px] uppercase tracking-wide text-[var(--color-muted)] mt-8 mb-3">
        Profile
      </h2>
      <Card onClick={onEditProfile}>
        <div className="flex justify-between items-center">
          <div>
            <div className="font-medium">Edit health profile</div>
            <div className="text-[14px] text-[var(--color-muted)] mt-0.5">
              {profile.family.length} relatives · {profile.labs.length} lab results
            </div>
          </div>
          <IconChevron className="text-[var(--color-muted)]" />
        </div>
      </Card>

      <h2 className="text-[13px] uppercase tracking-wide text-[var(--color-muted)] mt-8 mb-3">
        What the coach remembers ({approved.length})
      </h2>
      {approved.length === 0 ? (
        <Card>
          <p className="text-[14px] text-[var(--color-muted)]">
            Nothing yet. After a few conversations the coach will propose things to remember, and
            you approve them.
          </p>
        </Card>
      ) : (
        <Card>
          {approved.map((m) => (
            <div
              key={m.id}
              className="flex items-start gap-2 py-2 border-b border-[var(--color-line)] last:border-0"
            >
              <span className="text-[11px] uppercase text-[var(--color-muted)] w-20 shrink-0 pt-0.5">
                {m.category}
              </span>
              <span className="flex-1 text-[14px] leading-snug">{m.text}</span>
              <button
                onClick={() => onMemories(memories.filter((x) => x.id !== m.id))}
                className="text-[var(--color-muted)] px-1 text-lg leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </Card>
      )}

      <h2 className="text-[13px] uppercase tracking-wide text-[var(--color-muted)] mt-8 mb-3">
        Security
      </h2>
      {db.isPlaintextMode() ? (
        <Card>
          <p className="text-[14px] text-[var(--color-warn)] leading-relaxed">
            Running unencrypted because this page isn't served over HTTPS. Deploy to an HTTPS
            host to enable the passphrase lock and Face ID.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {faceIdPossible &&
            (vault?.prf ? (
              <Button variant="ghost" onClick={doRemoveFaceId}>
                Face ID is on — turn off
              </Button>
            ) : (
              <Button variant="ghost" onClick={doEnrollFaceId}>
                Enable Face ID unlock
              </Button>
            ))}
          <Button variant="ghost" onClick={doChangePassphrase}>
            Change passphrase
          </Button>
          <Button variant="ghost" onClick={onLock}>
            Lock now
          </Button>
        </div>
      )}

      <h2 className="text-[13px] uppercase tracking-wide text-[var(--color-muted)] mt-8 mb-3">
        Backup & moving device
      </h2>
      <div className="space-y-2">
        <Button variant="ghost" onClick={doExport}>
          Export encrypted backup
        </Button>
        <Button variant="ghost" onClick={doImport}>
          Restore from backup
        </Button>
        <Button variant="ghost" onClick={async () => setPersisted(await db.requestPersistence())}>
          {persisted === null
            ? "Request persistent storage"
            : persisted
              ? "Storage is persistent ✓"
              : "Denied — needs HTTPS and home-screen install"}
        </Button>
      </div>

      {secNote && (
        <div className="mt-3 rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)] px-4 py-3 text-[14px]">
          {secNote}
        </div>
      )}
      {secErr && (
        <div className="mt-3 rounded-xl border border-red-200 bg-[var(--color-danger-soft)] px-4 py-3 text-[14px] text-[var(--color-danger)] leading-relaxed">
          {secErr}
        </div>
      )}

      <p className="text-[13px] text-[var(--color-muted)] leading-relaxed mt-4">
        <strong>Moving to a new phone:</strong> export here, send the file to the new device
        (AirDrop, iCloud Drive, email — it's encrypted, so any of those is fine), open the app
        there and choose Restore. Face ID is tied to each device's secure enclave, so you'll
        set that up again on the new phone; your passphrase carries over.
      </p>
      <p className="text-[13px] text-[var(--color-muted)] leading-relaxed mt-2">
        Export regularly. Browser storage on iOS is durable for installed home-screen apps but
        not guaranteed — and there's no cloud copy of any of this.
      </p>

      <div className="mt-8 mb-4">
        <Button
          variant="danger"
          onClick={() => {
            if (confirm("Erase all health data on this device? This cannot be undone.")) onReset();
          }}
        >
          Erase everything
        </Button>
      </div>
    </Screen>
  );
}
