export const THDB_MAGIC = 'THDB1';
export const THDB_CHECKSUM_VERSION = 1;
export const THDB_CHECKSUM_ALGORITHM = 'SHA-256';

const SHA256_PREFIX = 'sha256:';
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/i;
const SHA256_ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function asUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return new Uint8Array(value || []);
}

function utf8Bytes(value) {
  return new TextEncoder().encode(String(value ?? ''));
}

function utf8Text(bytes) {
  return new TextDecoder().decode(asUint8Array(bytes));
}

function rotateRight(value, count) {
  return (value >>> count) | (value << (32 - count));
}





export function sha256HexBytes(value) {
  const bytes = asUint8Array(value);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bitLength = bytes.length * 8;
  const lengthView = new DataView(padded.buffer);
  lengthView.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  lengthView.setUint32(paddedLength - 4, bitLength >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const words = new Uint32Array(64);

  for (let blockOffset = 0; blockOffset < padded.length; blockOffset += 64) {
    const block = new DataView(padded.buffer, blockOffset, 64);
    for (let index = 0; index < 16; index += 1) {
      words[index] = block.getUint32(index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15];
      const previous2 = words[index - 2];
      const sigma0 = rotateRight(previous15, 7) ^ rotateRight(previous15, 18) ^ (previous15 >>> 3);
      const sigma1 = rotateRight(previous2, 17) ^ rotateRight(previous2, 19) ^ (previous2 >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choose + SHA256_ROUND_CONSTANTS[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((part) => part.toString(16).padStart(8, '0'))
    .join('');
}

function hashBytes(value) {
  return `${SHA256_PREFIX}${sha256HexBytes(value)}`;
}

function normalizeContentHash(value) {
  const normalized = String(value || '').toLowerCase();
  return SHA256_PATTERN.test(normalized) ? normalized : '';
}

function normalizeNonnegativeInteger(value) {
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized >= 0 ? normalized : null;
}

function normalizePositiveInteger(value) {
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
}

function lineFeedIndex(bytes, start = 0) {
  for (let index = Math.max(0, Number(start) || 0); index < bytes.length; index += 1) {
    if (bytes[index] === 10) return index;
  }
  return -1;
}

function normalizeDescriptor(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const courseId = normalizePositiveInteger(raw.courseId);
  const offset = normalizeNonnegativeInteger(raw.offset);
  const length = normalizeNonnegativeInteger(raw.length);
  if (!courseId || offset === null || length === null) return null;
  const declaresContentHash = Object.prototype.hasOwnProperty.call(raw, 'contentHash');
  const contentHash = declaresContentHash ? normalizeContentHash(raw.contentHash) : '';
  if (declaresContentHash && !contentHash) return null;
  return { courseId, offset, length, contentHash };
}

function normalizeIntegrity(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const version = normalizePositiveInteger(raw.version);
  const algorithm = String(raw.algorithm || '').toUpperCase();
  const startupShellHash = normalizeContentHash(raw.startupShellHash);
  const planningPublicHash = normalizeContentHash(raw.planningPublicHash);
  const gradeVaultConfigHash = normalizeContentHash(raw.gradeVaultConfigHash);
  const contentHash = normalizeContentHash(raw.contentHash);
  if (
    version !== THDB_CHECKSUM_VERSION
    || algorithm !== THDB_CHECKSUM_ALGORITHM
    || !startupShellHash
    || !planningPublicHash
    || !gradeVaultConfigHash
    || !contentHash
  ) return null;
  return {
    version,
    algorithm: THDB_CHECKSUM_ALGORITHM,
    startupShellHash,
    planningPublicHash,
    gradeVaultConfigHash,
    contentHash,
  };
}

function canonicalContentHash({
  schema,
  startupShellHash,
  planningPublicHash,
  gradeVaultConfigHash,
  gradeCourseSegments,
}) {
  const courses = (Array.isArray(gradeCourseSegments) ? gradeCourseSegments : [])
    .map((segment) => ({
      courseId: normalizePositiveInteger(segment?.courseId),
      contentHash: normalizeContentHash(segment?.contentHash),
    }));
  if (
    !String(schema || '')
    || !normalizeContentHash(startupShellHash)
    || !normalizeContentHash(planningPublicHash)
    || !normalizeContentHash(gradeVaultConfigHash)
    || courses.some((segment) => !segment.courseId || !segment.contentHash)
    || new Set(courses.map((segment) => segment.courseId)).size !== courses.length
  ) {
    throw new Error('THDB-Inhaltsfingerabdruck kann nicht aus ungültigen Segmenten gebildet werden.');
  }
  courses.sort((left, right) => left.courseId - right.courseId);
  return hashBytes(utf8Bytes(JSON.stringify({
    format: 'THDB1-content-v1',
    schema: String(schema),
    startupShellHash: normalizeContentHash(startupShellHash),
    planningPublicHash: normalizeContentHash(planningPublicHash),
    gradeVaultConfigHash: normalizeContentHash(gradeVaultConfigHash),
    gradeCourseSegments: courses,
  })));
}

function buildContentIntegrity({
  schema,
  startupShellBytes,
  planningPublicBytes,
  gradeVaultConfigBytes,
  gradeCourseSegments,
}) {
  const startupShellHash = hashBytes(startupShellBytes);
  const planningPublicHash = hashBytes(planningPublicBytes);
  const gradeVaultConfigHash = hashBytes(gradeVaultConfigBytes);
  const courses = gradeCourseSegments.map((segment) => ({
    courseId: segment.courseId,
    contentHash: hashBytes(segment.bytes),
  }));
  return {
    version: THDB_CHECKSUM_VERSION,
    algorithm: THDB_CHECKSUM_ALGORITHM,
    startupShellHash,
    planningPublicHash,
    gradeVaultConfigHash,
    contentHash: canonicalContentHash({
      schema,
      startupShellHash,
      planningPublicHash,
      gradeVaultConfigHash,
      gradeCourseSegments: courses,
    }),
    gradeCourseSegments: courses,
  };
}


export function getThdb1ContentHash({
  schema,
  startupShellText,
  planningPublicText = '',
  gradeVaultConfigText = '',
  gradeCourseSegments = [],
} = {}) {
  const normalizedSchema = String(schema || '');
  const shellText = String(startupShellText ?? '');
  if (!normalizedSchema || !shellText) {
    throw new Error('THDB-Schema und Startup-Shell sind erforderlich.');
  }
  if (!Array.isArray(gradeCourseSegments)) {
    throw new Error('THDB-Kurssegmente müssen als Liste übergeben werden.');
  }
  const seenCourseIds = new Set();
  const courses = gradeCourseSegments.map((segment) => {
    const courseId = normalizePositiveInteger(segment?.courseId);
    const text = String(segment?.text ?? '');
    if (!courseId || !text || seenCourseIds.has(courseId)) {
      throw new Error('THDB-Kurssegmente müssen eindeutige Kurs-IDs und nichtleere Inhalte besitzen.');
    }
    seenCourseIds.add(courseId);
    return { courseId, bytes: utf8Bytes(text) };
  });
  return buildContentIntegrity({
    schema: normalizedSchema,
    startupShellBytes: utf8Bytes(shellText),
    planningPublicBytes: utf8Bytes(String(planningPublicText ?? '')),
    gradeVaultConfigBytes: utf8Bytes(String(gradeVaultConfigText ?? '')),
    gradeCourseSegments: courses,
  }).contentHash;
}

export function parseThdb1Header(bytes, { schemas = [] } = {}) {
  const view = asUint8Array(bytes);
  const firstEnd = lineFeedIndex(view);
  const secondEnd = firstEnd < 0 ? -1 : lineFeedIndex(view, firstEnd + 1);
  if (firstEnd < 0 || secondEnd < 0 || utf8Text(view.slice(0, firstEnd)).replace(/\r$/, '').trim() !== THDB_MAGIC) {
    return null;
  }
  let raw;
  try {
    raw = JSON.parse(utf8Text(view.slice(firstEnd + 1, secondEnd)).replace(/\r$/, ''));
  } catch {
    return null;
  }
  const schema = String(raw?.schema || '');
  if (!raw || typeof raw !== 'object' || !schema || (schemas.length > 0 && !schemas.includes(schema))) return null;
  const revision = normalizeNonnegativeInteger(raw.revision ?? 0);
  const startupShellOffset = normalizeNonnegativeInteger(raw.startupShellOffset);
  const startupShellLength = normalizeNonnegativeInteger(raw.startupShellLength);
  const planningPublicOffset = normalizeNonnegativeInteger(raw.planningPublicOffset);
  const planningPublicLength = normalizeNonnegativeInteger(raw.planningPublicLength);
  const gradeVaultConfigOffset = normalizeNonnegativeInteger(raw.gradeVaultConfigOffset);
  const gradeVaultConfigLength = normalizeNonnegativeInteger(raw.gradeVaultConfigLength);
  if (
    revision === null
    || startupShellOffset === null
    || startupShellLength === null
    || planningPublicOffset === null
    || planningPublicLength === null
    || gradeVaultConfigOffset === null
    || gradeVaultConfigLength === null
    || (raw.gradeCourseSegments !== undefined && !Array.isArray(raw.gradeCourseSegments))
  ) return null;
  const gradeCourseSegments = (raw.gradeCourseSegments || []).map(normalizeDescriptor);
  if (gradeCourseSegments.some((descriptor) => !descriptor)) return null;
  const declaresIntegrity = Object.prototype.hasOwnProperty.call(raw, 'integrity');
  const integrity = declaresIntegrity ? normalizeIntegrity(raw.integrity) : null;
  if (declaresIntegrity && !integrity) return null;
  const header = {
    schema,
    revision,
    updatedAt: String(raw.updatedAt || ''),
    deviceId: String(raw.deviceId || ''),
    reason: String(raw.reason || ''),
    startupShellOffset,
    startupShellLength,
    planningPublicOffset,
    planningPublicLength,
    gradeVaultConfigOffset,
    gradeVaultConfigLength,
    gradeCourseSegments,
    integrity,
  };
  return { header, headerBytesLength: secondEnd + 1 };
}

function inspectContainerLayout(bytes, { schemas = [] } = {}) {
  let view;
  try {
    view = asUint8Array(bytes);
  } catch {
    return { ok: false, reason: 'invalid-bytes' };
  }
  const prefix = parseThdb1Header(view, { schemas });
  if (!prefix) return { ok: false, reason: 'invalid-header' };
  const { header, headerBytesLength } = prefix;
  const validRange = (offset, length) => (
    Number.isSafeInteger(offset)
    && Number.isSafeInteger(length)
    && offset >= 0
    && length >= 0
    && offset <= view.length
    && length <= view.length - offset
  );
  if (!header.startupShellLength) return { ok: false, reason: 'empty-startup-shell' };

  let expectedOffset = headerBytesLength;
  const fixedSegments = [
    ['startup-shell', header.startupShellOffset, header.startupShellLength],
    ['planning-public', header.planningPublicOffset, header.planningPublicLength],
    ['grade-vault-config', header.gradeVaultConfigOffset, header.gradeVaultConfigLength],
  ];
  for (const [name, offset, length] of fixedSegments) {
    if (offset !== expectedOffset || !validRange(offset, length)) {
      return { ok: false, reason: `invalid-${name}-range` };
    }
    expectedOffset += length;
  }

  const seenCourseIds = new Set();
  for (const descriptor of header.gradeCourseSegments) {
    if (
      seenCourseIds.has(descriptor.courseId)
      || descriptor.length <= 0
      || descriptor.offset !== expectedOffset
      || !validRange(descriptor.offset, descriptor.length)
    ) return { ok: false, reason: 'invalid-grade-course-range' };
    seenCourseIds.add(descriptor.courseId);
    expectedOffset += descriptor.length;
  }
  if (expectedOffset !== view.length) return { ok: false, reason: 'unexpected-trailing-or-missing-bytes' };
  return { ok: true, view, header, headerBytesLength };
}

function computeLayoutIntegrity(layout) {
  const { view, header } = layout;
  return buildContentIntegrity({
    schema: header.schema,
    startupShellBytes: view.slice(header.startupShellOffset, header.startupShellOffset + header.startupShellLength),
    planningPublicBytes: view.slice(header.planningPublicOffset, header.planningPublicOffset + header.planningPublicLength),
    gradeVaultConfigBytes: view.slice(
      header.gradeVaultConfigOffset,
      header.gradeVaultConfigOffset + header.gradeVaultConfigLength,
    ),
    gradeCourseSegments: header.gradeCourseSegments.map((descriptor) => ({
      courseId: descriptor.courseId,
      bytes: view.slice(descriptor.offset, descriptor.offset + descriptor.length),
    })),
  });
}





export function verifyThdb1ContainerIntegrity(bytes, { schemas = [], requireIntegrity = false } = {}) {
  const layout = inspectContainerLayout(bytes, { schemas });
  if (!layout.ok) {
    return { ok: false, legacy: false, reason: layout.reason, contentHash: '' };
  }
  const computed = computeLayoutIntegrity(layout);
  const { header } = layout;
  const descriptorHashes = header.gradeCourseSegments.map((descriptor) => descriptor.contentHash);
  if (!header.integrity) {
    if (descriptorHashes.some(Boolean)) {
      return { ok: false, legacy: false, reason: 'partial-integrity', contentHash: computed.contentHash };
    }
    if (requireIntegrity) {
      return { ok: false, legacy: true, reason: 'missing-integrity', contentHash: computed.contentHash };
    }
    return {
      ok: true,
      legacy: true,
      reason: '',
      contentHash: computed.contentHash,
      startupShellHash: computed.startupShellHash,
      planningPublicHash: computed.planningPublicHash,
      gradeVaultConfigHash: computed.gradeVaultConfigHash,
      gradeCourseSegments: computed.gradeCourseSegments,
    };
  }
  if (descriptorHashes.some((hash) => !hash)) {
    return { ok: false, legacy: false, reason: 'partial-integrity', contentHash: computed.contentHash };
  }
  const computedByCourseId = new Map(
    computed.gradeCourseSegments.map((segment) => [segment.courseId, segment.contentHash]),
  );
  const courseMismatch = header.gradeCourseSegments.some(
    (descriptor) => computedByCourseId.get(descriptor.courseId) !== descriptor.contentHash,
  );
  if (courseMismatch) {
    return { ok: false, legacy: false, reason: 'grade-course-integrity-mismatch', contentHash: computed.contentHash };
  }
  if (
    header.integrity.startupShellHash !== computed.startupShellHash
    || header.integrity.planningPublicHash !== computed.planningPublicHash
    || header.integrity.gradeVaultConfigHash !== computed.gradeVaultConfigHash
  ) {
    return { ok: false, legacy: false, reason: 'segment-integrity-mismatch', contentHash: computed.contentHash };
  }
  if (header.integrity.contentHash !== computed.contentHash) {
    return { ok: false, legacy: false, reason: 'container-integrity-mismatch', contentHash: computed.contentHash };
  }
  return {
    ok: true,
    legacy: false,
    reason: '',
    contentHash: computed.contentHash,
    startupShellHash: computed.startupShellHash,
    planningPublicHash: computed.planningPublicHash,
    gradeVaultConfigHash: computed.gradeVaultConfigHash,
    gradeCourseSegments: computed.gradeCourseSegments,
  };
}


export function getThdb1SegmentContentHash(bytes, locator) {
  let view;
  try {
    view = asUint8Array(bytes);
  } catch {
    return '';
  }
  const offset = normalizeNonnegativeInteger(locator?.offset);
  const length = normalizeNonnegativeInteger(locator?.length);
  if (offset === null || length === null || offset > view.length || length > view.length - offset) return '';
  return hashBytes(view.slice(offset, offset + length));
}


export function getThdb1FileHash(bytes) {
  try {
    return hashBytes(asUint8Array(bytes));
  } catch {
    return '';
  }
}

export function buildThdb1ContainerBytes({
  schema,
  startupShellText,
  planningPublicText,
  gradeVaultConfigText,
  gradeCourseSegments = [],
  revision = 0,
  updatedAt = '',
  deviceId = '',
  reason = '',
} = {}) {
  const normalizedSchema = String(schema || '');
  const shellText = String(startupShellText ?? '');
  if (!normalizedSchema || !shellText) throw new Error('THDB-Schema und Startup-Shell sind erforderlich.');
  const normalizedRevision = normalizeNonnegativeInteger(revision);
  if (normalizedRevision === null) throw new Error('Die THDB-Revision muss eine nichtnegative ganze Zahl sein.');
  if (!Array.isArray(gradeCourseSegments)) {
    throw new Error('THDB-Kurssegmente müssen als Liste übergeben werden.');
  }
  const shellBytes = utf8Bytes(shellText);
  const publicText = String(planningPublicText ?? '');
  const publicBytes = utf8Bytes(publicText);
  const configText = String(gradeVaultConfigText ?? '');
  const configBytes = utf8Bytes(configText);
  const seenCourseIds = new Set();
  const courses = gradeCourseSegments.map((segment) => {
    const courseId = normalizePositiveInteger(segment?.courseId);
    const text = String(segment?.text ?? '');
    if (!courseId || !text || seenCourseIds.has(courseId)) {
      throw new Error('THDB-Kurssegmente müssen eindeutige Kurs-IDs und nichtleere Inhalte besitzen.');
    }
    seenCourseIds.add(courseId);
    return { courseId, text, bytes: utf8Bytes(text) };
  }).sort((left, right) => left.courseId - right.courseId);
  const integrity = buildContentIntegrity({
    schema: normalizedSchema,
    startupShellBytes: shellBytes,
    planningPublicBytes: publicBytes,
    gradeVaultConfigBytes: configBytes,
    gradeCourseSegments: courses,
  });
  const courseHashes = new Map(
    integrity.gradeCourseSegments.map((segment) => [segment.courseId, segment.contentHash]),
  );
  let header = {
    schema: normalizedSchema,
    revision: normalizedRevision,
    updatedAt: String(updatedAt || ''),
    deviceId: String(deviceId || ''),
    reason: String(reason || ''),
    startupShellOffset: 0,
    startupShellLength: shellBytes.length,
    planningPublicOffset: 0,
    planningPublicLength: publicBytes.length,
    gradeVaultConfigOffset: 0,
    gradeVaultConfigLength: configBytes.length,
    gradeCourseSegments: courses.map((course) => ({
      courseId: course.courseId,
      offset: 0,
      length: course.bytes.length,
      contentHash: courseHashes.get(course.courseId),
    })),
    integrity: {
      version: integrity.version,
      algorithm: integrity.algorithm,
      startupShellHash: integrity.startupShellHash,
      planningPublicHash: integrity.planningPublicHash,
      gradeVaultConfigHash: integrity.gradeVaultConfigHash,
      contentHash: integrity.contentHash,
    },
  };
  let stable = false;
  for (let guard = 0; guard < 16; guard += 1) {
    const prefix = utf8Bytes(`${THDB_MAGIC}\n${JSON.stringify(header)}\n`);
    let offset = prefix.length;
    const next = {
      ...header,
      startupShellOffset: offset,
      planningPublicOffset: offset + shellBytes.length,
      gradeVaultConfigOffset: offset + shellBytes.length + publicBytes.length,
      gradeCourseSegments: [],
    };
    offset = next.gradeVaultConfigOffset + configBytes.length;
    next.gradeCourseSegments = courses.map((course) => {
      const descriptor = {
        courseId: course.courseId,
        offset,
        length: course.bytes.length,
        contentHash: courseHashes.get(course.courseId),
      };
      offset += course.bytes.length;
      return descriptor;
    });
    if (JSON.stringify(next) === JSON.stringify(header)) {
      header = next;
      stable = true;
      break;
    }
    header = next;
  }
  const prefix = utf8Bytes(`${THDB_MAGIC}\n${JSON.stringify(header)}\n`);
  if (!stable || header.startupShellOffset !== prefix.length) {
    throw new Error('THDB-Header konnte nicht stabil aufgebaut werden.');
  }
  const length = prefix.length + shellBytes.length + publicBytes.length + configBytes.length
    + courses.reduce((sum, course) => sum + course.bytes.length, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of [prefix, shellBytes, publicBytes, configBytes, ...courses.map((course) => course.bytes)]) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return {
    bytes,
    header,
    startupShellText: shellText,
    planningPublicText: publicText,
    gradeVaultConfigText: configText,
    contentHash: integrity.contentHash,
  };
}

export function parseThdb1ContainerBytes(bytes, {
  schemas = [],
  includePlanningPublic = true,
  includeGradeCourseSegments = false,
  requireIntegrity = false,
} = {}) {
  const layout = inspectContainerLayout(bytes, { schemas });
  if (!layout.ok) return null;
  const integrity = verifyThdb1ContainerIntegrity(layout.view, { schemas, requireIntegrity });
  if (!integrity.ok) return null;
  const { view, header } = layout;
  const actualCourseHashes = new Map(
    integrity.gradeCourseSegments.map((segment) => [segment.courseId, segment.contentHash]),
  );
  const directory = {};
  for (const descriptor of header.gradeCourseSegments) {
    directory[descriptor.courseId] = {
      offset: descriptor.offset,
      length: descriptor.length,
      contentHash: actualCourseHashes.get(descriptor.courseId) || '',
    };
  }
  const requested = includeGradeCourseSegments === true
    ? Object.keys(directory).map(Number)
    : Array.isArray(includeGradeCourseSegments)
      ? includeGradeCourseSegments.map(Number).filter((id) => id > 0)
      : [];
  const read = (offset, length) => utf8Text(view.slice(offset, offset + length));
  return {
    header,
    integrity,
    contentHash: integrity.contentHash,
    startupShellText: read(header.startupShellOffset, header.startupShellLength),
    planningPublicText: includePlanningPublic
      ? read(header.planningPublicOffset, header.planningPublicLength)
      : '',
    planningPublicLocator: header.planningPublicLength
      ? {
        offset: header.planningPublicOffset,
        length: header.planningPublicLength,
        contentHash: integrity.planningPublicHash,
      }
      : null,
    gradeVaultConfigText: read(header.gradeVaultConfigOffset, header.gradeVaultConfigLength),
    gradeVaultConfigLocator: header.gradeVaultConfigLength
      ? {
        offset: header.gradeVaultConfigOffset,
        length: header.gradeVaultConfigLength,
        contentHash: integrity.gradeVaultConfigHash,
      }
      : null,
    gradeCourseDirectory: directory,
    gradeCourseSegments: requested.map((courseId) => {
      const locator = directory[courseId];
      return locator ? { courseId, locator, text: read(locator.offset, locator.length) } : null;
    }).filter(Boolean),
  };
}
