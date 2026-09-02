export const WORKSPACE_VAULT_SCHEMA = 'teachhelper-grade-vault-v1';
export const WORKSPACE_VAULT_AAD_SCHEMA = 'teachhelper-db-v1';
export const WORKSPACE_VAULT_KDF_ITERATIONS = 600000;
export const WORKSPACE_VAULT_KDF_MIN_ITERATIONS = 100000;
export const WORKSPACE_VAULT_KDF_MAX_ITERATIONS = 2000000;
export const WORKSPACE_VAULT_SALT_BYTES = 16;
export const WORKSPACE_VAULT_IV_BYTES = 12;
export const WORKSPACE_VAULT_TAG_LENGTH = 128;
export const WORKSPACE_VAULT_CONTAINER_AUTH_SCHEMA = 'teachhelper-thdb-auth-v1';
export const WORKSPACE_VAULT_CONTAINER_AUTH_ALGORITHM = 'AES-GCM';
export const WORKSPACE_VAULT_CONTAINER_AUTH_TAG_BYTES = 16;

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

function base64LengthForBytes(length) {
  return Math.ceil(length / 3) * 4;
}

function decodeFixedBase64(value, byteLength, label) {
  const encoded = typeof value === 'string' ? value : '';
  if (encoded.length !== base64LengthForBytes(byteLength)) {
    throw new Error(`${label} hat eine ungültige Länge.`);
  }
  let bytes;
  try {
    bytes = base64ToBytes(encoded);
  } catch {
    throw new Error(`${label} ist nicht gültig Base64-kodiert.`);
  }
  if (bytes.length !== byteLength || bytesToBase64(bytes) !== encoded) {
    throw new Error(`${label} ist ungültig.`);
  }
  return bytes;
}

function randomBytes(length, cryptoProvider = globalThis.crypto) {
  const bytes = new Uint8Array(Math.max(0, Number(length) || 0));
  cryptoProvider.getRandomValues(bytes);
  return bytes;
}

function buildWorkspaceVaultContainerAuthenticationAad(payload) {
  return new TextEncoder().encode(String(payload || ''));
}

function validateWorkspaceVaultContainerAuthentication(authentication) {
  const source = authentication && typeof authentication === 'object' ? authentication : null;
  if (
    !source
    || Number(source.version) !== 1
    || String(source.schema || '') !== WORKSPACE_VAULT_CONTAINER_AUTH_SCHEMA
    || String(source.algorithm || '') !== WORKSPACE_VAULT_CONTAINER_AUTH_ALGORITHM
    || Number(source.tagLength) !== WORKSPACE_VAULT_TAG_LENGTH
  ) {
    throw new Error('Die THDB-Authentifizierung ist ungültig.');
  }
  return {
    iv: decodeFixedBase64(source.iv, WORKSPACE_VAULT_IV_BYTES, 'Der THDB-Authentifizierungs-IV'),
    tag: decodeFixedBase64(source.tag, WORKSPACE_VAULT_CONTAINER_AUTH_TAG_BYTES, 'Der THDB-Authentifizierungs-Tag'),
  };
}

export function normalizeWorkspaceVaultKdf(raw = null) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    name: 'PBKDF2',
    hash: 'SHA-256',
    iterations: Math.max(WORKSPACE_VAULT_KDF_MIN_ITERATIONS, Number(source.iterations) || WORKSPACE_VAULT_KDF_ITERATIONS),
    salt: String(source.salt || ''),
  };
}

export function validateWorkspaceVaultKdf(raw = null) {
  const source = raw && typeof raw === 'object' ? raw : null;
  if (!source) throw new Error('Die KDF-Konfiguration ist ungültig.');
  const iterations = Number(source.iterations);
  if (
    !Number.isSafeInteger(iterations)
    || iterations < WORKSPACE_VAULT_KDF_MIN_ITERATIONS
    || iterations > WORKSPACE_VAULT_KDF_MAX_ITERATIONS
  ) {
    throw new Error('Die PBKDF2-Iterationszahl ist ungültig.');
  }
  decodeFixedBase64(source.salt, WORKSPACE_VAULT_SALT_BYTES, 'Der PBKDF2-Salt');
  return {
    name: 'PBKDF2',
    hash: 'SHA-256',
    iterations,
    salt: source.salt,
  };
}

export function createWorkspaceVaultKdf({
  iterations = WORKSPACE_VAULT_KDF_ITERATIONS,
  cryptoProvider = globalThis.crypto,
} = {}) {
  return normalizeWorkspaceVaultKdf({
    iterations,
    salt: bytesToBase64(randomBytes(WORKSPACE_VAULT_SALT_BYTES, cryptoProvider)),
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
  const kdf = validateWorkspaceVaultKdf(kdfConfig);
  const baseKey = await cryptoProvider.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(password || '')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const algorithm = {
    name: 'PBKDF2',
    hash: 'SHA-256',
    iterations: kdf.iterations,
    salt: base64ToBytes(kdf.salt),
  };
  const [cryptoKey, signingKey] = await Promise.all([
    cryptoProvider.subtle.deriveKey(algorithm, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
    cryptoProvider.subtle.deriveKey(algorithm, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']),
  ]);
  return { cryptoKey, signingKey, kdf };
}

export async function encryptWorkspaceVaultText(
  plaintext,
  cryptoKey,
  kdfConfig,
  scope = {},
  cryptoProvider = globalThis.crypto,
) {
  const kdf = validateWorkspaceVaultKdf(kdfConfig);
  const iv = randomBytes(WORKSPACE_VAULT_IV_BYTES, cryptoProvider);
  const ciphertext = await cryptoProvider.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: buildWorkspaceVaultAad(scope),
    tagLength: WORKSPACE_VAULT_TAG_LENGTH,
  }, cryptoKey, new TextEncoder().encode(String(plaintext || '')));
  return {
    schema: WORKSPACE_VAULT_SCHEMA,
    kdf,
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv), tagLength: WORKSPACE_VAULT_TAG_LENGTH },
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
  const kdf = validateWorkspaceVaultKdf(kdfConfig || source?.kdf);
  if (
    !source
    || String(source.schema || '') !== WORKSPACE_VAULT_SCHEMA
    || !source.ciphertext
    || !kdf.salt
    || !source.cipher?.iv
  ) {
    throw new Error('Der verschlüsselte Notenbereich ist unvollständig.');
  }
  if (source.cipher.name !== 'AES-GCM') {
    throw new Error('Der verschlüsselte Notenbereich verwendet ein ungültiges Verschlüsselungsverfahren.');
  }
  const iv = decodeFixedBase64(source.cipher.iv, WORKSPACE_VAULT_IV_BYTES, 'Der AES-GCM-IV');
  if (source.cipher.tagLength !== WORKSPACE_VAULT_TAG_LENGTH) {
    throw new Error('Die AES-GCM-Taglänge ist ungültig.');
  }
  try {
    const plaintext = await cryptoProvider.subtle.decrypt({
      name: 'AES-GCM',
      iv,
      additionalData: buildWorkspaceVaultAad(scope),
      tagLength: WORKSPACE_VAULT_TAG_LENGTH,
    }, cryptoKey, base64ToBytes(source.ciphertext));
    return new TextDecoder().decode(new Uint8Array(plaintext));
  } catch {
    throw new Error('Passwort falsch oder Notendaten beschädigt.');
  }
}

export async function createWorkspaceVaultContainerAuthentication(
  payload,
  cryptoKey,
  cryptoProvider = globalThis.crypto,
) {
  const iv = randomBytes(WORKSPACE_VAULT_IV_BYTES, cryptoProvider);
  const tag = await cryptoProvider.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: buildWorkspaceVaultContainerAuthenticationAad(payload),
    tagLength: WORKSPACE_VAULT_TAG_LENGTH,
  }, cryptoKey, new Uint8Array());
  const tagBytes = new Uint8Array(tag);
  if (tagBytes.length !== WORKSPACE_VAULT_CONTAINER_AUTH_TAG_BYTES) {
    throw new Error('Der THDB-Authentifizierungs-Tag hat eine ungültige Länge.');
  }
  return {
    version: 1,
    schema: WORKSPACE_VAULT_CONTAINER_AUTH_SCHEMA,
    algorithm: WORKSPACE_VAULT_CONTAINER_AUTH_ALGORITHM,
    iv: bytesToBase64(iv),
    tagLength: WORKSPACE_VAULT_TAG_LENGTH,
    tag: bytesToBase64(tagBytes),
  };
}

export async function verifyWorkspaceVaultContainerAuthentication(
  authentication,
  payload,
  cryptoKey,
  cryptoProvider = globalThis.crypto,
) {
  const { iv, tag } = validateWorkspaceVaultContainerAuthentication(authentication);
  try {
    const plaintext = await cryptoProvider.subtle.decrypt({
      name: 'AES-GCM',
      iv,
      additionalData: buildWorkspaceVaultContainerAuthenticationAad(payload),
      tagLength: WORKSPACE_VAULT_TAG_LENGTH,
    }, cryptoKey, tag);
    if (new Uint8Array(plaintext).length !== 0) {
      throw new Error('Der THDB-Authentifizierungs-Tag enthält unerwartete Daten.');
    }
    return true;
  } catch {
    throw new Error('Die THDB-Datei wurde verändert oder ist beschädigt.');
  }
}
