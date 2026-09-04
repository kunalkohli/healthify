import { useEffect, useState } from "react";
import {
  createVault,
  isPlatformAuthenticatorAvailable,
  unlockWithFaceId,
  unlockWithPassphrase,
  type VaultMeta,
} from "../storage/crypto.ts";
import * as db from "../storage/db.ts";
import { Button, H1, Screen, Sub, TextInput } from "./primitives.tsx";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faceIdReady, setFaceIdReady] = useState(false);

  const available = db.cryptoAvailable();

  useEffect(() => {
    if (meta?.prf) isPlatformAuthenticatorAvailable().then(setFaceIdReady);
  }, [meta]);

  // Offer Face ID immediately — it's the fast path when enrolled.
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
      // Cancelling Face ID is normal; fall through to the passphrase field.
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
      setError("That passphrase didn't work.");
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
      // Anything written before the vault existed gets encrypted now.
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
          This encrypts everything on this device. You can add Face ID afterwards for quick
          unlocking.
        </Sub>

        <div className="mb-4">
          <TextInput
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="Passphrase"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <div className="mb-4">
          <TextInput
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm passphrase"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onKeyDown={(e) => e.key === "Enter" && doCreate()}
          />
        </div>

        <div className="rounded-xl bg-[var(--color-warn-soft)] text-[var(--color-warn)] px-4 py-3 mb-4 text-[14px] leading-relaxed">
          There is no reset. The key is derived from this passphrase and nothing is stored on a
          server, so if you forget it the data is unrecoverable. Put it in your password manager
          now.
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
      <div className="pt-20" />
      <H1>Locked</H1>
      <Sub>Enter your passphrase to open your health data.</Sub>

      <div className="mb-4">
        <TextInput
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="Passphrase"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onKeyDown={(e) => e.key === "Enter" && doUnlock()}
        />
      </div>

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
    </Screen>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-red-200 bg-[var(--color-danger-soft)] px-4 py-3 mb-4 text-[14px] text-[var(--color-danger)] leading-relaxed">
      {children}
    </div>
  );
}
