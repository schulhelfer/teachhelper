import { ensurePdfLibLoaded } from '../../shared/pdf-vendor.js';
import { PLANNING_RICH_TEXT_COLORS } from '../../shared/planning-rich-text.js';

function sanitizePdfText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, '?');
}

function sanitizeFileName(value, fallback = 'Teachhelper-Archiv') {
  const text = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.\- ]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return text || fallback;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('de-DE');
}

export async function buildWorkspaceArchivePdfBytes(year, sections = []) {
  const PDFLib = await ensurePdfLibLoaded();
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const boldItalicFont = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const margin = 30;
  const contentWidth = pageWidth - margin * 2;
  let page = null;
  let y = 0;
  let pageNumber = 0;
  const colors = {
    text: rgb(0.08, 0.1, 0.14),
    muted: rgb(0.36, 0.42, 0.5),
    line: rgb(0.78, 0.82, 0.88),
    headerBg: rgb(0.9, 0.93, 0.97),
    title: rgb(0.05, 0.12, 0.24),
  };
  const richTextColor = (color) => {
    const hex = PLANNING_RICH_TEXT_COLORS[color];
    if (!hex) return colors.text;
    const value = Number.parseInt(hex.slice(1), 16);
    return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
  };

  const addPage = () => {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    pageNumber += 1;
    y = pageHeight - margin;
    page.drawText(sanitizePdfText(`Teachhelper Archiv - ${year?.name || ''}`), {
      x: margin, y, size: 8, font, color: colors.muted,
    });
    page.drawText(String(pageNumber), {
      x: pageWidth - margin - 20, y, size: 8, font, color: colors.muted,
    });
    y -= 22;
  };

  const ensureSpace = (height) => {
    if (!page || y - height < margin) {
      addPage();
      return true;
    }
    return false;
  };

  const wrapText = (value, maxWidth, size, activeFont = font, maxLines = 4) => {
    const lines = [];
    for (const paragraph of sanitizePdfText(value || '').split('\n')) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push('');
        continue;
      }
      let line = '';
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (activeFont.widthOfTextAtSize(next, size) <= maxWidth || !line) line = next;
        else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    if (lines.length <= maxLines) return lines;
    const clipped = lines.slice(0, maxLines);
    clipped[clipped.length - 1] = `${clipped.at(-1).replace(/\.*$/, '')}...`;
    return clipped;
  };

  const drawLines = (lines, x, topY, size, activeFont = font, color = colors.text, lineHeight = size + 2) => {
    lines.forEach((line, index) => page.drawText(sanitizePdfText(line), {
      x,
      y: topY - (index + 1) * lineHeight,
      size,
      font: activeFont,
      color,
    }));
  };

  const drawHeading = (title, level = 1) => {
    const size = level === 1 ? 16 : 11;
    const lines = wrapText(title, contentWidth, size, boldFont, 3);
    const height = lines.length * (size + 3) + 8;
    ensureSpace(height);
    drawLines(lines, margin, y, size, boldFont, level === 1 ? colors.title : colors.text, size + 3);
    y -= height;
  };

  const drawParagraph = (text) => {
    const lines = wrapText(text, contentWidth, 9, font, 8);
    const height = Math.max(18, lines.length * 11 + 4);
    ensureSpace(height);
    drawLines(lines, margin, y, 9, font, colors.text, 11);
    y -= height;
  };

  const fontForRichInline = (inline) => {
    if (inline?.bold && inline?.italic) return boldItalicFont;
    if (inline?.bold) return boldFont;
    if (inline?.italic) return italicFont;
    return font;
  };

  const richLines = (children, maxWidth, baseSize = 9) => {
    const lines = [[]];
    let width = 0;
    (Array.isArray(children) ? children : []).forEach((inline) => {
      const size = Number(inline?.size) || baseSize;
      const activeFont = fontForRichInline(inline);
      String(inline?.text || '').split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (part.includes('\n')) {
          part.split(/(\n)/).forEach((piece) => {
            if (piece === '\n') { lines.push([]); width = 0; }
            else if (piece) {
              const pieceWidth = activeFont.widthOfTextAtSize(sanitizePdfText(piece), size);
              lines.at(-1).push({ ...inline, text: piece, size, activeFont, width: pieceWidth }); width += pieceWidth;
            }
          });
          return;
        }
        const partWidth = activeFont.widthOfTextAtSize(sanitizePdfText(part), size);
        if (width && width + partWidth > maxWidth && !/^\s+$/u.test(part)) { lines.push([]); width = 0; }
        lines.at(-1).push({ ...inline, text: part, size, activeFont, width: partWidth }); width += partWidth;
      });
    });
    return lines;
  };

  const drawRichParagraph = (children, indent = 0, prefix = '') => {
    const size = 9;
    const prefixWidth = prefix ? font.widthOfTextAtSize(prefix, size) + 4 : 0;
    const lines = richLines(children, contentWidth - indent - prefixWidth, size);
    const lineHeight = Math.max(12, ...lines.flat().map((run) => Number(run.size) + 3), 12);
    const height = Math.max(lineHeight, lines.length * lineHeight + 3);
    ensureSpace(height);
    lines.forEach((line, lineIndex) => {
      let x = margin + indent + (lineIndex === 0 ? 0 : prefixWidth);
      if (lineIndex === 0 && prefix) page.drawText(prefix, { x, y: y - lineHeight, size, font, color: colors.text });
      if (lineIndex === 0 && prefix) x += prefixWidth;
      line.forEach((run) => {
        const baseline = y - lineHeight;
        const color = richTextColor(run.color);
        page.drawText(sanitizePdfText(run.text), { x, y: baseline, size: run.size, font: run.activeFont, color });
        if (run.underline) page.drawLine({ start: { x, y: baseline - 1 }, end: { x: x + run.width, y: baseline - 1 }, thickness: 0.6, color });
        x += run.width;
      });
      y -= lineIndex === lines.length - 1 ? 0 : lineHeight;
    });
    y -= lineHeight + 3;
  };

  const plainRichBlock = (block) => {
    if (block?.type === 'paragraph') return (block.children || []).map((inline) => inline.text || '').join('');
    if (block?.type === 'list') return (block.items || []).map((item, index) => `${block.ordered ? `${index + 1}.` : '•'} ${item.map(plainRichBlock).join(' ')}`).join('\n');
    if (block?.type === 'table') return (block.rows || []).map((row) => row.map((cell) => cell.map(plainRichBlock).join(' ')).join(' | ')).join('\n');
    return '';
  };

  const drawRichBlocks = (blocks, indent = 0) => {
    (Array.isArray(blocks) ? blocks : []).forEach((block) => {
      if (block?.type === 'paragraph') drawRichParagraph(block.children, indent);
      else if (block?.type === 'list') (block.items || []).forEach((item, index) => {
        const prefix = block.ordered ? `${index + 1}.` : '•';
        const first = item[0] || { type: 'paragraph', children: [] };
        if (first.type === 'paragraph') drawRichParagraph(first.children, indent, prefix);
        else drawRichParagraph([{ text: plainRichBlock(first) }], indent, prefix);
        item.slice(1).forEach((child) => drawRichBlocks([child], indent + 14));
      });
      else if (block?.type === 'table') {
        const rows = block.rows || [];
        const columns = Array.from({ length: Math.max(1, ...rows.map((row) => row.length)) }, (_value, index) => `Spalte ${index + 1}`);
        drawTablePart('Tabelle', columns, rows.map((row) => row.map((cell) => cell.map(plainRichBlock).join('\n'))));
      }
    });
  };

  const drawTablePart = (title, columns, rows) => {
    drawHeading(title, 2);
    const size = 7;
    const lineHeight = 8.5;
    const firstWidth = columns.length > 1 ? 104 : contentWidth;
    const otherWidth = columns.length > 1 ? Math.max(54, (contentWidth - firstWidth) / (columns.length - 1)) : contentWidth;
    const widths = columns.map((_column, index) => index === 0 ? firstWidth : otherWidth);
    const drawRow = (cells, header = false) => {
      const cellLines = cells.map((cell, index) => wrapText(cell, widths[index] - 7, size, header ? boldFont : font, header ? 3 : 4));
      const height = Math.max(18, Math.max(...cellLines.map((lines) => lines.length)) * lineHeight + 8);
      const pageBroke = ensureSpace(height + (header ? 0 : 18));
      if (pageBroke && !header) drawRow(columns, true);
      let x = margin;
      cells.forEach((_cell, index) => {
        page.drawRectangle({
          x, y: y - height, width: widths[index], height,
          borderColor: colors.line, borderWidth: 0.5,
          ...(header ? { color: colors.headerBg } : {}),
        });
        drawLines(cellLines[index], x + 3.5, y - 3, size, header ? boldFont : font, colors.text, lineHeight);
        x += widths[index];
      });
      y -= height;
    };
    drawRow(columns, true);
    if (!rows.length) drawRow(['Keine Daten', ...columns.slice(1).map(() => '')]);
    else rows.forEach((row) => drawRow(row.map((cell) => cell === null || cell === undefined || cell === '' ? '—' : String(cell))));
    y -= 10;
  };

  const drawTable = (section) => {
    const columns = Array.isArray(section.columns) ? section.columns : [];
    const rows = Array.isArray(section.rows) ? section.rows : [];
    if (columns.length <= 1) {
      drawTablePart(section.title, columns.length ? columns : ['Daten'], rows);
      return;
    }
    const maxOtherColumns = Math.max(1, Math.floor((contentWidth - 104) / 72));
    const remaining = columns.slice(1);
    for (let start = 0; start < remaining.length; start += maxOtherColumns) {
      const chunk = remaining.slice(start, start + maxOtherColumns);
      const chunkRows = rows.map((row) => [row[0], ...row.slice(1 + start, 1 + start + chunk.length)]);
      const suffix = remaining.length > maxOtherColumns
        ? ` (${Math.floor(start / maxOtherColumns) + 1}/${Math.ceil(remaining.length / maxOtherColumns)})`
        : '';
      drawTablePart(`${section.title}${suffix}`, [columns[0], ...chunk], chunkRows);
    }
  };

  addPage();
  drawHeading(`Teachhelper Archiv ${year?.name || ''}`, 1);
  drawParagraph(`Schuljahr: ${formatDate(year?.startDate)} bis ${formatDate(year?.endDate)}`);
  for (const section of sections) {
    if (section?.type === 'note') {
      drawHeading(section.title || 'Hinweis', 2);
      drawParagraph(section.text || 'Keine Daten.');
    } else if (section?.type === 'table') drawTable(section);
    else if (section?.type === 'richText') {
      drawHeading(section.title || 'Detailplanung', 2);
      drawRichBlocks(section.blocks);
    }
  }
  return pdfDoc.save();
}

export function downloadWorkspaceArchivePdf(bytes, year, root = document) {
  const fallback = `${String(year?.startDate || '').slice(0, 4)}-${String(year?.endDate || '').slice(0, 4)}`;
  const fileName = `${sanitizeFileName(`Teachhelper-Archiv-${year?.name || fallback}`)}.pdf`;
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const anchor = root.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return fileName;
}
