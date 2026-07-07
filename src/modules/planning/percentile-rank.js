export const PERCENTILE_RANK_IMAGE_WIDTH_PX = 1212;
export const PERCENTILE_RANK_IMAGE_HEIGHT_PX = 525;
export const PERCENTILE_RANK_IMAGE_WIDTH_EMU = 5760000;
export const PERCENTILE_RANK_IMAGE_HEIGHT_EMU = Math.round(
  PERCENTILE_RANK_IMAGE_WIDTH_EMU
  * (PERCENTILE_RANK_IMAGE_HEIGHT_PX / PERCENTILE_RANK_IMAGE_WIDTH_PX)
);

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const BLUE = "#0b3a82";
const BLUE_DARK = "#06275b";
const BORDER_SOFT = "#b8c9e2";
const TEXT = "#000000";
const PERCENTILE_RANK_FONT_FAMILY = "Calibri, 'Segoe UI', Arial, sans-serif";

export function clampPercentileRank(value, min = 0, max = 100) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return min;
  }
  return Math.min(Math.max(number, min), max);
}

export function formatPercentileRank(value) {
  const number = clampPercentileRank(value);
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 1
  }).format(number);
}

export function getPercentileRankQuartileLabel(value) {
  const percentile = clampPercentileRank(value);
  if (percentile < 25) {
    return "unteres Viertel";
  }
  if (percentile < 50) {
    return "unteres Mittelfeld";
  }
  if (percentile < 75) {
    return "oberes Mittelfeld";
  }
  return "oberes Viertel";
}

export function getPercentileRankDescription(value) {
  const percentile = clampPercentileRank(value);
  const p = formatPercentileRank(percentile);
  const better = formatPercentileRank(100 - percentile);
  return `Ein Prozentrang von ${p} bedeutet, dass etwa ${p} % der Lerngruppe ein schlechteres oder gleich gutesErgebnis erzielt haben. Etwa ${better} % der Leistungen waren besser.`;
}

export function hasPngSignature(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < PNG_SIGNATURE.length) {
    return false;
  }
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function getCanvasDocument(options = {}) {
  const doc = options.document || (typeof document !== "undefined" ? document : null);
  if (!doc || typeof doc.createElement !== "function") {
    throw new Error("Die Prozentrang-Grafik konnte nicht erzeugt werden: Canvas ist nicht verfügbar.");
  }
  return doc;
}

function createCanvas(options = {}) {
  const canvas = options.canvas || getCanvasDocument(options).createElement("canvas");
  canvas.width = PERCENTILE_RANK_IMAGE_WIDTH_PX;
  canvas.height = PERCENTILE_RANK_IMAGE_HEIGHT_PX;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Die Prozentrang-Grafik konnte nicht erzeugt werden: Canvas-Kontext fehlt.");
  }
  return { canvas, ctx };
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(Number(radius) || 0, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawRoundedRect(ctx, x, y, width, height, radius, fill, stroke = "", lineWidth = 1) {
  roundedRect(ctx, x, y, width, height, radius);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawText(ctx, text, x, y, options = {}) {
  ctx.save();
  ctx.font = options.font || `400 20px ${PERCENTILE_RANK_FONT_FAMILY}`;
  ctx.fillStyle = options.fill || TEXT;
  ctx.textAlign = options.align || "left";
  ctx.textBaseline = options.baseline || "alphabetic";
  ctx.fillText(String(text ?? ""), x, y);
  ctx.restore();
}

function drawCenteredText(ctx, text, x, y, font, fill = "#000000") {
  drawText(ctx, text, x, y, { font, fill, align: "center" });
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, options = {}) {
  ctx.save();
  ctx.font = options.font || `400 22px ${PERCENTILE_RANK_FONT_FAMILY}`;
  ctx.fillStyle = options.fill || "#000000";
  ctx.textBaseline = options.baseline || "alphabetic";
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = wrapCanvasTextLines(ctx, words, maxWidth);
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + (index * lineHeight));
  });
  ctx.restore();
  return y + (lines.length * lineHeight);
}

function wrapCanvasTextLines(ctx, words, maxWidth) {
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const nextLine = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(nextLine).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = nextLine;
    }
  });
  if (line) {
    lines.push(line);
  }
  return lines;
}

function measureWrappedTextLineCount(ctx, text, maxWidth, font) {
  ctx.save();
  ctx.font = font;
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lineCount = wrapCanvasTextLines(ctx, words, maxWidth).length;
  ctx.restore();
  return lineCount;
}

function drawInfoIcon(ctx, x, y) {
  ctx.save();
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 24, 0, Math.PI * 2);
  ctx.stroke();
  drawText(ctx, "i", x, y + 13, {
    font: `700 36px ${PERCENTILE_RANK_FONT_FAMILY}`,
    fill: BLUE,
    align: "center"
  });
  ctx.restore();
}

function drawPercentileRankCanvas(ctx, percentile) {
  const value = clampPercentileRank(percentile);
  const p = formatPercentileRank(value);
  const width = PERCENTILE_RANK_IMAGE_WIDTH_PX;
  const height = PERCENTILE_RANK_IMAGE_HEIGHT_PX;
  const rootPadding = 30;
  const widgetWidth = 1100;
  const widgetX = (width - widgetWidth) / 2;
  const titleY = rootPadding + 31;
  const scaleY = rootPadding + 62;
  const labelY = scaleY + 25;
  const barX = widgetX;
  const barY = scaleY + 60;
  const barW = widgetWidth;
  const barH = 55;
  const markerX = barX + (value / 100) * barW;
  const markerCenterY = barY + Math.round(barH / 2);
  const markerLineH = 122;
  const markerLabelTop = markerCenterY + markerLineH;
  const markerLabelHeight = 56;
  const verticalGroupGap = 18;
  const markerLabelText = `Dein Prozentrang: ${p}`;
  const markerLabelFont = `800 24px ${PERCENTILE_RANK_FONT_FAMILY}`;
  const quartileY = markerLabelTop - verticalGroupGap - 6;
  const infoX = widgetX;
  const infoY = markerLabelTop + markerLabelHeight + verticalGroupGap;
  const infoW = widgetWidth;
  const infoH = 118;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  drawText(ctx, "Vergleich mit der Lerngruppe", widgetX, titleY, {
    font: `650 32px ${PERCENTILE_RANK_FONT_FAMILY}`,
    fill: TEXT
  });

  const tickFont = `800 25px ${PERCENTILE_RANK_FONT_FAMILY}`;
  [0, 25, 50, 75, 100].forEach((tick) => {
    const x = barX + (tick / 100) * barW;
    const align = tick === 0 ? "left" : (tick === 100 ? "right" : "center");
    drawText(ctx, `${tick} %`, x, labelY, {
      font: tickFont,
      fill: "#000000",
      align
    });
  });

  const gradient = ctx.createLinearGradient(barX, barY, barX + barW, barY);
  gradient.addColorStop(0, "#f7fbff");
  gradient.addColorStop(0.48, "#dcecff");
  gradient.addColorStop(1, "#edf6ff");
  drawRoundedRect(ctx, barX, barY, barW, barH, 8, gradient, BLUE_DARK, 3);

  ctx.save();
  ctx.strokeStyle = BLUE_DARK;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.95;
  [25, 50, 75].forEach((tick) => {
    const x = barX + (tick / 100) * barW;
    ctx.beginPath();
    ctx.moveTo(x, barY - 24);
    ctx.lineTo(x, barY + barH);
    ctx.stroke();
  });
  ctx.restore();

  const quartileFont = `650 23px ${PERCENTILE_RANK_FONT_FAMILY}`;
  [
    "unteres Viertel",
    "unteres Mittelfeld",
    "oberes Mittelfeld",
    "oberes Viertel"
  ].forEach((label, index) => {
    drawCenteredText(ctx, label, barX + ((index + 0.5) * barW) / 4, quartileY, quartileFont, "#000000");
  });

  ctx.save();
  ctx.strokeStyle = BLUE;
  ctx.fillStyle = BLUE;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(markerX, markerCenterY);
  ctx.lineTo(markerX, markerCenterY + markerLineH);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(markerX, markerCenterY, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.font = markerLabelFont;
  const labelPaddingX = 22;
  const labelWidth = Math.ceil(ctx.measureText(markerLabelText).width + labelPaddingX * 2);
  let shift = -0.5;
  if (value <= 12) {
    shift = -0.08;
  } else if (value >= 88) {
    shift = -0.92;
  }
  const labelX = Math.min(
    widgetX + widgetWidth - labelWidth,
    Math.max(widgetX, markerX + (labelWidth * shift))
  );
  drawRoundedRect(ctx, labelX, markerLabelTop, labelWidth, markerLabelHeight, 10, "#ffffff", BLUE, 3);
  drawText(ctx, markerLabelText, labelX + labelPaddingX, markerLabelTop + 36, {
    font: markerLabelFont,
    fill: BLUE_DARK
  });
  ctx.restore();

  drawRoundedRect(ctx, infoX, infoY, infoW, infoH, 10, "#fbfdff", BORDER_SOFT, 2);
  const infoCenterY = infoY + (infoH / 2);
  drawInfoIcon(ctx, infoX + 55, infoCenterY);
  const infoTextX = infoX + 115;
  const infoText = getPercentileRankDescription(value);
  const infoTextFont = `400 23px ${PERCENTILE_RANK_FONT_FAMILY}`;
  const infoLineHeight = 31;
  const infoLineCount = measureWrappedTextLineCount(ctx, infoText, infoW - 150, infoTextFont);
  const infoTextY = infoY + ((infoH - (infoLineCount * infoLineHeight)) / 2);
  drawWrappedText(
    ctx,
    infoText,
    infoTextX,
    infoTextY,
    infoW - 150,
    infoLineHeight,
    {
      font: infoTextFont,
      fill: "#000000",
      baseline: "top"
    }
  );

  return value;
}

export function isPercentileRankCanvasVisible(ctx, width = PERCENTILE_RANK_IMAGE_WIDTH_PX, height = PERCENTILE_RANK_IMAGE_HEIGHT_PX) {
  try {
    const data = ctx.getImageData(0, 0, width, height).data;
    let visibleSamples = 0;
    for (let y = 0; y < height; y += 20) {
      for (let x = 0; x < width; x += 20) {
        const index = ((y * width) + x) * 4;
        const alpha = data[index + 3];
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        if (alpha > 0 && (red < 245 || green < 245 || blue < 245)) {
          visibleSamples += 1;
          if (visibleSamples > 30) {
            return true;
          }
        }
      }
    }
    return false;
  } catch (_error) {
    return false;
  }
}

async function canvasToPngBytes(canvas) {
  if (typeof canvas.toBlob !== "function") {
    throw new Error("Die Prozentrang-Grafik konnte nicht als PNG erzeugt werden: Canvas.toBlob fehlt.");
  }
  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  if (!blob) {
    throw new Error("Die Prozentrang-Grafik konnte nicht als PNG erzeugt werden.");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!hasPngSignature(bytes)) {
    throw new Error("Die Prozentrang-Grafik wurde nicht als gültiges PNG erzeugt.");
  }
  return bytes;
}

export async function renderPercentileRankPng(percentile, options = {}) {
  const { canvas, ctx } = createCanvas(options);
  drawPercentileRankCanvas(ctx, percentile);
  if (!isPercentileRankCanvasVisible(ctx, canvas.width, canvas.height)) {
    throw new Error("Die Prozentrang-Grafik wurde leer gerendert.");
  }
  return canvasToPngBytes(canvas);
}
