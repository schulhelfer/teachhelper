export const WORKSPACE_VAULT_SCHEMA = 'teachhelper-grade-vault-v1';
export const WORKSPACE_VAULT_AAD_SCHEMA = 'teachhelper-db-v1';
export const WORKSPACE_VAULT_KDF_ITERATIONS = 250000;

function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomBytes(length, cryptoProvider = globalThis.crypto) {
  const bytes = new Uint8Array(Math.max(0, Number(length) || 0));
  cryptoProvider.getRandomValues(bytes);
  return bytes;
}

export function normalizeWorkspaceVaultKdf(raw = null) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    name: 'PBKDF2',
    hash: 'SHA-256',
    iterations: Math.max(100000, Number(source.iterations) || WORKSPACE_VAULT_KDF_ITERATIONS),
    salt: String(source.salt || ''),
  };
}

export function createWorkspaceVaultKdf({
  iterations = WORKSPACE_VAULT_KDF_ITERATIONS,
  cryptoProvider = globalThis.crypto,
} = {}) {
  return normalizeWorkspaceVaultKdf({
    iterations,
    salt: bytesToBase64(randomBytes(16, cryptoProvider)),
  });
}

export function buildWorkspaceVaultAad(scope = {}) {
  return new TextEncoder().encode(JSON.stringify({
    schema: WORKSPACE_VAULT_AAD_SCHEMA,
    gradeVault: {
      schema: WORKSPACE_VAULT_SCHEMA,
      type: String(scope.type || 'vault'),
      courseId: Number(scope.courseId) || 0,
    },
  }));
}

export async function deriveWorkspaceVaultKey(password, kdfConfig, cryptoProvider = globalThis.crypto) {
  const kdf = normalizeWorkspaceVaultKdf(kdfConfig);
  const baseKey = await cryptoProvider.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(password || '')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const cryptoKey = await cryptoProvider.subtle.deriveKey({
    name: 'PBKDF2',
    hash: 'SHA-256',
    iterations: kdf.iterations,
    salt: base64ToBytes(kdf.salt),
  }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { cryptoKey, kdf };
}

export async function encryptWorkspaceVaultText(
  plaintext,
  cryptoKey,
  kdfConfig,
  scope = {},
  cryptoProvider = globalThis.crypto,
) {
  const kdf = normalizeWorkspaceVaultKdf(kdfConfig);
  const iv = randomBytes(12, cryptoProvider);
  const ciphertext = await cryptoProvider.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: buildWorkspaceVaultAad(scope),
    tagLength: 128,
  }, cryptoKey, new TextEncoder().encode(String(plaintext || '')));
  return {
    schema: WORKSPACE_VAULT_SCHEMA,
    kdf,
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv), tagLength: 128 },
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptWorkspaceVaultText(
  envelope,
  cryptoKey,
  kdfConfig,
  scope = {},
  cryptoProvider = globalThis.crypto,
) {
  const source = envelope && typeof envelope === 'object' ? envelope : null;
  const kdf = normalizeWorkspaceVaultKdf(kdfConfig || source?.kdf);
  if (
    !source
    || String(source.schema || '') !== WORKSPACE_VAULT_SCHEMA
    || !source.ciphertext
    || !kdf.salt
    || !source.cipher?.iv
  ) {
    throw new Error('Der verschlüsselte Notenbereich ist unvollständig.');
  }
  try {
    const plaintext = await cryptoProvider.subtle.decrypt({
      name: 'AES-GCM',
      iv: base64ToBytes(source.cipher.iv),
      additionalData: buildWorkspaceVaultAad(scope),
      tagLength: Number(source.cipher.tagLength) || 128,
    }, cryptoKey, base64ToBytes(source.ciphertext));
    return new TextDecoder().decode(new Uint8Array(plaintext));
  } catch {
    throw new Error('Passwort falsch oder Notendaten beschädigt.');
  }
}
