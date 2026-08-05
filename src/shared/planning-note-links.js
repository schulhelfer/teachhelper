const ALLOWED_NOTE_LINK_PROTOCOLS = new Set(["http:", "https:", "onenote:"]);
const NOTE_LINK_CANDIDATE_PATTERN = /(?:https?:\/\/|onenote:)[^\s<>"']+/giu;
const TERMINAL_NOTE_LINK_PUNCTUATION = /[.,;:!]+$/u;

export function normalizePlanningNoteText(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n");
}

function trimTerminalNoteLinkPunctuation(candidate) {
  let link = String(candidate || "");
  let trailing = "";

  const punctuation = link.match(TERMINAL_NOTE_LINK_PUNCTUATION);
  if (punctuation) {
    trailing = punctuation[0] + trailing;
    link = link.slice(0, -punctuation[0].length);
  }

  const pairs = [["(", ")"], ["[", "]"], ["{", "}"]];
  for (const [opening, closing] of pairs) {
    while (
      link.endsWith(closing)
      && [...link].filter((character) => character === closing).length
        > [...link].filter((character) => character === opening).length
    ) {
      link = link.slice(0, -closing.length);
      trailing = closing + trailing;
    }
  }

  return { link, trailing };
}

export function isAllowedPlanningNoteLink(value) {
  const rawValue = String(value || "");
  if (!rawValue) {
    return false;
  }
  try {
    const url = new URL(rawValue);
    if (!ALLOWED_NOTE_LINK_PROTOCOLS.has(url.protocol)) {
      return false;
    }
    if (url.protocol === "onenote:") {
      return rawValue.length > "onenote:".length;
    }
    return Boolean(url.hostname);
  } catch (_error) {
    return false;
  }
}

export function tokenizePlanningNoteLinks(value) {
  const text = normalizePlanningNoteText(value);
  const tokens = [];
  let cursor = 0;

  for (const match of text.matchAll(NOTE_LINK_CANDIDATE_PATTERN)) {
    const candidate = String(match[0] || "");
    const start = Number(match.index || 0);
    const { link, trailing } = trimTerminalNoteLinkPunctuation(candidate);
    if (!isAllowedPlanningNoteLink(link)) {
      continue;
    }
    if (start > cursor) {
      tokens.push({ type: "text", value: text.slice(cursor, start) });
    }
    tokens.push({ type: "link", value: link, href: link });
    if (trailing) {
      tokens.push({ type: "text", value: trailing });
    }
    cursor = start + candidate.length;
  }

  if (cursor < text.length) {
    tokens.push({ type: "text", value: text.slice(cursor) });
  }
  return tokens;
}

export function appendPlanningNoteWithLinks(container, value, options = {}) {
  if (!container) {
    return container;
  }
  const linkClassName = String(options.linkClassName || "planning-note-link");
  for (const token of tokenizePlanningNoteLinks(value)) {
    if (token.type !== "link") {
      container.append(document.createTextNode(token.value));
      continue;
    }
    const link = document.createElement("a");
    link.className = linkClassName;
    link.href = token.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.referrerPolicy = "no-referrer";
    if (options.linkContentEditable === false) {
      link.contentEditable = "false";
    }
    link.textContent = token.value;
    container.append(link);
  }
  return container;
}
