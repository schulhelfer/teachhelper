const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_FILE_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE = 0;
const ZIP_DEFLATE = 8;
const WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const MATH_NAMESPACE = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const CONTENT_TYPES_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/content-types";
const PACKAGE_RELATIONSHIPS_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_RELATIONSHIPS_NAMESPACE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const WORD_NUMBERING_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml";
const WORD_NUMBERING_RELATIONSHIP_TYPE = `${OFFICE_RELATIONSHIPS_NAMESPACE}/numbering`;
const WORD_IMAGE_RELATIONSHIP_TYPE = `${OFFICE_RELATIONSHIPS_NAMESPACE}/image`;
const DRAWING_NAMESPACE = "http://schemas.openxmlformats.org/drawingml/2006/main";
const DRAWING_PICTURE_NAMESPACE = "http://schemas.openxmlformats.org/drawingml/2006/picture";
const WORDPROCESSING_DRAWING_NAMESPACE = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const RELATIONSHIPS_DOC_NAMESPACE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PNG_CONTENT_TYPE = "image/png";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8");

let crcTable = null;
const preparedTemplateCache = new WeakMap();

function getCrcTable() {
  if (crcTable) {
    return crcTable;
  }
  crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    crcTable[index] = value >>> 0;
  }
  return crcTable;
}

function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });
  return result;
}

function writeUint16(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function getUint16(view, offset) {
  return view.getUint16(offset, true);
}

function getUint32(view, offset) {
  return view.getUint32(offset, true);
}

function findEndOfCentralDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (getUint32(view, offset) === ZIP_END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }
  throw new Error("Die DOCX-Datei konnte nicht gelesen werden.");
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("Dieser Browser unterstützt die DOCX-ZIP-Dekompression nicht.");
  }
  let stream;
  try {
    stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  } catch (_error) {
    throw new Error("Dieser Browser unterstützt die DOCX-ZIP-Dekompression nicht.");
  }
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipEntries(input) {
  const sourceBytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(sourceBytes.buffer, sourceBytes.byteOffset, sourceBytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(sourceBytes);
  const entryCount = getUint16(view, eocdOffset + 10);
  let centralOffset = getUint32(view, eocdOffset + 16);
  const entries = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (getUint32(view, centralOffset) !== ZIP_CENTRAL_FILE_HEADER) {
      throw new Error("Die DOCX-ZIP-Struktur ist ungültig.");
    }
    const flags = getUint16(view, centralOffset + 8);
    const method = getUint16(view, centralOffset + 10);
    const compressedSize = getUint32(view, centralOffset + 20);
    const uncompressedSize = getUint32(view, centralOffset + 24);
    const nameLength = getUint16(view, centralOffset + 28);
    const extraLength = getUint16(view, centralOffset + 30);
    const commentLength = getUint16(view, centralOffset + 32);
    const localOffset = getUint32(view, centralOffset + 42);
    const nameBytes = sourceBytes.slice(centralOffset + 46, centralOffset + 46 + nameLength);
    const name = textDecoder.decode(nameBytes);
    if (getUint32(view, localOffset) !== ZIP_LOCAL_FILE_HEADER) {
      throw new Error("Die DOCX-ZIP-Struktur ist ungültig.");
    }
    const localNameLength = getUint16(view, localOffset + 26);
    const localExtraLength = getUint16(view, localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressedData = sourceBytes.slice(dataOffset, dataOffset + compressedSize);
    let data;
    if (method === ZIP_STORE) {
      data = compressedData;
    } else if (method === ZIP_DEFLATE) {
      data = await inflateRaw(compressedData);
    } else {
      throw new Error("Diese DOCX-Komprimierung wird nicht unterstützt.");
    }
    if (uncompressedSize && data.length !== uncompressedSize) {
      throw new Error("Die DOCX-Datei konnte nicht vollständig gelesen werden.");
    }
    entries.push({ name, data, flags });
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  entries.forEach((entry) => {
    const name = String(entry.name || "");
    const nameBytes = textEncoder.encode(name);
    const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data || []);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    writeUint32(local, 0, ZIP_LOCAL_FILE_HEADER);
    writeUint16(local, 4, 20);
    writeUint16(local, 6, ZIP_UTF8_FLAG);
    writeUint16(local, 8, ZIP_STORE);
    writeUint16(local, 10, 0);
    writeUint16(local, 12, 0);
    writeUint32(local, 14, crc);
    writeUint32(local, 18, data.length);
    writeUint32(local, 22, data.length);
    writeUint16(local, 26, nameBytes.length);
    writeUint16(local, 28, 0);
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    writeUint32(central, 0, ZIP_CENTRAL_FILE_HEADER);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 8, ZIP_UTF8_FLAG);
    writeUint16(central, 10, ZIP_STORE);
    writeUint16(central, 12, 0);
    writeUint16(central, 14, 0);
    writeUint32(central, 16, crc);
    writeUint32(central, 20, data.length);
    writeUint32(central, 24, data.length);
    writeUint16(central, 28, nameBytes.length);
    writeUint16(central, 30, 0);
    writeUint16(central, 32, 0);
    writeUint16(central, 34, 0);
    writeUint16(central, 36, 0);
    writeUint32(central, 38, 0);
    writeUint32(central, 42, offset);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  });
  const localBytes = concatBytes(localParts);
  const centralBytes = concatBytes(centralParts);
  const end = new Uint8Array(22);
  writeUint32(end, 0, ZIP_END_OF_CENTRAL_DIRECTORY);
  writeUint16(end, 8, entries.length);
  writeUint16(end, 10, entries.length);
  writeUint32(end, 12, centralBytes.length);
  writeUint32(end, 16, localBytes.length);
  writeUint16(end, 20, 0);
  return concatBytes([localBytes, centralBytes, end]);
}

function isWordXmlPart(name) {
  const normalized = String(name || "");
  return normalized.startsWith("word/") && normalized.endsWith(".xml");
}

function getWordTextElements(doc) {
  return Array.from(doc.getElementsByTagName("*"))
    .filter((element) => element.localName === "t");
}

function getChildElementsByLocalName(element, localName) {
  return Array.from(element?.children || [])
    .filter((child) => child.localName === localName);
}

function getAncestorByLocalName(element, localName) {
  let node = element?.parentNode || null;
  while (node) {
    if (node.localName === localName) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

function getWordElementText(element) {
  return getWordTextElements(element)
    .map((textElement) => textElement.textContent || "")
    .join("");
}

function normalizeWordCellText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getWordNamespace(doc) {
  return doc.documentElement?.lookupNamespaceURI("w")
    || WORD_NAMESPACE;
}

function parseXmlDocument(xml, message = "Ein XML-Teil der DOCX-Datei konnte nicht gelesen werden.") {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error(message);
  }
  return doc;
}

function serializeXmlDocument(doc) {
  return new XMLSerializer().serializeToString(doc);
}

function upsertZipEntry(entries, name, xml) {
  const data = textEncoder.encode(xml);
  const index = entries.findIndex((entry) => entry.name === name);
  if (index >= 0) {
    return entries.map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, data } : entry
    ));
  }
  return [...entries, { name, data, flags: ZIP_UTF8_FLAG }];
}

function getWordPartRelationshipsPath(partName) {
  const normalized = String(partName || "");
  const slashIndex = normalized.lastIndexOf("/");
  if (slashIndex < 0) {
    return `_rels/${normalized}.rels`;
  }
  return `${normalized.slice(0, slashIndex)}/_rels/${normalized.slice(slashIndex + 1)}.rels`;
}

function getRelationshipMaxId(entries, relsPath) {
  const existing = entries.find((entry) => entry.name === relsPath);
  if (!existing) {
    return 0;
  }
  const doc = parseXmlDocument(textDecoder.decode(existing.data), "Die Relationship-Definition der DOCX-Datei konnte nicht gelesen werden.");
  return Array.from(doc.getElementsByTagName("*"))
    .filter((element) => element.localName === "Relationship")
    .reduce((max, element) => {
      const match = String(element.getAttribute("Id") || "").match(/^rId(\d+)$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
}

function normalizeWordImageReplacement(value) {
  if (!value || typeof value !== "object" || !value.image || typeof value.image !== "object") {
    return null;
  }
  const image = value.image;
  const data = image.data instanceof Uint8Array ? image.data : new Uint8Array(image.data || []);
  if (!data.length) {
    return null;
  }
  const widthEmu = Math.max(1, Math.round(Number(image.widthEmu || image.width || 0)));
  const heightEmu = Math.max(1, Math.round(Number(image.heightEmu || image.height || 0)));
  if (!widthEmu || !heightEmu) {
    return null;
  }
  return {
    data,
    widthEmu,
    heightEmu,
    description: String(image.description || "Bild")
  };
}

function isWordImageReplacement(value) {
  return Boolean(normalizeWordImageReplacement(value));
}

function createWordImageContext(entries) {
  const usedMediaNames = new Set(entries.map((entry) => entry.name));
  const relationshipMaxByPath = new Map();
  let imageCounter = 0;
  const nextMediaName = () => {
    while (true) {
      imageCounter += 1;
      const name = `word/media/image${imageCounter}.png`;
      if (!usedMediaNames.has(name)) {
        usedMediaNames.add(name);
        return name;
      }
    }
  };
  return {
    images: [],
    relationships: [],
    insertedImageCount: 0,
    addImage(partName, image) {
      const normalizedImage = normalizeWordImageReplacement({ image });
      if (!normalizedImage) {
        return "";
      }
      const relsPath = getWordPartRelationshipsPath(partName);
      const currentMax = relationshipMaxByPath.has(relsPath)
        ? relationshipMaxByPath.get(relsPath)
        : getRelationshipMaxId(entries, relsPath);
      const nextMax = currentMax + 1;
      relationshipMaxByPath.set(relsPath, nextMax);
      const id = `rId${nextMax}`;
      const mediaName = nextMediaName();
      this.images.push({
        name: mediaName,
        data: normalizedImage.data
      });
      this.relationships.push({
        relsPath,
        id,
        target: `media/${mediaName.split("/").pop()}`
      });
      return id;
    }
  };
}

function getElementAttributeValue(element, namespace, localName) {
  return element.getAttributeNS(namespace, localName)
    || element.getAttribute(`w:${localName}`)
    || element.getAttribute(localName)
    || "";
}

function getMaxLocalElementId(doc, localName, attributeName) {
  return Array.from(doc.getElementsByTagName("*"))
    .filter((element) => element.localName === localName)
    .reduce((max, element) => {
      const value = Number(getElementAttributeValue(element, WORD_NAMESPACE, attributeName));
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, -1);
}

function appendHyphenBulletNumberingDefinition(doc) {
  const namespace = doc.documentElement?.lookupNamespaceURI("w") || WORD_NAMESPACE;
  const abstractNumId = getMaxLocalElementId(doc, "abstractNum", "abstractNumId") + 1;
  const numId = getMaxLocalElementId(doc, "num", "numId") + 1;
  const abstractNum = doc.createElementNS(namespace, "w:abstractNum");
  abstractNum.setAttributeNS(namespace, "w:abstractNumId", String(Math.max(0, abstractNumId)));

  const multiLevelType = doc.createElementNS(namespace, "w:multiLevelType");
  multiLevelType.setAttributeNS(namespace, "w:val", "multilevel");
  abstractNum.append(multiLevelType);

  [0, 1].forEach((listLevel) => {
    const left = listLevel === 0 ? 340 : 750;
    const level = doc.createElementNS(namespace, "w:lvl");
    level.setAttributeNS(namespace, "w:ilvl", String(listLevel));
    const start = doc.createElementNS(namespace, "w:start");
    start.setAttributeNS(namespace, "w:val", "1");
    const numFmt = doc.createElementNS(namespace, "w:numFmt");
    numFmt.setAttributeNS(namespace, "w:val", "bullet");
    const lvlText = doc.createElementNS(namespace, "w:lvlText");
    lvlText.setAttributeNS(namespace, "w:val", "-");
    const suffix = doc.createElementNS(namespace, "w:suff");
    suffix.setAttributeNS(namespace, "w:val", "tab");
    const pPr = doc.createElementNS(namespace, "w:pPr");
    const tabs = doc.createElementNS(namespace, "w:tabs");
    const tab = doc.createElementNS(namespace, "w:tab");
    tab.setAttributeNS(namespace, "w:val", "num");
    tab.setAttributeNS(namespace, "w:pos", String(left));
    tabs.append(tab);
    const indent = doc.createElementNS(namespace, "w:ind");
    indent.setAttributeNS(namespace, "w:left", String(left));
    indent.setAttributeNS(namespace, "w:hanging", "283");
    pPr.append(tabs, indent);
    level.append(start, numFmt, lvlText, suffix, pPr);
    abstractNum.append(level);
  });

  const num = doc.createElementNS(namespace, "w:num");
  num.setAttributeNS(namespace, "w:numId", String(Math.max(1, numId)));
  const abstractNumIdElement = doc.createElementNS(namespace, "w:abstractNumId");
  abstractNumIdElement.setAttributeNS(namespace, "w:val", String(Math.max(0, abstractNumId)));
  num.append(abstractNumIdElement);
  doc.documentElement.append(abstractNum, num);
  return Math.max(1, numId);
}

function ensureNumberingXmlEntry(entries) {
  const existing = entries.find((entry) => entry.name === "word/numbering.xml");
  const doc = existing
    ? parseXmlDocument(textDecoder.decode(existing.data), "Die Nummerierungsdefinition der DOCX-Datei konnte nicht gelesen werden.")
    : parseXmlDocument(`<w:numbering xmlns:w="${WORD_NAMESPACE}"></w:numbering>`);
  const numId = appendHyphenBulletNumberingDefinition(doc);
  return {
    entries: upsertZipEntry(entries, "word/numbering.xml", serializeXmlDocument(doc)),
    numId
  };
}

function ensureNumberingContentType(entries) {
  const existing = entries.find((entry) => entry.name === "[Content_Types].xml");
  const doc = existing
    ? parseXmlDocument(textDecoder.decode(existing.data), "Die Content-Type-Definition der DOCX-Datei konnte nicht gelesen werden.")
    : parseXmlDocument(`<Types xmlns="${CONTENT_TYPES_NAMESPACE}"></Types>`);
  const hasOverride = Array.from(doc.getElementsByTagName("*"))
    .some((element) => (
      element.localName === "Override"
      && element.getAttribute("PartName") === "/word/numbering.xml"
    ));
  if (!hasOverride) {
    const namespace = doc.documentElement?.namespaceURI || CONTENT_TYPES_NAMESPACE;
    const override = doc.createElementNS(namespace, "Override");
    override.setAttribute("PartName", "/word/numbering.xml");
    override.setAttribute("ContentType", WORD_NUMBERING_CONTENT_TYPE);
    doc.documentElement.append(override);
  }
  return upsertZipEntry(entries, "[Content_Types].xml", serializeXmlDocument(doc));
}

function ensureNumberingDocumentRelationship(entries) {
  const name = "word/_rels/document.xml.rels";
  const existing = entries.find((entry) => entry.name === name);
  const doc = existing
    ? parseXmlDocument(textDecoder.decode(existing.data), "Die Relationship-Definition der DOCX-Datei konnte nicht gelesen werden.")
    : parseXmlDocument(`<Relationships xmlns="${PACKAGE_RELATIONSHIPS_NAMESPACE}"></Relationships>`);
  const relationships = Array.from(doc.getElementsByTagName("*"))
    .filter((element) => element.localName === "Relationship");
  const hasRelationship = relationships.some((element) => element.getAttribute("Type") === WORD_NUMBERING_RELATIONSHIP_TYPE);
  if (!hasRelationship) {
    const maxRid = relationships.reduce((max, element) => {
      const match = String(element.getAttribute("Id") || "").match(/^rId(\d+)$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    const namespace = doc.documentElement?.namespaceURI || PACKAGE_RELATIONSHIPS_NAMESPACE;
    const relationship = doc.createElementNS(namespace, "Relationship");
    relationship.setAttribute("Id", `rId${maxRid + 1}`);
    relationship.setAttribute("Type", WORD_NUMBERING_RELATIONSHIP_TYPE);
    relationship.setAttribute("Target", "numbering.xml");
    doc.documentElement.append(relationship);
  }
  return upsertZipEntry(entries, name, serializeXmlDocument(doc));
}

function ensurePngContentType(entries) {
  const existing = entries.find((entry) => entry.name === "[Content_Types].xml");
  const doc = existing
    ? parseXmlDocument(textDecoder.decode(existing.data), "Die Content-Type-Definition der DOCX-Datei konnte nicht gelesen werden.")
    : parseXmlDocument(`<Types xmlns="${CONTENT_TYPES_NAMESPACE}"></Types>`);
  const hasDefault = Array.from(doc.getElementsByTagName("*"))
    .some((element) => (
      element.localName === "Default"
      && String(element.getAttribute("Extension") || "").toLowerCase() === "png"
    ));
  if (!hasDefault) {
    const namespace = doc.documentElement?.namespaceURI || CONTENT_TYPES_NAMESPACE;
    const item = doc.createElementNS(namespace, "Default");
    item.setAttribute("Extension", "png");
    item.setAttribute("ContentType", PNG_CONTENT_TYPE);
    doc.documentElement.append(item);
  }
  return upsertZipEntry(entries, "[Content_Types].xml", serializeXmlDocument(doc));
}

function addImageRelationships(entries, relationships = []) {
  let nextEntries = entries.slice();
  const byPath = new Map();
  relationships.forEach((relationship) => {
    const list = byPath.get(relationship.relsPath) || [];
    list.push(relationship);
    byPath.set(relationship.relsPath, list);
  });
  byPath.forEach((items, relsPath) => {
    const existing = nextEntries.find((entry) => entry.name === relsPath);
    const doc = existing
      ? parseXmlDocument(textDecoder.decode(existing.data), "Die Relationship-Definition der DOCX-Datei konnte nicht gelesen werden.")
      : parseXmlDocument(`<Relationships xmlns="${PACKAGE_RELATIONSHIPS_NAMESPACE}"></Relationships>`);
    const namespace = doc.documentElement?.namespaceURI || PACKAGE_RELATIONSHIPS_NAMESPACE;
    items.forEach((item) => {
      const relationship = doc.createElementNS(namespace, "Relationship");
      relationship.setAttribute("Id", item.id);
      relationship.setAttribute("Type", WORD_IMAGE_RELATIONSHIP_TYPE);
      relationship.setAttribute("Target", item.target);
      doc.documentElement.append(relationship);
    });
    nextEntries = upsertZipEntry(nextEntries, relsPath, serializeXmlDocument(doc));
  });
  return nextEntries;
}

function applyWordImageContext(entries, imageContext = null) {
  if (!imageContext || !imageContext.images.length) {
    return entries;
  }
  if (imageContext.relationships.length < imageContext.images.length) {
    throw new Error("Die Bildreferenzen der DOCX-Datei konnten nicht vollständig erzeugt werden.");
  }
  let nextEntries = entries.slice();
  imageContext.images.forEach((image) => {
    const index = nextEntries.findIndex((entry) => entry.name === image.name);
    if (index >= 0) {
      nextEntries = nextEntries.map((entry, entryIndex) => (
        entryIndex === index ? { name: image.name, data: image.data, flags: ZIP_UTF8_FLAG } : entry
      ));
    } else {
      nextEntries.push({ name: image.name, data: image.data, flags: ZIP_UTF8_FLAG });
    }
  });
  nextEntries = addImageRelationships(nextEntries, imageContext.relationships);
  nextEntries = ensurePngContentType(nextEntries);
  imageContext.images.forEach((image) => {
    if (!nextEntries.some((entry) => entry.name === image.name && entry.data?.length)) {
      throw new Error("Die Prozentrang-Grafik wurde nicht in die DOCX-Datei geschrieben.");
    }
  });
  imageContext.relationships.forEach((relationship) => {
    const relsEntry = nextEntries.find((entry) => entry.name === relationship.relsPath);
    if (!relsEntry || !textDecoder.decode(relsEntry.data).includes(`Id="${relationship.id}"`)) {
      throw new Error("Die Bildreferenz der Prozentrang-Grafik wurde nicht in die DOCX-Datei geschrieben.");
    }
  });
  return nextEntries;
}

function richTextReplacementsNeedHyphenBulletNumbering(replacements) {
  return replacements.some((replacement) => (
    replacement.values.some(wordRichTextValueNeedsHyphenBulletNumbering)
  ));
}

function wordRichTextValueNeedsHyphenBulletNumbering(value) {
  return Boolean(
    isWordRichTextValue(value)
    && value.runs.some((run) => run.list === "hyphenBullet")
  );
}

function ensureHyphenBulletNumbering(entries) {
  let nextEntries = entries.slice();
  const numberingResult = ensureNumberingXmlEntry(nextEntries);
  nextEntries = numberingResult.entries;
  nextEntries = ensureNumberingContentType(nextEntries);
  nextEntries = ensureNumberingDocumentRelationship(nextEntries);
  return {
    entries: nextEntries,
    numId: numberingResult.numId
  };
}

function setWordTextElementText(doc, textElement, value) {
  const text = String(value ?? "").replace(/\r\n?/g, "\n");
  if (!text.includes("\n")) {
    textElement.textContent = text;
    return;
  }
  const run = textElement.parentNode;
  if (!run) {
    textElement.textContent = text;
    return;
  }
  const namespace = getWordNamespace(doc);
  const lines = text.split("\n");
  textElement.textContent = lines[0] || "";
  let anchor = textElement;
  lines.slice(1).forEach((line) => {
    const breakElement = doc.createElementNS(namespace, "w:br");
    const nextTextElement = doc.createElementNS(namespace, "w:t");
    nextTextElement.textContent = line;
    run.insertBefore(breakElement, anchor.nextSibling);
    run.insertBefore(nextTextElement, breakElement.nextSibling);
    anchor = nextTextElement;
  });
}

function isWordRichTextValue(value) {
  return value && typeof value === "object" && Array.isArray(value.runs);
}

function normalizeWordRichTextText(value) {
  return String(value ?? "").replace(/[ \t]*(?:\r\n?|\n)[ \t]*/g, " ");
}

function normalizeWordRichTextRuns(value) {
  if (!isWordRichTextValue(value)) {
    return null;
  }
  return value.runs
    .map((run) => {
      const item = run && typeof run === "object" ? run : {};
      return {
        text: normalizeWordRichTextText(item.text),
        bold: item.bold === true,
        italic: item.italic === true,
        math: item.math === true,
        paragraphBreak: item.paragraphBreak === true,
        list: item.list === "hyphenBullet" ? "hyphenBullet" : "",
        listLevel: clampWordListLevel(item.listLevel)
      };
    })
    .filter((run) => run.text.length > 0);
}

function clampWordListLevel(value) {
  const number = Math.round(Number(value || 0));
  return Number.isFinite(number) ? Math.max(0, Math.min(8, number)) : 0;
}

function setWordTextPreserveSpace(textElement, text) {
  textElement.textContent = String(text ?? "");
  if (/^\s|\s$| {2,}/.test(textElement.textContent || "")) {
    textElement.setAttribute("xml:space", "preserve");
  }
}

function createMathElement(doc, localName) {
  return doc.createElementNS(MATH_NAMESPACE, `m:${localName}`);
}

function appendMathText(doc, parent, text, options = {}) {
  if (String(text ?? "") === "") {
    return;
  }
  const run = createMathElement(doc, "r");
  if (options.normal === true) {
    const properties = createMathElement(doc, "rPr");
    properties.append(createMathElement(doc, "nor"));
    run.append(properties);
  }
  const textElement = createMathElement(doc, "t");
  setWordTextPreserveSpace(textElement, text);
  run.append(textElement);
  parent.append(run);
}

function normalizeLatexMathCommand(command) {
  const symbols = {
    alpha: "α",
    beta: "β",
    gamma: "γ",
    delta: "δ",
    epsilon: "ε",
    theta: "θ",
    lambda: "λ",
    mu: "μ",
    pi: "π",
    rho: "ρ",
    sigma: "σ",
    tau: "τ",
    phi: "φ",
    omega: "ω",
    cdot: "⋅",
    times: "×",
    div: "÷",
    leq: "≤",
    geq: "≥",
    neq: "≠",
    infty: "∞",
    pm: "±",
    degree: "°",
    cdots: "⋯",
    ldots: "…",
    quad: " ",
    qquad: "  ",
    left: "",
    right: ""
  };
  const operators = new Set(["sin", "cos", "tan", "ln", "log", "lim", "max", "min", "exp"]);
  if (Object.prototype.hasOwnProperty.call(symbols, command)) {
    return symbols[command];
  }
  if (operators.has(command)) {
    return command;
  }
  return command ? `\\${command}` : "";
}

function normalizeLatexMathEscapedCharacter(char) {
  if (char === "," || char === ":" || char === ";") {
    return " ";
  }
  if (char === "!") {
    return "";
  }
  const escapedSymbols = {
    "%": "%",
    "$": "$",
    "#": "#",
    "&": "&",
    "_": "_",
    "{": "{",
    "}": "}",
    "\\": "\\"
  };
  return Object.prototype.hasOwnProperty.call(escapedSymbols, char) ? escapedSymbols[char] : char;
}

function normalizeLatexMathTextGroup(value) {
  return String(value ?? "")
    .replace(/\\([,;:])/g, " ")
    .replace(/\\!/g, "")
    .replace(/\\([%$#&_{}\\])/g, (_match, char) => normalizeLatexMathEscapedCharacter(char))
    .replace(/\s+/g, " ");
}

function createLatexMathParser(source) {
  const text = String(source || "");
  const parser = {
    index: 0,
    skipSpaces() {
      while (this.index < text.length && /\s/.test(text[this.index])) {
        this.index += 1;
      }
    },
    parseSequence(stopChar = "") {
      const nodes = [];
      while (this.index < text.length) {
        if (stopChar && text[this.index] === stopChar) {
          this.index += 1;
          break;
        }
        const node = this.parseScriptedAtom();
        if (node) {
          nodes.push(node);
        } else {
          this.index += 1;
        }
      }
      return nodes;
    },
    parseGroup() {
      this.skipSpaces();
      if (text[this.index] !== "{") {
        const node = this.parseAtom();
        return node ? [node] : [];
      }
      this.index += 1;
      return this.parseSequence("}");
    },
    parseOptionalGroup() {
      this.skipSpaces();
      if (text[this.index] !== "[") {
        return [];
      }
      this.index += 1;
      return this.parseSequence("]");
    },
    readRequiredGroupText() {
      this.skipSpaces();
      if (text[this.index] !== "{") {
        return "";
      }
      this.index += 1;
      let depth = 1;
      let result = "";
      while (this.index < text.length && depth > 0) {
        const char = text[this.index];
        if (char === "\\" && this.index + 1 < text.length) {
          result += text.slice(this.index, this.index + 2);
          this.index += 2;
          continue;
        }
        if (char === "{") {
          depth += 1;
          result += char;
          this.index += 1;
          continue;
        }
        if (char === "}") {
          depth -= 1;
          if (depth > 0) {
            result += char;
          }
          this.index += 1;
          continue;
        }
        result += char;
        this.index += 1;
      }
      return normalizeLatexMathTextGroup(result);
    },
    parseCommand() {
      this.index += 1;
      const start = this.index;
      while (this.index < text.length && /[a-zA-Z]/.test(text[this.index])) {
        this.index += 1;
      }
      if (start === this.index && this.index < text.length) {
        const char = text[this.index];
        this.index += 1;
        return { type: "text", text: normalizeLatexMathEscapedCharacter(char) };
      }
      const command = text.slice(start, this.index);
      if (command === "frac") {
        return { type: "frac", numerator: this.parseGroup(), denominator: this.parseGroup() };
      }
      if (command === "sqrt") {
        const degree = this.parseOptionalGroup();
        return { type: "sqrt", degree, value: this.parseGroup() };
      }
      if (command === "text" || command === "mathrm" || command === "operatorname") {
        return { type: "text", text: this.readRequiredGroupText(), normal: true };
      }
      return { type: "text", text: normalizeLatexMathCommand(command) };
    },
    parseAtom() {
      this.skipSpaces();
      if (this.index >= text.length) {
        return null;
      }
      const char = text[this.index];
      if (char === "{") {
        this.index += 1;
        return { type: "group", children: this.parseSequence("}") };
      }
      if (char === "\\") {
        return this.parseCommand();
      }
      if (char === "}" || char === "]") {
        return null;
      }
      this.index += 1;
      return { type: "text", text: char };
    },
    parseScriptArgument() {
      this.skipSpaces();
      if (text[this.index] === "{") {
        this.index += 1;
        return this.parseSequence("}");
      }
      const atom = this.parseAtom();
      return atom ? [atom] : [];
    },
    parseScriptedAtom() {
      const base = this.parseAtom();
      if (!base) {
        return null;
      }
      let sub = null;
      let sup = null;
      while (true) {
        this.skipSpaces();
        if (text[this.index] === "_") {
          this.index += 1;
          sub = this.parseScriptArgument();
          continue;
        }
        if (text[this.index] === "^") {
          this.index += 1;
          sup = this.parseScriptArgument();
          continue;
        }
        break;
      }
      if (sub && sup) {
        return { type: "subSup", base: [base], sub, sup };
      }
      if (sub) {
        return { type: "sub", base: [base], sub };
      }
      if (sup) {
        return { type: "sup", base: [base], sup };
      }
      return base;
    }
  };
  return parser;
}

function appendMathNodes(doc, parent, nodes) {
  (Array.isArray(nodes) ? nodes : []).forEach((node) => {
    appendMathNode(doc, parent, node);
  });
}

function appendMathNode(doc, parent, node) {
  if (!node) {
    return;
  }
  if (node.type === "text") {
    appendMathText(doc, parent, node.text, { normal: node.normal === true });
    return;
  }
  if (node.type === "group") {
    appendMathNodes(doc, parent, node.children);
    return;
  }
  if (node.type === "frac") {
    const fraction = createMathElement(doc, "f");
    const numerator = createMathElement(doc, "num");
    const denominator = createMathElement(doc, "den");
    appendMathNodes(doc, numerator, node.numerator);
    appendMathNodes(doc, denominator, node.denominator);
    fraction.append(numerator, denominator);
    parent.append(fraction);
    return;
  }
  if (node.type === "sqrt") {
    const radical = createMathElement(doc, "rad");
    if (node.degree && node.degree.length) {
      const degree = createMathElement(doc, "deg");
      appendMathNodes(doc, degree, node.degree);
      radical.append(degree);
    }
    const value = createMathElement(doc, "e");
    appendMathNodes(doc, value, node.value);
    radical.append(value);
    parent.append(radical);
    return;
  }
  if (node.type === "sup" || node.type === "sub" || node.type === "subSup") {
    const element = createMathElement(doc, node.type === "sup" ? "sSup" : (node.type === "sub" ? "sSub" : "sSubSup"));
    const base = createMathElement(doc, "e");
    appendMathNodes(doc, base, node.base);
    element.append(base);
    if (node.type === "sub" || node.type === "subSup") {
      const sub = createMathElement(doc, "sub");
      appendMathNodes(doc, sub, node.sub);
      element.append(sub);
    }
    if (node.type === "sup" || node.type === "subSup") {
      const sup = createMathElement(doc, "sup");
      appendMathNodes(doc, sup, node.sup);
      element.append(sup);
    }
    parent.append(element);
  }
}

function appendWordMathRun(doc, paragraph, latex) {
  const math = createMathElement(doc, "oMath");
  const parser = createLatexMathParser(latex);
  const nodes = parser.parseSequence();
  if (nodes.length) {
    appendMathNodes(doc, math, nodes);
  } else {
    appendMathText(doc, math, String(latex || ""));
  }
  paragraph.append(math);
}

function appendWordRichTextRun(doc, paragraph, run) {
  if (run.math) {
    appendWordMathRun(doc, paragraph, run.text);
    return;
  }
  const namespace = getWordNamespace(doc);
  const runElement = doc.createElementNS(namespace, "w:r");
  if (run.bold || run.italic) {
    const runProperties = doc.createElementNS(namespace, "w:rPr");
    if (run.bold) {
      runProperties.append(doc.createElementNS(namespace, "w:b"));
    }
    if (run.italic) {
      runProperties.append(doc.createElementNS(namespace, "w:i"));
    }
    runElement.append(runProperties);
  }
  const lines = String(run.text ?? "").replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) {
      runElement.append(doc.createElementNS(namespace, "w:br"));
    }
    const textElement = doc.createElementNS(namespace, "w:t");
    setWordTextPreserveSpace(textElement, line);
    runElement.append(textElement);
  });
  paragraph.append(runElement);
}

function applyWordRichTextParagraphSpacing(doc, properties) {
  if (!properties) {
    return;
  }
  const namespace = getWordNamespace(doc);
  let spacing = getChildElementsByLocalName(properties, "spacing")[0] || null;
  if (!spacing) {
    spacing = doc.createElementNS(namespace, "w:spacing");
    properties.append(spacing);
  }
  spacing.setAttributeNS(namespace, "w:line", "240");
  spacing.setAttributeNS(namespace, "w:lineRule", "auto");
}

function createWordParagraph(doc, baseParagraphProperties = null, list = "", richTextContext = null, listLevel = 0) {
  const namespace = getWordNamespace(doc);
  const paragraph = doc.createElementNS(namespace, "w:p");
  const properties = baseParagraphProperties
    ? baseParagraphProperties.cloneNode(true)
    : doc.createElementNS(namespace, "w:pPr");
  applyWordRichTextParagraphSpacing(doc, properties);
  if (list === "hyphenBullet") {
    Array.from(properties.children || []).forEach((child) => {
      if (child.localName === "numPr") {
        properties.removeChild(child);
      }
    });
    const numPr = doc.createElementNS(namespace, "w:numPr");
    const ilvl = doc.createElementNS(namespace, "w:ilvl");
    ilvl.setAttributeNS(namespace, "w:val", String(clampWordListLevel(listLevel)));
    const numId = doc.createElementNS(namespace, "w:numId");
    numId.setAttributeNS(namespace, "w:val", String(richTextContext?.hyphenBulletNumId || 1));
    numPr.append(ilvl, numId);
    properties.append(numPr);
  }
  if (properties.children.length || properties.attributes.length) {
    paragraph.append(properties);
  }
  return paragraph;
}

function pushWordRichTextParagraph(paragraphs, paragraph) {
  if (!paragraph) {
    return;
  }
  const hasText = getWordElementText(paragraph).length > 0;
  const hasNumbering = Array.from(paragraph.getElementsByTagName("*"))
    .some((element) => element.localName === "numPr");
  if (hasText || hasNumbering) {
    paragraphs.push(paragraph);
  }
}

function buildWordRichTextParagraphs(doc, runs, baseParagraphProperties, richTextContext) {
  const paragraphs = [];
  let paragraph = createWordParagraph(doc, baseParagraphProperties, "", richTextContext, 0);
  const hasParagraphContent = () => getWordElementText(paragraph).length > 0;
  const startParagraph = (list = "", listLevel = 0) => {
    pushWordRichTextParagraph(paragraphs, paragraph);
    paragraph = createWordParagraph(doc, baseParagraphProperties, list, richTextContext, listLevel);
  };
  runs.forEach((run) => {
    if (run.paragraphBreak && hasParagraphContent()) {
      startParagraph(run.list || "", run.listLevel);
    } else if (run.list === "hyphenBullet" && hasParagraphContent()) {
      startParagraph(run.list, run.listLevel);
    } else if (run.list === "hyphenBullet") {
      paragraph = createWordParagraph(doc, baseParagraphProperties, run.list, richTextContext, run.listLevel);
    }
    appendWordRichTextRun(doc, paragraph, {
      ...run,
      text: normalizeWordRichTextText(run.text)
    });
  });
  pushWordRichTextParagraph(paragraphs, paragraph);
  return paragraphs;
}

function wordRichTextNeedsParagraphs(runs) {
  return runs.some((run) => run.paragraphBreak || run.list);
}

function getWordRichTextPlainText(runs) {
  return (Array.isArray(runs) ? runs : [])
    .map((run) => String(run?.text ?? ""))
    .join("");
}

function replacePlaceholderParagraphWithRichText(doc, textElement, value, richTextContext = null) {
  const runs = normalizeWordRichTextRuns(value);
  if (!runs || !runs.length) {
    setWordTextElementText(doc, textElement, "");
    return false;
  }
  const paragraph = getAncestorByLocalName(textElement, "p");
  const parent = paragraph?.parentNode || null;
  if (!paragraph || !parent || !wordRichTextNeedsParagraphs(runs)) {
    setWordTextElementText(doc, textElement, getWordRichTextPlainText(runs));
    return false;
  }
  const baseParagraphProperties = getChildElementsByLocalName(paragraph, "pPr")[0]?.cloneNode(true) || null;
  const nextParagraphs = buildWordRichTextParagraphs(doc, runs, baseParagraphProperties, richTextContext);
  nextParagraphs.forEach((nextParagraph) => {
    parent.insertBefore(nextParagraph, paragraph);
  });
  parent.removeChild(paragraph);
  return true;
}

function createWordImageElement(doc, relationshipId, image, docPrId = 1) {
  const drawing = doc.createElementNS(getWordNamespace(doc), "w:drawing");
  const inline = doc.createElementNS(WORDPROCESSING_DRAWING_NAMESPACE, "wp:inline");
  inline.setAttribute("distT", "0");
  inline.setAttribute("distB", "0");
  inline.setAttribute("distL", "0");
  inline.setAttribute("distR", "0");

  const extent = doc.createElementNS(WORDPROCESSING_DRAWING_NAMESPACE, "wp:extent");
  extent.setAttribute("cx", String(image.widthEmu));
  extent.setAttribute("cy", String(image.heightEmu));
  const effectExtent = doc.createElementNS(WORDPROCESSING_DRAWING_NAMESPACE, "wp:effectExtent");
  effectExtent.setAttribute("l", "0");
  effectExtent.setAttribute("t", "0");
  effectExtent.setAttribute("r", "0");
  effectExtent.setAttribute("b", "0");
  const docPr = doc.createElementNS(WORDPROCESSING_DRAWING_NAMESPACE, "wp:docPr");
  docPr.setAttribute("id", String(docPrId));
  docPr.setAttribute("name", image.description || "Bild");
  docPr.setAttribute("descr", image.description || "Bild");
  const cNvGraphicFramePr = doc.createElementNS(WORDPROCESSING_DRAWING_NAMESPACE, "wp:cNvGraphicFramePr");
  const graphicFrameLocks = doc.createElementNS(DRAWING_NAMESPACE, "a:graphicFrameLocks");
  graphicFrameLocks.setAttribute("noChangeAspect", "1");
  cNvGraphicFramePr.append(graphicFrameLocks);

  const graphic = doc.createElementNS(DRAWING_NAMESPACE, "a:graphic");
  const graphicData = doc.createElementNS(DRAWING_NAMESPACE, "a:graphicData");
  graphicData.setAttribute("uri", DRAWING_PICTURE_NAMESPACE);
  const pic = doc.createElementNS(DRAWING_PICTURE_NAMESPACE, "pic:pic");
  const nvPicPr = doc.createElementNS(DRAWING_PICTURE_NAMESPACE, "pic:nvPicPr");
  const cNvPr = doc.createElementNS(DRAWING_PICTURE_NAMESPACE, "pic:cNvPr");
  cNvPr.setAttribute("id", "0");
  cNvPr.setAttribute("name", image.description || "Bild");
  cNvPr.setAttribute("descr", image.description || "Bild");
  const cNvPicPr = doc.createElementNS(DRAWING_PICTURE_NAMESPACE, "pic:cNvPicPr");
  nvPicPr.append(cNvPr, cNvPicPr);

  const blipFill = doc.createElementNS(DRAWING_PICTURE_NAMESPACE, "pic:blipFill");
  const blip = doc.createElementNS(DRAWING_NAMESPACE, "a:blip");
  blip.setAttributeNS(RELATIONSHIPS_DOC_NAMESPACE, "r:embed", relationshipId);
  const stretch = doc.createElementNS(DRAWING_NAMESPACE, "a:stretch");
  stretch.append(doc.createElementNS(DRAWING_NAMESPACE, "a:fillRect"));
  blipFill.append(blip, stretch);

  const spPr = doc.createElementNS(DRAWING_PICTURE_NAMESPACE, "pic:spPr");
  const xfrm = doc.createElementNS(DRAWING_NAMESPACE, "a:xfrm");
  const off = doc.createElementNS(DRAWING_NAMESPACE, "a:off");
  off.setAttribute("x", "0");
  off.setAttribute("y", "0");
  const ext = doc.createElementNS(DRAWING_NAMESPACE, "a:ext");
  ext.setAttribute("cx", String(image.widthEmu));
  ext.setAttribute("cy", String(image.heightEmu));
  xfrm.append(off, ext);
  const prstGeom = doc.createElementNS(DRAWING_NAMESPACE, "a:prstGeom");
  prstGeom.setAttribute("prst", "rect");
  prstGeom.append(doc.createElementNS(DRAWING_NAMESPACE, "a:avLst"));
  spPr.append(xfrm, prstGeom);

  pic.append(nvPicPr, blipFill, spPr);
  graphicData.append(pic);
  graphic.append(graphicData);
  inline.append(extent, effectExtent, docPr, cNvGraphicFramePr, graphic);
  drawing.append(inline);
  return drawing;
}

function replacePlaceholderParagraphWithImage(doc, textElement, value, imageContext = null) {
  const image = normalizeWordImageReplacement(value);
  const partName = imageContext?.partName || "";
  if (!image || !imageContext || !partName || typeof imageContext.addImage !== "function") {
    throw new Error("Die Prozentrang-Grafik konnte nicht in die DOCX-Datei eingebettet werden.");
  }
  const paragraph = getAncestorByLocalName(textElement, "p");
  const parent = paragraph?.parentNode || null;
  if (!paragraph || !parent) {
    throw new Error("Die Position für die Prozentrang-Grafik konnte in der DOCX-Datei nicht gefunden werden.");
  }
  const relationshipId = imageContext.addImage(partName, image);
  if (!relationshipId) {
    throw new Error("Die Bildreferenz für die Prozentrang-Grafik konnte nicht erzeugt werden.");
  }
  const namespace = getWordNamespace(doc);
  const nextParagraph = doc.createElementNS(namespace, "w:p");
  const baseParagraphProperties = getChildElementsByLocalName(paragraph, "pPr")[0]?.cloneNode(true) || null;
  if (baseParagraphProperties) {
    Array.from(baseParagraphProperties.children || []).forEach((child) => {
      if (child.localName === "ind") {
        baseParagraphProperties.removeChild(child);
      }
    });
    nextParagraph.append(baseParagraphProperties);
  }
  const run = doc.createElementNS(namespace, "w:r");
  run.append(createWordImageElement(doc, relationshipId, image, Math.max(1, imageContext.images.length)));
  nextParagraph.append(run);
  parent.insertBefore(nextParagraph, paragraph);
  parent.removeChild(paragraph);
  imageContext.insertedImageCount = Number(imageContext.insertedImageCount || 0) + 1;
  return true;
}

function setWordCellRichText(doc, cell, value, richTextContext = null) {
  const runs = normalizeWordRichTextRuns(value);
  if (!runs || !runs.length) {
    setWordCellText(doc, cell, "");
    return;
  }
  const namespace = getWordNamespace(doc);
  const paragraph = getChildElementsByLocalName(cell, "p")[0] || doc.createElementNS(namespace, "w:p");
  const baseParagraphProperties = getChildElementsByLocalName(paragraph, "pPr")[0]?.cloneNode(true) || null;
  if (wordRichTextNeedsParagraphs(runs)) {
    Array.from(cell.children || []).forEach((child) => {
      if (child.localName === "p") {
        cell.removeChild(child);
      }
    });
    buildWordRichTextParagraphs(doc, runs, baseParagraphProperties, richTextContext).forEach((nextParagraph) => {
      cell.append(nextParagraph);
    });
    return;
  }
  Array.from(paragraph.children || []).forEach((child) => {
    if (child.localName !== "pPr") {
      paragraph.removeChild(child);
    }
  });
  runs.forEach((run) => {
    appendWordRichTextRun(doc, paragraph, run);
  });
  if (!paragraph.parentNode) {
    cell.append(paragraph);
  }
}

function setWordCellText(doc, cell, value, richTextContext = null) {
  if (isWordRichTextValue(value)) {
    setWordCellRichText(doc, cell, value, richTextContext);
    return;
  }
  const textElements = getWordTextElements(cell);
  const text = String(value ?? "");
  if (textElements.length) {
    textElements.forEach((textElement, index) => {
      setWordTextElementText(doc, textElement, index === 0 ? text : "");
    });
    return;
  }
  const namespace = getWordNamespace(doc);
  const paragraph = getChildElementsByLocalName(cell, "p")[0] || doc.createElementNS(namespace, "w:p");
  const run = getChildElementsByLocalName(paragraph, "r")[0] || doc.createElementNS(namespace, "w:r");
  const textElement = doc.createElementNS(namespace, "w:t");
  textElement.textContent = text;
  if (!run.parentNode) {
    paragraph.append(run);
  }
  run.append(textElement);
  if (!paragraph.parentNode) {
    cell.append(paragraph);
  }
}

function normalizeTableColumnReplacements(tableColumnReplacements) {
  const source = Array.isArray(tableColumnReplacements)
    ? tableColumnReplacements
    : (tableColumnReplacements ? [tableColumnReplacements] : []);
  return source
    .map((replacement) => {
      const item = replacement && typeof replacement === "object" ? replacement : {};
      const header = normalizeWordCellText(item.header);
      if (!header) {
        return null;
      }
      return {
        header,
        values: Array.isArray(item.values) ? item.values.map((value) => (
          isWordRichTextValue(value)
            ? { runs: normalizeWordRichTextRuns(value) || [] }
            : String(value ?? "")
        )) : [],
        targetRowHeader: normalizeWordCellText(item.targetRowHeader),
        targetRowPattern: item.targetRowPattern instanceof RegExp ? item.targetRowPattern : null,
        targetSectionEndText: normalizeWordCellText(item.targetSectionEndText),
        extendRows: item.extendRows === true,
        numberContinuation: item.numberContinuation === true,
        numberTargetRows: item.numberTargetRows === true,
        removeUnusedTargetRows: item.removeUnusedTargetRows === true
      };
    })
    .filter(Boolean);
}

function createTableReplacementStats(replacements) {
  return replacements.map((replacement) => ({
    replacement,
    foundColumn: false,
    foundTargetRowColumn: false,
    foundTargetSectionEnd: false,
    foundTargetRows: false,
    applied: false
  }));
}

function findWordTableHeaderColumnIndex(headerCells, header) {
  return headerCells.findIndex(
    (cell) => normalizeWordCellText(getWordElementText(cell)) === header
  );
}

function matchesWordTargetRow(text, pattern) {
  const value = normalizeWordCellText(text);
  if (pattern instanceof RegExp) {
    pattern.lastIndex = 0;
    return pattern.test(value);
  }
  return Boolean(value);
}

function hasWordCellNumbering(cell) {
  return Array.from(cell?.getElementsByTagName("*") || [])
    .some((element) => element.localName === "numPr");
}

function matchesWordTargetRowCell(cell, pattern) {
  const text = getWordElementText(cell);
  if (matchesWordTargetRow(text, pattern)) {
    return true;
  }
  return !normalizeWordCellText(text) && hasWordCellNumbering(cell);
}

function getWordNumberCellValue(cell) {
  const match = normalizeWordCellText(getWordElementText(cell)).match(/^\((\d+)\)$/);
  return match ? Number(match[1]) : null;
}

function removeWordCellNumbering(cell) {
  Array.from(cell?.getElementsByTagName("*") || [])
    .filter((element) => element.localName === "numPr")
    .forEach((numPr) => {
      numPr.parentNode?.removeChild(numPr);
    });
}

function insertWordTableRowsForReplacement(doc, table, targetRows, replacement, columnIndex, targetColumnIndex) {
  if (!replacement.extendRows || targetRows.length >= replacement.values.length || !targetRows.length) {
    return;
  }
  let insertAfter = targetRows[targetRows.length - 1];
  const baseRow = insertAfter;
  const baseNumberCell = getChildElementsByLocalName(baseRow, "tc")[targetColumnIndex];
  let nextNumber = getWordNumberCellValue(baseNumberCell) || targetRows.length;
  while (targetRows.length < replacement.values.length) {
    const row = baseRow.cloneNode(true);
    const cells = getChildElementsByLocalName(row, "tc");
    cells.forEach((cell) => {
      setWordCellText(doc, cell, "");
    });
    if (replacement.numberContinuation) {
      nextNumber += 1;
      const numberCell = cells[targetColumnIndex];
      if (numberCell && !hasWordCellNumbering(numberCell)) {
        setWordCellText(doc, numberCell, `(${nextNumber})`);
      }
    }
    const contentCell = cells[columnIndex];
    if (contentCell) {
      setWordCellText(doc, contentCell, "");
    }
    table.insertBefore(row, insertAfter.nextSibling);
    targetRows.push(row);
    insertAfter = row;
  }
}

function insertWordTableSectionRowsForReplacement(doc, table, targetRows, replacement, columnIndex, targetColumnIndex, insertBefore) {
  if (!replacement.extendRows || targetRows.length >= replacement.values.length || !targetRows.length) {
    return;
  }
  const baseRow = targetRows[targetRows.length - 1];
  while (targetRows.length < replacement.values.length) {
    const row = baseRow.cloneNode(true);
    const cells = getChildElementsByLocalName(row, "tc");
    cells.forEach((cell) => {
      removeWordCellNumbering(cell);
      setWordCellText(doc, cell, "");
    });
    const numberCell = cells[targetColumnIndex];
    if (numberCell) {
      removeWordCellNumbering(numberCell);
      setWordCellText(doc, numberCell, "");
    }
    const contentCell = cells[columnIndex];
    if (contentCell) {
      setWordCellText(doc, contentCell, "");
    }
    table.insertBefore(row, insertBefore);
    targetRows.push(row);
  }
}

function removeUnusedWordTableRowsForReplacement(targetRows, replacement) {
  if (!replacement.removeUnusedTargetRows || targetRows.length <= replacement.values.length) {
    return;
  }
  targetRows.slice(replacement.values.length).forEach((row) => {
    row.parentNode?.removeChild(row);
  });
  targetRows.length = replacement.values.length;
}

function setWordTableTargetRowNumbers(doc, targetRows, targetColumnIndex) {
  targetRows.forEach((row, rowIndex) => {
    const cell = getChildElementsByLocalName(row, "tc")[targetColumnIndex];
    if (!cell) {
      return;
    }
    removeWordCellNumbering(cell);
    setWordCellText(doc, cell, `(${rowIndex + 1})`);
  });
}

function getWordTableSectionTargetRows(bodyRows, targetColumnIndex, sectionEndText) {
  const endIndex = bodyRows.findIndex((row) => {
    const cell = getChildElementsByLocalName(row, "tc")[targetColumnIndex];
    return cell && normalizeWordCellText(getWordElementText(cell)) === sectionEndText;
  });
  if (endIndex < 0) {
    return null;
  }
  return {
    endRow: bodyRows[endIndex],
    rows: bodyRows.slice(0, endIndex)
  };
}

function applyTableColumnReplacements(doc, replacements, stats = null, richTextContext = null) {
  if (!replacements.length) {
    return;
  }
  const tables = Array.from(doc.getElementsByTagName("*"))
    .filter((element) => element.localName === "tbl");
  tables.forEach((table) => {
    const rows = getChildElementsByLocalName(table, "tr");
    const [headerRow, ...bodyRows] = rows;
    if (!headerRow || !bodyRows.length) {
      return;
    }
    const headerCells = getChildElementsByLocalName(headerRow, "tc");
    if (!headerCells.length) {
      return;
    }
    replacements.forEach((replacement, replacementIndex) => {
      const replacementStats = stats ? stats[replacementIndex] : null;
      const columnIndex = findWordTableHeaderColumnIndex(headerCells, replacement.header);
      if (columnIndex < 0) {
        return;
      }
      if (replacementStats) {
        replacementStats.foundColumn = true;
      }
      if (replacement.targetRowHeader) {
        const targetColumnIndex = findWordTableHeaderColumnIndex(headerCells, replacement.targetRowHeader);
        if (targetColumnIndex < 0) {
          return;
        }
        if (replacementStats) {
          replacementStats.foundTargetRowColumn = true;
        }
        if (replacement.targetSectionEndText) {
          const section = getWordTableSectionTargetRows(bodyRows, targetColumnIndex, replacement.targetSectionEndText);
          if (!section) {
            return;
          }
          if (replacementStats) {
            replacementStats.foundTargetSectionEnd = true;
          }
          const targetRows = section.rows;
          if (targetRows.length) {
            if (replacementStats) {
              replacementStats.foundTargetRows = true;
            }
            insertWordTableSectionRowsForReplacement(
              doc,
              table,
              targetRows,
              replacement,
              columnIndex,
              targetColumnIndex,
              section.endRow
            );
            removeUnusedWordTableRowsForReplacement(targetRows, replacement);
            if (replacement.numberTargetRows) {
              setWordTableTargetRowNumbers(doc, targetRows, targetColumnIndex);
            }
          }
          targetRows.slice(0, replacement.values.length).forEach((row, rowIndex) => {
            const cell = getChildElementsByLocalName(row, "tc")[columnIndex];
            if (cell) {
              setWordCellText(doc, cell, replacement.values[rowIndex], richTextContext);
              if (replacementStats) {
                replacementStats.applied = true;
              }
            }
          });
          return;
        }
        const targetRows = bodyRows.filter((row) => {
          const cell = getChildElementsByLocalName(row, "tc")[targetColumnIndex];
          return cell && matchesWordTargetRowCell(cell, replacement.targetRowPattern);
        });
        if (targetRows.length) {
          if (replacementStats) {
            replacementStats.foundTargetRows = true;
          }
          insertWordTableRowsForReplacement(doc, table, targetRows, replacement, columnIndex, targetColumnIndex);
          removeUnusedWordTableRowsForReplacement(targetRows, replacement);
        }
        targetRows.slice(0, replacement.values.length).forEach((row, rowIndex) => {
          const cell = getChildElementsByLocalName(row, "tc")[columnIndex];
          if (cell) {
            setWordCellText(doc, cell, replacement.values[rowIndex], richTextContext);
            if (replacementStats) {
              replacementStats.applied = true;
            }
          }
        });
        return;
      }
      bodyRows.slice(0, replacement.values.length).forEach((row, rowIndex) => {
        const cell = getChildElementsByLocalName(row, "tc")[columnIndex];
        if (cell) {
          setWordCellText(doc, cell, replacement.values[rowIndex], richTextContext);
        }
      });
    });
  });
}

function assertRequiredTableReplacementsApplied(stats) {
  stats
    .filter((entry) => entry.replacement.targetRowHeader && entry.replacement.values.length)
    .forEach((entry) => {
      if (!entry.foundColumn) {
        throw new Error(`Die Spalte „${entry.replacement.header}“ wurde in der EWH-Vorlage nicht gefunden.`);
      }
      if (!entry.foundTargetRowColumn) {
        throw new Error(`Die Spalte „${entry.replacement.targetRowHeader}“ wurde in der EWH-Vorlage nicht gefunden.`);
      }
      if (entry.replacement.targetSectionEndText && !entry.foundTargetSectionEnd) {
        throw new Error(`Die Summenzeile „${entry.replacement.targetSectionEndText}“ wurde in der Spalte „${entry.replacement.targetRowHeader}“ nicht gefunden.`);
      }
      if (!entry.foundTargetRows) {
        if (entry.replacement.targetSectionEndText) {
          throw new Error(`Vor der Summenzeile „${entry.replacement.targetSectionEndText}“ ist keine Aufgabenzeile vorhanden.`);
        }
        throw new Error(`In der Spalte „${entry.replacement.targetRowHeader}“ wurde keine Nummerierung oder Nummer im Format (10) gefunden.`);
      }
      if (!entry.applied) {
        throw new Error(`Die Inhalte konnten nicht in die Spalte „${entry.replacement.header}“ eingefügt werden.`);
      }
    });
}

function standardReplacementsNeedHyphenBulletNumbering(replacements = {}) {
  return Object.values(replacements || {}).some(wordRichTextValueNeedsHyphenBulletNumbering);
}

function replaceFirstShortParagraphContainingTextWithImage(doc, textElements, text, replacement, richTextContext = null) {
  const needle = String(text || "");
  const imageContext = richTextContext?.imageContext || null;
  if (!needle || !isWordImageReplacement(replacement) || !imageContext) {
    return false;
  }
  const candidates = textElements
    .map((element) => {
      const paragraph = getAncestorByLocalName(element, "p");
      return paragraph ? { element, paragraph, text: getWordElementText(paragraph) } : null;
    })
    .filter((candidate, index, list) => (
      candidate
      && candidate.text.includes(needle)
      && candidate.text.trim().length <= 80
      && list.findIndex((item) => item?.paragraph === candidate.paragraph) === index
    ));
  const candidate = candidates[0] || null;
  if (!candidate) {
    return false;
  }
  return replacePlaceholderParagraphWithImage(doc, candidate.element, replacement, imageContext);
}

function replacePlaceholderInTextElements(doc, textElements, placeholder, replacement, richTextContext = null) {
  const needle = String(placeholder || "");
  if (!needle) {
    return 0;
  }
  const richTextReplacement = isWordRichTextValue(replacement);
  const imageReplacement = isWordImageReplacement(replacement);
  const richTextRuns = richTextReplacement ? normalizeWordRichTextRuns(replacement) : null;
  const value = richTextReplacement ? getWordRichTextPlainText(richTextRuns) : (imageReplacement ? "" : String(replacement ?? ""));
  let currentTextElements = textElements;
  let replacementCount = 0;
  while (true) {
    let combined = "";
    const records = currentTextElements.map((element) => {
      const text = element.textContent || "";
      const start = combined.length;
      combined += text;
      return { element, text, start, end: combined.length };
    });
    const matchStart = combined.indexOf(needle);
    if (matchStart < 0) {
      break;
    }
    const matchEnd = matchStart + needle.length;
    const first = records.find((record) => record.start <= matchStart && record.end > matchStart);
    const last = records.find((record) => record.start < matchEnd && record.end >= matchEnd);
    if (!first || !last) {
      break;
    }
    if (imageReplacement && replacePlaceholderParagraphWithImage(doc, first.element, replacement, richTextContext?.imageContext || null)) {
      replacementCount += 1;
      currentTextElements = getWordTextElements(doc);
      continue;
    }
    if (imageReplacement) {
      throw new Error("Die Prozentrang-Grafik konnte nicht an der Platzhalterposition eingefügt werden.");
    }
    if (richTextReplacement && replacePlaceholderParagraphWithRichText(doc, first.element, replacement, richTextContext)) {
      replacementCount += 1;
      currentTextElements = getWordTextElements(doc);
      continue;
    }
    if (first === last) {
      const localStart = matchStart - first.start;
      const localEnd = matchEnd - first.start;
      setWordTextElementText(
        doc,
        first.element,
        `${first.text.slice(0, localStart)}${value}${first.text.slice(localEnd)}`
      );
      replacementCount += 1;
      continue;
    }
    setWordTextElementText(doc, first.element, `${first.text.slice(0, matchStart - first.start)}${value}`);
    let inside = false;
    records.forEach((record) => {
      if (record === first) {
        inside = true;
        return;
      }
      if (record === last) {
        inside = false;
        setWordTextElementText(doc, record.element, record.text.slice(matchEnd - record.start));
        return;
      }
      if (inside) {
        setWordTextElementText(doc, record.element, "");
      }
    });
    replacementCount += 1;
  }
  return replacementCount;
}

function replaceXmlPlaceholders(xml, replacements, options = {}) {
  const doc = parseXmlDocument(xml);
  const richTextContext = options.richTextContext || {};
  if (richTextContext.imageContext) {
    richTextContext.imageContext.partName = options.partName || "";
  }
  const imageContext = richTextContext.imageContext || null;
  const entries = Object.entries(replacements || {});
  entries.forEach(([placeholder, replacement]) => {
    replacePlaceholderInTextElements(
      doc,
      getWordTextElements(doc),
      placeholder,
      replacement,
      richTextContext
    );
  });
  if (imageContext && !Number(imageContext.insertedImageCount || 0)) {
    const fallbackEntry = entries.find(([placeholder, replacement]) => (
      String(placeholder || "").includes("Prozentrang")
      && isWordImageReplacement(replacement)
    ));
    if (fallbackEntry) {
      replaceFirstShortParagraphContainingTextWithImage(
        doc,
        getWordTextElements(doc),
        "Prozentrang",
        fallbackEntry[1],
        richTextContext
      );
    }
  }
  applyTableColumnReplacements(
    doc,
    options.tableColumnReplacements || [],
    options.tableColumnReplacementStats || null,
    richTextContext
  );
  return new XMLSerializer().serializeToString(doc);
}

export function isDocxZipSupported() {
  return typeof DOMParser === "function"
    && typeof XMLSerializer === "function"
    && typeof TextEncoder === "function"
    && typeof TextDecoder === "function"
    && typeof Blob === "function"
    && typeof Response === "function"
    && typeof DecompressionStream === "function";
}

export async function prepareDocxTemplate(templateBytes) {
  const bytes = templateBytes instanceof Uint8Array ? templateBytes : new Uint8Array(templateBytes || []);
  const cached = preparedTemplateCache.get(bytes);
  if (cached) {
    return cached;
  }
  const prepared = {
    entries: await readZipEntries(bytes)
  };
  preparedTemplateCache.set(bytes, prepared);
  return prepared;
}

export function preparedDocxTemplateContainsText(preparedTemplate, text = "") {
  const needle = String(text || "");
  if (!needle) {
    return false;
  }
  return (preparedTemplate?.entries || []).some((entry) => (
    isWordXmlPart(entry.name)
    && (() => {
      const xml = textDecoder.decode(entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data || []));
      if (xml.includes(needle)) {
        return true;
      }
      try {
        const doc = parseXmlDocument(xml);
        return getWordTextElements(doc).map((element) => element.textContent || "").join("").includes(needle);
      } catch (_error) {
        return false;
      }
    })()
  ));
}

export async function createDocxFromPreparedTemplate(preparedTemplate, replacements = {}, options = {}) {
  const entries = (preparedTemplate?.entries || []).map((entry) => ({
    ...entry,
    data: entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data || [])
  }));
  const tableColumnReplacements = normalizeTableColumnReplacements(options.tableColumnReplacements);
  const tableColumnReplacementStats = createTableReplacementStats(tableColumnReplacements);
  const richTextContext = {};
  const sourceEntries = (
    standardReplacementsNeedHyphenBulletNumbering(replacements)
    || richTextReplacementsNeedHyphenBulletNumbering(tableColumnReplacements)
  )
    ? (() => {
      const result = ensureHyphenBulletNumbering(entries);
      richTextContext.hyphenBulletNumId = result.numId;
      return result.entries;
    })()
    : entries;
  const imageContext = createWordImageContext(sourceEntries);
  richTextContext.imageContext = imageContext;
  const expectsImageReplacement = Object.values(replacements || {}).some(isWordImageReplacement);
  const nextEntries = sourceEntries.map((entry) => {
    if (!isWordXmlPart(entry.name)) {
      return entry;
    }
    const xml = textDecoder.decode(entry.data);
    const replaced = replaceXmlPlaceholders(xml, replacements, {
      ...options,
      partName: entry.name,
      tableColumnReplacements,
      tableColumnReplacementStats,
      richTextContext
    });
    return {
      ...entry,
      data: textEncoder.encode(replaced)
    };
  });
  if (expectsImageReplacement && !Number(imageContext.insertedImageCount || 0)) {
    throw new Error("Die Prozentrang-Grafik wurde erzeugt, aber in der aktiven DOCX-Vorlage wurde kein Platzhalter <<Prozentrang>> gefunden.");
  }
  assertRequiredTableReplacementsApplied(tableColumnReplacementStats);
  return buildZip(applyWordImageContext(nextEntries, imageContext));
}

export async function createDocxFromTemplate(templateBytes, replacements = {}, options = {}) {
  return createDocxFromPreparedTemplate(
    await prepareDocxTemplate(templateBytes),
    replacements,
    options
  );
}

export function createZipArchive(files = []) {
  return buildZip(files.map((file) => ({
    name: String(file.name || "Datei"),
    data: file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data || [])
  })));
}
