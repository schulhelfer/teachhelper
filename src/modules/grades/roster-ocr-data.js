const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

const NAME_EDGE_NOISE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

const cleanNamePart = (value) => clean(value)
  .split(" ")
  .map((word) => word.replace(NAME_EDGE_NOISE, ""))
  .filter(Boolean)
  .join(" ");

export function parseOcrNames(text, order = "last-first") {
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((raw) => {
    const line = raw.replace(/^\d+[.)\s]+/, "").trim();
    const parts = line.split(/\s*[,;\t]\s*| {2,}/).filter(Boolean);
    if (parts.length < 2) {
      const words = line.split(/\s+/);
      parts.splice(0, parts.length, words.shift() || "", words.join(" "));
    }
    const left = cleanNamePart(parts[0]);
    const right = cleanNamePart(parts.slice(1).join(" "));
    const lastName = order === "last-first" ? left : right;
    const firstName = order === "last-first" ? right : left;
    return { raw, lastName, firstName };
  });
}

export function importableOcrNames(rows) {
  return rows.map((row) => ({
    lastName: clean(row.lastName), firstName: clean(row.firstName),
  })).filter((row) => row.lastName || row.firstName);
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function boundCrop(crop) {
  const width = clamp(crop.width, 0.01, 1);
  const height = clamp(crop.height, 0.01, 1);
  return { x: clamp(crop.x, 0, 1 - width), y: clamp(crop.y, 0, 1 - height), width, height };
}

export function changeCrop(crop, handle, dx, dy) {
  if (handle === "move") return boundCrop({ ...crop, x: crop.x + dx, y: crop.y + dy });
  let { x, y } = crop;
  let right = x + crop.width;
  let bottom = y + crop.height;
  if (handle.includes("w")) x = clamp(x + dx, 0, right - 0.01);
  if (handle.includes("e")) right = clamp(right + dx, x + 0.01, 1);
  if (handle.includes("n")) y = clamp(y + dy, 0, bottom - 0.01);
  if (handle.includes("s")) bottom = clamp(bottom + dy, y + 0.01, 1);
  return boundCrop({ x, y, width: right - x, height: bottom - y });
}

export function cropPixels(crop, width, height) {
  const bounded = boundCrop(crop);
  const x = Math.floor(bounded.x * width);
  const y = Math.floor(bounded.y * height);
  return {
    x, y,
    width: Math.max(1, Math.min(width - x, Math.round(bounded.width * width))),
    height: Math.max(1, Math.min(height - y, Math.round(bounded.height * height))),
  };
}

export function ocrOutputSize(width, height) {
  const scale = Math.min(1, 4096 / width, 4096 / height, Math.sqrt(4_000_000 / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}
