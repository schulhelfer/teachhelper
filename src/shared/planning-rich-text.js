import { isAllowedPlanningNoteLink, normalizePlanningNoteText, tokenizePlanningNoteLinks } from "./planning-note-links.js";

export const PLANNING_RICH_TEXT_VERSION = 1;
export const PLANNING_RICH_TEXT_SIZES = [12, 14, 16, 18, 22];
export const PLANNING_RICH_TEXT_COLORS = Object.freeze({
  navy: "#1e3a8a",
  blue: "#2563eb",
  sky: "#0284c7",
  cyan: "#0891b2",
  teal: "#0f766e",
  emerald: "#059669",
  lime: "#65a30d",
  amber: "#d97706",
  red: "#dc2626",
  rose: "#e11d48",
  pink: "#db2777",
  green: "#16a34a",
  orange: "#ea580c",
  violet: "#7c3aed",
  purple: "#9333ea",
  indigo: "#4f46e5",
  brown: "#92400e",
  gray: "#475569"
});

const TEXT_MARKS = ["bold", "italic", "underline"];

function textNode(value, marks = {}) {
  const text = normalizePlanningNoteText(value);
  if (!text) return null;
  const next = { text };
  TEXT_MARKS.forEach((mark) => { if (marks[mark]) next[mark] = true; });
  const size = Number(marks.size);
  if (PLANNING_RICH_TEXT_SIZES.includes(size)) next.size = size;
  const color = String(marks.color || "");
  if (marks.color === null) next.color = null;
  else if (Object.hasOwn(PLANNING_RICH_TEXT_COLORS, color)) next.color = color;
  if (isAllowedPlanningNoteLink(marks.link)) next.link = String(marks.link);
  return next;
}

function normaliseInlines(value) {
  const result = [];
  (Array.isArray(value) ? value : []).forEach((raw) => {
    const node = textNode(raw?.text, raw || {});
    if (!node) return;
    const previous = result.at(-1);
    if (previous && TEXT_MARKS.every((mark) => Boolean(previous[mark]) === Boolean(node[mark]))
      && previous.size === node.size && previous.color === node.color && previous.link === node.link) {
      previous.text += node.text;
    } else result.push(node);
  });
  return result;
}

function normaliseBlocks(value) {
  return (Array.isArray(value) ? value : []).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    if (raw.type === "paragraph") return [{ type: "paragraph", children: normaliseInlines(raw.children) }];
    if (raw.type === "list" && (raw.ordered === true || raw.ordered === false)) {
      const items = (Array.isArray(raw.items) ? raw.items : []).map((item) => normaliseBlocks(item));
      return items.length ? [{ type: "list", ordered: raw.ordered, items }] : [];
    }
    if (raw.type === "table") {
      const rows = (Array.isArray(raw.rows) ? raw.rows : []).map((row) =>
        (Array.isArray(row) ? row : []).map((cell) => normaliseBlocks(cell))
      ).filter((row) => row.length);
      const columns = rows.reduce((max, row) => Math.max(max, row.length), 0);
      if (!rows.length || !columns) return [];
      return [{ type: "table", rows: rows.map((row) => {
        const next = [...row];
        while (next.length < columns) next.push([]);
        return next;
      }) }];
    }
    return [];
  });
}

export function createPlanningRichTextFromPlainText(value) {
  const text = normalizePlanningNoteText(value);
  return {
    version: PLANNING_RICH_TEXT_VERSION,
    blocks: text.split("\n").map((line) => ({ type: "paragraph", children: line ? [{ text: line }] : [] }))
      .filter((block, index, blocks) => block.children.length || blocks.length > 1 || index === 0)
  };
}

export function normalizePlanningRichText(value, fallbackText = "") {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const blocks = normaliseBlocks(raw?.blocks);
  return blocks.length
    ? { version: PLANNING_RICH_TEXT_VERSION, blocks }
    : createPlanningRichTextFromPlainText(fallbackText);
}

function inlinePlainText(children) {
  return normaliseInlines(children).map((node) => node.text).join("");
}

export function planningRichTextToPlainText(value, fallbackText = "") {
  const documentValue = normalizePlanningRichText(value, fallbackText);
  const blockText = (block, listIndex = 0) => {
    if (block.type === "paragraph") return inlinePlainText(block.children);
    if (block.type === "list") return block.items.map((item, index) =>
      item.map((child) => blockText(child, index)).filter(Boolean).map((text) =>
        `${block.ordered ? `${index + 1}.` : "•"} ${text}`
      ).join("\n")
    ).join("\n");
    if (block.type === "table") return block.rows.map((row) => row.map((cell) =>
      cell.map((child) => blockText(child, listIndex)).join("\n")
    ).join("\t")).join("\n");
    return "";
  };
  return documentValue.blocks.map((block) => blockText(block)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function readStyleSize(element) {
  const fontSizeMap = { 1: 12, 2: 12, 3: 14, 4: 16, 5: 18, 6: 22, 7: 22 };
  const classSize = [...(element.classList || [])].find((value) => /^planning-rich-size-(?:12|14|16|18|22)$/u.test(value));
  if (classSize) return Number(classSize.slice("planning-rich-size-".length));
  const htmlSize = Number(element.getAttribute?.("size"));
  if (fontSizeMap[htmlSize]) return fontSizeMap[htmlSize];
  const parsed = Number.parseFloat(element.style?.fontSize || "");
  return PLANNING_RICH_TEXT_SIZES.reduce((closest, candidate) =>
    Math.abs(candidate - parsed) < Math.abs(closest - parsed) ? candidate : closest, 14);
}

function readColorName(element) {
  if (element.classList?.contains("planning-rich-color-default")) return null;
  return [...(element.classList || [])]
    .map((value) => value.match(/^planning-rich-color-([a-z]+)$/u)?.[1] || "")
    .find(Boolean) || "";
}

function collectInlineNodes(node, marks = {}, target = []) {
  if (node.nodeType === Node.TEXT_NODE) {
    const value = textNode(node.textContent, marks);
    if (value) target.push(value);
    return target;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return target;
  const tag = node.tagName.toLowerCase();
  const nextMarks = { ...marks };
  if (["b", "strong"].includes(tag)) nextMarks.bold = true;
  if (["i", "em"].includes(tag)) nextMarks.italic = true;
  if (tag === "u") nextMarks.underline = true;
  if (["span", "font"].includes(tag) && (node.style?.fontSize || node.hasAttribute("size") || node.className?.includes("planning-rich-size-"))) nextMarks.size = readStyleSize(node);
  if (tag === "span" && node.className?.includes("planning-rich-color-")) nextMarks.color = readColorName(node);
  if (tag === "a" && isAllowedPlanningNoteLink(node.getAttribute("href"))) nextMarks.link = node.getAttribute("href");
  if (tag === "br") {
    const value = textNode("\n", nextMarks);
    if (value) target.push(value);
    return target;
  }
  [...node.childNodes].forEach((child) => collectInlineNodes(child, nextMarks, target));
  return target;
}

function collectBlocks(nodes) {
  const blocks = [];
  [...nodes].forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const children = collectInlineNodes(node);
      if (children.length) blocks.push({ type: "paragraph", children });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    if (["ul", "ol"].includes(tag)) {
      const items = [...node.children].filter((child) => child.tagName.toLowerCase() === "li")
        .map((item) => collectBlocks(item.childNodes));
      if (items.length) blocks.push({ type: "list", ordered: tag === "ol", items });
      return;
    }
    if (tag === "table") {
      const rows = [...node.querySelectorAll(":scope > tbody > tr, :scope > thead > tr, :scope > tr")]
        .map((row) => [...row.children].filter((cell) => ["td", "th"].includes(cell.tagName.toLowerCase()))
          .map((cell) => collectBlocks(cell.childNodes)));
      if (rows.length) blocks.push({ type: "table", rows });
      return;
    }
    if (["p", "div", "h1", "h2", "h3", "h4", "blockquote"].includes(tag)) {
      blocks.push({ type: "paragraph", children: collectInlineNodes(node) });
      return;
    }
    const children = collectInlineNodes(node);
    if (children.length) blocks.push({ type: "paragraph", children });
  });
  return blocks;
}

export function planningRichTextFromElement(element, fallbackText = "") {
  if (!element) return createPlanningRichTextFromPlainText(fallbackText);
  return normalizePlanningRichText({ version: PLANNING_RICH_TEXT_VERSION, blocks: collectBlocks(element.childNodes) }, fallbackText);
}

function appendInline(parent, inline, documentRef) {
  let node = documentRef.createTextNode(inline.text);
  if (inline.link) {
    const link = documentRef.createElement("a");
    link.className = "planning-note-link";
    link.href = inline.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.referrerPolicy = "no-referrer";
    link.contentEditable = "false";
    link.append(node); node = link;
  }
  if (inline.underline) { const wrap = documentRef.createElement("u"); wrap.append(node); node = wrap; }
  if (inline.italic) { const wrap = documentRef.createElement("em"); wrap.append(node); node = wrap; }
  if (inline.bold) { const wrap = documentRef.createElement("strong"); wrap.append(node); node = wrap; }
  if (inline.size) { const wrap = documentRef.createElement("span"); wrap.className = `planning-rich-size-${inline.size}`; wrap.append(node); node = wrap; }
  if (Object.hasOwn(inline, "color")) { const wrap = documentRef.createElement("span"); wrap.className = `planning-rich-color-${inline.color || "default"}`; wrap.append(node); node = wrap; }
  parent.append(node);
}

function appendBlock(parent, block, documentRef) {
  if (block.type === "paragraph") {
    const paragraph = documentRef.createElement("p");
    if (!block.children.length) paragraph.append(documentRef.createElement("br"));
    else block.children.forEach((inline) => appendInline(paragraph, inline, documentRef));
    parent.append(paragraph); return;
  }
  if (block.type === "list") {
    const list = documentRef.createElement(block.ordered ? "ol" : "ul");
    block.items.forEach((item) => {
      const listItem = documentRef.createElement("li");
      item.forEach((child) => appendBlock(listItem, child, documentRef));
      if (!item.length) listItem.append(documentRef.createElement("br"));
      list.append(listItem);
    });
    parent.append(list); return;
  }
  if (block.type === "table") {
    const table = documentRef.createElement("table");
    const body = documentRef.createElement("tbody");
    block.rows.forEach((row) => {
      const tr = documentRef.createElement("tr");
      row.forEach((cell) => {
        const td = documentRef.createElement("td");
        cell.forEach((child) => appendBlock(td, child, documentRef));
        if (!cell.length) td.append(documentRef.createElement("br"));
        tr.append(td);
      });
      body.append(tr);
    });
    table.append(body); parent.append(table);
  }
}

export function renderPlanningRichText(element, value, fallbackText = "") {
  if (!element) return;
  const documentValue = normalizePlanningRichText(value, fallbackText);
  element.replaceChildren();
  documentValue.blocks.forEach((block) => appendBlock(element, block, element.ownerDocument || document));
}

export function planningRichTextToArchiveBlocks(value, fallbackText = "") {
  return normalizePlanningRichText(value, fallbackText).blocks;
}

export function planningRichTextFromClipboard(html, text) {
  if (!html || typeof document === "undefined") return createPlanningRichTextFromPlainText(text);
  const template = document.createElement("template");
  template.innerHTML = html;
  return normalizePlanningRichText({ version: PLANNING_RICH_TEXT_VERSION, blocks: collectBlocks(template.content.childNodes) }, text);
}

export function linkifyPlanningRichText(value, fallbackText = "") {
  const documentValue = normalizePlanningRichText(value, fallbackText);
  const linkify = (children) => children.flatMap((inline) => {
    if (inline.link) return [inline];
    return tokenizePlanningNoteLinks(inline.text).map((token) => token.type === "link"
      ? { ...inline, text: token.value, link: token.href }
      : { ...inline, text: token.value });
  });
  const mapBlock = (block) => {
    if (block.type === "paragraph") return { ...block, children: linkify(block.children) };
    if (block.type === "list") return { ...block, items: block.items.map((item) => item.map(mapBlock)) };
    if (block.type === "table") return { ...block, rows: block.rows.map((row) => row.map((cell) => cell.map(mapBlock))) };
    return block;
  };
  return { ...documentValue, blocks: documentValue.blocks.map(mapBlock) };
}
