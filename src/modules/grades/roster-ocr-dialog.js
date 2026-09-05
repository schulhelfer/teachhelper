import { createOcrPdfSession } from "./roster-ocr-pdf.js";
import { assertFileSizeAtMost, FILE_LIMITS, FILE_TIMEOUTS, withTimeout } from "../../shared/file-guards.js";
import { recognizeLocalNames } from "../../shared/ocr-vendor.js";
import { boundCrop, changeCrop, cropPixels, importableOcrNames, ocrOutputSize, parseOcrNames } from "./roster-ocr-data.js";

const FULL_CROP = { x: 0, y: 0, width: 1, height: 1 };
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function createRosterOcrDialog({ dialog, openDialog, closeDialog, onImported, recognize = recognizeLocalNames, createPdf = createOcrPdfSession }) {
  const doc = dialog.ownerDocument;
  const ref = (name) => dialog.querySelector(`[data-ocr="${name}"]`);
  const orderInputs = () => [...dialog.querySelectorAll('[data-ocr="order-input"]')];
  const nameOrder = () => orderInputs().find((input) => input.checked)?.value || "last-first";
  const setNameOrder = (value) => { for (const input of orderInputs()) input.checked = input.value === value; };
  const canvas = ref("canvas");
  const stage = ref("stage");
  const frame = ref("frame");
  let source = null;
  let turns = 0;
  let crop = { ...FULL_CROP };
  let rows = [];
  let drag = null;
  let generation = 0;
  let controller = null;
  let pendingImage = null;
  let pdfSession = null;
  let pdfPages = 0;
  let pdfPage = 1;
  let confirm = null;
  let busy = false;

  const dimensions = () => turns % 2
    ? { width: (source.naturalHeight || source.height), height: (source.naturalWidth || source.width) }
    : { width: (source.naturalWidth || source.width), height: (source.naturalHeight || source.height) };
  const status = (message) => { ref("status").textContent = message; };
  const showStage = () => {
    stage.dataset.state = source ? "loaded" : "empty";
    frame.hidden = !source;
    ref("drop").hidden = Boolean(source);
  };
  const updateConfirm = () => {
    const count = importableOcrNames(rows).length;
    const label = count ? `${count} Namen übernehmen` : "Namen übernehmen";
    ref("confirm").disabled = busy || count === 0;
    ref("confirm").setAttribute("aria-label", label);
    ref("confirm").dataset.tooltip = label;
  };
  const setBusy = (value) => {
    busy = value;
    ref("recognize").disabled = value || !source;
    ref("rotate").disabled = value || !source;
    ref("paste").disabled = value;
    for (const input of orderInputs()) input.disabled = value;
    ref("pdf-page").disabled = value;
    ref("stop").hidden = !value;
    ref("progress").hidden = !value;
    stage.inert = value;
    dialog.setAttribute("aria-busy", String(value));
    updateConfirm();
  };
  const clearRows = () => {
    rows = [];
    ref("rows").replaceChildren();
    ref("review").hidden = true;
    updateConfirm();
  };
  const stop = () => {
    generation += 1;
    controller?.abort();
    controller = null;
    if (pendingImage) {
      pendingImage.controller.abort();
      pendingImage.image.src = "";
      URL.revokeObjectURL(pendingImage.url);
      pendingImage = null;
    }
    drag = null;
    setBusy(false);
  };
  const releasePdf = () => {
    pdfSession?.destroy();
    pdfSession = null;
    pdfPages = 0;
    pdfPage = 1;
    ref("pdf-pages").hidden = true;
    ref("pdf-page").value = "1";
    ref("pdf-count").textContent = "";
  };
  const cleanup = () => {
    stop();
    releasePdf();
    source = null;
    confirm = null;
    canvas.width = 0;
    canvas.height = 0;
    ref("file").value = "";
    showStage();
    clearRows();
    status("");
    setBusy(false);
  };
  const close = () => {
    cleanup();
    closeDialog(dialog);
  };
  const renderCrop = () => {
    const box = ref("crop");
    box.style.left = `${crop.x * 100}%`;
    box.style.top = `${crop.y * 100}%`;
    box.style.width = `${crop.width * 100}%`;
    box.style.height = `${crop.height * 100}%`;
  };
  const drawSource = (context) => {
    context.save();
    if (turns === 1) context.translate((source.naturalHeight || source.height), 0);
    if (turns === 2) context.translate((source.naturalWidth || source.width), (source.naturalHeight || source.height));
    if (turns === 3) context.translate(0, (source.naturalWidth || source.width));
    context.rotate(turns * Math.PI / 2);
    context.drawImage(source, 0, 0);
    context.restore();
  };
  const renderImage = () => {
    const size = dimensions();
    const scale = Math.min(1, 1200 / Math.max(size.width, size.height));
    canvas.width = Math.max(1, Math.round(size.width * scale));
    canvas.height = Math.max(1, Math.round(size.height * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.scale(canvas.width / size.width, canvas.height / size.height);
    drawSource(context);
    showStage();
    renderCrop();
    setBusy(false);
  };
  const renderHead = (list) => {
    const head = doc.createElement("div");
    head.className = "course-ocr-row course-ocr-head";
    for (const title of ["Nachname", "Vorname", ""]) {
      const cell = doc.createElement("span");
      cell.textContent = title;
      head.append(cell);
    }
    list.append(head);
  };
  const renderRows = () => {
    const list = ref("rows");
    const items = [];
    list.replaceChildren();
    ref("review").hidden = rows.length === 0;
    if (rows.length) renderHead(list);
    rows.forEach((row, index) => {
      const item = doc.createElement("div");
      item.className = "course-ocr-row";
      for (const [field, title] of [["lastName", "Nachname"], ["firstName", "Vorname"]]) {
        const input = doc.createElement("input");
        input.type = "text";
        input.value = row[field];
        input.maxLength = FILE_LIMITS.CSV_MAX_CELL_CHARS;
        input.autocomplete = "off";
        input.spellcheck = false;
        input.setAttribute("aria-label", `${title} ${index + 1}`);
        input.addEventListener("input", () => { row[field] = input.value; updateConfirm(); });
        item.append(input);
      }
      const remove = doc.createElement("button");
      remove.type = "button";
      remove.className = "ghost danger-action dialog-icon-button app-action-icon";
      remove.textContent = "🗑️";
      remove.setAttribute("aria-label", `Eintrag ${index + 1} entfernen`);
      remove.addEventListener("click", () => {
        rows = rows.filter((candidate) => candidate !== row);
        const remaining = renderRows();
        (remaining[Math.min(index, remaining.length - 1)]?.querySelector("button") || ref("recognize")).focus();
      });
      item.append(remove);
      list.append(item);
      items.push(item);
    });
    updateConfirm();
    return items;
  };

  async function loadFile(file) {
    if (!file) return;
    stop();
    const token = generation;
    releasePdf();
    source = null;
    canvas.width = 0;
    canvas.height = 0;
    showStage();
    clearRows();
    setBusy(false);
    let url;
    try {
      if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
        pdfSession = createPdf({ createCanvas: () => doc.createElement("canvas") });
        controller = new AbortController();
        setBusy(true);
        status("PDF wird lokal geladen …");
        const count = await pdfSession.load(file, { signal: controller.signal });
        if (token !== generation || !dialog.open) return;
        pdfPages = count;
        ref("pdf-pages").hidden = false;
        ref("pdf-page").max = String(count);
        ref("pdf-count").textContent = `von ${count}`;
        await showPdfPage(1);
        return;
      }
      if (!IMAGE_TYPES.has(file.type) && !(file.type === "" && /\.(jpe?g|png|webp)$/i.test(file.name))) {
        throw new Error("Bitte eine JPEG-, PNG-, WebP- oder PDF-Datei auswählen.");
      }
      assertFileSizeAtMost(file, FILE_LIMITS.IMAGE_BYTES, "Bilddatei");
      status("Bild wird geladen …");
      url = URL.createObjectURL(file);
      const image = new Image();
      const imageController = new AbortController();
      pendingImage = { image, url, controller: imageController };
      image.src = url;
      await withTimeout(image.decode(), FILE_TIMEOUTS.READ_MS, "Das Bild konnte nicht rechtzeitig geladen werden.", { signal: imageController.signal });
      if (token !== generation || !dialog.open) return;
      if (!image.naturalWidth || !image.naturalHeight) throw new Error("Das Bild konnte nicht gelesen werden.");
      source = image;
      turns = 0;
      crop = { ...FULL_CROP };
      renderImage();
      status("");
      ref("recognize").focus();
    } catch (error) {
      if (token === generation) {
        releasePdf();
        status(error instanceof Error ? error.message : "Die Datei konnte nicht gelesen werden.");
      }
    } finally {
      if (token === generation) { controller = null; setBusy(false); }
      if (url && pendingImage?.url === url) {
        URL.revokeObjectURL(url);
        pendingImage = null;
      }
    }
  }

  async function showPdfPage(number) {
    if (!pdfSession || !Number.isInteger(number) || number < 1 || number > pdfPages) {
      ref("pdf-page").value = String(pdfPage);
      status(`Bitte eine PDF-Seite zwischen 1 und ${pdfPages} wählen.`);
      return;
    }
    stop();
    const token = generation;
    source = null;
    canvas.width = canvas.height = 0;
    showStage();
    clearRows();
    controller = new AbortController();
    setBusy(true);
    status(`PDF-Seite ${number} wird dargestellt …`);
    try {
      const image = await pdfSession.render(number, { signal: controller.signal });
      if (token !== generation || !dialog.open) return;
      source = image;
      pdfPage = number;
      ref("pdf-page").value = String(number);
      turns = 0;
      crop = { ...FULL_CROP };
      renderImage();
      status("");
    } catch (error) {
      if (token === generation && error?.name !== "AbortError") status(error instanceof Error ? error.message : "Die PDF-Seite konnte nicht dargestellt werden.");
    } finally {
      if (token === generation) { controller = null; setBusy(false); }
    }
  }

  async function pasteImage() {
    if (!navigator.clipboard || typeof navigator.clipboard.read !== "function") {
      status("Dieser Browser kann keine Bilder aus der Zwischenablage lesen.");
      return;
    }
    stop();
    const token = generation;
    try {
      // Read immediately in the click handler to preserve browser user activation.
      const items = await navigator.clipboard.read();
      if (token !== generation || !dialog.open) return;
      for (const item of items) {
        const type = item.types.find((candidate) => IMAGE_TYPES.has(candidate));
        if (!type) continue;
        const blob = await item.getType(type);
        if (token !== generation || !dialog.open) return;
        const extension = type === "image/jpeg" ? "jpg" : type.slice("image/".length);
        await loadFile(new File([blob], `bild-aus-zwischenablage.${extension}`, { type }));
        return;
      }
      status("In der Zwischenablage wurde keine passende Datei gefunden.");
    } catch (error) {
      if (token !== generation || !dialog.open) return;
      status(error?.name === "NotAllowedError"
        ? "Der Zugriff auf die Zwischenablage wurde nicht erlaubt. Bitte eine Bilddatei auswählen oder den Zugriff im Browser erlauben."
        : "Datei konnte nicht aus der Zwischenablage gelesen werden.");
    }
  }

  async function run() {
    if (!source || busy) return;
    stop();
    const token = generation;
    controller = new AbortController();
    const signal = controller.signal;
    const order = nameOrder();
    clearRows();
    setBusy(true);
    ref("progress").value = 0;
    status("Lokale Texterkennung wird vorbereitet …");
    const output = doc.createElement("canvas");
    try {
      const size = dimensions();
      const area = cropPixels(crop, size.width, size.height);
      const target = ocrOutputSize(area.width, area.height);
      output.width = target.width;
      output.height = target.height;
      const context = output.getContext("2d");
      context.fillStyle = "white";
      context.fillRect(0, 0, output.width, output.height);
      context.scale(output.width / area.width, output.height / area.height);
      context.translate(-area.x, -area.y);
      drawSource(context);
      const blob = await new Promise((resolve) => output.toBlob(resolve, "image/png"));
      if (signal.aborted) return;
      if (!blob) throw new Error("Der Bildausschnitt konnte nicht erstellt werden.");
      const bytes = await blob.arrayBuffer();
      if (signal.aborted) return;
      const text = await recognize(bytes, {
        signal, onProgress: ({ status: phase, progress }) => {
          if (token !== generation) return;
          if (phase === "recognizing text") {
            ref("progress").value = Number(progress) || 0;
            status(`Namen werden erkannt … ${Math.round((Number(progress) || 0) * 100)} %`);
          } else status("Lokale OCR-Dateien werden geladen …");
        }
      });
      if (token !== generation || !dialog.open) return;
      rows = parseOcrNames(text, order);
      if (rows.length > FILE_LIMITS.CSV_MAX_ROWS || rows.some((row) => row.raw.length > FILE_LIMITS.CSV_MAX_CELL_CHARS)) {
        clearRows();
        throw new Error("Zu viele oder zu lange Einträge. Bitte einen kleineren Listenbereich auswählen.");
      }
      renderRows();
      status(rows.length ? "" : "Keine Namen erkannt.");
      ref("review").querySelector("input")?.focus();
    } catch (error) {
      if (token === generation && error?.name !== "AbortError") status(error instanceof Error ? error.message : "Die Erkennung ist fehlgeschlagen.");
    } finally {
      output.width = 0;
      output.height = 0;
      if (token === generation) { controller = null; setBusy(false); }
    }
  }

  const point = (event) => {
    const rect = frame.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  const cropEdgeHandle = (event) => {
    const rect = ref("crop").getBoundingClientRect();
    if (!rect.width || !rect.height) return "move";
    const band = (size) => Math.min(Math.max(12, size * 0.2), size * 0.4);
    const x = band(rect.width);
    const y = band(rect.height);
    const vertical = Math.abs(event.clientY - rect.top) <= y ? "n" : Math.abs(event.clientY - rect.bottom) <= y ? "s" : "";
    const horizontal = Math.abs(event.clientX - rect.left) <= x ? "w" : Math.abs(event.clientX - rect.right) <= x ? "e" : "";
    return `${vertical}${horizontal}` || "move";
  };
  const showCropCursor = (handle) => {
    const box = ref("crop");
    if (handle && handle !== "move") box.dataset.resize = handle;
    else delete box.dataset.resize;
  };
  stage.addEventListener("pointerdown", (event) => {
    if (!source || busy || !event.isPrimary || event.button !== 0) return;
    const start = point(event);
    const handle = event.target.closest('[data-ocr="crop"]') ? cropEdgeHandle(event) : "new";
    drag = { start, crop: { ...crop }, handle, pointerId: event.pointerId };
    stage.setPointerCapture(event.pointerId);
    ref("crop").focus({ preventScroll: true });
    event.preventDefault();
    clearRows();
  });
  stage.addEventListener("pointermove", (event) => {
    if (!drag) {
      showCropCursor(source && !busy && event.target.closest('[data-ocr="crop"]') ? cropEdgeHandle(event) : null);
      return;
    }
    if (drag.pointerId !== event.pointerId) return;
    const position = point(event);
    const dx = position.x - drag.start.x;
    const dy = position.y - drag.start.y;
    crop = drag.handle === "new"
      ? boundCrop({ x: Math.min(drag.start.x, position.x), y: Math.min(drag.start.y, position.y), width: Math.abs(dx), height: Math.abs(dy) })
      : changeCrop(drag.crop, drag.handle, dx, dy);
    renderCrop();
  });
  const endDrag = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    drag = null;
    showCropCursor(null);
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  stage.addEventListener("lostpointercapture", () => { drag = null; showCropCursor(null); });
  stage.addEventListener("keydown", (event) => {
    const onCrop = Boolean(event.target.closest('[data-ocr="crop"]'));
    if (!source || busy || !onCrop || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const size = dimensions();
    const step = event.shiftKey ? 10 : 1;
    const dx = (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0) / size.width;
    const dy = (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0) / size.height;
    crop = changeCrop(crop, event.altKey ? "se" : "move", dx, dy);
    clearRows();
    renderCrop();
  });
  const openFilePicker = () => {
    if (busy) return;
    ref("file").value = "";
    ref("file").click();
  };
  const setDragOver = (active) => {
    if (active) stage.dataset.dragOver = "1";
    else delete stage.dataset.dragOver;
  };
  stage.addEventListener("click", () => { if (!source) openFilePicker(); });
  stage.addEventListener("keydown", (event) => {
    if (source || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openFilePicker();
  });
  let dragDepth = 0;
  const hasDraggedFiles = (transfer) => Boolean(transfer)
    && (transfer.files?.length > 0 || [...(transfer.types || [])].includes("Files"));
  stage.addEventListener("dragenter", (event) => {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth += 1;
    setDragOver(true);
  });
  stage.addEventListener("dragover", (event) => {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    setDragOver(true);
  });
  stage.addEventListener("dragleave", (event) => {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setDragOver(false);
  });
  stage.addEventListener("drop", (event) => {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth = 0;
    setDragOver(false);
    void loadFile(event.dataTransfer?.files?.[0]);
  });
  ref("paste").addEventListener("click", () => { void pasteImage(); });
  ref("pdf-page").addEventListener("change", () => { if (!busy) void showPdfPage(Number(ref("pdf-page").value)); });
  ref("file").addEventListener("change", () => { void loadFile(ref("file").files?.[0]); });
  ref("rotate").addEventListener("click", () => {
    if (!source || busy) return;
    turns = (turns + 1) % 4;
    crop = { ...FULL_CROP };
    clearRows();
    renderImage();
  });
  ref("order").addEventListener("change", (event) => {
    if (event.target?.dataset?.ocr !== "order-input") return;
    clearRows();
    status("");
  });
  ref("recognize").addEventListener("click", () => { void run(); });
  ref("stop").addEventListener("click", () => { stop(); status(""); });
  ref("close").addEventListener("click", close);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.addEventListener("close", () => { if (!dialog.open) cleanup(); });
  dialog.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    const names = importableOcrNames(rows);
    if (busy || !names.length || !confirm) return;
    try {
      const result = confirm(names);
      close();
      onImported?.(result);
    } catch (error) {
      status(error instanceof Error ? error.message : "Die Namen konnten nicht übernommen werden.");
    }
  });
  return {
    open(onConfirm) {
      cleanup();
      confirm = onConfirm;
      setNameOrder("last-first");
      openDialog(dialog);
      stage.focus();
    },
    close,
  };
}
