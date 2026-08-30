import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('../src/shared/school-data/thdb.js', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const thdb = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytes(value) {
  return encoder.encode(String(value));
}

function buildLegacyContainer({
  schema = 'test-db-v1',
  startupShellText = '{"shell":true}',
  planningPublicText = '{"courses":[]}',
  gradeVaultConfigText = '{"configured":false}',
  gradeCourseSegments = [],
  descriptorPatch = (descriptor) => descriptor,
  headerPatch = (header) => header,
} = {}) {
  const shellBytes = bytes(startupShellText);
  const publicBytes = bytes(planningPublicText);
  const configBytes = bytes(gradeVaultConfigText);
  const courses = gradeCourseSegments.map((segment) => ({
    courseId: segment.courseId,
    bytes: bytes(segment.text),
  }));
  let header = {
    schema,
    revision: 3,
    updatedAt: '2026-07-18T12:00:00.000Z',
    deviceId: 'legacy-device',
    reason: 'fixture',
    startupShellOffset: 0,
    startupShellLength: shellBytes.length,
    planningPublicOffset: 0,
    planningPublicLength: publicBytes.length,
    gradeVaultConfigOffset: 0,
    gradeVaultConfigLength: configBytes.length,
    gradeCourseSegments: courses.map((course) => descriptorPatch({
      courseId: course.courseId,
      offset: 0,
      length: course.bytes.length,
    })),
  };
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const prefix = bytes(`${thdb.THDB_MAGIC}\n${JSON.stringify(header)}\n`);
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
      const descriptor = descriptorPatch({
        courseId: course.courseId,
        offset,
        length: course.bytes.length,
      });
      offset += course.bytes.length;
      return descriptor;
    });
    const patched = headerPatch(next);
    if (JSON.stringify(patched) === JSON.stringify(header)) {
      header = patched;
      break;
    }
    header = patched;
  }
  const prefix = bytes(`${thdb.THDB_MAGIC}\n${JSON.stringify(header)}\n`);
  assert.equal(header.startupShellOffset, prefix.length, 'legacy fixture header must be stable');
  const parts = [prefix, shellBytes, publicBytes, configBytes, ...courses.map((course) => course.bytes)];
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function sampleContainer(overrides = {}) {
  return thdb.buildThdb1ContainerBytes({
    schema: 'test-db-v2',
    startupShellText: '{"shell":true}',
    planningPublicText: '{"courses":[1,2]}',
    gradeVaultConfigText: '{"configured":true}',
    gradeCourseSegments: [
      { courseId: 2, text: '{"students":["B"]}' },
      { courseId: 1, text: '{"students":["A"]}' },
    ],
    revision: 7,
    updatedAt: '2026-07-18T12:00:00.000Z',
    deviceId: 'device-a',
    reason: 'test',
    ...overrides,
  });
}

test('THDB lehnt übergroße JSON-Köpfe vor dem Parsen ab', () => {
  const oversizedHeader = bytes(`${thdb.THDB_MAGIC}\n${' '.repeat((1024 * 1024) + 1)}\n`);
  assert.equal(thdb.parseThdb1ContainerBytes(oversizedHeader), null);
});

test('synchronous SHA-256 matches standard vectors and Node crypto', () => {
  assert.equal(
    thdb.sha256HexBytes(new Uint8Array()),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
  assert.equal(
    thdb.sha256HexBytes(bytes('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  const payload = bytes('gleich lang, aber anderer Inhalt: äöü — '.repeat(100));
  assert.equal(thdb.sha256HexBytes(payload), createHash('sha256').update(payload).digest('hex'));
  for (const length of [1, 55, 56, 63, 64, 65, 127, 128, 129, 4096]) {
    const boundaryPayload = Uint8Array.from({ length }, (_, index) => (index * 37 + 11) & 0xff);
    assert.equal(
      thdb.sha256HexBytes(boundaryPayload),
      createHash('sha256').update(boundaryPayload).digest('hex'),
      `SHA-256 mismatch at ${length} bytes`,
    );
  }
});

test('asynchronous SHA-256 agrees with the synchronous fallback and Node crypto', async () => {
  const payloads = [
    new Uint8Array(),
    bytes('abc'),
    bytes('gleich lang, aber anderer Inhalt: äöü — '.repeat(100)),
    ...[1, 55, 56, 63, 64, 65, 127, 128, 129, 4096].map(
      (length) => Uint8Array.from({ length }, (_, index) => (index * 37 + 11) & 0xff),
    ),
  ];
  for (const payload of payloads) {
    const expected = createHash('sha256').update(payload).digest('hex');
    assert.equal(await thdb.sha256HexBytesAsync(payload), expected, `async SHA-256 mismatch at ${payload.length} bytes`);
    assert.equal(thdb.sha256HexBytes(payload), expected, `sync SHA-256 mismatch at ${payload.length} bytes`);
  }

  const offsetPayload = new Uint8Array([9, 9, 9, 1, 2, 3, 4, 9, 9]).subarray(3, 7);
  assert.equal(
    await thdb.sha256HexBytesAsync(offsetPayload),
    createHash('sha256').update(Uint8Array.from([1, 2, 3, 4])).digest('hex'),
  );
});

test('the async file hash matches the synchronous one', async () => {
  const built = sampleContainer();
  assert.equal(await thdb.getThdb1FileHashAsync(built.bytes), thdb.getThdb1FileHash(built.bytes));
  assert.match(await thdb.getThdb1FileHashAsync(built.bytes), /^sha256:[0-9a-f]{64}$/);
});

test('new containers carry offsets-independent hashes for every segment', () => {
  const first = sampleContainer();
  const sameContentAtAnotherRevision = sampleContainer({
    revision: 99,
    updatedAt: '2027-01-01T00:00:00.000Z',
    deviceId: 'device-b-with-a-different-length',
    reason: 'different metadata changes header offsets',
  });

  assert.notDeepEqual(first.bytes, sameContentAtAnotherRevision.bytes);
  assert.notEqual(first.header.startupShellOffset, sameContentAtAnotherRevision.header.startupShellOffset);
  assert.equal(first.contentHash, sameContentAtAnotherRevision.contentHash);
  assert.match(first.contentHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(first.header.integrity.contentHash, first.contentHash);
  assert.equal(thdb.getThdb1FileHash(first.bytes), `sha256:${createHash('sha256').update(first.bytes).digest('hex')}`);
  assert.equal(thdb.getThdb1ContentHash({
    schema: 'test-db-v2',
    startupShellText: '{"shell":true}',
    planningPublicText: '{"courses":[1,2]}',
    gradeVaultConfigText: '{"configured":true}',
    gradeCourseSegments: [
      { courseId: 1, text: '{"students":["A"]}' },
      { courseId: 2, text: '{"students":["B"]}' },
    ],
  }), first.contentHash);
  assert.ok(first.header.gradeCourseSegments.every((segment) => /^sha256:[0-9a-f]{64}$/.test(segment.contentHash)));

  const verified = thdb.verifyThdb1ContainerIntegrity(first.bytes, { schemas: ['test-db-v2'] });
  assert.equal(verified.ok, true);
  assert.equal(verified.legacy, false);
  assert.equal(verified.contentHash, first.contentHash);
  const parsed = thdb.parseThdb1ContainerBytes(first.bytes, {
    schemas: ['test-db-v2'],
    includeGradeCourseSegments: true,
    requireIntegrity: true,
  });
  assert.ok(parsed);
  assert.equal(parsed.contentHash, first.contentHash);
  assert.deepEqual(parsed.gradeCourseSegments.map((segment) => segment.courseId), [1, 2]);
  assert.ok(parsed.gradeCourseSegments.every((segment) => segment.locator.contentHash));
});

test('same-length data changes are detected instead of being confused by locators', () => {
  const built = sampleContainer();
  const changed = built.bytes.slice();
  const course = built.header.gradeCourseSegments.find((segment) => segment.courseId === 2);
  const originalHash = thdb.getThdb1SegmentContentHash(changed, course);
  changed[course.offset + course.length - 3] ^= 1;

  assert.equal(changed.length, built.bytes.length);
  assert.notEqual(thdb.getThdb1SegmentContentHash(changed, course), originalHash);
  const verified = thdb.verifyThdb1ContainerIntegrity(changed);
  assert.equal(verified.ok, false);
  assert.equal(verified.reason, 'grade-course-integrity-mismatch');
  assert.equal(thdb.parseThdb1ContainerBytes(changed), null);
});

test('selective reads still verify every segment and the complete physical file', () => {
  const built = sampleContainer();
  const selected = thdb.parseThdb1ContainerBytes(built.bytes, {
    schemas: ['test-db-v2'],
    includePlanningPublic: false,
    includeGradeCourseSegments: [1],
    requireIntegrity: true,
  });
  assert.ok(selected);
  assert.equal(selected.planningPublicText, '');
  assert.deepEqual(selected.gradeCourseSegments.map((segment) => segment.courseId), [1]);

  const tamperedUnrequestedCourse = built.bytes.slice();
  const unrequestedCourse = built.header.gradeCourseSegments.find((segment) => segment.courseId === 2);
  tamperedUnrequestedCourse[unrequestedCourse.offset + unrequestedCourse.length - 2] ^= 1;
  assert.equal(thdb.parseThdb1ContainerBytes(tamperedUnrequestedCourse, {
    includePlanningPublic: false,
    includeGradeCourseSegments: [1],
  }), null, 'an unrequested corrupt course must invalidate the complete file');

  const tamperedUnrequestedPublicData = built.bytes.slice();
  tamperedUnrequestedPublicData[built.header.planningPublicOffset + 2] ^= 1;
  assert.equal(thdb.parseThdb1ContainerBytes(tamperedUnrequestedPublicData, {
    includePlanningPublic: false,
    includeGradeCourseSegments: [1],
  }), null, 'excluded public data must still be integrity-checked');

  const anotherRevision = sampleContainer({ revision: built.header.revision + 1 });
  assert.equal(anotherRevision.contentHash, built.contentHash);
  assert.notEqual(
    thdb.getThdb1FileHash(anotherRevision.bytes),
    thdb.getThdb1FileHash(built.bytes),
    'write verification must compare physical bytes in addition to logical content',
  );
});

test('legacy containers remain readable but can be rejected when integrity is mandatory', () => {
  const legacy = buildLegacyContainer({
    gradeCourseSegments: [
      { courseId: 1, text: '{"students":[1]}' },
      { courseId: 2, text: '{"students":[2]}' },
    ],
  });
  const verified = thdb.verifyThdb1ContainerIntegrity(legacy, { schemas: ['test-db-v1'] });
  assert.equal(verified.ok, true);
  assert.equal(verified.legacy, true);
  assert.match(verified.contentHash, /^sha256:[0-9a-f]{64}$/);
  assert.ok(thdb.parseThdb1ContainerBytes(legacy, { includeGradeCourseSegments: true }));

  const strict = thdb.verifyThdb1ContainerIntegrity(legacy, { requireIntegrity: true });
  assert.equal(strict.ok, false);
  assert.equal(strict.legacy, true);
  assert.equal(strict.reason, 'missing-integrity');
  assert.equal(thdb.parseThdb1ContainerBytes(legacy, { requireIntegrity: true }), null);
});

test('malformed, duplicated, partial, and trailing container data fails closed', () => {
  assert.throws(
    () => sampleContainer({
      gradeCourseSegments: [
        { courseId: 1, text: 'first' },
        { courseId: 1, text: 'second' },
      ],
    }),
    /eindeutige Kurs-IDs/,
  );
  assert.throws(
    () => sampleContainer({ gradeCourseSegments: [{ courseId: 1, text: '' }] }),
    /nichtleere Inhalte/,
  );
  assert.throws(() => sampleContainer({ revision: -1 }), /nichtnegative ganze Zahl/);

  const duplicate = buildLegacyContainer({
    gradeCourseSegments: [
      { courseId: 1, text: 'first' },
      { courseId: 1, text: 'second' },
    ],
  });
  assert.equal(thdb.verifyThdb1ContainerIntegrity(duplicate).ok, false);
  assert.equal(thdb.parseThdb1ContainerBytes(duplicate), null);

  const partial = buildLegacyContainer({
    gradeCourseSegments: [{ courseId: 1, text: 'course' }],
    descriptorPatch: (descriptor) => ({
      ...descriptor,
      contentHash: `sha256:${'0'.repeat(64)}`,
    }),
  });
  const partialResult = thdb.verifyThdb1ContainerIntegrity(partial);
  assert.equal(partialResult.ok, false);
  assert.equal(partialResult.reason, 'partial-integrity');

  const valid = sampleContainer().bytes;
  const withTrailingByte = new Uint8Array(valid.length + 1);
  withTrailingByte.set(valid);
  withTrailingByte[withTrailingByte.length - 1] = 10;
  const trailingResult = thdb.verifyThdb1ContainerIntegrity(withTrailingByte);
  assert.equal(trailingResult.ok, false);
  assert.equal(trailingResult.reason, 'unexpected-trailing-or-missing-bytes');
});

test('declared hashes are bound to course IDs and header metadata cannot disguise a segment', () => {
  const built = sampleContainer();
  const headerEnd = built.bytes.indexOf(10, built.bytes.indexOf(10) + 1);
  const rawHeader = JSON.parse(decoder.decode(built.bytes.slice(built.bytes.indexOf(10) + 1, headerEnd)));
  const firstHash = rawHeader.gradeCourseSegments[0].contentHash;
  rawHeader.gradeCourseSegments[0].contentHash = rawHeader.gradeCourseSegments[1].contentHash;
  rawHeader.gradeCourseSegments[1].contentHash = firstHash;
  const replacement = bytes(JSON.stringify(rawHeader));
  assert.equal(replacement.length, headerEnd - built.bytes.indexOf(10) - 1);
  const changed = built.bytes.slice();
  changed.set(replacement, built.bytes.indexOf(10) + 1);

  const result = thdb.verifyThdb1ContainerIntegrity(changed);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'grade-course-integrity-mismatch');
});
