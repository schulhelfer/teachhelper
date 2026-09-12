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

const { assertImageDimensionsAtMost, assertImageFilePixelsAtMost, assertJsonNestingAtMost, exceedsZipCompressionRatio, FILE_LIMITS, fitCanvasSize, readImageDimensions } = await import(fileGuardsUrl);
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

function buildJpegWithDelayedSof(width, height) {
  const segments = [Uint8Array.from([0xff, 0xd8])];
  for (let index = 0; index < 9; index += 1) {
    const segment = new Uint8Array(65_537);
    segment.set([0xff, 0xe1, 0xff, 0xff]);
    segments.push(segment);
  }
  segments.push(Uint8Array.from([
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >>> 8) & 0xff, height & 0xff,
    (width >>> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  ]));
  return new Blob(segments, { type: 'image/jpeg' });
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

test('Bildheader und Arbeits-Canvas bleiben innerhalb des Pixelbudgets', () => {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(png.buffer).setUint32(16, 12_000);
  new DataView(png.buffer).setUint32(20, 8_000);
  assert.throws(() => assertImageDimensionsAtMost(readImageDimensions(png, 'image/png')), /zu viele Bildpunkte/);
  assert.throws(
    () => assertImageDimensionsAtMost({ width: 12_000, height: 8_000 }),
    new RegExp(`Maximal erlaubt: ${Math.round(FILE_LIMITS.IMAGE_MAX_PIXELS / 1_000_000)} Megapixel`)
  );
  const canvas = fitCanvasSize(12_000, 8_000);
  assert.ok(canvas.width * canvas.height <= FILE_LIMITS.CANVAS_MAX_PIXELS);
  assert.ok(Math.max(canvas.width, canvas.height) <= FILE_LIMITS.CANVAS_MAX_EDGE);
});

test('PNG-, GIF-, BMP- und WebP-Abmessungen werden anhand ihrer Signatur gelesen', () => {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(png.buffer).setUint32(16, 1200);
  new DataView(png.buffer).setUint32(20, 800);

  const gif = new Uint8Array(10);
  gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  new DataView(gif.buffer).setUint16(6, 1200, true);
  new DataView(gif.buffer).setUint16(8, 800, true);

  const bmp = new Uint8Array(26);
  bmp.set([0x42, 0x4d]);
  new DataView(bmp.buffer).setInt32(18, 1200, true);
  new DataView(bmp.buffer).setInt32(22, 800, true);

  const webp = new Uint8Array(30);
  webp.set([0x52, 0x49, 0x46, 0x46]);
  webp.set([0x57, 0x45, 0x42, 0x50], 8);
  webp.set([0x56, 0x50, 0x38, 0x58], 12);
  webp.set([0xaf, 0x04, 0x00, 0x1f, 0x03, 0x00], 24);

  for (const [bytes, type] of [
    [png, 'image/png'],
    [gif, 'image/gif'],
    [bmp, 'image/bmp'],
    [webp, 'image/webp'],
  ]) {
    assert.deepEqual(readImageDimensions(bytes, type), { width: 1200, height: 800 });
  }
});

test('ein JPEG mit spätem SOF wird vollständig geprüft und bei zu vielen Bildpunkten abgelehnt', async () => {
  const jpeg = buildJpegWithDelayedSof(9000, 6000);
  const prefix = new Uint8Array(await jpeg.slice(0, 512 * 1024).arrayBuffer());
  assert.equal(readImageDimensions(prefix, jpeg.type), null);
  await assert.rejects(
    () => assertImageFilePixelsAtMost(jpeg, { label: 'Das Bild' }),
    /zu viele Bildpunkte/
  );
});

test('ein JPEG mit spätem SOF und zulässigen Abmessungen bleibt erlaubt', async () => {
  const jpeg = buildJpegWithDelayedSof(4000, 3000);
  assert.deepEqual(
    await assertImageFilePixelsAtMost(jpeg, { label: 'Das Bild' }),
    { width: 4000, height: 3000 }
  );
});

test('die Bildprüfung lehnt fehlende, abgeschnittene und ungültige Abmessungen ab', async () => {
  const missing = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
  const truncated = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x00])], { type: 'image/jpeg' });
  const invalid = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x01])], { type: 'image/jpeg' });
  const earlyScan = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08])], { type: 'image/jpeg' });
  await assert.rejects(() => assertImageFilePixelsAtMost(missing), /konnte nicht gelesen werden/);
  await assert.rejects(() => assertImageFilePixelsAtMost(truncated), /konnte nicht gelesen werden/);
  await assert.rejects(() => assertImageFilePixelsAtMost(invalid), /konnte nicht gelesen werden/);
  await assert.rejects(() => assertImageFilePixelsAtMost(earlyScan), /konnte nicht gelesen werden/);
});

test('der JPEG-Parser verarbeitet Füllbytes und längenlose Marker vor dem SOF', () => {
  const jpeg = Uint8Array.from([
    0xff, 0xd8, 0xff, 0xff, 0x01,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    0x0b, 0xb8, 0x0f, 0xa0,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  ]);
  assert.deepEqual(readImageDimensions(jpeg, 'image/jpeg'), { width: 4000, height: 3000 });
});

test('die Dateisignatur hat bei der Dimensionsprüfung Vorrang vor dem MIME-Typ', async () => {
  const jpeg = buildJpegWithDelayedSof(9000, 6000);
  const mislabeled = new Blob([jpeg], { type: 'image/png' });
  await assert.rejects(
    () => assertImageFilePixelsAtMost(mislabeled, { mimeType: mislabeled.type }),
    /zu viele Bildpunkte/
  );
});

test('der QR-Bildimport begrenzt Bytes und Bildpunkte vor dem Decode', async () => {
  const qr = await readFile(new URL('../src/modules/qr/app.js', import.meta.url), 'utf8');
  assert.match(qr, /assertImageFilePixelsAtMost/);
  const decode = qr.slice(qr.indexOf('async function decodeBlob'), qr.indexOf('async function decodeFile'));
  assert.match(decode, /assertFileSizeAtMost\(blob, FILE_LIMITS\.IMAGE_BYTES/);
  assert.match(decode, /await assertImageFilePixelsAtMost\(blob/);
});

test('der QR-Bildimport akzeptiert nur Formate, deren Maße vorab prüfbar sind', async () => {
  const qr = await readFile(new URL('../src/modules/qr/app.js', import.meta.url), 'utf8');
  const allowList = qr.slice(qr.indexOf('const DECODABLE_IMAGE_TYPES'), qr.indexOf('const toastApi'));
  ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'].forEach((type) => {
    assert.match(allowList, new RegExp(`'${type}'`));
  });
  ['image/avif', 'image/heic', 'image/jxl', 'image/tiff'].forEach((type) => {
    assert.doesNotMatch(allowList, new RegExp(type));
  });

  const decode = qr.slice(qr.indexOf('async function decodeBlob'), qr.indexOf('async function decodeFile'));
  const gateIndex = decode.indexOf('isDecodableImageType(blob.type)');
  assert.ok(gateIndex > -1);
  assert.ok(gateIndex < decode.indexOf('createDrawableFromBlob'));

  assert.doesNotMatch(qr.slice(qr.indexOf("addEventListener('drop'")), /startsWith\('image\/'\)/);
});

test('der JSON-Schutz begrenzt Tiefe und die Größe einzelner Container', () => {
  const deeplyNested = `${'['.repeat(FILE_LIMITS.JSON_MAX_NESTING + 1)}0${']'.repeat(FILE_LIMITS.JSON_MAX_NESTING + 1)}`;
  assert.throws(() => assertJsonNestingAtMost(deeplyNested), /tief verschachtelt/);

  const oversizedList = `[${Array(FILE_LIMITS.JSON_MAX_CONTAINER_ITEMS + 1).fill('0').join(',')}]`;
  assert.throws(() => assertJsonNestingAtMost(oversizedList), /zu viele Einträge/);

  assert.doesNotThrow(() => assertJsonNestingAtMost('{"text":"[{},]","items":[1,2,3]}'));
});
