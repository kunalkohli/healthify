/**
 * Local encryption for the health vault.
 *
 * Architecture: a random 256-bit data key (DEK) encrypts every record. The DEK
 * itself is never stored in the clear — it is wrapped separately by
 *   (a) a passphrase-derived key, and
 *   (b) optionally a Face ID / passkey-derived key (WebAuthn PRF).
 *
 * Wrapping one DEK twice, rather than encrypting data twice, means adding or
 * removing Face ID never re-encrypts the database, and changing the passphrase
 * only rewrites ~100 bytes.
 *
 * The DEK lives in memory only. Locking drops the reference.
 *
 * NOTE: crypto.subtle and WebAuthn both require a secure context. On plain
 * http:// (a LAN dev server) none of this is available — see isCryptoAvailable.
 */

const ENC = new TextEncoder();
const DEC = new TextDecoder();

/** OWASP's current floor for PBKDF2-HMAC-SHA256. ~0.5s on an A15. */
export const PBKDF2_ITERATIONS = 600_000;

export type Blob_ = { iv: string; ct: string };

export type VaultMeta = {
  v: 1;
  /** DEK wrapped with the passphrase-derived key. */
  passphrase: { salt: string; iterations: number } & Blob_;
  /** DEK wrapped with a WebAuthn PRF-derived key, if Face ID is enrolled. */
  prf?: { credentialId: string; prfSalt: string } & Blob_;
  createdAt: string;
};

// ---------- encoding ----------

function b64(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function isCryptoAvailable(): boolean {
  return typeof crypto !== "undefined" && !!crypto.subtle && window.isSecureContext;
}

// ---------- key derivation ----------

async function deriveFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", ENC.encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Stretch a PRF output into an AES key. HKDF because the PRF output is already high-entropy. */
async function deriveFromPrf(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", prfOutput, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: ENC.encode("health-coach/prf-wrap/v1"),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ---------- primitives ----------

async function wrap(kek: CryptoKey, raw: ArrayBuffer): Promise<Blob_> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, kek, raw);
  return { iv: b64(iv), ct: b64(ct) };
}

async function unwrap(kek: CryptoKey, blob: Blob_): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(blob.iv) as BufferSource },
    kek,
    unb64(blob.ct) as BufferSource,
  );
}

async function importDek(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

// ---------- vault lifecycle ----------

export async function createVault(
  passphrase: string,
): Promise<{ meta: VaultMeta; dek: CryptoKey }> {
  const dekRaw = randomBytes(32);
  const salt = randomBytes(32);
  const kek = await deriveFromPassphrase(passphrase, salt, PBKDF2_ITERATIONS);
  const wrapped = await wrap(kek, dekRaw.buffer as ArrayBuffer);
  return {
    meta: {
      v: 1,
      passphrase: { salt: b64(salt), iterations: PBKDF2_ITERATIONS, ...wrapped },
      createdAt: new Date().toISOString(),
    },
    dek: await importDek(dekRaw.buffer as ArrayBuffer),
  };
}

export async function unlockWithPassphrase(
  meta: VaultMeta,
  passphrase: string,
): Promise<CryptoKey> {
  const kek = await deriveFromPassphrase(
    passphrase,
    unb64(meta.passphrase.salt),
    meta.passphrase.iterations,
  );
  // A wrong passphrase fails the GCM auth tag — no separate verifier needed.
  const raw = await unwrap(kek, meta.passphrase);
  return importDek(raw);
}

export async function changePassphrase(
  meta: VaultMeta,
  dek: CryptoKey,
  next: string,
): Promise<VaultMeta> {
  const raw = await crypto.subtle.exportKey("raw", dek);
  const salt = randomBytes(32);
  const kek = await deriveFromPassphrase(next, salt, PBKDF2_ITERATIONS);
  return {
    ...meta,
    passphrase: {
      salt: b64(salt),
      iterations: PBKDF2_ITERATIONS,
      ...(await wrap(kek, raw)),
    },
  };
}

// ---------- record encryption ----------

export async function encryptValue(dek: CryptoKey, value: unknown): Promise<Blob_> {
  return wrap(dek, ENC.encode(JSON.stringify(value)).buffer as ArrayBuffer);
}

export async function decryptValue<T>(dek: CryptoKey, blob: Blob_): Promise<T> {
  return JSON.parse(DEC.decode(await unwrap(dek, blob))) as T;
}

export function isEncrypted(v: unknown): v is Blob_ {
  return !!v && typeof v === "object" && "iv" in (v as any) && "ct" in (v as any);
}

// ---------- WebAuthn / Face ID ----------

export function isWebAuthnAvailable(): boolean {
  return (
    isCryptoAvailable() &&
    typeof PublicKeyCredential !== "undefined" &&
    !!navigator.credentials?.create
  );
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnAvailable()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

const RP_NAME = "Health Coach";

/**
 * Enrol Face ID. Requires the vault to already be unlocked, because we wrap the
 * existing DEK rather than minting a new one — both unlock paths must yield the
 * same key or half your data becomes unreadable.
 */
export async function enrollFaceId(meta: VaultMeta, dek: CryptoKey): Promise<VaultMeta> {
  const prfSalt = randomBytes(32);
  const userId = randomBytes(16);

  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32) as BufferSource,
      rp: { name: RP_NAME, id: location.hostname },
      user: { id: userId as BufferSource, name: "you", displayName: "You" },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
      timeout: 60_000,
      extensions: { prf: { eval: { first: prfSalt as BufferSource } } } as any,
    },
  })) as PublicKeyCredential | null;

  if (!cred) throw new Error("Face ID setup was cancelled.");

  const ext = cred.getClientExtensionResults() as any;
  if (!ext?.prf?.enabled && !ext?.prf?.results?.first) {
    throw new Error(
      "This device's passkey doesn't support the PRF extension, which is what derives the encryption key. Your passphrase still works.",
    );
  }

  // Many authenticators only produce PRF output on get(), not create().
  let prfOutput: ArrayBuffer | undefined = ext?.prf?.results?.first;
  if (!prfOutput) {
    prfOutput = await evaluatePrf(cred.rawId, prfSalt);
  }
  if (!prfOutput) throw new Error("Could not derive a key from Face ID on this device.");

  const kek = await deriveFromPrf(prfOutput);
  const raw = await crypto.subtle.exportKey("raw", dek);

  return {
    ...meta,
    prf: {
      credentialId: b64(cred.rawId),
      prfSalt: b64(prfSalt),
      ...(await wrap(kek, raw)),
    },
  };
}

async function evaluatePrf(
  credentialId: ArrayBuffer,
  prfSalt: Uint8Array,
): Promise<ArrayBuffer | undefined> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32) as BufferSource,
      rpId: location.hostname,
      allowCredentials: [{ type: "public-key", id: credentialId as BufferSource }],
      userVerification: "required",
      timeout: 60_000,
      extensions: { prf: { eval: { first: prfSalt as BufferSource } } } as any,
    },
  })) as PublicKeyCredential | null;
  const ext = assertion?.getClientExtensionResults() as any;
  return ext?.prf?.results?.first;
}

export async function unlockWithFaceId(meta: VaultMeta): Promise<CryptoKey> {
  if (!meta.prf) throw new Error("Face ID isn't set up on this device.");
  const out = await evaluatePrf(unb64(meta.prf.credentialId).buffer as ArrayBuffer, unb64(meta.prf.prfSalt));
  if (!out) throw new Error("Face ID didn't return a key. Use your passphrase.");
  const kek = await deriveFromPrf(out);
  const raw = await unwrap(kek, meta.prf);
  return importDek(raw);
}

export function removeFaceId(meta: VaultMeta): VaultMeta {
  const { prf: _drop, ...rest } = meta;
  return rest as VaultMeta;
}

// ---------- encrypted backup ----------

export type EncryptedExport = {
  format: "health-coach-encrypted";
  v: 1;
  kdf: { salt: string; iterations: number };
  exportedAt: string;
} & Blob_;

export async function encryptExport(
  passphrase: string,
  payload: unknown,
): Promise<EncryptedExport> {
  const salt = randomBytes(32);
  const kek = await deriveFromPassphrase(passphrase, salt, PBKDF2_ITERATIONS);
  const blob = await wrap(kek, ENC.encode(JSON.stringify(payload)).buffer as ArrayBuffer);
  return {
    format: "health-coach-encrypted",
    v: 1,
    kdf: { salt: b64(salt), iterations: PBKDF2_ITERATIONS },
    exportedAt: new Date().toISOString(),
    ...blob,
  };
}

export async function decryptExport<T>(passphrase: string, file: EncryptedExport): Promise<T> {
  const kek = await deriveFromPassphrase(
    passphrase,
    unb64(file.kdf.salt),
    file.kdf.iterations,
  );
  return JSON.parse(DEC.decode(await unwrap(kek, file))) as T;
}
