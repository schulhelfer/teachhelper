import { isAllowedPlanningNoteLink, normalizePlanningNoteText, tokenizePlanningNoteLinks } from "./planning-note-links.js";

export const PLANNING_RICH_TEXT_VERSION = 1;
export const PLANNING_RICH_TEXT_SIZES = [12, 14, 16, 18, 22];
export const PLANNING_RICH_TEXT_COLORS = Object.freeze({
  navy: "#1e3a8a",
  blue: "#1d4ed8",
  sky: "#0284c7",
  cyan: "#0891b2",
  teal: "#0f766e",
  emerald: "#047857",
  lime: "#4d7c0f",
  amber: "#a16207",
  red: "#b91c1c",
  rose: "#be123c",
  pink: "#db2777",
  green: "#16a34a",
  orange: "#c2410c",
  violet: "#6d28d9",
  purple: "#9333ea",
  indigo: "#4f46e5",
  brown: "#92400e",
  gray: "#334155"
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
  const blocks = [];
  const stack = [{ type: "blocks", source: Array.isArray(value) ? value : [], target: blocks, index: 0 }];
  while (stack.length) {
    const frame = stack.at(-1);
    if (frame.type === "blocks") {
      if (frame.index >= frame.source.length) { stack.pop(); continue; }
      const raw = frame.source[frame.index++];
      if (!raw || typeof raw !== "object") continue;
      if (raw.type === "paragraph") {
        frame.target.push({ type: "paragraph", children: normaliseInlines(raw.children) });
        continue;
      }
      if (raw.type === "list" && (raw.ordered === true || raw.ordered === false)) {
        const source = Array.isArray(raw.items) ? raw.items : [];
        const items = source.map(() => []);
        stack.push({ type: "commitList", target: frame.target, ordered: raw.ordered, items });
        stack.push({ type: "listItems", source, items, index: 0 });
        continue;
      }
      if (raw.type === "table") {
        const source = Array.isArray(raw.rows) ? raw.rows : [];
        const rows = source.map((row) => Array.isArray(row) ? row.map(() => []) : []);
        stack.push({ type: "commitTable", target: frame.target, rows });
        stack.push({ type: "tableCells", source, rows, rowIndex: 0, cellIndex: 0 });
      }
      continue;
    }
    if (frame.type === "listItems") {
      if (frame.index >= frame.source.length) { stack.pop(); continue; }
      const index = frame.index++;
      stack.push({ type: "blocks", source: Array.isArray(frame.source[index]) ? frame.source[index] : [], target: frame.items[index], index: 0 });
      continue;
    }
    if (frame.type === "tableCells") {
      while (frame.rowIndex < frame.source.length
        && frame.cellIndex >= (Array.isArray(frame.source[frame.rowIndex]) ? frame.source[frame.rowIndex].length : 0)) {
        frame.rowIndex += 1;
        frame.cellIndex = 0;
      }
      if (frame.rowIndex >= frame.source.length) { stack.pop(); continue; }
      const rowIndex = frame.rowIndex;
      const cellIndex = frame.cellIndex++;
      stack.push({
        type: "blocks",
        source: Array.isArray(frame.source[rowIndex][cellIndex]) ? frame.source[rowIndex][cellIndex] : [],
        target: frame.rows[rowIndex][cellIndex],
        index: 0
      });
      continue;
    }
    if (frame.type === "commitList") {
      stack.pop();
      if (frame.items.length) frame.target.push({ type: "list", ordered: frame.ordered, items: frame.items });
      continue;
    }
    stack.pop();
    const rows = frame.rows.filter((row) => row.length);
    const columns = rows.reduce((max, row) => Math.max(max, row.length), 0);
    if (!rows.length || !columns) continue;
    frame.target.push({ type: "table", rows: rows.map((row) => {
      const next = [...row];
      while (next.length < columns) next.push([]);
      return next;
    }) });
  }
  return blocks;
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
  const results = [];
  const stack = documentValue.blocks.slice().reverse().map((block) => ({ type: "block", block, listIndex: 0, target: results }));
  while (stack.length) {
    const frame = stack.pop();
    if (frame.type === "block") {
      if (frame.block.type === "paragraph") { frame.target.push(inlinePlainText(frame.block.children)); continue; }
      if (frame.block.type === "list") {
        const items = frame.block.items.map(() => []);
        stack.push({ type: "list", block: frame.block, items, target: frame.target });
        for (let itemIndex = frame.block.items.length - 1; itemIndex >= 0; itemIndex -= 1) {
          const item = frame.block.items[itemIndex];
          for (let childIndex = item.length - 1; childIndex >= 0; childIndex -= 1) {
            stack.push({ type: "block", block: item[childIndex], listIndex: itemIndex, target: items[itemIndex] });
          }
        }
        continue;
      }
      if (frame.block.type === "table") {
        const rows = frame.block.rows.map((row) => row.map(() => []));
        stack.push({ type: "table", rows, target: frame.target });
        for (let rowIndex = frame.block.rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
          const row = frame.block.rows[rowIndex];
          for (let cellIndex = row.length - 1; cellIndex >= 0; cellIndex -= 1) {
            const cell = row[cellIndex];
            for (let childIndex = cell.length - 1; childIndex >= 0; childIndex -= 1) {
              stack.push({ type: "block", block: cell[childIndex], listIndex: frame.listIndex, target: rows[rowIndex][cellIndex] });
            }
          }
        }
      }
      continue;
    }
    if (frame.type === "list") {
      frame.target.push(frame.items.map((item, index) => item.filter(Boolean).map((text) =>
        `${frame.block.ordered ? `${index + 1}.` : "•"} ${text}`
      ).join("\n")).join("\n"));
      continue;
    }
    frame.target.push(frame.rows.map((row) => row.map((cell) => cell.join("\n")).join("\t")).join("\n"));
  }
  return results.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
  const stack = [{ node, marks }];
  while (stack.length) {
    const current = stack.pop();
    if (current.node.nodeType === Node.TEXT_NODE) {
      const value = textNode(current.node.textContent, current.marks);
      if (value) target.push(value);
      continue;
    }
    if (current.node.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = current.node.tagName.toLowerCase();
    const nextMarks = { ...current.marks };
    if (["b", "strong"].includes(tag)) nextMarks.bold = true;
    if (["i", "em"].includes(tag)) nextMarks.italic = true;
    if (tag === "u") nextMarks.underline = true;
    if (["span", "font"].includes(tag) && (current.node.style?.fontSize || current.node.hasAttribute("size") || current.node.className?.includes("planning-rich-size-"))) nextMarks.size = readStyleSize(current.node);
    if (tag === "span" && current.node.className?.includes("planning-rich-color-")) nextMarks.color = readColorName(current.node);
    if (tag === "a" && isAllowedPlanningNoteLink(current.node.getAttribute("href"))) nextMarks.link = current.node.getAttribute("href");
    if (tag === "br") {
      const value = textNode("\n", nextMarks);
      if (value) target.push(value);
      continue;
    }
    const children = current.node.childNodes || [];
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push({ node: children[index], marks: nextMarks });
  }
  return target;
}

function collectBlocks(nodes) {
  const blocks = [];
  const stack = [{ type: "nodes", source: [...nodes], target: blocks, index: 0 }];
  while (stack.length) {
    const frame = stack.at(-1);
    if (frame.type === "nodes") {
      if (frame.index >= frame.source.length) { stack.pop(); continue; }
      const node = frame.source[frame.index++];
      if (node.nodeType === Node.TEXT_NODE) {
        const children = collectInlineNodes(node);
        if (children.length) frame.target.push({ type: "paragraph", children });
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = node.tagName.toLowerCase();
      if (["ul", "ol"].includes(tag)) {
        const source = [...node.children].filter((child) => child.tagName.toLowerCase() === "li");
        const items = source.map(() => []);
        stack.push({ type: "commitList", target: frame.target, ordered: tag === "ol", items });
        stack.push({ type: "listItems", source, items, index: 0 });
        continue;
      }
      if (tag === "table") {
        const source = [...node.querySelectorAll(":scope > tbody > tr, :scope > thead > tr, :scope > tr")]
          .map((row) => [...row.children].filter((cell) => ["td", "th"].includes(cell.tagName.toLowerCase())));
        const rows = source.map((row) => row.map(() => []));
        stack.push({ type: "commitTable", target: frame.target, rows });
        stack.push({ type: "tableCells", source, rows, rowIndex: 0, cellIndex: 0 });
        continue;
      }
      const children = collectInlineNodes(node);
      if (["p", "div", "h1", "h2", "h3", "h4", "blockquote"].includes(tag) || children.length) {
        frame.target.push({ type: "paragraph", children });
      }
      continue;
    }
    if (frame.type === "listItems") {
      if (frame.index >= frame.source.length) { stack.pop(); continue; }
      const index = frame.index++;
      stack.push({ type: "nodes", source: [...frame.source[index].childNodes], target: frame.items[index], index: 0 });
      continue;
    }
    if (frame.type === "tableCells") {
      while (frame.rowIndex < frame.source.length && frame.cellIndex >= frame.source[frame.rowIndex].length) {
        frame.rowIndex += 1;
        frame.cellIndex = 0;
      }
      if (frame.rowIndex >= frame.source.length) { stack.pop(); continue; }
      const rowIndex = frame.rowIndex;
      const cellIndex = frame.cellIndex++;
      stack.push({ type: "nodes", source: [...frame.source[rowIndex][cellIndex].childNodes], target: frame.rows[rowIndex][cellIndex], index: 0 });
      continue;
    }
    stack.pop();
    if (frame.type === "commitList") {
      if (frame.items.length) frame.target.push({ type: "list", ordered: frame.ordered, items: frame.items });
    } else if (frame.rows.length) frame.target.push({ type: "table", rows: frame.rows });
  }
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

function appendBlocks(parent, blocks, documentRef) {
  const stack = blocks.slice().reverse().map((block) => ({ parent, block }));
  while (stack.length) {
    const { parent: target, block } = stack.pop();
    if (block.type === "paragraph") {
      const paragraph = documentRef.createElement("p");
      if (!block.children.length) paragraph.append(documentRef.createElement("br"));
      else block.children.forEach((inline) => appendInline(paragraph, inline, documentRef));
      target.append(paragraph);
      continue;
    }
    if (block.type === "list") {
      const list = documentRef.createElement(block.ordered ? "ol" : "ul");
      const items = block.items.map((item) => {
        const listItem = documentRef.createElement("li");
        if (!item.length) listItem.append(documentRef.createElement("br"));
        list.append(listItem);
        return listItem;
      });
      target.append(list);
      for (let itemIndex = block.items.length - 1; itemIndex >= 0; itemIndex -= 1) {
        const item = block.items[itemIndex];
        for (let childIndex = item.length - 1; childIndex >= 0; childIndex -= 1) {
          stack.push({ parent: items[itemIndex], block: item[childIndex] });
        }
      }
      continue;
    }
    if (block.type === "table") {
      const table = documentRef.createElement("table");
      const body = documentRef.createElement("tbody");
      const cells = block.rows.map((row) => {
        const tr = documentRef.createElement("tr");
        const rowCells = row.map((cell) => {
          const td = documentRef.createElement("td");
          if (!cell.length) td.append(documentRef.createElement("br"));
          tr.append(td);
          return td;
        });
        body.append(tr);
        return rowCells;
      });
      table.append(body); target.append(table);
      for (let rowIndex = block.rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
        const row = block.rows[rowIndex];
        for (let cellIndex = row.length - 1; cellIndex >= 0; cellIndex -= 1) {
          const cell = row[cellIndex];
          for (let childIndex = cell.length - 1; childIndex >= 0; childIndex -= 1) {
            stack.push({ parent: cells[rowIndex][cellIndex], block: cell[childIndex] });
          }
        }
      }
    }
  }
}

export function renderPlanningRichText(element, value, fallbackText = "") {
  if (!element) return;
  const documentValue = normalizePlanningRichText(value, fallbackText);
  element.replaceChildren();
  appendBlocks(element, documentValue.blocks, element.ownerDocument || document);
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
  const blocks = [];
  const stack = documentValue.blocks.slice().reverse().map((block) => ({ block, target: blocks }));
  while (stack.length) {
    const { block, target } = stack.pop();
    if (block.type === "paragraph") {
      target.push({ ...block, children: linkify(block.children) });
      continue;
    }
    if (block.type === "list") {
      const mapped = { ...block, items: block.items.map(() => []) };
      target.push(mapped);
      for (let itemIndex = block.items.length - 1; itemIndex >= 0; itemIndex -= 1) {
        const item = block.items[itemIndex];
        for (let childIndex = item.length - 1; childIndex >= 0; childIndex -= 1) {
          stack.push({ block: item[childIndex], target: mapped.items[itemIndex] });
        }
      }
      continue;
    }
    if (block.type === "table") {
      const mapped = { ...block, rows: block.rows.map((row) => row.map(() => [])) };
      target.push(mapped);
      for (let rowIndex = block.rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
        const row = block.rows[rowIndex];
        for (let cellIndex = row.length - 1; cellIndex >= 0; cellIndex -= 1) {
          const cell = row[cellIndex];
          for (let childIndex = cell.length - 1; childIndex >= 0; childIndex -= 1) {
            stack.push({ block: cell[childIndex], target: mapped.rows[rowIndex][cellIndex] });
          }
        }
      }
      continue;
    }
    target.push(block);
  }
  return { ...documentValue, blocks };
}
