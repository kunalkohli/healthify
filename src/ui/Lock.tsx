import { useEffect, useState } from "react";
import {
  createVault,
  isPlatformAuthenticatorAvailable,
  unlockWithFaceId,
  unlockWithPassphrase,
  type VaultMeta,
} from "../storage/crypto.ts";
import * as db from "../storage/db.ts";
import { Button, H1, Screen, Sub } from "./primitives.tsx";

/**
 * Gate in front of the app.
 *
 * Three states: create a vault, unlock an existing one, or explain why
 * encryption is unavailable (non-secure origin) and offer a clearly-labelled
 * unencrypted mode for local testing.
 */
export function Lock({
  meta,
  onUnlocked,
}: {
  meta: VaultMeta | null;
  onUnlocked: () => void;
}) {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faceIdReady, setFaceIdReady] = useState(false);
  const [showRescue, setShowRescue] = useState(false);

  const available = db.cryptoAvailable();

  useEffect(() => {
    if (meta?.prf) isPlatformAuthenticatorAvailable().then(setFaceIdReady);
  }, [meta]);

  useEffect(() => {
    if (faceIdReady && meta?.prf) void tryFaceId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceIdReady]);

  async function tryFaceId() {
    if (!meta?.prf) return;
    setBusy(true);
    setError(null);
    try {
      db.setDek(await unlockWithFaceId(meta));
      onUnlocked();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/NotAllowed|cancel|abort/i.test(msg)) setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function doUnlock() {
    if (!meta) return;
    setBusy(true);
    setError(null);
    try {
      db.setDek(await unlockWithPassphrase(meta, pass));
      setPass("");
      onUnlocked();
    } catch {
      setError(
        "That passphrase didn't work. Check capitalisation and any leading or trailing space — tap Show to see exactly what you typed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function doCreate() {
    if (pass.length < 8) return setError("Use at least 8 characters.");
    if (pass !== confirm) return setError("The two passphrases don't match.");
    setBusy(true);
    setError(null);
    try {
      const { meta: m, dek } = await createVault(pass);
      db.setDek(dek);
      await db.saveVaultMeta(m);
      await db.encryptExistingData();
      setPass("");
      setConfirm("");
      onUnlocked();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** The only way out of a forgotten passphrase. Destroys everything. */
  async function doEraseAndRestart() {
    if (
      !confirmTwice(
        "Erase all data on this device and start over?",
        "Last chance — this permanently deletes your profile, family history, chats and settings. There is no backup unless you exported one.",
      )
    )
      return;
    await db.destroyVault();
    location.reload();
  }

  // ---------- no secure context ----------
  if (!available) {
    return (
      <Screen>
        <H1>Encryption unavailable</H1>
        <Sub>
          Browsers only expose the crypto and Face ID APIs over HTTPS. You're on a plain
          http:// address, so the vault can't be locked here.
        </Sub>
        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 mb-4 text-[14px] leading-relaxed">
          Deploy to any HTTPS host and this screen becomes a real passphrase + Face ID lock.
          Until then you can carry on unencrypted for testing — but don't enter real family
          medical history.
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            db.setPlaintextMode(true);
            onUnlocked();
          }}
        >
          Continue unencrypted (testing only)
        </Button>
      </Screen>
    );
  }

  // ---------- first run ----------
  if (!meta) {
    return (
      <Screen>
        <H1>Set a passphrase</H1>
        <Sub>
          This encrypts everything on this device. You can add Face ID afterwards so you rarely
          have to type it.
        </Sub>

        <PassField
          value={pass}
          onChange={setPass}
          reveal={reveal}
          onReveal={() => setReveal(!reveal)}
          placeholder="Passphrase"
          autoComplete="new-password"
          name="new-password"
        />
        <PassField
          value={confirm}
          onChange={setConfirm}
          reveal={reveal}
          placeholder="Confirm passphrase"
          autoComplete="new-password"
          name="confirm-password"
          onEnter={doCreate}
        />

        <div className="rounded-xl bg-[var(--color-warn-soft)] text-[var(--color-warn)] px-4 py-3 mb-4 text-[14px] leading-relaxed">
          There is no reset. The key is derived from this passphrase and nothing is stored on a
          server, so if you forget it the only option is erasing and starting over. Save it to
          your password manager now — tap Show first and check it character by character.
        </div>

        {error && <ErrorBox>{error}</ErrorBox>}

        <Button onClick={doCreate} disabled={busy || !pass || !confirm}>
          {busy ? "Encrypting…" : "Create vault"}
        </Button>
      </Screen>
    );
  }

  // ---------- unlock ----------
  return (
    <Screen>
      <div className="pt-16" />
      <H1>Locked</H1>
      <Sub>Enter your passphrase to open your health data.</Sub>

      <PassField
        value={pass}
        onChange={setPass}
        reveal={reveal}
        onReveal={() => setReveal(!reveal)}
        placeholder="Passphrase"
        autoComplete="current-password"
        name="password"
        onEnter={doUnlock}
      />

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="space-y-2">
        <Button onClick={doUnlock} disabled={busy || !pass}>
          {busy ? "Unlocking…" : "Unlock"}
        </Button>
        {meta.prf && faceIdReady && (
          <Button variant="ghost" onClick={tryFaceId} disabled={busy}>
            Use Face ID
          </Button>
        )}
      </div>

      {/* Escape hatch. Without this a mistyped passphrase bricks the app. */}
      <div className="mt-10">
        {showRescue ? (
          <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
            <p className="text-[14px] leading-relaxed mb-3">
              There's no recovery. The encryption key comes from your passphrase alone — nothing
              is stored on a server, so nobody, including me, can unlock this for you.
            </p>
            <p className="text-[14px] leading-relaxed mb-3 text-[var(--color-muted)]">
              Before erasing, try: tapping <strong>Show</strong> to check what you typed, turning
              off autocapitalisation, and checking for a trailing space. If you saved an encrypted
              backup you can restore it after erasing.
            </p>
            <Button variant="danger" onClick={doEraseAndRestart}>
              Erase everything and start over
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setShowRescue(true)}
            className="w-full text-center text-[14px] text-[var(--color-muted)] underline underline-offset-2 py-2"
          >
            Forgotten your passphrase?
          </button>
        )}
      </div>
    </Screen>
  );
}

function confirmTwice(a: string, b: string): boolean {
  return confirm(a) && confirm(b);
}

function PassField({
  value,
  onChange,
  reveal,
  onReveal,
  placeholder,
  autoComplete,
  name,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  reveal: boolean;
  onReveal?: () => void;
  placeholder: string;
  autoComplete: string;
  name: string;
  onEnter?: () => void;
}) {
  return (
    <div className="relative mb-3">
      <input
        // Revealing uses type=text so iOS doesn't mask it; autoComplete keeps
        // Keychain / 1Password able to save and refill it, which is the real
        // fix for mistyped passphrases.
        type={reveal ? "text" : "password"}
        name={name}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="w-full rounded-xl bg-[var(--color-surface)] border border-[var(--color-line)] px-4 py-3 pr-20 outline-none focus:border-[var(--color-accent)] focus:bg-white"
      />
      {onReveal && (
        <button
          type="button"
          onClick={onReveal}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg text-[13px] text-[var(--color-muted)] bg-white border border-[var(--color-line)]"
        >
          {reveal ? "Hide" : "Show"}
        </button>
      )}
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-red-200 bg-[var(--color-danger-soft)] px-4 py-3 mb-4 text-[14px] text-[var(--color-danger)] leading-relaxed">
      {children}
    </div>
  );
}
