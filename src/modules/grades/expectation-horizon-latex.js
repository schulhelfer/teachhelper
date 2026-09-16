export function findExpectationHorizonLatexMatchingBrace(text, openIndex) {
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

export function replaceExpectationHorizonLatexCommandArgument(text, command, prefix = "") {
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

export function removeExpectationHorizonLatexEnvironmentWithContent(text, environmentName) {
  const name = String(environmentName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\\\begin\\{${name}\\}(?:\\s*\\[[^\\]]*\\]|\\s*\\([^)]*\\)|\\s*\\{[^{}]*\\})*[\\s\\S]*?\\\\end\\{${name}\\}`, "g");
  return String(text || "").replace(pattern, " ");
}

export function stripExpectationHorizonLatexEnvironmentMarkers(text, environmentName) {
  const name = String(environmentName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const beginPattern = new RegExp(`\\\\begin\\{${name}\\}(?:\\s*\\[[^\\]]*\\]|\\s*\\([^)]*\\)|\\s*\\{[^{}]*\\})*`, "g");
  const endPattern = new RegExp(`\\\\end\\{${name}\\}`, "g");
  return String(text || "")
    .replace(beginPattern, " ")
    .replace(endPattern, " ");
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

export function removeExpectationHorizonLatexCommandWithArguments(text, command) {
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

export function normalizeExpectationHorizonLatexCellText(text, options = {}) {
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

export function preprocessExpectationHorizonLatexTask(text) {
  let result = String(text || "").replace(/\r\n?/g, "\n");
  result = removeExpectationHorizonLatexEnvironmentWithContent(result, "framed");
  result = removeExpectationHorizonLatexEnvironmentWithContent(result, "lsg");
  result = removeExpectationHorizonLatexEnvironmentWithContent(result, "tikzpicture");
  result = stripExpectationHorizonLatexEnvironmentMarkers(result, "tasks")
    .replace(/\\task\b(?:\s*\[[^\]]*\]|\s*\([^)]*\)|\s*\{[^{}]*\})*/g, "\n- ");
  result = stripExpectationHorizonLatexEnvironmentMarkers(result, "minipage");
  result = removeExpectationHorizonLatexCommandWithArguments(result, "includegraphics");
  return normalizeExpectationHorizonLatexCellText(result);
}

export function isExpectationHorizonLatexEscapedAt(text, index) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

export function findExpectationHorizonLatexMathStart(text, cursor = 0) {
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

export function findExpectationHorizonLatexMathEnd(text, start) {
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

export function splitExpectationHorizonLatexMathPieces(text) {
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

export function findExpectationHorizonLatexSolutionCommand(text, cursor = 0) {
  const source = String(text || "");
  const needle = "\\lsgZwei";
  let searchCursor = cursor;
  while (searchCursor < source.length) {
    const commandIndex = source.indexOf(needle, searchCursor);
    if (commandIndex < 0) {
      return null;
    }
    let next = commandIndex + needle.length;
    if (/[a-zA-Z]/.test(source[next] || "")) {
      searchCursor = next;
      continue;
    }
    while (next < source.length && /\s/.test(source[next])) {
      next += 1;
    }
    while (source[next] === "[") {
      const close = findExpectationHorizonLatexMatchingDelimiter(source, next, "[", "]");
      if (close < 0) {
        return { index: commandIndex, openIndex: -1, closeIndex: -1 };
      }
      next = close + 1;
      while (next < source.length && /\s/.test(source[next])) {
        next += 1;
      }
    }
    if (source[next] !== "{") {
      searchCursor = next;
      continue;
    }
    const closeIndex = findExpectationHorizonLatexMatchingBrace(source, next);
    let afterIndex = closeIndex >= 0 ? closeIndex + 1 : closeIndex;
    while (afterIndex > 0) {
      while (afterIndex < source.length && /\s/.test(source[afterIndex])) {
        afterIndex += 1;
      }
      if (source[afterIndex] !== "[") {
        break;
      }
      const optionClose = findExpectationHorizonLatexMatchingDelimiter(source, afterIndex, "[", "]");
      if (optionClose < 0) {
        break;
      }
      afterIndex = optionClose + 1;
    }
    return {
      index: commandIndex,
      openIndex: next,
      closeIndex,
      afterIndex
    };
  }
  return null;
}

export function splitExpectationHorizonLatexSolutionSegments(text) {
  const source = preprocessExpectationHorizonLatexTask(text);
  const segments = [];
  let cursor = 0;
  while (cursor < source.length) {
    const command = findExpectationHorizonLatexSolutionCommand(source, cursor);
    if (!command) {
      segments.push({ text: source.slice(cursor), italic: true, leadingBreak: false });
      break;
    }
    if (command.index > cursor) {
      segments.push({ text: source.slice(cursor, command.index), italic: true, leadingBreak: false });
    }
    if (command.openIndex < 0 || command.closeIndex < 0) {
      segments.push({ text: source.slice(command.index), italic: true, leadingBreak: false });
      break;
    }
    segments.push({ text: source.slice(command.openIndex + 1, command.closeIndex), italic: false, leadingBreak: true });
    cursor = command.afterIndex > command.closeIndex ? command.afterIndex : command.closeIndex + 1;
  }
  return segments;
}

export function cleanExpectationHorizonLatexSegment(text, options = {}) {
  let result = String(text || "").replace(/\r\n?/g, "\n");
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

export function appendExpectationHorizonLatexTaskRun(runs, text, options = {}) {
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

export function trimExpectationHorizonLatexTaskRuns(runs) {
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

export function cleanExpectationHorizonLatexTask(text) {
  const runs = [];
  splitExpectationHorizonLatexSolutionSegments(text).forEach((segment) => {
    let segmentHasContent = false;
    let pendingList = "";
    const pieces = splitExpectationHorizonLatexMathPieces(segment.text);
    const preserveMathSpacing = pieces.some((piece) => piece.math);
    pieces.forEach((piece) => {
      if (piece.math) {
        const formula = String(piece.text || "").trim();
        if (!formula) {
          return;
        }
        appendExpectationHorizonLatexTaskRun(runs, formula, {
          italic: false,
          math: true,
          paragraphBreak: (segment.leadingBreak && !segmentHasContent && runs.length > 0) || (Boolean(pendingList) && runs.length > 0),
          list: pendingList
        });
        pendingList = "";
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
        const emptyBulletMatch = trimmedLine.match(/^-\s*$/);
        if (emptyBulletMatch) {
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
            italic: segment.italic,
            paragraphBreak: (segment.leadingBreak && !segmentHasContent && runs.length > 0) || (Boolean(pendingList) && runs.length > 0),
            preserveOuterSpaces: preserveMathSpacing,
            list
          }
        );
        pendingList = "";
        segmentHasContent = true;
      });
    });
  });
  return { runs: trimExpectationHorizonLatexTaskRuns(runs) };
}
