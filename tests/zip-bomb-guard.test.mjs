import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';

const [fileGuardsSource, docxTemplateSource] = await Promise.all([
  readFile(new URL('../src/shared/file-guards.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/shared/docx-template.js', import.meta.url), 'utf8'),
]);
const fileGuardsUrl = `data:text/javascript;base64,${Buffer.from(fileGuardsSource).toString('base64')}`;
const docxTemplateUrl = `data:text/javascript;base64,${Buffer.from(
  docxTemplateSource.replace('"./file-guards.js"', JSON.stringify(fileGuardsUrl)),
).toString('base64')}`;

const { assertJsonNestingAtMost, exceedsZipCompressionRatio, FILE_LIMITS } = await import(fileGuardsUrl);
const { prepareDocxTemplate } = await import(docxTemplateUrl);

const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_FILE_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_DEFLATE = 8;

function buildSingleEntryZip({ name, compressed, declaredUncompressedSize }) {
  const nameBytes = Buffer.from(name, 'utf8');
  const compressedSize = compressed.length;

  const local = Buffer.alloc(30 + nameBytes.length);
  local.writeUInt32LE(ZIP_LOCAL_FILE_HEADER, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(ZIP_DEFLATE, 8);
  local.writeUInt32LE(compressedSize, 18);
  local.writeUInt32LE(declaredUncompressedSize, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  nameBytes.copy(local, 30);

  const localOffset = 0;
  const centralOffset = local.length + compressedSize;

  const central = Buffer.alloc(46 + nameBytes.length);
  central.writeUInt32LE(ZIP_CENTRAL_FILE_HEADER, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(ZIP_DEFLATE, 10);
  central.writeUInt32LE(compressedSize, 20);
  central.writeUInt32LE(declaredUncompressedSize, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(localOffset, 42);
  nameBytes.copy(central, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(ZIP_END_OF_CENTRAL_DIRECTORY, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);

  return new Uint8Array(Buffer.concat([local, compressed, central, eocd]));
}

const BOMB_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const bombPayload = deflateRawSync(Buffer.alloc(BOMB_UNCOMPRESSED_BYTES));
const RATIO_UNCOMPRESSED_BYTES = 4 * 1024 * 1024;
const ratioPayload = deflateRawSync(Buffer.alloc(RATIO_UNCOMPRESSED_BYTES));

test('ein gelogener uncompressedSize-Header bricht das Entpacken ab', async () => {
  const zip = buildSingleEntryZip({
    name: 'word/document.xml',
    compressed: bombPayload,
    declaredUncompressedSize: 1000,
  });

  const heapBefore = process.memoryUsage().heapUsed;
  await assert.rejects(
    () => prepareDocxTemplate(zip),
    /entpackt zu groß|nicht vollständig gelesen/
  );
  const heapGrowth = process.memoryUsage().heapUsed - heapBefore;

  assert.ok(
    heapGrowth < BOMB_UNCOMPRESSED_BYTES / 4,
    `Heap wuchs um ${heapGrowth} Bytes – der Eintrag wurde offenbar komplett entpackt.`
  );
});

test('uncompressedSize = 0 umgeht die Konsistenzprüfung nicht', async () => {
  const zip = buildSingleEntryZip({
    name: 'word/document.xml',
    compressed: deflateRawSync(Buffer.from('x'.repeat(4096), 'utf8')),
    declaredUncompressedSize: 0,
  });

  await assert.rejects(
    () => prepareDocxTemplate(zip),
    /entpackt zu groß|nicht vollständig gelesen/
  );
});

test('ein ehrlich deklarierter Eintrag mit absurder Kompressionsrate wird abgelehnt', async () => {
  assert.ok(
    RATIO_UNCOMPRESSED_BYTES <= FILE_LIMITS.DOCX_ENTRY_BYTES,
    'Der Testeintrag muss unter dem Eintragslimit bleiben, damit die Ratenprüfung greift.'
  );
  const zip = buildSingleEntryZip({
    name: 'word/document.xml',
    compressed: ratioPayload,
    declaredUncompressedSize: RATIO_UNCOMPRESSED_BYTES,
  });

  await assert.rejects(() => prepareDocxTemplate(zip), /verdächtig stark komprimiert/);
});

test('ein Eintrag oberhalb des DOCX-Eintragslimits wird vor dem Entpacken abgelehnt', async () => {
  const zip = buildSingleEntryZip({
    name: 'word/media/riesig.png',
    compressed: bombPayload,
    declaredUncompressedSize: BOMB_UNCOMPRESSED_BYTES,
  });

  await assert.rejects(() => prepareDocxTemplate(zip), /entpackt zu groß/);
});

test('ein unauffälliger Deflate-Eintrag wird weiterhin korrekt gelesen', async () => {
  const payload = Buffer.from('<w:document>Hallo Welt</w:document>', 'utf8');
  const zip = buildSingleEntryZip({
    name: 'word/document.xml',
    compressed: deflateRawSync(payload),
    declaredUncompressedSize: payload.length,
  });

  const prepared = await prepareDocxTemplate(zip);
  assert.equal(prepared.entries.length, 1);
  assert.equal(prepared.entries[0].name, 'word/document.xml');
  assert.equal(
    Buffer.from(prepared.entries[0].data).toString('utf8'),
    payload.toString('utf8')
  );
});

test('die ausgelieferte Erwartungshorizont-Vorlage bleibt lesbar', async () => {
  const templateUrl = new URL(
    '../src/modules/grades/expectation-horizon-template.docx',
    import.meta.url
  );
  const bytes = new Uint8Array(await readFile(templateUrl));
  const prepared = await prepareDocxTemplate(bytes);
  assert.ok(prepared.entries.length > 0);
  assert.ok(prepared.entries.some((entry) => entry.name === 'word/document.xml'));
});

test('die Kompressionsraten-Heuristik verschont kleine, gut komprimierbare Dateien', () => {
  assert.equal(exceedsZipCompressionRatio(50, 40 * 1024), false);
  assert.equal(
    exceedsZipCompressionRatio(10_000, 10_000 * (FILE_LIMITS.ZIP_MAX_COMPRESSION_RATIO - 100)),
    false
  );
  assert.equal(
    exceedsZipCompressionRatio(10_000, 10_000 * (FILE_LIMITS.ZIP_MAX_COMPRESSION_RATIO + 100)),
    true
  );
  assert.equal(exceedsZipCompressionRatio(null, 10 * 1024 * 1024), false);
});

test('der JSON-Schutz begrenzt Tiefe und die Größe einzelner Container', () => {
  const deeplyNested = `${'['.repeat(FILE_LIMITS.JSON_MAX_NESTING + 1)}0${']'.repeat(FILE_LIMITS.JSON_MAX_NESTING + 1)}`;
  assert.throws(() => assertJsonNestingAtMost(deeplyNested), /tief verschachtelt/);

  const oversizedList = `[${Array(FILE_LIMITS.JSON_MAX_CONTAINER_ITEMS + 1).fill('0').join(',')}]`;
  assert.throws(() => assertJsonNestingAtMost(oversizedList), /zu viele Einträge/);

  assert.doesNotThrow(() => assertJsonNestingAtMost('{"text":"[{},]","items":[1,2,3]}'));
});
