const EXPECTATION_HORIZON_LATEX_SOLUTION_START = "\uE000";
const EXPECTATION_HORIZON_LATEX_SOLUTION_END = "\uE001";
const EXPECTATION_HORIZON_LATEX_LINE_BREAK = "\uE002";
const EXPECTATION_HORIZON_LATEX_MARKER_PATTERN = /[\uE000-\uE002]/g;

function findExpectationHorizonLatexMatchingBrace(text, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\" && index + 1 < text.length) {
      index += 1;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function replaceExpectationHorizonLatexCommandArgument(text, command, prefix = "") {
  const needle = `\\${command}{`;
  let result = "";
  let cursor = 0;
  while (cursor < text.length) {
    const index = text.indexOf(needle, cursor);
    if (index < 0) {
      result += text.slice(cursor);
      break;
    }
    result += text.slice(cursor, index);
    const openIndex = index + needle.length - 1;
    const closeIndex = findExpectationHorizonLatexMatchingBrace(text, openIndex);
    if (closeIndex < 0) {
      result += text.slice(index, index + needle.length);
      cursor = index + needle.length;
      continue;
    }
    result += `${prefix}${text.slice(openIndex + 1, closeIndex)}`;
    cursor = closeIndex + 1;
  }
  return result;
}

function removeExpectationHorizonLatexEnvironmentWithContent(text, environmentName) {
  const name = String(environmentName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\\\begin\\{${name}\\}(?:\\s*\\[[^\\]]*\\]|\\s*\\([^)]*\\)|\\s*\\{[^{}]*\\})*[\\s\\S]*?\\\\end\\{${name}\\}`, "g");
  return String(text || "").replace(pattern, " ");
}

function stripExpectationHorizonLatexEnvironmentMarkers(text, environmentName, beginReplacement = " ", endReplacement = " ") {
  const name = String(environmentName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const beginPattern = new RegExp(`\\\\begin\\{${name}\\}(?:\\s*\\[[^\\]]*\\]|\\s*\\([^)]*\\)|\\s*\\{[^{}]*\\})*`, "g");
  const endPattern = new RegExp(`\\\\end\\{${name}\\}`, "g");
  return String(text || "")
    .replace(beginPattern, beginReplacement)
    .replace(endPattern, endReplacement);
}

export function findExpectationHorizonLatexMatchingDelimiter(text, openIndex, openChar, closeChar) {
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\" && index + 1 < text.length) {
      index += 1;
      continue;
    }
    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function removeExpectationHorizonLatexCommandWithArguments(text, command) {
  const source = String(text || "");
  const needle = `\\${command}`;
  let result = "";
  let cursor = 0;
  while (cursor < source.length) {
    const index = source.indexOf(needle, cursor);
    if (index < 0) {
      result += source.slice(cursor);
      break;
    }
    result += source.slice(cursor, index);
    let next = index + needle.length;
    if (/[a-zA-Z]/.test(source[next] || "")) {
      result += source.slice(index, next);
      cursor = next;
      continue;
    }
    if (source[next] === "*") {
      next += 1;
    }
    while (next < source.length) {
      while (next < source.length && /\s/.test(source[next])) {
        next += 1;
      }
      const char = source[next];
      if (char === "[") {
        const close = findExpectationHorizonLatexMatchingDelimiter(source, next, "[", "]");
        next = close >= 0 ? close + 1 : next + 1;
        continue;
      }
      if (char === "{") {
        const close = findExpectationHorizonLatexMatchingBrace(source, next);
        next = close >= 0 ? close + 1 : next + 1;
        continue;
      }
      if (char === "(") {
        const close = findExpectationHorizonLatexMatchingDelimiter(source, next, "(", ")");
        next = close >= 0 ? close + 1 : next + 1;
        continue;
      }
      break;
    }
    result += " ";
    cursor = next;
  }
  return result;
}

function normalizeExpectationHorizonLatexCellText(text, options = {}) {
  const keepEmptyLines = options.keepEmptyLines === true;
  const trimEdges = options.trimEdges !== false;
  const lines = String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map((line) => line.trim());
  const normalizedLines = keepEmptyLines ? lines : lines.filter(Boolean);
  const normalized = normalizedLines.join("\n");
  return trimEdges ? normalized.trim() : normalized;
}

function skipExpectationHorizonLatexOptionalArguments(source, start) {
  let next = start;
  while (next < source.length) {
    let probe = next;
    while (probe < source.length && /\s/.test(source[probe])) {
      probe += 1;
    }
    if (source[probe] !== "[") {
      break;
    }
    const close = findExpectationHorizonLatexMatchingDelimiter(source, probe, "[", "]");
    if (close < 0) {
      break;
    }
    next = close + 1;
  }
  return next;
}

function wrapExpectationHorizonLatexSolutionCommands(text) {
  const source = String(text || "");
  const needle = "\\lsg";
  let result = "";
  let cursor = 0;
  while (cursor < source.length) {
    const index = source.indexOf(needle, cursor);
    if (index < 0) {
      result += source.slice(cursor);
      break;
    }
    const afterName = index + needle.length;
    if (/[a-zA-Z]/.test(source[afterName] || "")) {
      result += source.slice(cursor, afterName);
      cursor = afterName;
      continue;
    }
    let openIndex = skipExpectationHorizonLatexOptionalArguments(source, afterName);
    while (openIndex < source.length && /\s/.test(source[openIndex])) {
      openIndex += 1;
    }
    const closeIndex = source[openIndex] === "{" ? findExpectationHorizonLatexMatchingBrace(source, openIndex) : -1;
    if (closeIndex < 0) {
      result += source.slice(cursor, afterName);
      cursor = afterName;
      continue;
    }
    result += source.slice(cursor, index)
      + EXPECTATION_HORIZON_LATEX_SOLUTION_START
      + source.slice(openIndex + 1, closeIndex)
      + EXPECTATION_HORIZON_LATEX_SOLUTION_END;
    cursor = skipExpectationHorizonLatexOptionalArguments(source, closeIndex + 1);
  }
  return result;
}

function preprocessExpectationHorizonLatexTask(text, includeSolutions = false) {
  let result = String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(EXPECTATION_HORIZON_LATEX_MARKER_PATTERN, "");
  result = removeExpectationHorizonLatexEnvironmentWithContent(result, "framed");
  if (includeSolutions) {
    result = stripExpectationHorizonLatexEnvironmentMarkers(
      result,
      "lsg",
      EXPECTATION_HORIZON_LATEX_SOLUTION_START,
      EXPECTATION_HORIZON_LATEX_SOLUTION_END
    );
    result = wrapExpectationHorizonLatexSolutionCommands(result);
  } else {
    result = removeExpectationHorizonLatexEnvironmentWithContent(result, "lsg");
    result = removeExpectationHorizonLatexCommandWithArguments(result, "lsg");
  }
  result = removeExpectationHorizonLatexEnvironmentWithContent(result, "tikzpicture");
  result = stripExpectationHorizonLatexEnvironmentMarkers(result, "tasks")
    .replace(/\\task\b(?:\s*\[[^\]]*\]|\s*\([^)]*\)|\s*\{[^{}]*\})*/g, "\n- ");
  result = stripExpectationHorizonLatexEnvironmentMarkers(result, "minipage");
  result = removeExpectationHorizonLatexCommandWithArguments(result, "includegraphics");
  return normalizeExpectationHorizonLatexCellText(result)
    .split("\n")
    .join(`\n${EXPECTATION_HORIZON_LATEX_LINE_BREAK}\n`);
}

function isExpectationHorizonLatexEscapedAt(text, index) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function findExpectationHorizonLatexMathStart(text, cursor = 0) {
  const source = String(text || "");
  for (let index = cursor; index < source.length; index += 1) {
    if (source[index] === "$" && !isExpectationHorizonLatexEscapedAt(source, index)) {
      return {
        index,
        contentStart: index + 1,
        delimiter: "$",
        closeChar: "$"
      };
    }
    if (
      source[index] === "\\"
      && !isExpectationHorizonLatexEscapedAt(source, index)
      && (source[index + 1] === "(" || source[index + 1] === "[")
    ) {
      return {
        index,
        contentStart: index + 2,
        delimiter: source[index + 1],
        closeChar: source[index + 1] === "(" ? ")" : "]"
      };
    }
  }
  return null;
}

function findExpectationHorizonLatexMathEnd(text, start) {
  const source = String(text || "");
  if (!start) {
    return null;
  }
  if (start.delimiter === "$") {
    for (let index = start.contentStart; index < source.length; index += 1) {
      if (source[index] === "$" && !isExpectationHorizonLatexEscapedAt(source, index)) {
        return { index, after: index + 1 };
      }
    }
    return null;
  }
  for (let index = start.contentStart; index < source.length - 1; index += 1) {
    if (
      source[index] === "\\"
      && !isExpectationHorizonLatexEscapedAt(source, index)
      && source[index + 1] === start.closeChar
    ) {
      return { index, after: index + 2 };
    }
  }
  return null;
}

function splitExpectationHorizonLatexMathPieces(text) {
  const source = String(text || "");
  const pieces = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = findExpectationHorizonLatexMathStart(source, cursor);
    if (!start) {
      pieces.push({ text: source.slice(cursor), math: false });
      break;
    }
    const end = findExpectationHorizonLatexMathEnd(source, start);
    if (!end) {
      pieces.push({ text: source.slice(cursor), math: false });
      break;
    }
    if (start.index > cursor) {
      pieces.push({ text: source.slice(cursor, start.index), math: false });
    }
    pieces.push({ text: source.slice(start.contentStart, end.index), math: true });
    cursor = end.after;
  }
  return pieces;
}

function splitExpectationHorizonLatexSolutionSegments(text) {
  const segments = [];
  let depth = 0;
  let current = "";
  const flush = () => {
    if (!current) {
      return;
    }
    const solution = depth > 0;
    const previous = segments[segments.length - 1];
    if (previous && previous.solution === solution) {
      previous.text += current;
    } else {
      segments.push({ text: current, solution });
    }
    current = "";
  };
  for (const char of String(text || "")) {
    if (char === EXPECTATION_HORIZON_LATEX_SOLUTION_START) {
      flush();
      depth += 1;
    } else if (char === EXPECTATION_HORIZON_LATEX_SOLUTION_END) {
      flush();
      depth = Math.max(0, depth - 1);
    } else {
      current += char;
    }
  }
  flush();
  return segments;
}

function cleanExpectationHorizonLatexSegment(text, options = {}) {
  let result = String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\\\\\*?(?:\[[^\]]*\])?|\\(?:newline|par)(?![a-zA-Z])/g, `\n${EXPECTATION_HORIZON_LATEX_LINE_BREAK}\n`);
  const argumentCommands = ["textbf", "textit", "textsc", "texttt"];
  for (let pass = 0; pass < 8; pass += 1) {
    const before = result;
    argumentCommands.forEach((command) => {
      result = replaceExpectationHorizonLatexCommandArgument(result, command);
    });
    if (result === before) {
      break;
    }
  }
  const cleaned = result
    .replace(/\\begin\{[^}]+\}/g, " ")
    .replace(/\\end\{[^}]+\}/g, " ")
    .replace(/\\[a-zA-Z]+\*?(?:\s*\[[^\]]*\]|\s*\{[^{}]*\})*/g, " ")
    .replace(/\\./g, " ")
    .replace(/[{}]/g, "");
  const normalized = normalizeExpectationHorizonLatexCellText(cleaned);
  if (options.trim === false && normalized) {
    const prefix = /^\s/.test(cleaned) ? " " : "";
    const suffix = /\s$/.test(cleaned) ? " " : "";
    return `${prefix}${normalized}${suffix}`;
  }
  return normalized;
}

function appendExpectationHorizonLatexTaskRun(runs, text, options = {}) {
  const rawValue = String(text || "");
  const normalized = normalizeExpectationHorizonLatexCellText(rawValue);
  let value = options.preserveOuterSpaces === true && normalized
    ? `${/^\s/.test(rawValue) ? " " : ""}${normalized}${/\s$/.test(rawValue) ? " " : ""}`
    : normalized;
  if (!value) {
    return;
  }
  const previous = runs[runs.length - 1];
  const nextRun = {
    text: value,
    italic: options.italic === true,
    math: options.math === true,
    paragraphBreak: options.paragraphBreak === true,
    list: options.list || ""
  };
  if (previous && !nextRun.list) {
    const previousText = String(previous.text || "");
    const nextText = String(nextRun.text || "");
    const previousEnd = previousText.match(/\S(?=\s*$)/u)?.[0] || "";
    const nextStart = nextText.match(/^\s*(\S)/u)?.[1] || "";
    const shouldInsertSpace = Boolean(
      previousEnd
      && nextStart
      && !/\s$/.test(previousText)
      && !/^\s/.test(nextText)
      && !/[\[({/]/u.test(previousEnd)
      && previousEnd !== "-"
      && nextStart !== "-"
      && !/[.,;:!?)]/u.test(nextStart)
      && !(previous.math && nextRun.math)
    );
    if (shouldInsertSpace) {
      if (previous.math && !nextRun.math) {
        value = ` ${value}`;
        nextRun.text = value;
      } else {
        previous.text += " ";
      }
    }
  }
  if (
    previous
    && previous.italic === nextRun.italic
    && previous.math === nextRun.math
    && previous.paragraphBreak === nextRun.paragraphBreak
    && previous.list === nextRun.list
    && !nextRun.paragraphBreak
    && !nextRun.list
    && !nextRun.math
  ) {
    previous.text += nextRun.text;
    return;
  }
  runs.push(nextRun);
}

function trimExpectationHorizonLatexTaskRuns(runs) {
  const trimmedRuns = (Array.isArray(runs) ? runs : [])
    .map((run) => ({ ...run, text: String(run?.text || "") }));
  while (trimmedRuns.length && !trimmedRuns[0].math && !trimmedRuns[0].text.trim()) {
    trimmedRuns.shift();
  }
  while (trimmedRuns.length) {
    const first = trimmedRuns[0];
    if (first.math) {
      break;
    }
    const text = first.text.replace(/^\s+/, "");
    if (text) {
      first.text = text;
      first.paragraphBreak = false;
      break;
    }
    trimmedRuns.shift();
  }
  while (trimmedRuns.length && !trimmedRuns[trimmedRuns.length - 1].math && !trimmedRuns[trimmedRuns.length - 1].text.trim()) {
    trimmedRuns.pop();
  }
  while (trimmedRuns.length) {
    const last = trimmedRuns[trimmedRuns.length - 1];
    if (last.math) {
      break;
    }
    const text = last.text.replace(/\s+$/, "");
    if (text) {
      last.text = text;
      break;
    }
    trimmedRuns.pop();
  }
  return trimmedRuns;
}

export function cleanExpectationHorizonLatexTask(text, options = {}) {
  const includeSolutions = options.includeSolutions === true;
  const runs = [];
  let lastContentWasSolution = false;
  let pendingBreak = false;
  const source = preprocessExpectationHorizonLatexTask(text, includeSolutions);
  splitExpectationHorizonLatexSolutionSegments(source).forEach((segment) => {
    const italic = includeSolutions && !segment.solution;
    const leadingBreak = segment.solution || lastContentWasSolution;
    let segmentHasContent = false;
    let pendingList = "";
    const startsParagraph = () => runs.length > 0
      && ((leadingBreak && !segmentHasContent) || Boolean(pendingList) || pendingBreak);
    const pieces = splitExpectationHorizonLatexMathPieces(segment.text);
    const preserveMathSpacing = pieces.some((piece) => piece.math);
    pieces.forEach((piece) => {
      if (piece.math) {
        const formula = String(piece.text || "").replace(EXPECTATION_HORIZON_LATEX_MARKER_PATTERN, " ").trim();
        if (!formula) {
          return;
        }
        appendExpectationHorizonLatexTaskRun(runs, formula, {
          italic: false,
          math: true,
          paragraphBreak: startsParagraph(),
          list: pendingList
        });
        pendingList = "";
        pendingBreak = false;
        segmentHasContent = true;
        return;
      }
      const cleaned = cleanExpectationHorizonLatexSegment(piece.text, { trim: !preserveMathSpacing });
      if (!cleaned) {
        return;
      }
      cleaned.split("\n").forEach((line, lineIndex) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) {
          return;
        }
        if (trimmedLine === EXPECTATION_HORIZON_LATEX_LINE_BREAK) {
          pendingBreak = true;
          return;
        }
        if (/^-\s*$/.test(trimmedLine)) {
          pendingList = "hyphenBullet";
          if (lineIndex > 0) {
            segmentHasContent = true;
          }
          return;
        }
        const bulletMatch = trimmedLine.match(/^-\s+(.+)$/);
        const textValue = bulletMatch
          ? (preserveMathSpacing ? line.replace(/^\s*-\s+/, "") : bulletMatch[1])
          : (preserveMathSpacing ? line : trimmedLine);
        const list = bulletMatch ? "hyphenBullet" : pendingList;
        appendExpectationHorizonLatexTaskRun(
          runs,
          textValue,
          {
            italic,
            paragraphBreak: startsParagraph(),
            preserveOuterSpaces: preserveMathSpacing,
            list
          }
        );
        pendingList = "";
        pendingBreak = false;
        segmentHasContent = true;
      });
    });
    if (segmentHasContent) {
      lastContentWasSolution = segment.solution;
    }
  });
  return { runs: trimExpectationHorizonLatexTaskRuns(runs) };
}
