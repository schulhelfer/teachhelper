import { MERGER_SHELL_LAYOUT_EVENT } from '../../shell/tabs.js';

export function createMergerApp({
  sideRoot = null,
  mainRoot = null,
  sideHost = null,
  mainHost = null,
  root = document,
} = {}) {
  const A4_WIDTH = 595.3;
  const A4_HEIGHT = 841.9;
  const A4_TOLERANCE = 3.0;
  const A3_WIDTH = A4_HEIGHT;
  const A3_HEIGHT = A4_WIDTH * 2.0;
  const TOOL_MERGE = "merge";
  const TOOL_LAYOUT = "layout";
  const TOOL_ROTATE = "rotate";
  const TOOL_SPLIT = "split";
  const standalone = !sideRoot || !mainRoot || !sideHost || !mainHost;
  const domRoots = standalone ? [root] : [sideRoot, mainRoot];

  const getElementById = (id) => {
    const escapedId = typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(id)
      : String(id).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    const selector = `#${escapedId}`;
    for (const root of domRoots) {
      const element = root.querySelector(selector);
      if (element) return element;
    }
    return null;
  };

  const querySelector = (selector) => {
    for (const root of domRoots) {
      const element = root.querySelector(selector);
      if (element) return element;
    }
    return null;
  };

  const querySelectorAll = (selector) => domRoots.flatMap((root) => [...root.querySelectorAll(selector)]);
  const scopeTargets = standalone ? [root?.documentElement].filter(Boolean) : [sideHost, mainHost].filter(Boolean);
  const runtimeChrome = querySelector(".merger-runtime-root");

  const setScopeAttribute = (name, value) => {
    scopeTargets.forEach((host) => {
      if (value == null) {
        host.removeAttribute(name);
      } else {
        host.setAttribute(name, value);
      }
    });
  };

  const ui = {
    toolTabs: [...querySelectorAll(".tool-tab")],
    toolPanels: {
      [TOOL_MERGE]: getElementById("tool-panel-merge"),
      [TOOL_LAYOUT]: getElementById("tool-panel-layout"),
      [TOOL_ROTATE]: getElementById("tool-panel-rotate"),
      [TOOL_SPLIT]: getElementById("tool-panel-split"),
    },
    splitSidebarPanel: getElementById("splitSidebarPanel"),
    sharedPdfInput: getElementById("sharedPdfInput"),
    mergeDropZone: getElementById("mergeDropZone"),
    mergeDropHint: getElementById("mergeDropHint"),
    mergeDropSummary: getElementById("mergeDropSummary"),
    mergeFileListShell: getElementById("mergeFileListShell"),
    mergeTotalPages: getElementById("mergeTotalPages"),
    mergeAppendFileList: getElementById("mergeAppendFileList"),
    mergeStartButton: getElementById("mergeStartButton"),
    layoutDropZone: getElementById("layoutDropZone"),
    layoutDropHint: getElementById("layoutDropHint"),
    layoutDropSummary: getElementById("layoutDropSummary"),
    optionsPanel: getElementById("optionsPanel"),
    pagesButtons: [...querySelectorAll("#pagesButtons button[data-pages]")],
    autoOrientationToggle: getElementById("autoOrientationToggle"),
    studentCount: getElementById("studentCount"),
    paddingModes: [...querySelectorAll('input[name="paddingMode"]')],
    specialThreeModeButton: getElementById("specialThreeModeButton"),
    layoutStartButton: getElementById("layoutStartButton"),
    rotateDropZone: getElementById("rotateDropZone"),
    rotateDropHint: getElementById("rotateDropHint"),
    rotateDropSummary: getElementById("rotateDropSummary"),
    rotateDocumentDegreesButtons: [...querySelectorAll("#rotateDocumentDegreesGroup [data-rotation]")],
    rotatePagesHint: getElementById("rotatePagesHint"),
    rotatePagesList: getElementById("rotatePagesList"),
    rotateStartButton: getElementById("rotateStartButton"),
    splitDropZone: getElementById("splitDropZone"),
    splitDropHint: getElementById("splitDropHint"),
    splitDropSummary: getElementById("splitDropSummary"),
    splitWorkspace: getElementById("splitWorkspace"),
    splitPagesList: getElementById("splitPagesList"),
    splitGroupRowsList: getElementById("splitGroupRowsList"),
    splitOutputModeButtons: [...querySelectorAll("[data-split-output-mode]")],
    splitStartButton: getElementById("splitStartButton"),
    splitActivateAllButton: getElementById("splitActivateAllButton"),
    splitDeactivateAllButton: getElementById("splitDeactivateAllButton"),
    resultDialog: getElementById("resultDialog"),
    resultTitle: getElementById("resultTitle"),
    resultMessage: getElementById("resultMessage"),
    resultOpenButton: getElementById("resultOpenButton"),
    resultCloseButton: getElementById("resultCloseButton"),
    busyDialog: getElementById("busyDialog"),
    busyTitle: getElementById("busyTitle"),
    busyMessage: getElementById("busyMessage"),
  };

  let activeTool = TOOL_LAYOUT;
  let pendingPickerTarget = null;
  const mergeState = {
    files: [],
    pageCountByFile: new Map(),
    pageCountProbeToken: 0,
    dragIndex: null,
    dropIndex: null,
    dragSourceRow: null,
    dragPlaceholder: null,
    dragDropCommitted: false,
  };
  const layoutState = {
    file: null,
    pagesPerSheet: 2,
    specialThreeModeEnabled: false,
    specialThreeModeAvailable: false,
    specialModeProbeToken: 0,
  };
  const rotateState = {
    file: null,
    basePageRotations: [],
    documentRotation: 0,
    pageRotations: [],
    previewAnimationFrom: [],
    previewUrls: [],
    previewLoading: false,
    previewLoadError: "",
    previewSetupToken: 0,
    loadingPages: false,
    pageLoadError: "",
    pageSetupToken: 0,
  };
  const splitState = {
    file: null,
    pageCount: 0,
    pageLoadError: "",
    loadingPages: false,
    pageSetupToken: 0,
    previewUrls: [],
    previewLoading: false,
    previewLoadError: "",
    previewSetupToken: 0,
    activePages: new Set(),
    pageGroups: [],
    outputMode: "combined",
    groupRowValues: new Map(),
    draftGroupRow: { start: "", end: "" },
    draggedPageIndex: null,
    dragSettling: false,
    dragDropCommitted: false,
    dragPointerId: null,
    dragPointerOriginX: 0,
    dragPointerOriginY: 0,
    dragPointerActive: false,
    dragHoverPageIndex: null,
    dragPreviewX: 0,
    dragPreviewY: 0,
  };
  let pdfLibLoadPromise = null;
  let pdfJsLoadPromise = null;
  let pdfJsWorkerBlobUrl = null;
  let resultOpenUrl = null;
  let messageListener = null;
  let splitDragPreviewElement = null;
  const PDF_LIB_CDN_URL = "https://cdn.jsdelivr.net/npm/pdf-lib/dist/pdf-lib.min.js";
  const PDF_LIB_CACHE_KEY = "teachhelper.pdf-lib.min.js.v1";
  const PDF_JS_CDN_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
  const PDF_JS_WORKER_CDN_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  const PDF_JS_CACHE_KEY = "teachhelper.pdfjs.min.js.v1";
  const PDF_JS_WORKER_CACHE_KEY = "teachhelper.pdfjs.worker.min.js.v1";
  const MACOS_PERMISSION_HINT_MESSAGE = [
    "macOS blockiert manchmal den Zugriff auf Dateien.",
    "",
    "So behebst du das:",
    "",
    "1. Öffne die Systemeinstellungen",
    "2. Gehe zu „Datenschutz & Sicherheit“",
    "3. Öffne „Dateien & Ordner“",
    "4. Wähle deinen Browser (z. B. Safari, Chrome oder Firefox)",
    "5. Aktiviere Zugriff auf „Downloads“ (und ggf. „Dokumente“)",
    "6. Starte den Browser neu"
  ].join("\n");

  function applyTheme(theme) {
    setScopeAttribute("data-theme", theme === "light" ? "light" : "dark");
  }

  function applyShellLayout(detail) {
    const collapsed = Boolean(detail && typeof detail === "object" && detail.collapsed);
    setScopeAttribute("data-shell-collapsed", collapsed ? "true" : "false");
  }

  function initNumberStepper(input) {
    if (!input || input.dataset.stepperInit === "1") {
      return;
    }
    input.dataset.stepperInit = "1";

    const wrapper = document.createElement("span");
    wrapper.className = "number-stepper";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.append(input);

    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "number-stepper-btn minus";
    minus.textContent = "-";
    minus.setAttribute("tabindex", "-1");
    minus.setAttribute("aria-label", "Wert verringern");

    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "number-stepper-btn plus";
    plus.textContent = "+";
    plus.setAttribute("tabindex", "-1");
    plus.setAttribute("aria-label", "Wert erhöhen");

    wrapper.append(minus, plus);
    input._stepperMinus = minus;
    input._stepperPlus = plus;

    bindNumberStepperButton(input, minus, -1);
    bindNumberStepperButton(input, plus, 1);

    const sync = () => syncNumberStepperState(input);
    input.addEventListener("input", sync);
    input.addEventListener("change", sync);
    sync();
  }

  function bindNumberStepperButton(input, button, direction) {
    let holdTimeout = 0;
    let holdInterval = 0;
    const clearHold = () => {
      if (holdTimeout) {
        clearTimeout(holdTimeout);
        holdTimeout = 0;
      }
      if (holdInterval) {
        clearInterval(holdInterval);
        holdInterval = 0;
      }
    };
    const trigger = () => {
      stepNumberInput(input, direction);
    };

    button.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      trigger();
      clearHold();
      holdTimeout = window.setTimeout(() => {
        holdInterval = window.setInterval(trigger, 80);
      }, 320);
    });

    for (const eventName of ["pointerup", "pointercancel", "pointerleave", "blur"]) {
      button.addEventListener(eventName, clearHold);
    }
    window.addEventListener("pointerup", clearHold);
  }

  function stepNumberInput(input, direction) {
    if (!input || input.disabled || input.readOnly) {
      return;
    }
    const previous = String(input.value || "");
    try {
      if (direction < 0) {
        input.stepDown();
      } else {
        input.stepUp();
      }
    } catch (_error) {
      const base = Number.isFinite(Number(input.value))
        ? Number(input.value)
        : (input.min !== "" && Number.isFinite(Number(input.min)) ? Number(input.min) : 0);
      const step = input.step && input.step !== "any" && Number.isFinite(Number(input.step))
        ? Number(input.step)
        : 1;
      let next = base + (step * direction);
      if (input.min !== "" && Number.isFinite(Number(input.min))) {
        next = Math.max(Number(input.min), next);
      }
      if (input.max !== "" && Number.isFinite(Number(input.max))) {
        next = Math.min(Number(input.max), next);
      }
      input.value = String(next);
    }

    if (String(input.value || "") !== previous) {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    syncNumberStepperState(input);
  }

  function syncNumberStepperState(input) {
    if (!input || !input._stepperMinus || !input._stepperPlus) {
      return;
    }
    const disabled = Boolean(input.disabled || input.readOnly);
    let disableMinus = disabled;
    let disablePlus = disabled;

    const hasValue = String(input.value || "").trim() !== "";
    const value = Number(input.value);
    const min = Number(input.min);
    const max = Number(input.max);

    if (!disabled && hasValue && Number.isFinite(value)) {
      if (input.min !== "" && Number.isFinite(min) && value <= min) {
        disableMinus = true;
      }
      if (input.max !== "" && Number.isFinite(max) && value >= max) {
        disablePlus = true;
      }
    }

    input._stepperMinus.disabled = disableMinus;
    input._stepperPlus.disabled = disablePlus;
  }

  applyTheme(root?.documentElement?.dataset?.theme);
  applyShellLayout({ collapsed: false });
  initNumberStepper(ui.studentCount);
  hydrateRotateDocumentDegreeButtons();

  if (standalone && typeof window !== "undefined") {
    messageListener = (event) => {
      if (event.source !== window.parent) return;
      const data = event.data;
      if (!data || typeof data !== "object" || data.type !== MERGER_SHELL_LAYOUT_EVENT) return;
      const detail = data.detail && typeof data.detail === "object" ? data.detail : null;
      if (detail?.theme) {
        applyTheme(detail.theme);
      }
      applyShellLayout(detail);
    };
    window.addEventListener("message", messageListener);
  }

  function syncDialogUiState() {
    const resultOpen = ui.resultDialog.open || ui.resultDialog.hasAttribute("open") || !ui.resultDialog.classList.contains("hidden");
    const busyOpen = ui.busyDialog.open || ui.busyDialog.hasAttribute("open") || !ui.busyDialog.classList.contains("hidden");
    if (runtimeChrome) {
      runtimeChrome.classList.toggle("dialog-active", resultOpen || busyOpen);
    }
  }

          function isMacOS() {
            const platform = typeof navigator.platform === "string" ? navigator.platform.toLowerCase() : "";
            const userAgent = typeof navigator.userAgent === "string" ? navigator.userAgent.toLowerCase() : "";
            return platform.includes("mac") || userAgent.includes("macintosh") || userAgent.includes("mac os x");
          }

          function isIOS() {
            const platform = typeof navigator.platform === "string" ? navigator.platform : "";
            const userAgent = typeof navigator.userAgent === "string" ? navigator.userAgent : "";
            const touchPoints = typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : 0;
            return /iPad|iPhone|iPod/.test(platform)
              || /iPad|iPhone|iPod/.test(userAgent)
              || (platform === "MacIntel" && touchPoints > 1);
          }

          async function tryShareMergedPdfOnIOS(blob, outputName) {
            if (!isIOS()) return { handled: false };
            if (typeof navigator.share !== "function" || typeof File !== "function") {
              return { handled: false };
            }

            const pdfFile = new File([blob], outputName, { type: "application/pdf" });
            const shareData = { files: [pdfFile], title: outputName };

            if (typeof navigator.canShare === "function") {
              try {
                if (!navigator.canShare(shareData)) return { handled: false };
              } catch (error) {
                console.warn("iOS canShare-Pruefung fehlgeschlagen:", error);
                return { handled: false };
              }
            }

            try {
              await navigator.share(shareData);
              return { handled: true, status: "shared" };
            } catch (error) {
              if (error && error.name === "AbortError") {
                return { handled: true, status: "cancelled" };
              }
              console.warn("iOS-Teilen fehlgeschlagen, falle auf Download zurueck:", error);
              return { handled: false };
            }
          }

          function showMacOSPermissionHint() {
            if (!isMacOS()) return false;
            showResultDialog(MACOS_PERMISSION_HINT_MESSAGE, "warn", "Hinweis");
            return true;
          }

          function isFileAccessRestrictionError(error) {
            if (!error) return false;
            const name = String(error.name || "").toLowerCase();
            const message = String(error.message || "").toLowerCase();
            if (
              name === "notreadableerror" ||
              name === "securityerror" ||
              name === "notallowederror" ||
              name === "permissiondeniederror"
            ) {
              return true;
            }
            return /permission|zugriff|denied|not readable|operation not permitted|security/.test(message);
          }

          function maybeShowMacOSPermissionHint(error) {
            if (!isFileAccessRestrictionError(error)) return false;
            return showMacOSPermissionHint();
          }

          function showResultDialog(message, tone = "warn", title = "Hinweis", openUrl = null) {
            const hasTitle = Boolean(title && String(title).trim());
            ui.resultTitle.textContent = hasTitle ? title : "";
            ui.resultTitle.classList.toggle("hidden", !hasTitle);
            ui.resultMessage.textContent = message;
            resultOpenUrl = openUrl;
            ui.resultOpenButton.classList.toggle("hidden", !resultOpenUrl);
            ui.resultDialog.setAttribute("data-tone", tone);
            ui.resultDialog.classList.remove("hidden");
            if (typeof ui.resultDialog.showModal === "function") {
              if (!ui.resultDialog.open) ui.resultDialog.showModal();
            } else {
              ui.resultDialog.setAttribute("open", "");
            }
            syncDialogUiState();
          }

          function hideResultDialog() {
            resultOpenUrl = null;
            ui.resultOpenButton.classList.add("hidden");
            if (typeof ui.resultDialog.close === "function" && ui.resultDialog.open) {
              ui.resultDialog.close();
            } else {
              ui.resultDialog.removeAttribute("open");
            }
            ui.resultDialog.classList.add("hidden");
            syncDialogUiState();
          }

          function showBusyDialog(message, title = "Bitte warten") {
            ui.busyTitle.textContent = title;
            ui.busyMessage.textContent = message;
            ui.busyDialog.classList.remove("hidden");
            if (typeof ui.busyDialog.showModal === "function") {
              if (!ui.busyDialog.open) ui.busyDialog.showModal();
            } else {
              ui.busyDialog.setAttribute("open", "");
            }
            syncDialogUiState();
          }

          function hideBusyDialog() {
            if (typeof ui.busyDialog.close === "function" && ui.busyDialog.open) {
              ui.busyDialog.close();
            } else {
              ui.busyDialog.removeAttribute("open");
            }
            ui.busyDialog.classList.add("hidden");
            syncDialogUiState();
          }

          function hasPdfLibLoaded() {
            return Boolean(window.PDFLib && window.PDFLib.PDFDocument);
          }

          function cachePdfLibSource(source) {
            if (!source) return;
            try {
              window.localStorage?.setItem(PDF_LIB_CACHE_KEY, source);
            } catch (error) {
              console.warn("PDF-Library konnte nicht lokal zwischengespeichert werden.", error);
            }
          }

          function getCachedPdfLibSource() {
            try {
              return window.localStorage?.getItem(PDF_LIB_CACHE_KEY) || "";
            } catch (error) {
              console.warn("Lokaler PDF-Library-Cache konnte nicht gelesen werden.", error);
              return "";
            }
          }

          function cacheSource(key, source, label) {
            if (!source) return;
            try {
              window.localStorage?.setItem(key, source);
            } catch (error) {
              console.warn(`${label} konnte nicht lokal zwischengespeichert werden.`, error);
            }
          }

          function getCachedSource(key, label) {
            try {
              return window.localStorage?.getItem(key) || "";
            } catch (error) {
              console.warn(`${label} konnte nicht lokal gelesen werden.`, error);
              return "";
            }
          }

          function injectPdfLibSource(source) {
            if (!source) return false;
            const script = document.createElement("script");
            script.textContent = source;
            document.head.appendChild(script);
            script.remove();
            return hasPdfLibLoaded();
          }

          async function fetchPdfLibSource() {
            const response = await fetch(PDF_LIB_CDN_URL, { cache: "force-cache" });
            if (!response.ok) {
              throw new Error(`PDF-Library konnte nicht geladen werden (${response.status}).`);
            }
            return response.text();
          }

          async function ensurePdfLibLoaded() {
            if (hasPdfLibLoaded()) return;
            if (!pdfLibLoadPromise) {
              pdfLibLoadPromise = (async () => {
                const cachedSource = getCachedPdfLibSource();
                if (cachedSource) {
                  const loadedFromCache = injectPdfLibSource(cachedSource);
                  if (loadedFromCache) return;
                  try {
                    window.localStorage?.removeItem(PDF_LIB_CACHE_KEY);
                  } catch (error) {
                    console.warn("Defekter PDF-Library-Cache konnte nicht entfernt werden.", error);
                  }
                }

                const source = await fetchPdfLibSource();
                const loaded = injectPdfLibSource(source);
                if (!loaded) {
                  throw new Error("PDF-Library wurde geladen, ist aber unvollstaendig.");
                }
                cachePdfLibSource(source);
              })().catch((error) => {
                pdfLibLoadPromise = null;
                throw error;
              });
            }
            return pdfLibLoadPromise;
          }

          function hasPdfJsLoaded() {
            return Boolean(window.pdfjsLib && typeof window.pdfjsLib.getDocument === "function");
          }

          function injectScriptSource(source) {
            if (!source) return false;
            const script = document.createElement("script");
            script.textContent = source;
            document.head.appendChild(script);
            script.remove();
            return true;
          }

          async function fetchTextSource(url, label) {
            const response = await fetch(url, { cache: "force-cache" });
            if (!response.ok) {
              throw new Error(`${label} konnte nicht geladen werden (${response.status}).`);
            }
            return response.text();
          }

          function configurePdfJsWorker(workerSource) {
            if (!(window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions)) return;
            if (pdfJsWorkerBlobUrl) {
              URL.revokeObjectURL(pdfJsWorkerBlobUrl);
              pdfJsWorkerBlobUrl = null;
            }
            pdfJsWorkerBlobUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfJsWorkerBlobUrl;
          }

          async function ensurePdfJsLoaded() {
            if (hasPdfJsLoaded()) return window.pdfjsLib;
            if (!pdfJsLoadPromise) {
              pdfJsLoadPromise = (async () => {
                let source = getCachedSource(PDF_JS_CACHE_KEY, "PDF-Vorschau-Library");
                let workerSource = getCachedSource(PDF_JS_WORKER_CACHE_KEY, "PDF-Vorschau-Worker");

                if (source) {
                  injectScriptSource(source);
                }

                if (!hasPdfJsLoaded()) {
                  source = await fetchTextSource(PDF_JS_CDN_URL, "PDF-Vorschau-Library");
                  injectScriptSource(source);
                  if (!hasPdfJsLoaded()) {
                    throw new Error("PDF-Vorschau-Library wurde geladen, ist aber unvollständig.");
                  }
                  cacheSource(PDF_JS_CACHE_KEY, source, "PDF-Vorschau-Library");
                }

                if (!workerSource) {
                  workerSource = await fetchTextSource(PDF_JS_WORKER_CDN_URL, "PDF-Vorschau-Worker");
                  cacheSource(PDF_JS_WORKER_CACHE_KEY, workerSource, "PDF-Vorschau-Worker");
                }

                configurePdfJsWorker(workerSource);
                return window.pdfjsLib;
              })().catch((error) => {
                pdfJsLoadPromise = null;
                throw error;
              });
            }
            return pdfJsLoadPromise;
          }

          function fmtNumber(n) {
            if (Math.abs(n) < 1e-10) n = 0;
            const fixed = Number(n).toFixed(4);
            return fixed.replace(/\.?0+$/, "");
          }

          function gcd(a, b) {
            a = Math.abs(a);
            b = Math.abs(b);
            while (b) {
              const t = b;
              b = a % b;
              a = t;
            }
            return a;
          }

          function lcm(a, b) {
            if (!a || !b) return 0;
            return Math.abs(a * b) / gcd(a, b);
          }

          function buildPaddedIndices(pageCount, groupSize) {
            const indices = [];
            for (let i = 0; i < pageCount; i += 1) indices.push(i);
            const remainder = pageCount % groupSize;
            if (remainder) {
              const needed = groupSize - remainder;
              for (let i = 0; i < needed; i += 1) {
                indices.push(indices[i % pageCount]);
              }
            }
            return indices;
          }

          function buildBlankIndices(pageCount, groupSize) {
            const indices = [];
            for (let i = 0; i < pageCount; i += 1) indices.push(i);
            const remainder = pageCount % groupSize;
            if (remainder) {
              const needed = groupSize - remainder;
              for (let i = 0; i < needed; i += 1) indices.push(null);
            }
            return indices;
          }

          function buildLcmIndices(pageCount, groupSize) {
            if (pageCount <= 0 || groupSize <= 0) return [];
            const total = lcm(pageCount, groupSize);
            if (pageCount <= groupSize) {
              const sheetCount = total / groupSize;
              const extraSlots = groupSize - pageCount;
              const indices = [];
              let extraIndex = 0;
              for (let sheet = 0; sheet < sheetCount; sheet += 1) {
                for (let i = 0; i < pageCount; i += 1) indices.push(i);
                for (let i = 0; i < extraSlots; i += 1) {
                  indices.push(extraIndex);
                  extraIndex = (extraIndex + 1) % pageCount;
                }
              }
              return indices;
            }
            return Array.from({ length: total }, (_, i) => i % pageCount);
          }

          function buildTwoUpPairs(pageCount, enableThreePageSpecialMode, studentCount) {
            if (pageCount <= 0) return [];
            if (enableThreePageSpecialMode && pageCount === 3) {
              return [[0, 0], [1, 2], [1, 2]];
            }

            const pairs = [];
            if (studentCount === 1) {
              for (let i = 0; i < pageCount; i += 2) {
                pairs.push([i, i + 1 < pageCount ? i + 1 : null]);
              }
              return pairs;
            }

            if (pageCount % 2 === 0) {
              for (let i = 0; i < pageCount; i += 2) pairs.push([i, i + 1]);
            } else {
              for (let i = 0; i < pageCount; i += 1) pairs.push([i, i]);
            }
            return pairs;
          }

          function buildSpecialThreeModePairs(paddingMode, studentCount) {
            // Standard-Spezialmodus: 1|1 + 2|3 + 2|3
            if (paddingMode !== "lcm") {
              return [[0, 0], [1, 2], [1, 2]];
            }

            // LCM-Spezialmodus:
            // ceil(n/2) mal 1|1 und n mal 2|3
            const n = Number.isInteger(studentCount) && studentCount > 0 ? studentCount : 0;
            const pairs = [];
            const oneOneCount = Math.ceil(n / 2);
            for (let i = 0; i < oneOneCount; i += 1) pairs.push([0, 0]);
            for (let i = 0; i < n; i += 1) pairs.push([1, 2]);
            return pairs;
          }

          function bytesToBinaryString(bytes) {
            const chunk = 0x8000;
            let out = "";
            for (let i = 0; i < bytes.length; i += chunk) {
              out += String.fromCharCode(...bytes.subarray(i, i + chunk));
            }
            return out;
          }

          function binaryStringToBytes(str) {
            const out = new Uint8Array(str.length);
            for (let i = 0; i < str.length; i += 1) out[i] = str.charCodeAt(i) & 0xFF;
            return out;
          }

          function asciiBytes(str) {
            const out = new Uint8Array(str.length);
            for (let i = 0; i < str.length; i += 1) out[i] = str.charCodeAt(i) & 0xFF;
            return out;
          }

          function joinUint8(parts) {
            const total = parts.reduce((sum, part) => sum + part.length, 0);
            const out = new Uint8Array(total);
            let offset = 0;
            for (const part of parts) {
              out.set(part, offset);
              offset += part.length;
            }
            return out;
          }

          function skipWhitespaceAndComments(text, start) {
            let i = start;
            while (i < text.length) {
              const ch = text[i];
              if (/\s/.test(ch)) {
                i += 1;
                continue;
              }
              if (ch === "%") {
                while (i < text.length && text[i] !== "\n" && text[i] !== "\r") i += 1;
                continue;
              }
              break;
            }
            return i;
          }

          function isDelimiter(ch) {
            return !ch || /[\s<>\[\]\(\)\/%]/.test(ch);
          }

          function isNumberToken(token) {
            return /^[+-]?(?:\d+|\d*\.\d+)$/.test(token);
          }

          function scanLiteralString(text, start) {
            let depth = 0;
            let escaped = false;
            let i = start;
            while (i < text.length) {
              const ch = text[i];
              if (escaped) {
                escaped = false;
              } else if (ch === "\\") {
                escaped = true;
              } else if (ch === "(") {
                depth += 1;
              } else if (ch === ")") {
                depth -= 1;
                if (depth === 0) return i + 1;
              }
              i += 1;
            }
            return text.length;
          }

          function scanComposite(text, start, openA, closeA, openB = null, closeB = null) {
            let depthA = 0;
            let depthB = 0;
            let i = start;
            while (i < text.length) {
              const duo = text.slice(i, i + 2);
              const ch = text[i];
              if (ch === "(") {
                i = scanLiteralString(text, i);
                continue;
              }
              if (duo === openA) {
                depthA += 1;
                i += openA.length;
                continue;
              }
              if (duo === closeA) {
                depthA -= 1;
                i += closeA.length;
                if (depthA === 0 && depthB === 0) return i;
                continue;
              }
              if (openB && duo === openB) {
                depthB += 1;
                i += openB.length;
                continue;
              }
              if (closeB && duo === closeB) {
                depthB -= 1;
                i += closeB.length;
                continue;
              }
              if (ch === "[" && openA !== "[") {
                i = scanArray(text, i);
                continue;
              }
              i += 1;
            }
            return text.length;
          }

          function scanArray(text, start) {
            let depth = 0;
            let i = start;
            while (i < text.length) {
              const duo = text.slice(i, i + 2);
              const ch = text[i];
              if (ch === "(") {
                i = scanLiteralString(text, i);
                continue;
              }
              if (duo === "<<") {
                i = scanDictionary(text, i);
                continue;
              }
              if (ch === "[") {
                depth += 1;
              } else if (ch === "]") {
                depth -= 1;
                if (depth === 0) return i + 1;
              }
              i += 1;
            }
            return text.length;
          }

          function scanDictionary(text, start) {
            let depth = 0;
            let i = start;
            while (i < text.length) {
              const duo = text.slice(i, i + 2);
              const ch = text[i];
              if (ch === "(") {
                i = scanLiteralString(text, i);
                continue;
              }
              if (duo === "<<") {
                depth += 1;
                i += 2;
                continue;
              }
              if (duo === ">>") {
                depth -= 1;
                i += 2;
                if (depth === 0) return i;
                continue;
              }
              if (ch === "[") {
                i = scanArray(text, i);
                continue;
              }
              i += 1;
            }
            return text.length;
          }

          function readPdfValue(text, start) {
            let i = skipWhitespaceAndComments(text, start);
            if (i >= text.length) return null;
            const ch = text[i];
            const duo = text.slice(i, i + 2);

            if (duo === "<<") {
              const end = scanDictionary(text, i);
              return { text: text.slice(i, end), end };
            }
            if (ch === "[") {
              const end = scanArray(text, i);
              return { text: text.slice(i, end), end };
            }
            if (ch === "(") {
              const end = scanLiteralString(text, i);
              return { text: text.slice(i, end), end };
            }
            if (ch === "<") {
              let end = i + 1;
              while (end < text.length && text[end] !== ">") end += 1;
              end = Math.min(end + 1, text.length);
              return { text: text.slice(i, end), end };
            }
            if (ch === "/") {
              let end = i + 1;
              while (end < text.length && !isDelimiter(text[end])) end += 1;
              return { text: text.slice(i, end), end };
            }

            let end1 = i;
            while (end1 < text.length && !isDelimiter(text[end1])) end1 += 1;
            const token1 = text.slice(i, end1);

            let j = skipWhitespaceAndComments(text, end1);
            let end2 = j;
            while (end2 < text.length && !isDelimiter(text[end2])) end2 += 1;
            const token2 = text.slice(j, end2);

            let k = skipWhitespaceAndComments(text, end2);
            if (isNumberToken(token1) && isNumberToken(token2) && text[k] === "R" && isDelimiter(text[k + 1])) {
              return { text: text.slice(i, k + 1), end: k + 1 };
            }

            return { text: token1, end: end1 };
          }

          function parseTopLevelDict(dictText) {
            const start = dictText.indexOf("<<");
            if (start === -1) return null;
            const end = scanDictionary(dictText, start);
            if (!end) return null;
            const inner = dictText.slice(start + 2, end - 2);
            const out = new Map();
            let i = 0;

            while (i < inner.length) {
              i = skipWhitespaceAndComments(inner, i);
              if (i >= inner.length) break;
              if (inner[i] !== "/") {
                i += 1;
                continue;
              }
              let nameEnd = i + 1;
              while (nameEnd < inner.length && !isDelimiter(inner[nameEnd])) nameEnd += 1;
              const key = inner.slice(i + 1, nameEnd);
              const value = readPdfValue(inner, nameEnd);
              if (!value) break;
              out.set(key, value.text.trim());
              i = value.end;
            }

            return out;
          }

          function extractRef(valueText) {
            if (!valueText) return null;
            const match = valueText.trim().match(/^(\d+)\s+(\d+)\s+R$/);
            if (!match) return null;
            return { num: Number(match[1]), gen: Number(match[2]) };
          }

          function extractRefs(valueText) {
            const refs = [];
            if (!valueText) return refs;
            const re = /(\d+)\s+(\d+)\s+R/g;
            let match;
            while ((match = re.exec(valueText)) !== null) {
              refs.push({ num: Number(match[1]), gen: Number(match[2]) });
            }
            return refs;
          }

          function parseNumberArray(valueText) {
            if (!valueText) return null;
            const nums = valueText.match(/[+-]?(?:\d+|\d*\.\d+)/g);
            if (!nums) return null;
            return nums.map(Number);
          }

          function matrixMultiply(m1, m2) {
            const [a1, b1, c1, d1, e1, f1] = m1;
            const [a2, b2, c2, d2, e2, f2] = m2;
            return [
              a1 * a2 + c1 * b2,
              b1 * a2 + d1 * b2,
              a1 * c2 + c1 * d2,
              b1 * c2 + d1 * d2,
              a1 * e2 + c1 * f2 + e1,
              b1 * e2 + d1 * f2 + f1
            ];
          }

          function matrixToPdf(m) {
            return m.map(fmtNumber).join(" ");
          }

          class SimplePdfDocument {
            constructor(bytes) {
              this.bytes = bytes;
              this.binary = bytesToBinaryString(bytes);
              this.objects = new Map();
              this.pages = [];
              this._parseObjects();
              this._collectPages();
            }

            _parseObjects() {
              if (this.binary.includes("/Encrypt")) {
                throw new Error("Verschlüsselte oder passwortgeschützte PDFs werden nicht unterstützt.");
              }

              const re = /^(\d+)\s+(\d+)\s+obj\b/gm;
              const starts = [];
              let match;
              while ((match = re.exec(this.binary)) !== null) {
                starts.push({
                  index: match.index,
                  bodyStart: re.lastIndex,
                  num: Number(match[1]),
                  gen: Number(match[2])
                });
              }

              for (let i = 0; i < starts.length; i += 1) {
                const cur = starts[i];
                const end = (i + 1 < starts.length) ? starts[i + 1].index : this.binary.length;
                let body = this.binary.slice(cur.bodyStart, end);
                const endObjPos = body.lastIndexOf("endobj");
                if (endObjPos !== -1) body = body.slice(0, endObjPos);
                body = body.trim();

                const streamPos = body.indexOf("stream");
                let obj;
                if (streamPos !== -1) {
                  const dictEnd = body.lastIndexOf(">>", streamPos);
                  const between = dictEnd !== -1 ? body.slice(dictEnd + 2, streamPos) : "";
                  if (dictEnd !== -1 && /^[\s]*$/.test(between)) {
                    let dataStart = streamPos + "stream".length;
                    if (body[dataStart] === "\r" && body[dataStart + 1] === "\n") dataStart += 2;
                    else if (body[dataStart] === "\r" || body[dataStart] === "\n") dataStart += 1;

                    const endStreamPos = body.lastIndexOf("endstream");
                    const dataEnd = endStreamPos !== -1 ? endStreamPos : body.length;
                    const dictText = body.slice(0, dictEnd + 2).trim();
                    const streamChunk = body.slice(dataStart, dataEnd);

                    obj = {
                      num: cur.num,
                      gen: cur.gen,
                      isStream: true,
                      dictText,
                      streamBytes: binaryStringToBytes(streamChunk),
                      parsedDict: null
                    };
                  } else {
                    obj = {
                      num: cur.num,
                      gen: cur.gen,
                      isStream: false,
                      bodyText: body,
                      parsedDict: null
                    };
                  }
                } else {
                  obj = {
                    num: cur.num,
                    gen: cur.gen,
                    isStream: false,
                    bodyText: body,
                    parsedDict: null
                  };
                }

                this.objects.set(cur.num, obj);
              }
            }

            _dictOf(obj) {
              if (!obj) return null;
              if (obj.parsedDict) return obj.parsedDict;
              const text = obj.isStream ? obj.dictText : obj.bodyText;
              obj.parsedDict = parseTopLevelDict(text);
              return obj.parsedDict;
            }

            _objectText(obj) {
              return obj ? (obj.isStream ? obj.dictText : obj.bodyText) : "";
            }

            getObject(num) {
              return this.objects.get(num) || null;
            }

            getDict(num) {
              const obj = this.getObject(num);
              return this._dictOf(obj);
            }

            _valueFromDict(num, key) {
              const dict = this.getDict(num);
              return dict ? dict.get(key) || null : null;
            }

            _collectPages() {
              const catalogNum = this._findCatalog();
              if (catalogNum) {
                const pagesRef = extractRef(this._valueFromDict(catalogNum, "Pages"));
                if (pagesRef) {
                  const ordered = [];
                  const seen = new Set();
                  const walk = (num) => {
                    if (seen.has(num)) return;
                    seen.add(num);
                    const dict = this.getDict(num);
                    if (!dict) return;
                    const type = dict.get("Type") || "";
                    if (/^\/Page\b/.test(type) && !/^\/Pages\b/.test(type)) {
                      ordered.push(num);
                      return;
                    }
                    const kids = extractRefs(dict.get("Kids") || "");
                    for (const kid of kids) walk(kid.num);
                  };
                  walk(pagesRef.num);
                  if (ordered.length) {
                    this.pages = ordered;
                    return;
                  }
                }
              }

              const fallback = [];
              for (const [num, obj] of this.objects) {
                const text = this._objectText(obj);
                if (/\/Type\s*\/Page\b/.test(text) && !/\/Type\s*\/Pages\b/.test(text)) {
                  fallback.push(num);
                }
              }
              fallback.sort((a, b) => a - b);
              this.pages = fallback;
            }

            _findCatalog() {
              for (const [num, obj] of this.objects) {
                const text = this._objectText(obj);
                if (/\/Type\s*\/Catalog\b/.test(text)) return num;
              }
              return null;
            }

            _resolveInheritedValue(pageNum, key) {
              const seen = new Set();
              let cur = pageNum;
              while (cur && !seen.has(cur)) {
                seen.add(cur);
                const value = this._valueFromDict(cur, key);
                if (value) return value;
                const parentRef = extractRef(this._valueFromDict(cur, "Parent"));
                cur = parentRef ? parentRef.num : 0;
              }
              return null;
            }

            _resolveArrayOrIndirect(valueText) {
              if (!valueText) return null;
              const ref = extractRef(valueText);
              if (ref) {
                const obj = this.getObject(ref.num);
                if (!obj || obj.isStream) return null;
                return parseNumberArray(obj.bodyText);
              }
              return parseNumberArray(valueText);
            }

            getPageCount() {
              return this.pages.length;
            }

            getPageInfo(index) {
              const pageNum = this.pages[index];
              if (!pageNum) throw new Error("Seite nicht gefunden.");

              const mediaBoxValue = this._resolveInheritedValue(pageNum, "MediaBox");
              const mediaBox = this._resolveArrayOrIndirect(mediaBoxValue);
              if (!mediaBox || mediaBox.length < 4) {
                throw new Error("MediaBox konnte nicht gelesen werden.");
              }

              const cropBoxValue = this._resolveInheritedValue(pageNum, "CropBox");
              const cropBox = this._resolveArrayOrIndirect(cropBoxValue);
              const viewBox = cropBox && cropBox.length >= 4 ? cropBox : mediaBox;

              const [llx, lly, urx, ury] = viewBox;
              const width = Math.abs(urx - llx);
              const height = Math.abs(ury - lly);

              const resourcesValue = this._resolveInheritedValue(pageNum, "Resources");
              const rotateValue = this._resolveInheritedValue(pageNum, "Rotate");
              const rotateNum = rotateValue ? ((parseInt(rotateValue, 10) % 360) + 360) % 360 : 0;
              const contentsValue = this._valueFromDict(pageNum, "Contents");

              let contentRefs = [];
              const directContentRef = extractRef(contentsValue || "");
              if (directContentRef) {
                const contentsObj = this.getObject(directContentRef.num);
                if (contentsObj && !contentsObj.isStream && /^\s*\[/.test(contentsObj.bodyText || "")) {
                  contentRefs = extractRefs(contentsObj.bodyText);
                } else {
                  contentRefs = [directContentRef];
                }
              } else if (contentsValue && contentsValue.trim().startsWith("[")) {
                contentRefs = extractRefs(contentsValue);
              }

              return {
                pageNum,
                mediaBox: mediaBox.slice(0, 4),
                viewBox: [llx, lly, urx, ury],
                width,
                height,
                rotate: rotateNum,
                resourcesValue,
                contentRefs
              };
            }

            isA4Document() {
              for (let i = 0; i < this.getPageCount(); i += 1) {
                const { width, height } = this.getPageInfo(i);
                const portrait = Math.abs(width - A4_WIDTH) <= A4_TOLERANCE && Math.abs(height - A4_HEIGHT) <= A4_TOLERANCE;
                const landscape = Math.abs(width - A4_HEIGHT) <= A4_TOLERANCE && Math.abs(height - A4_WIDTH) <= A4_TOLERANCE;
                if (!portrait && !landscape) return false;
              }
              return true;
            }
          }

          class PdfWriterLite {
            constructor() {
              this.objects = [null];
            }

            reserveObject() {
              this.objects.push({ kind: "placeholder" });
              return this.objects.length - 1;
            }

            addObject(text) {
              const num = this.reserveObject();
              this.setObject(num, { kind: "plain", text });
              return num;
            }

            addStreamObject(dictText, streamBytes) {
              const num = this.reserveObject();
              this.setObject(num, { kind: "stream", dictText, streamBytes });
              return num;
            }

            setObject(num, obj) {
              this.objects[num] = obj;
            }

            _withLength(dictText, byteLength) {
              const cleaned = dictText.trim();
              if (!cleaned.startsWith("<<") || !cleaned.endsWith(">>")) {
                throw new Error("Ungültiges Stream-Dictionary.");
              }
              return cleaned.slice(0, -2).trimEnd() + " /Length " + byteLength + " >>";
            }

            toBytes(rootNum) {
              const parts = [];
              const offsets = [0];

              const header = asciiBytes("%PDF-1.7\n%\xFF\xFF\xFF\xFF\n");
              parts.push(header);
              let offset = header.length;

              for (let i = 1; i < this.objects.length; i += 1) {
                offsets[i] = offset;
                const obj = this.objects[i];
                const prefix = asciiBytes(i + " 0 obj\n");
                parts.push(prefix);
                offset += prefix.length;

                if (!obj || obj.kind === "placeholder") {
                  const body = asciiBytes("null\n");
                  parts.push(body);
                  offset += body.length;
                } else if (obj.kind === "plain") {
                  const body = asciiBytes(String(obj.text).trim() + "\n");
                  parts.push(body);
                  offset += body.length;
                } else if (obj.kind === "stream") {
                  const dict = asciiBytes(this._withLength(obj.dictText, obj.streamBytes.length) + "\nstream\n");
                  const suffix = asciiBytes("\nendstream\n");
                  parts.push(dict, obj.streamBytes, suffix);
                  offset += dict.length + obj.streamBytes.length + suffix.length;
                } else {
                  throw new Error("Unbekannter Objekttyp.");
                }

                const endObj = asciiBytes("endobj\n");
                parts.push(endObj);
                offset += endObj.length;
              }

              const xrefOffset = offset;
              const xrefLines = ["xref", "0 " + this.objects.length, "0000000000 65535 f "];
              for (let i = 1; i < this.objects.length; i += 1) {
                xrefLines.push(String(offsets[i]).padStart(10, "0") + " 00000 n ");
              }
              const xref = asciiBytes(xrefLines.join("\n") + "\n");
              parts.push(xref);
              offset += xref.length;

              const trailer =
                "trailer\n<< /Size " + this.objects.length + " /Root " + rootNum + " 0 R >>\n" +
                "startxref\n" + xrefOffset + "\n%%EOF";
              const trailerBytes = asciiBytes(trailer);
              parts.push(trailerBytes);

              return joinUint8(parts);
            }
          }

          class OfflineImposer {
            constructor(sourceDoc) {
              this.source = sourceDoc;
              this.writer = new PdfWriterLite();
              this.imported = new Map();
              this.formCache = new Map();
              this.directResourceCache = new Map();
            }

            _replaceRefsInText(text) {
              if (!text) return text;
              return text.replace(/(\d+)\s+(\d+)\s+R/g, (_, a) => {
                const mapped = this._ensureImportedObject(Number(a));
                return mapped + " 0 R";
              });
            }

            _ensureImportedObject(sourceNum) {
              if (this.imported.has(sourceNum)) return this.imported.get(sourceNum);
              const sourceObj = this.source.getObject(sourceNum);
              if (!sourceObj) {
                throw new Error("Die PDF verweist auf komprimierte oder fehlende Objekte. Solche Objekt-Streams werden in dieser Offline-Version nicht unterstützt.");
              }

              const newNum = this.writer.reserveObject();
              this.imported.set(sourceNum, newNum);

              if (sourceObj.isStream) {
                const remappedDict = this._replaceRefsInText(sourceObj.dictText);
                this.writer.setObject(newNum, {
                  kind: "stream",
                  dictText: remappedDict,
                  streamBytes: sourceObj.streamBytes
                });
              } else {
                const remappedText = this._replaceRefsInText(sourceObj.bodyText);
                this.writer.setObject(newNum, {
                  kind: "plain",
                  text: remappedText
                });
              }

              return newNum;
            }

            _resourceRefForPage(pageInfo) {
              const raw = pageInfo.resourcesValue;
              if (!raw) return this.writer.addObject("<< >>");

              const ref = extractRef(raw);
              if (ref) return this._ensureImportedObject(ref.num);

              if (this.directResourceCache.has(raw)) {
                return this.directResourceCache.get(raw);
              }

              const newNum = this.writer.addObject(this._replaceRefsInText(raw));
              this.directResourceCache.set(raw, newNum);
              return newNum;
            }

            _pickStreamSettings(streamObj) {
              const dict = parseTopLevelDict(streamObj.dictText);
              if (!dict) return "";
              const parts = [];
              const filter = dict.get("Filter");
              const decodeParms = dict.get("DecodeParms");
              if (filter) parts.push("/Filter " + this._replaceRefsInText(filter));
              if (decodeParms) parts.push("/DecodeParms " + this._replaceRefsInText(decodeParms));
              return parts.length ? " " + parts.join(" ") : "";
            }

            _formObjectsForPage(pageInfo) {
              const key = [
                pageInfo.pageNum,
                pageInfo.viewBox.join(","),
                pageInfo.rotate
              ].join("|");

              if (this.formCache.has(key)) return this.formCache.get(key);

              const resRef = this._resourceRefForPage(pageInfo);
              const [llx, lly, urx, ury] = pageInfo.viewBox;
              const bbox = `[${fmtNumber(llx)} ${fmtNumber(lly)} ${fmtNumber(urx)} ${fmtNumber(ury)}]`;
              const formRefs = [];

              if (!pageInfo.contentRefs.length) {
                throw new Error("Die Seiteninhalte konnten nicht gelesen werden (fehlender /Contents-Eintrag).");
              }

              for (const ref of pageInfo.contentRefs) {
                const streamObj = this.source.getObject(ref.num);
                if (!streamObj || !streamObj.isStream) {
                  throw new Error("Die Seiteninhalte konnten nicht gelesen werden.");
                }
                const extra = this._pickStreamSettings(streamObj);
                const dictText = `<< /Type /XObject /Subtype /Form /FormType 1 /BBox ${bbox} /Resources ${resRef} 0 R${extra} >>`;
                const formNum = this.writer.addStreamObject(dictText, streamObj.streamBytes);
                formRefs.push(formNum);
              }

              this.formCache.set(key, formRefs);
              return formRefs;
            }

            _rotationMatrix(rotation, width, height) {
              const rot = ((rotation % 360) + 360) % 360;
              if (rot === 90) return [0, -1, 1, 0, 0, width];
              if (rot === 180) return [-1, 0, 0, -1, width, height];
              if (rot === 270) return [0, 1, -1, 0, height, 0];
              return [1, 0, 0, 1, 0, 0];
            }

            _effectivePageSize(pageInfo) {
              const rotated = pageInfo.rotate === 90 || pageInfo.rotate === 270;
              return rotated
                ? { width: pageInfo.height, height: pageInfo.width }
                : { width: pageInfo.width, height: pageInfo.height };
            }

            _computeDisplayRotationForPlacements(placements, autoOrientationEnabled) {
              const rotations = [];
              for (const slot of placements) {
                if (!slot || !slot.pageInfo) continue;
                const effective = this._effectivePageSize(slot.pageInfo);
                const fit = chooseBestSlotOrientation(
                  effective.width,
                  effective.height,
                  slot.w,
                  slot.h,
                  autoOrientationEnabled
                );
                rotations.push(fit.rotate90 ? 90 : 0);
              }
              if (!rotations.length) return null;
              return rotations.every((value) => value === rotations[0]) ? rotations[0] : null;
            }

            _placementMatrix(pageInfo, xOffset, yOffset, cellWidth, cellHeight, autoOrientationEnabled) {
              const [llx, lly] = pageInfo.viewBox;
              const t0 = [1, 0, 0, 1, -llx, -lly];
              const rot = this._rotationMatrix(pageInfo.rotate, pageInfo.width, pageInfo.height);
              const effective = this._effectivePageSize(pageInfo);
              const fit = chooseBestSlotOrientation(
                effective.width,
                effective.height,
                cellWidth,
                cellHeight,
                autoOrientationEnabled
              );

              let baseMatrix = matrixMultiply(rot, t0);
              if (fit.rotate90) {
                const autoRotate = this._rotationMatrix(90, effective.width, effective.height);
                baseMatrix = matrixMultiply(autoRotate, baseMatrix);
              }

              const drawnWidth = fit.orientedWidth * fit.scale;
              const drawnHeight = fit.orientedHeight * fit.scale;
              const tx = xOffset + (cellWidth - drawnWidth) / 2;
              const ty = yOffset + (cellHeight - drawnHeight) / 2;
              const st = [fit.scale, 0, 0, fit.scale, tx, ty];

              return matrixMultiply(st, baseMatrix);
            }

            _buildContentCommands(placements, autoOrientationEnabled) {
              const lines = [];
              for (const item of placements) {
                if (!item) continue;
                const matrix = this._placementMatrix(item.pageInfo, item.x, item.y, item.w, item.h, autoOrientationEnabled);
                lines.push("q");
                lines.push(matrixToPdf(matrix) + " cm");
                for (const name of item.names) {
                  lines.push("/" + name + " Do");
                }
                lines.push("Q");
              }
              return lines.join("\n") + "\n";
            }

            _buildOutputPdf(layout, autoOrientationEnabled) {
              const pagesRootNum = this.writer.reserveObject();
              const pageObjectNums = [];

              for (const outputPage of layout.pages) {
                const xObjectEntries = [];
                let xObjectIndex = 1;
                const placements = outputPage.placements.map((slot) => {
                  if (!slot || !slot.pageInfo) return null;
                  const formNums = this._formObjectsForPage(slot.pageInfo);
                  const names = formNums.map((formNum) => {
                    const name = "F" + xObjectIndex;
                    xObjectIndex += 1;
                    xObjectEntries.push("/" + name + " " + formNum + " 0 R");
                    return name;
                  });
                  return {
                    pageInfo: slot.pageInfo,
                    x: slot.x,
                    y: slot.y,
                    w: slot.w,
                    h: slot.h,
                    names
                  };
                });

                const resourcesRef = this.writer.addObject(
                  xObjectEntries.length
                    ? `<< /XObject << ${xObjectEntries.join(" ")} >> >>`
                    : "<< >>"
                );

                const contentBytes = asciiBytes(this._buildContentCommands(placements, autoOrientationEnabled));
                const contentRef = this.writer.addStreamObject("<< >>", contentBytes);
                const rotatePart = outputPage.displayRotation == null ? "" : ` /Rotate ${outputPage.displayRotation}`;

                const pageRef = this.writer.addObject(
                  `<< /Type /Page /Parent ${pagesRootNum} 0 R /MediaBox [0 0 ${fmtNumber(outputPage.width)} ${fmtNumber(outputPage.height)}]${rotatePart} /Resources ${resourcesRef} 0 R /Contents ${contentRef} 0 R >>`
                );
                pageObjectNums.push(pageRef);
              }

              this.writer.setObject(
                pagesRootNum,
                {
                  kind: "plain",
                  text: `<< /Type /Pages /Count ${pageObjectNums.length} /Kids [${pageObjectNums.map((n) => `${n} 0 R`).join(" ")}] >>`
                }
              );

              const catalogNum = this.writer.addObject(`<< /Type /Catalog /Pages ${pagesRootNum} 0 R >>`);
              return this.writer.toBytes(catalogNum);
            }

            impose(pagesPerSheet, paddingMode, enableThreePageSpecialMode, studentCount, autoOrientationEnabled) {
              const pageCount = this.source.getPageCount();
              if (!pageCount) throw new Error("Die PDF enthält keine Seiten.");
              if (enableThreePageSpecialMode && pageCount !== 3) {
                throw new Error("Spezialmodus ist nur mit 3-seitiger PDF möglich.");
              }

              const isA4 = this.source.isA4Document();
              const pageInfos = Array.from({ length: pageCount }, (_, i) => this.source.getPageInfo(i));
              const layout = { pages: [] };

              if (enableThreePageSpecialMode || pagesPerSheet === 2) {
                const pairs = enableThreePageSpecialMode
                  ? buildSpecialThreeModePairs(paddingMode, studentCount)
                  : buildTwoUpPairs(pageCount, false, studentCount);

                for (const [leftIndex, rightIndex] of pairs) {
                  const leftPage = pageInfos[leftIndex];
                  const rightPage = rightIndex == null ? null : pageInfos[rightIndex];

                  let outWidth, outHeight, halfWidth;
                  if (isA4) {
                    halfWidth = A4_WIDTH;
                    outHeight = A4_HEIGHT;
                    outWidth = A4_WIDTH * 2;
                  } else {
                    halfWidth = Math.max(leftPage.width, rightPage?.width || leftPage.width);
                    outHeight = Math.max(leftPage.height, rightPage?.height || leftPage.height);
                    outWidth = halfWidth * 2;
                    if (outWidth < outHeight) {
                      outWidth = outHeight;
                      halfWidth = outWidth / 2;
                    }
                  }

                  const placements = [
                    { pageInfo: leftPage, x: 0, y: 0, w: halfWidth, h: outHeight },
                    { pageInfo: rightPage, x: halfWidth, y: 0, w: halfWidth, h: outHeight }
                  ];
                  const displayRotation = this._computeDisplayRotationForPlacements(placements, autoOrientationEnabled);

                  layout.pages.push({
                    width: outWidth,
                    height: outHeight,
                    placements,
                    displayRotation
                  });
                }
              } else if ([4, 6, 8].includes(pagesPerSheet)) {
                let indices;
                if (paddingMode === "blank") indices = buildBlankIndices(pageCount, pagesPerSheet);
                else if (paddingMode === "lcm") indices = buildLcmIndices(pageCount, pagesPerSheet);
                else indices = buildPaddedIndices(pageCount, pagesPerSheet);

                const rows = pagesPerSheet / 2;

                for (let i = 0; i < indices.length; i += pagesPerSheet) {
                  const chunk = indices.slice(i, i + pagesPerSheet);
                  const pages = chunk.map((idx) => (idx == null ? null : pageInfos[idx]));
                  const existing = pages.filter(Boolean);

                  if (!existing.length) continue;

                  let outWidth, outHeight;
                  if (isA4) {
                    outWidth = A3_WIDTH;
                    outHeight = A3_HEIGHT;
                  } else {
                    const maxWidth = Math.max(...existing.map((p) => p.width));
                    const maxHeight = Math.max(...existing.map((p) => p.height));
                    outWidth = maxWidth * Math.sqrt(2);
                    outHeight = maxHeight * Math.sqrt(2);
                  }

                  const cellWidth = outWidth / 2;
                  const cellHeight = outHeight / rows;

                  const placements = pages.map((pageInfo, idx) => {
                    if (!pageInfo) return null;
                    const row = Math.floor(idx / 2);
                    const col = idx % 2;
                    const x = col * cellWidth;
                    const y = cellHeight * (rows - 1 - row);
                    return { pageInfo, x, y, w: cellWidth, h: cellHeight };
                  });
                  const displayRotation = this._computeDisplayRotationForPlacements(placements, autoOrientationEnabled);

                  layout.pages.push({
                    width: outWidth,
                    height: outHeight,
                    placements,
                    displayRotation
                  });
                }
              } else {
                throw new Error("Ungültige Auswahl für Seiten pro Blatt.");
              }

              return this._buildOutputPdf(layout, autoOrientationEnabled);
            }
          }

          function buildOutputName(baseName, copyCount) {
            if (copyCount) return `${copyCount} mal drucken - ${baseName}.pdf`;
            return `Drucken - ${baseName}.pdf`;
          }

          function deriveCopyCount(pageCount, pagesPerSheet, studentCount, paddingMode, enableThreePageSpecialMode) {
            if (!studentCount) return null;
            if (enableThreePageSpecialMode) {
              return paddingMode === "lcm" ? 1 : Math.ceil(studentCount / 2);
            }
            let copyCount = studentCount;

            if (pagesPerSheet === 2 && pageCount % 2 === 1 && !(enableThreePageSpecialMode && pageCount === 3)) {
              copyCount = Math.ceil(studentCount / 2);
            }

            if ([4, 6, 8].includes(pagesPerSheet) && paddingMode === "lcm") {
              const totalSlots = lcm(pageCount, pagesPerSheet);
              const setsPerOutput = totalSlots / pageCount;
              if (setsPerOutput > 0) {
                copyCount = Math.ceil(studentCount / setsPerOutput);
              }
            }

            return copyCount;
          }

          function chooseBestSlotOrientation(pageWidth, pageHeight, slotWidth, slotHeight, autoOrientationEnabled) {
            const normalScale = Math.min(slotWidth / pageWidth, slotHeight / pageHeight);
            if (!autoOrientationEnabled) {
              return {
                rotate90: false,
                scale: normalScale,
                orientedWidth: pageWidth,
                orientedHeight: pageHeight
              };
            }

            const rotatedScale = Math.min(slotWidth / pageHeight, slotHeight / pageWidth);
            if (rotatedScale > normalScale + 1e-9) {
              return {
                rotate90: true,
                scale: rotatedScale,
                orientedWidth: pageHeight,
                orientedHeight: pageWidth
              };
            }

            return {
              rotate90: false,
              scale: normalScale,
              orientedWidth: pageWidth,
              orientedHeight: pageHeight
            };
          }

          function detectUnsupportedLegacyFeatures(bytes) {
            const text = bytesToBinaryString(bytes);
            const features = [];
            if (/\/ObjStm\b/.test(text)) features.push("Objekt-Streams (/ObjStm)");
            if (/\/Type\s*\/XRef\b/.test(text) || /\/XRefStm\b/.test(text)) features.push("XRef-Streams");
            if (/\/Encrypt\b/.test(text)) features.push("Verschluesselung (/Encrypt)");
            return features;
          }

          async function loadSourceDocument(inputBytes) {
            const PDFLib = window.PDFLib;
            if (PDFLib && PDFLib.PDFDocument) {
              try {
                const source = await PDFLib.PDFDocument.load(inputBytes);
                return { engine: "pdf-lib", source };
              } catch (error) {
                throw new Error("PDF konnte nicht gelesen werden (evtl. beschaedigt oder verschluesselt).");
              }
            }

            const detected = detectUnsupportedLegacyFeatures(inputBytes);
            if (detected.length) {
              throw new Error(
                "Lokale PDF-Library fehlt und diese PDF verwendet nicht unterstuetzte Strukturen: " +
                detected.join(", ") +
                ". Bitte Internetverbindung pruefen, damit pdf-lib geladen werden kann."
              );
            }

            try {
              const source = new SimplePdfDocument(inputBytes);
              return { engine: "builtin", source };
            } catch (error) {
              throw new Error(
                "PDF-Library fehlt und die eingebaute Fallback-Verarbeitung konnte die PDF nicht sicher lesen. " +
                "Bitte Internetverbindung pruefen, damit pdf-lib geladen werden kann."
              );
            }
          }

          async function imposeWithPdfLib(sourceDoc, pagesPerSheet, paddingMode, enableThreePageSpecialMode, studentCount, autoOrientationEnabled) {
            const PDFLib = window.PDFLib;
            const pageCount = sourceDoc.getPageCount();
            if (!pageCount) throw new Error("Die PDF enthaelt keine Seiten.");
            if (enableThreePageSpecialMode && pageCount !== 3) {
              throw new Error("Spezialmodus ist nur mit 3-seitiger PDF möglich.");
            }

            const sourcePages = sourceDoc.getPages();
            const sourceSizes = sourcePages.map((page) => {
              const size = page.getSize();
              return { width: size.width, height: size.height };
            });

            const isA4 = sourceSizes.every(({ width, height }) => {
              const portrait = Math.abs(width - A4_WIDTH) <= A4_TOLERANCE && Math.abs(height - A4_HEIGHT) <= A4_TOLERANCE;
              const landscape = Math.abs(width - A4_HEIGHT) <= A4_TOLERANCE && Math.abs(height - A4_WIDTH) <= A4_TOLERANCE;
              return portrait || landscape;
            });

            const outputDoc = await PDFLib.PDFDocument.create();
            const embeddedPages = await outputDoc.embedPages(sourcePages);

            function drawPlacement(outputPage, pageIndex, x, y, w, h, slotRotations) {
              if (pageIndex == null) return;
              const embedded = embeddedPages[pageIndex];
              if (!embedded) throw new Error("Seiteneinbettung fehlgeschlagen.");

              const fit = chooseBestSlotOrientation(embedded.width, embedded.height, w, h, autoOrientationEnabled);
              if (slotRotations) slotRotations.push(fit.rotate90 ? 90 : 0);
              const baseWidth = embedded.width * fit.scale;
              const baseHeight = embedded.height * fit.scale;
              const drawWidth = fit.orientedWidth * fit.scale;
              const drawHeight = fit.orientedHeight * fit.scale;
              const drawX = x + (w - drawWidth) / 2;
              const drawY = y + (h - drawHeight) / 2;

              if (fit.rotate90) {
                outputPage.drawPage(embedded, {
                  x: drawX + baseHeight,
                  y: drawY,
                  width: baseWidth,
                  height: baseHeight,
                  rotate: PDFLib.degrees(90)
                });
                return;
              }

              outputPage.drawPage(embedded, {
                x: drawX,
                y: drawY,
                width: drawWidth,
                height: drawHeight
              });
            }

            function computeUniformDisplayRotation(slotRotations) {
              if (!slotRotations.length) return null;
              const first = slotRotations[0];
              return slotRotations.every((value) => value === first) ? first : null;
            }

            if (enableThreePageSpecialMode || pagesPerSheet === 2) {
              const pairs = enableThreePageSpecialMode
                ? buildSpecialThreeModePairs(paddingMode, studentCount)
                : buildTwoUpPairs(pageCount, false, studentCount);

              for (const [leftIndex, rightIndex] of pairs) {
                const left = sourceSizes[leftIndex];
                const right = rightIndex == null ? null : sourceSizes[rightIndex];

                let outWidth;
                let outHeight;
                let halfWidth;
                if (isA4) {
                  halfWidth = A4_WIDTH;
                  outHeight = A4_HEIGHT;
                  outWidth = A4_WIDTH * 2;
                } else {
                  halfWidth = Math.max(left.width, right?.width || left.width);
                  outHeight = Math.max(left.height, right?.height || left.height);
                  outWidth = halfWidth * 2;
                  if (outWidth < outHeight) {
                    outWidth = outHeight;
                    halfWidth = outWidth / 2;
                  }
                }

                const outputPage = outputDoc.addPage([outWidth, outHeight]);
                const slotRotations = [];
                drawPlacement(outputPage, leftIndex, 0, 0, halfWidth, outHeight, slotRotations);
                drawPlacement(outputPage, rightIndex, halfWidth, 0, halfWidth, outHeight, slotRotations);
                const displayRotation = computeUniformDisplayRotation(slotRotations);
                if (displayRotation != null) outputPage.setRotation(PDFLib.degrees(displayRotation));
              }
            } else if ([4, 6, 8].includes(pagesPerSheet)) {
              let indices;
              if (paddingMode === "blank") indices = buildBlankIndices(pageCount, pagesPerSheet);
              else if (paddingMode === "lcm") indices = buildLcmIndices(pageCount, pagesPerSheet);
              else indices = buildPaddedIndices(pageCount, pagesPerSheet);

              const rows = pagesPerSheet / 2;
              for (let i = 0; i < indices.length; i += pagesPerSheet) {
                const chunk = indices.slice(i, i + pagesPerSheet);
                const existing = chunk.filter((idx) => idx != null);
                if (!existing.length) continue;

                let outWidth;
                let outHeight;
                if (isA4) {
                  outWidth = A3_WIDTH;
                  outHeight = A3_HEIGHT;
                } else {
                  const maxWidth = Math.max(...existing.map((idx) => sourceSizes[idx].width));
                  const maxHeight = Math.max(...existing.map((idx) => sourceSizes[idx].height));
                  outWidth = maxWidth * Math.sqrt(2);
                  outHeight = maxHeight * Math.sqrt(2);
                }

                const cellWidth = outWidth / 2;
                const cellHeight = outHeight / rows;
                const outputPage = outputDoc.addPage([outWidth, outHeight]);
                const slotRotations = [];

                for (let slotIndex = 0; slotIndex < chunk.length; slotIndex += 1) {
                  const pageIndex = chunk[slotIndex];
                  const row = Math.floor(slotIndex / 2);
                  const col = slotIndex % 2;
                  const x = col * cellWidth;
                  const y = cellHeight * (rows - 1 - row);
                  drawPlacement(outputPage, pageIndex, x, y, cellWidth, cellHeight, slotRotations);
                }
                const displayRotation = computeUniformDisplayRotation(slotRotations);
                if (displayRotation != null) outputPage.setRotation(PDFLib.degrees(displayRotation));
              }
            } else {
              throw new Error("Ungueltige Auswahl fuer Seiten pro Blatt.");
            }

            return outputDoc.save({ useObjectStreams: false });
          }

          function chooseEffectivePaddingMode(pageCount, pagesPerSheet, requestedMode) {
            if (![4, 6, 8].includes(pagesPerSheet)) return null;
            if (pageCount % pagesPerSheet === 0) return null;
            return requestedMode === "auto" ? null : requestedMode;
          }

          function getBaseName(filename) {
            return filename.replace(/\.pdf$/i, "");
          }

          function isPdfFile(file) {
            return Boolean(file && /\.pdf$/i.test(file.name));
          }

          function buildAppendOutputName(files) {
            const firstBaseName = getBaseName(files[0]?.name || "PDF");
            const secondBaseName = getBaseName(files[1]?.name || "PDF");
            const hasMore = files.length > 2;
            const morePart = hasMore ? " + Weitere" : "";
            return `Zusammengeführt ${firstBaseName} + ${secondBaseName}${morePart}.pdf`;
          }

          function buildRotatedOutputName(filename) {
            return `${getBaseName(filename || "PDF")} - gedreht.pdf`;
          }

          function buildSplitCombinedOutputName(filename) {
            return `${getBaseName(filename || "PDF")} - Auswahl.pdf`;
          }

          function buildSplitSingleOutputName(filename, pageNumber, width) {
            return `${getBaseName(filename || "PDF")} - Seite ${String(pageNumber).padStart(width, "0")}.pdf`;
          }

          function buildSplitPartOutputName(filename, index, total) {
            const width = Math.max(2, String(total).length);
            return `${getBaseName(filename || "PDF")} - Teil ${String(index + 1).padStart(width, "0")}.pdf`;
          }

          function getPaddingModeValue() {
            const selected = ui.paddingModes.find((radio) => radio.checked);
            return selected ? selected.value : "blank";
          }

          function setPaddingModeValue(mode) {
            const target = ui.paddingModes.find((radio) => radio.value === mode);
            if (target) target.checked = true;
          }

          function setDropZoneContent(dropZone, hint, summary, text = "", options = {}) {
            const hasSummary = Boolean(text && String(text).trim());
            dropZone.classList.toggle("awaiting-file", !hasSummary);
            if (hint) {
              hint.classList.toggle("hidden", hasSummary);
            }
            if (summary) {
              summary.classList.toggle("hidden", !hasSummary);
              summary.replaceChildren();
              if (!hasSummary) return;

              const name = document.createElement("span");
              name.className = "drop-summary-name";
              name.textContent = text;
              summary.append(name);

              if (options.clearTool) {
                const removeButton = document.createElement("button");
                removeButton.type = "button";
                removeButton.className = "drop-summary-delete";
                removeButton.dataset.clearTool = options.clearTool;
                removeButton.setAttribute("aria-label", `${text} entfernen`);
                removeButton.title = "Datei entfernen";
                removeButton.textContent = "🗑️";
                summary.append(removeButton);
              }
            }
          }

          function renderToolTabs() {
            if (runtimeChrome) {
              runtimeChrome.dataset.tool = activeTool;
            }
            ui.toolTabs.forEach((button) => {
              const isActive = button.dataset.tool === activeTool;
              button.classList.toggle("active", isActive);
              button.setAttribute("aria-selected", isActive ? "true" : "false");
              button.setAttribute("tabindex", isActive ? "0" : "-1");
            });
            Object.entries(ui.toolPanels).forEach(([tool, panel]) => {
              const isActive = tool === activeTool;
              panel.hidden = !isActive;
              panel.classList.toggle("active", isActive);
            });
            if (ui.splitSidebarPanel) {
              ui.splitSidebarPanel.hidden = activeTool !== TOOL_SPLIT;
            }
          }

          function setActiveTool(tool) {
            if (!ui.toolPanels[tool]) return;
            activeTool = tool;
            renderToolTabs();
          }

          function getToolFileState(tool) {
            if (tool === TOOL_LAYOUT) return layoutState;
            if (tool === TOOL_ROTATE) return rotateState;
            if (tool === TOOL_SPLIT) return splitState;
            return null;
          }

          function clearSingleToolFile(tool) {
            const state = getToolFileState(tool);
            if (!state) return;
            state.file = null;

            if (tool === TOOL_LAYOUT) {
              layoutState.specialModeProbeToken += 1;
              layoutState.specialThreeModeEnabled = false;
              setSpecialThreeModeAvailability(false);
              renderLayoutSelection();
              return;
            }
            if (tool === TOOL_ROTATE) {
              rotateState.pageSetupToken += 1;
              rotateState.previewSetupToken += 1;
              rotateState.loadingPages = false;
              rotateState.pageLoadError = "";
              rotateState.basePageRotations = [];
              rotateState.documentRotation = 0;
              rotateState.pageRotations = [];
              rotateState.previewAnimationFrom = [];
              rotateState.previewUrls = [];
              rotateState.previewLoading = false;
              rotateState.previewLoadError = "";
              renderRotateSelection();
              return;
            }
            if (tool === TOOL_SPLIT) {
              splitState.pageSetupToken += 1;
              splitState.previewSetupToken += 1;
              splitState.pageCount = 0;
              splitState.pageLoadError = "";
              splitState.loadingPages = false;
              splitState.previewUrls = [];
              splitState.previewLoading = false;
              splitState.previewLoadError = "";
              splitState.activePages = new Set();
              splitState.pageGroups = [];
              splitState.outputMode = "combined";
              splitState.groupRowValues = new Map();
              splitState.draftGroupRow = { start: "", end: "" };
              splitState.draggedPageIndex = null;
              splitState.dragSettling = false;
              splitState.dragDropCommitted = false;
              splitState.dragPointerId = null;
              splitState.dragPointerOriginX = 0;
              splitState.dragPointerOriginY = 0;
              splitState.dragPointerActive = false;
              splitState.dragHoverPageIndex = null;
              document.documentElement.classList.remove("split-drag-active");
              ui.splitPagesList?.classList.remove("drag-active");
              renderSplitSelection();
              return;
            }
          }

          function normalizeRotationAngle(angle) {
            return ((Number(angle) || 0) % 360 + 360) % 360;
          }

          function getPageRotationAngle(page) {
            const rotation = typeof page.getRotation === "function" ? page.getRotation() : null;
            return normalizeRotationAngle(rotation?.angle);
          }

          function formatPageCountLabel(pageCount) {
            return pageCount === 1 ? "1 Seite" : `${pageCount} Seiten`;
          }

          function getUniformRotateSelection() {
            if (!rotateState.pageRotations.length) return 0;
            const [first] = rotateState.pageRotations;
            return rotateState.pageRotations.every((value) => value === first) ? first : null;
          }

          function buildRotationChoiceLabel(degrees, scopeLabel) {
            if (Number(degrees) === 0) {
              return `${scopeLabel} nicht drehen`;
            }
            return `${scopeLabel} um ${degrees} Grad drehen`;
          }

          function getShortestRotationDelta(fromDegrees, toDegrees) {
            return ((toDegrees - fromDegrees + 540) % 360) - 180;
          }

          function getPreviewAnimationStartAngle(fromDegrees, toDegrees) {
            return toDegrees - getShortestRotationDelta(fromDegrees, toDegrees);
          }

          function buildRotateIconMarkup(degrees) {
            const normalized = Number(degrees);
            const iconByRotation = {
              90: {
                arc: "M24 6 A18 18 0 0 1 42 24",
                arrowX: 42,
                arrowY: 24,
                arrowAngle: 90
              },
              180: {
                arc: "M24 6 A18 18 0 0 1 24 42",
                arrowX: 24,
                arrowY: 42,
                arrowAngle: 180
              },
              270: {
                arc: "M24 6 A18 18 0 1 1 6 24",
                arrowX: 6,
                arrowY: 24,
                arrowAngle: 270
              }
            };
            const icon = iconByRotation[normalized] || iconByRotation[90];
            return `
              <svg class="rotate-icon-svg" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                <path class="rotate-icon-arc" d="${icon.arc}"></path>
                <polygon class="rotate-icon-head" points="9,0 0,-6 0,6"
                  transform="translate(${icon.arrowX} ${icon.arrowY}) rotate(${icon.arrowAngle})"></polygon>
              </svg>
            `;
          }

          function createRotateIconElement(degrees) {
            const icon = document.createElement("span");
            icon.className = "rotate-icon";
            icon.setAttribute("aria-hidden", "true");
            icon.innerHTML = buildRotateIconMarkup(degrees);
            return icon;
          }

          function hydrateRotateDocumentDegreeButtons() {
            ui.rotateDocumentDegreesButtons.forEach((button) => {
              button.querySelector(".rotate-icon")?.remove();
              button.querySelector(".rotate-none-icon")?.remove();
              const rotation = Number(button.dataset.rotation);
              const icon = rotation === 0
                ? (() => {
                  const iconWrap = document.createElement("span");
                  iconWrap.className = "rotate-none-icon";
                  iconWrap.setAttribute("aria-hidden", "true");
                  return iconWrap;
                })()
                : createRotateIconElement(rotation);
              const srLabel = button.querySelector(".sr-only");
              if (srLabel) {
                button.insertBefore(icon, srLabel);
              } else {
                button.append(icon);
              }
            });
          }

          function createRotateChoiceButton(degrees, isActive, scopeLabel, pageIndex = null) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = `choice-pill rotate-icon-pill${isActive ? " active" : ""}`;
            button.dataset.rotation = String(degrees);
            if (pageIndex != null) button.dataset.pageIndex = String(pageIndex);
            button.setAttribute("aria-pressed", isActive ? "true" : "false");
            button.title = buildRotationChoiceLabel(degrees, scopeLabel);

            const icon = Number(degrees) === 0
              ? (() => {
                const iconWrap = document.createElement("span");
                iconWrap.className = "rotate-none-icon";
                iconWrap.setAttribute("aria-hidden", "true");
                return iconWrap;
              })()
              : createRotateIconElement(degrees);

            const srLabel = document.createElement("span");
            srLabel.className = "sr-only";
            srLabel.textContent = buildRotationChoiceLabel(degrees, scopeLabel);

            button.append(icon, srLabel);
            return button;
          }

          function syncLayoutStartButtonState() {
            if (!layoutState.file) {
              ui.layoutStartButton.disabled = true;
              return;
            }
            const isLcmWithoutStudentCount = getPaddingModeValue() === "lcm" && !ui.studentCount.value.trim();
            ui.layoutStartButton.disabled = isLcmWithoutStudentCount;
          }

          function syncMergeStartButtonState() {
            ui.mergeStartButton.disabled = mergeState.files.length < 2;
          }

          function syncRotateStartButtonState() {
            ui.rotateStartButton.disabled = !rotateState.file || rotateState.loadingPages || !rotateState.pageRotations.length;
          }

          function setMergeTotalPagesText(value) {
            ui.mergeTotalPages.textContent = `(Gesamtseitenanzahl: ${value})`;
          }

          function getMergeTotalPagesFromCache() {
            let total = 0;
            for (const file of mergeState.files) {
              const pageCount = mergeState.pageCountByFile.get(file);
              if (typeof pageCount === "number") total += pageCount;
            }
            return total;
          }

          function updateRenderedMergePageMeta() {
            const rows = [...ui.mergeAppendFileList.querySelectorAll(".file-item")];
            rows.forEach((row) => {
              const index = Number(row.dataset.fileIndex);
              const file = mergeState.files[index];
              const meta = row.querySelector(".file-item-meta");
              if (!file || !meta) return;
              const pageCount = mergeState.pageCountByFile.get(file);
              meta.textContent = typeof pageCount === "number"
                ? formatPageCountLabel(pageCount)
                : (
                  pageCount === null
                    ? "Seitenanzahl unbekannt"
                    : "Seitenanzahl wird geprüft"
                );
            });
          }

          async function loadMergePageCount(file) {
            if (mergeState.pageCountByFile.has(file)) {
              return mergeState.pageCountByFile.get(file);
            }
            const inputBytes = new Uint8Array(await file.arrayBuffer());
            try {
              const loaded = await loadSourceDocument(inputBytes);
              const pageCount = loaded.source.getPageCount();
              if (!Number.isInteger(pageCount) || pageCount < 0) {
                throw new Error("Ungueltige Seitenzahl.");
              }
              mergeState.pageCountByFile.set(file, pageCount);
              return pageCount;
            } catch (firstError) {
              if (!(window.PDFLib && window.PDFLib.PDFDocument)) {
                try {
                  await ensurePdfLibLoaded();
                  const loaded = await loadSourceDocument(inputBytes);
                  const pageCount = loaded.source.getPageCount();
                  if (!Number.isInteger(pageCount) || pageCount < 0) {
                    throw new Error("Ungueltige Seitenzahl.");
                  }
                  mergeState.pageCountByFile.set(file, pageCount);
                  return pageCount;
                } catch (secondError) {
                  console.warn(`Seitenzahl konnte nicht ermittelt werden: ${file.name}`, secondError);
                }
              } else {
                console.warn(`Seitenzahl konnte nicht ermittelt werden: ${file.name}`, firstError);
              }
              mergeState.pageCountByFile.set(file, null);
              return null;
            }
          }

          async function refreshMergeTotalPages() {
            const token = ++mergeState.pageCountProbeToken;
            if (!mergeState.files.length) {
              setMergeTotalPagesText("0");
              return;
            }

            setMergeTotalPagesText(String(getMergeTotalPagesFromCache()));

            for (const file of mergeState.files) {
              if (!mergeState.pageCountByFile.has(file)) {
                await loadMergePageCount(file);
                if (token !== mergeState.pageCountProbeToken) return;
              }
            }

            if (token !== mergeState.pageCountProbeToken) return;
            setMergeTotalPagesText(String(getMergeTotalPagesFromCache()));
            updateRenderedMergePageMeta();
          }

          function renderMergeFileList() {
            const fragment = document.createDocumentFragment();
            mergeState.files.forEach((file, index) => {
              const row = document.createElement("div");
              row.className = "file-item";
              row.draggable = true;
              row.dataset.fileIndex = String(index);
              row.title = "Reihenfolge per Drag-and-Drop ändern";

              const order = document.createElement("span");
              order.className = "file-item-order";
              order.textContent = String(index + 1);

              const name = document.createElement("span");
              name.className = "file-item-name";
              name.textContent = file.name;

              const meta = document.createElement("span");
              meta.className = "file-item-meta";
              const pageCount = mergeState.pageCountByFile.get(file);
              meta.textContent = typeof pageCount === "number"
                ? formatPageCountLabel(pageCount)
                : (
                  pageCount === null
                    ? "Seitenanzahl unbekannt"
                    : "Seitenanzahl wird geprüft"
                );

              const removeButton = document.createElement("button");
              removeButton.type = "button";
              removeButton.className = "file-delete";
              removeButton.dataset.removeIndex = String(index);
              removeButton.setAttribute("aria-label", `${file.name} entfernen`);
              removeButton.title = "Datei entfernen";
              removeButton.textContent = "🗑️";
              removeButton.draggable = false;

              row.append(order, name, meta, removeButton);
              fragment.append(row);
            });

            ui.mergeAppendFileList.replaceChildren(fragment);
            ui.mergeFileListShell?.classList.toggle("hidden", mergeState.files.length < 1);
            ui.mergeDropZone.classList.toggle("awaiting-file", mergeState.files.length < 1);
            ui.mergeDropHint?.classList.toggle("hidden", mergeState.files.length > 0);
            syncMergeStartButtonState();
            void refreshMergeTotalPages();
          }

          function renderLayoutSelection() {
            setDropZoneContent(
              ui.layoutDropZone,
              ui.layoutDropHint,
              ui.layoutDropSummary,
              layoutState.file ? layoutState.file.name : "",
              { clearTool: layoutState.file ? TOOL_LAYOUT : "" }
            );
            setLayoutOptionsEnabled(Boolean(layoutState.file));
          }

          function renderRotateSelection() {
            setDropZoneContent(
              ui.rotateDropZone,
              ui.rotateDropHint,
              ui.rotateDropSummary,
              rotateState.file ? rotateState.file.name : "",
              { clearTool: rotateState.file ? TOOL_ROTATE : "" }
            );
            renderRotateDocumentDegreesSelection();
            renderRotatePagesList();
            syncRotateStartButtonState();
          }

          function renderSplitSelection() {
            setDropZoneContent(
              ui.splitDropZone,
              ui.splitDropHint,
              ui.splitDropSummary,
              splitState.file ? splitState.file.name : "",
              { clearTool: splitState.file ? TOOL_SPLIT : "" }
            );
            const hasFile = Boolean(splitState.file);
            ui.splitWorkspace?.classList.toggle("hidden", !hasFile);
            ui.splitSidebarPanel?.classList.toggle("options-disabled", !hasFile);
            ui.splitSidebarPanel?.setAttribute("aria-disabled", String(!hasFile));
            renderSplitOutputMode();
            renderSplitGroupRows();
            renderSplitPagesList();
            syncSplitButtonsState();
          }

          function getActiveSplitPageIndexes() {
            return [...splitState.activePages]
              .filter((pageIndex) => Number.isInteger(pageIndex) && pageIndex >= 0 && pageIndex < splitState.pageCount)
              .sort((a, b) => a - b);
          }

          function getNormalizedSplitPageGroups() {
            const validPages = new Set(Array.from({ length: splitState.pageCount }, (_, pageIndex) => pageIndex));
            const groups = [];
            const seenPages = new Set();

            splitState.pageGroups.forEach((group) => {
              const normalizedGroup = [];
              group.forEach((pageIndex) => {
                if (!validPages.has(pageIndex) || seenPages.has(pageIndex)) return;
                seenPages.add(pageIndex);
                normalizedGroup.push(pageIndex);
              });
              if (normalizedGroup.length) groups.push(normalizedGroup);
            });

            for (let pageIndex = 0; pageIndex < splitState.pageCount; pageIndex += 1) {
              if (!seenPages.has(pageIndex)) groups.push([pageIndex]);
            }

            return groups;
          }

          function getSplitPageGroupIndex(pageIndex) {
            return getNormalizedSplitPageGroups().findIndex((group) => group.includes(pageIndex));
          }

          function getOrderedActiveSplitPageIndexes() {
            return getNormalizedSplitPageGroups()
              .flatMap((group) => group.filter((pageIndex) => splitState.activePages.has(pageIndex)));
          }

          function getOrderedActiveSplitGroups() {
            return getNormalizedSplitPageGroups()
              .map((group) => group.filter((pageIndex) => splitState.activePages.has(pageIndex)))
              .filter((group) => group.length);
          }

          function getSplitGroupSignature(group) {
            return group.join(",");
          }

          function getSplitManagedGroups() {
            return getNormalizedSplitPageGroups().filter((group) => group.length > 1);
          }

          function getSplitGroupRangeTexts(group) {
            const orderedPages = [...group].sort((a, b) => a - b);
            return {
              start: String((orderedPages[0] ?? 0) + 1),
              end: String((orderedPages[orderedPages.length - 1] ?? 0) + 1),
            };
          }

          function getSplitGroupRowsDisabled() {
            return !splitState.file || splitState.loadingPages || Boolean(splitState.pageLoadError) || splitState.pageCount < 2;
          }

          function renderSplitOutputMode() {
            ui.splitOutputModeButtons.forEach((button) => {
              const isActive = button.dataset.splitOutputMode === splitState.outputMode;
              button.classList.toggle("active", isActive);
              button.setAttribute("aria-pressed", isActive ? "true" : "false");
              button.disabled = !splitState.file || splitState.loadingPages;
            });
          }

          function normalizeSplitGroupRowValues(startText, endText, changedField) {
            const pageMax = Math.max(1, splitState.pageCount || 1);
            let normalizedStartText = String(startText || "").trim();
            let normalizedEndText = String(endText || "").trim();
            let start = Number(normalizedStartText);
            let end = Number(normalizedEndText);

            if (Number.isInteger(start)) {
              start = Math.min(Math.max(1, start), pageMax);
            }
            if (Number.isInteger(end)) {
              end = Math.min(Math.max(1, end), pageMax);
            }

            if (Number.isInteger(start) && Number.isInteger(end) && start > end) {
              if (changedField === "start") {
                end = start;
              } else {
                start = end;
              }
            }

            if (Number.isInteger(start)) normalizedStartText = String(start);
            if (Number.isInteger(end)) normalizedEndText = String(end);

            return { start: normalizedStartText, end: normalizedEndText };
          }

          function getValidatedSplitRange(startText, endText) {
            startText = String(startText || "").trim();
            endText = String(endText || "").trim();
            if (!startText || !endText) return { ok: false, reason: "Bitte Start- und Endseite angeben." };

            const start = Number(startText);
            const end = Number(endText);
            if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end <= 0) {
              return { ok: false, reason: "Seitenzahlen müssen ganze Zahlen größer 0 sein." };
            }
            if (start > end) {
              return { ok: false, reason: "Die Startseite darf nicht größer als die Endseite sein." };
            }
            if (end > splitState.pageCount) {
              return { ok: false, reason: `Die Endseite darf höchstens ${splitState.pageCount} sein.` };
            }
            if (start === end) {
              return { ok: false, reason: "Eine Gruppe muss mindestens 2 Seiten umfassen." };
            }
            return { ok: true, start: start - 1, end: end - 1 };
          }

          function hasSplitRangeInputValues(startText, endText) {
            return Boolean(String(startText || "").trim() && String(endText || "").trim());
          }

          function pruneSplitGroupRowValues(validKeys) {
            [...splitState.groupRowValues.keys()].forEach((key) => {
              if (!validKeys.has(key)) {
                splitState.groupRowValues.delete(key);
              }
            });
          }

          function applySplitGroupRowInputState(row, values) {
            if (!row) return;
            const startInput = row.querySelector('input[data-split-group-field="start"]');
            const endInput = row.querySelector('input[data-split-group-field="end"]');
            if (!startInput || !endInput) return;

            const disabled = getSplitGroupRowsDisabled();
            const pageMax = Math.max(1, splitState.pageCount || 1);
            const currentStart = Number(values.start);
            const currentEnd = Number(values.end);

            startInput.min = "1";
            endInput.min = "1";
            startInput.max = Number.isInteger(currentEnd) && currentEnd > 0 ? String(currentEnd) : String(pageMax);
            endInput.max = String(pageMax);
            endInput.min = Number.isInteger(currentStart) && currentStart > 0 ? String(currentStart) : "1";
            startInput.value = values.start;
            endInput.value = values.end;
            startInput.disabled = disabled;
            endInput.disabled = disabled;
            syncNumberStepperState(startInput);
            syncNumberStepperState(endInput);

            const applyButton = row.querySelector('button[data-split-group-action="apply"]');
            if (applyButton) {
              applyButton.disabled = disabled || !hasSplitRangeInputValues(values.start, values.end);
            }
            const dissolveButton = row.querySelector('button[data-split-group-action="dissolve"]');
            if (dissolveButton) {
              dissolveButton.disabled = disabled || row.dataset.splitGroupRowKind !== "existing";
            }
          }

          function buildSplitGroupRow({
            rowKind,
            groupKey = "",
            values,
          }) {
            const row = document.createElement("div");
            row.className = `split-group-row split-group-row-${rowKind}`;
            row.dataset.splitGroupRowKind = rowKind;
            if (groupKey) row.dataset.splitGroupKey = groupKey;

            const inputs = document.createElement("div");
            inputs.className = "split-group-row-inputs";

            const startField = document.createElement("label");
            startField.className = "field split-range-field";
            const startLabel = document.createElement("span");
            startLabel.textContent = "Von";
            const startInput = document.createElement("input");
            startInput.type = "number";
            startInput.step = "1";
            startInput.min = "1";
            startInput.inputMode = "numeric";
            startInput.dataset.splitGroupField = "start";
            startInput.dataset.splitGroupRowKind = rowKind;
            if (groupKey) startInput.dataset.splitGroupKey = groupKey;
            startField.append(startLabel, startInput);

            const endField = document.createElement("label");
            endField.className = "field split-range-field";
            const endLabel = document.createElement("span");
            endLabel.textContent = "Bis";
            const endInput = document.createElement("input");
            endInput.type = "number";
            endInput.step = "1";
            endInput.min = "1";
            endInput.inputMode = "numeric";
            endInput.dataset.splitGroupField = "end";
            endInput.dataset.splitGroupRowKind = rowKind;
            if (groupKey) endInput.dataset.splitGroupKey = groupKey;
            endField.append(endLabel, endInput);

            inputs.append(startField, endField);
            row.append(inputs);

            const actions = document.createElement("div");
            actions.className = "split-group-row-actions";

            const applyButton = document.createElement("button");
            applyButton.type = "button";
            applyButton.className = "btn-small split-group-row-button split-group-row-apply";
            applyButton.dataset.splitGroupAction = "apply";
            applyButton.dataset.splitGroupRowKind = rowKind;
            if (groupKey) applyButton.dataset.splitGroupKey = groupKey;
            applyButton.textContent = "🔗";
            applyButton.title = "Gruppe zusammenlegen";
            applyButton.setAttribute("aria-label", "Gruppe zusammenlegen");
            actions.append(applyButton);

            const dissolveButton = document.createElement("button");
            dissolveButton.type = "button";
            dissolveButton.className = "btn-small split-group-row-button split-group-row-dissolve";
            dissolveButton.dataset.splitGroupAction = "dissolve";
            dissolveButton.dataset.splitGroupRowKind = rowKind;
            if (groupKey) dissolveButton.dataset.splitGroupKey = groupKey;
            dissolveButton.textContent = "⛓️‍💥";
            dissolveButton.title = "Gruppe auflösen";
            dissolveButton.setAttribute("aria-label", "Gruppe auflösen");
            actions.append(dissolveButton);

            row.append(actions);

            initNumberStepper(startInput);
            initNumberStepper(endInput);
            applySplitGroupRowInputState(row, values);
            return row;
          }

          function renderSplitGroupRows() {
            if (!ui.splitGroupRowsList) return;

            const fragment = document.createDocumentFragment();
            const validKeys = new Set();

            getSplitManagedGroups().forEach((group) => {
              const groupKey = getSplitGroupSignature(group);
              validKeys.add(groupKey);
              const defaultValues = getSplitGroupRangeTexts(group);
              const storedValues = splitState.groupRowValues.get(groupKey);
              fragment.append(buildSplitGroupRow({
                rowKind: "existing",
                groupKey,
                values: storedValues || defaultValues,
              }));
            });

            pruneSplitGroupRowValues(validKeys);

            fragment.append(buildSplitGroupRow({
              rowKind: "draft",
              values: splitState.draftGroupRow,
            }));

            ui.splitGroupRowsList.replaceChildren(fragment);
          }

          function getSplitExistingGroupRowValues(groupKey) {
            const group = getSplitManagedGroups().find((candidate) => getSplitGroupSignature(candidate) === groupKey);
            if (!group) return { start: "", end: "" };
            return splitState.groupRowValues.get(groupKey) || getSplitGroupRangeTexts(group);
          }

          function renderSplitPagesList() {
            if (!ui.splitPagesList) return;

            const renderSplitStatus = (message, tone = "muted") => {
              const status = document.createElement("div");
              status.className = `split-pages-status split-pages-status-${tone}`;
              status.textContent = message;
              ui.splitPagesList.replaceChildren(status);
            };

            if (!splitState.file) {
              ui.splitPagesList.replaceChildren();
              return;
            }
            if (splitState.loadingPages) {
              renderSplitStatus("Seiten werden geladen …");
              return;
            }
            if (splitState.pageLoadError) {
              renderSplitStatus(splitState.pageLoadError, "error");
              return;
            }
            if (!splitState.pageCount) {
              renderSplitStatus("Keine Seiten gefunden.");
              return;
            }

            const fragment = document.createDocumentFragment();
            const groups = getNormalizedSplitPageGroups();
            splitState.pageGroups = groups;

            groups.forEach((group) => {
              const groupShell = document.createElement("div");
              groupShell.className = `split-page-group${group.length > 1 ? " grouped" : ""}`;

              group.forEach((pageIndex, groupPosition) => {
                const pageNumber = pageIndex + 1;
                const isActive = splitState.activePages.has(pageIndex);
                const card = document.createElement("article");
                card.className = `split-page-card${isActive ? " active" : " inactive"}${splitState.draggedPageIndex === pageIndex ? " dragging" : ""}`;
                card.dataset.pageIndex = String(pageIndex);
                card.style.setProperty("--split-stack-index", String(groupPosition));
                card.title = "Ziehen, um Seiten zu gruppieren";

                const header = document.createElement("div");
                header.className = "split-page-card-header";

                const badge = document.createElement("div");
                badge.className = "split-page-number";
                badge.textContent = String(pageNumber);

                const toggle = document.createElement("button");
                toggle.type = "button";
                toggle.className = `split-page-toggle${isActive ? " active" : ""}`;
                toggle.dataset.pageIndex = String(pageIndex);
                toggle.setAttribute("aria-pressed", isActive ? "true" : "false");
                toggle.setAttribute("aria-label", isActive ? `Seite ${pageNumber} ausgewählt` : `Seite ${pageNumber} nicht ausgewählt`);
                toggle.title = isActive ? "Seite ausgewählt" : "Seite nicht ausgewählt";
                toggle.textContent = isActive ? "✓" : "";

                header.append(badge, toggle);

                const previewShell = document.createElement("div");
                previewShell.className = "split-page-preview-shell";
                const previewStage = document.createElement("div");
                previewStage.className = "split-page-preview-stage";
                const previewUrl = splitState.previewUrls[pageIndex];
                if (previewUrl) {
                  const previewImage = document.createElement("img");
                  previewImage.className = "split-page-preview";
                  previewImage.src = previewUrl;
                  previewImage.alt = `Vorschau für Seite ${pageNumber}`;
                  previewImage.draggable = false;
                  previewStage.append(previewImage);
                } else {
                  const previewPlaceholder = document.createElement("div");
                  previewPlaceholder.className = "split-page-preview-placeholder";
                  previewPlaceholder.textContent = splitState.previewLoading
                    ? "Vorschau lädt …"
                    : (
                      splitState.previewLoadError
                        ? "Keine Vorschau"
                        : String(pageNumber)
                    );
                  previewStage.append(previewPlaceholder);
                }
                previewShell.append(previewStage);

                card.append(header, previewShell);
                groupShell.append(card);
              });

              fragment.append(groupShell);
            });

            ui.splitPagesList.replaceChildren(fragment);
          }

          function setSplitDragSettling() {
            splitState.dragSettling = true;
            window.setTimeout(() => {
              splitState.dragSettling = false;
            }, 0);
          }

          function clearSplitDropTargets() {
            ui.splitPagesList?.querySelectorAll(".split-page-card.drop-target").forEach((element) => {
              element.classList.remove("drop-target");
            });
          }

          function buildSplitDragPreview(pageIndex) {
            const pageNumber = pageIndex + 1;
            const isActive = splitState.activePages.has(pageIndex);
            const previewUrl = splitState.previewUrls[pageIndex];

            const card = document.createElement("div");
            card.className = `split-page-card split-drag-preview-card${isActive ? " active" : " inactive"}`;

            const header = document.createElement("div");
            header.className = "split-page-card-header";

            const badge = document.createElement("div");
            badge.className = "split-page-number";
            badge.textContent = String(pageNumber);

            const toggle = document.createElement("div");
            toggle.className = `split-page-toggle${isActive ? " active" : ""}`;
            toggle.setAttribute("aria-hidden", "true");
            toggle.textContent = isActive ? "✓" : "";

            header.append(badge, toggle);

            const previewShell = document.createElement("div");
            previewShell.className = "split-page-preview-shell";
            const previewStage = document.createElement("div");
            previewStage.className = "split-page-preview-stage";
            if (previewUrl) {
              const previewImage = document.createElement("img");
              previewImage.className = "split-page-preview";
              previewImage.src = previewUrl;
              previewImage.alt = "";
              previewImage.draggable = false;
              previewStage.append(previewImage);
            } else {
              const previewPlaceholder = document.createElement("div");
              previewPlaceholder.className = "split-page-preview-placeholder";
              previewPlaceholder.textContent = String(pageNumber);
              previewStage.append(previewPlaceholder);
            }
            previewShell.append(previewStage);
            card.append(header, previewShell);
            return card;
          }

          function renderSplitDragPreview() {
            const shouldShow = splitState.dragPointerActive && Number.isInteger(splitState.draggedPageIndex);
            if (!shouldShow) {
              splitDragPreviewElement?.remove();
              splitDragPreviewElement = null;
              return;
            }

            if (!splitDragPreviewElement) {
              splitDragPreviewElement = document.createElement("div");
              splitDragPreviewElement.className = "split-drag-preview";
              document.body.append(splitDragPreviewElement);
            }

            splitDragPreviewElement.replaceChildren(buildSplitDragPreview(splitState.draggedPageIndex));
            splitDragPreviewElement.style.transform = `translate(${splitState.dragPreviewX + 18}px, ${splitState.dragPreviewY + 18}px)`;
          }

          function clearSplitPointerDragState() {
            splitState.draggedPageIndex = null;
            splitState.dragDropCommitted = false;
            splitState.dragPointerId = null;
            splitState.dragPointerOriginX = 0;
            splitState.dragPointerOriginY = 0;
            splitState.dragPointerActive = false;
            splitState.dragHoverPageIndex = null;
            splitState.dragPreviewX = 0;
            splitState.dragPreviewY = 0;
            document.documentElement.classList.remove("split-drag-active");
            ui.splitPagesList?.classList.remove("drag-active");
            clearSplitDropTargets();
            ui.splitPagesList?.querySelectorAll(".split-page-card.dragging").forEach((element) => {
              element.classList.remove("dragging");
            });
            renderSplitDragPreview();
          }

          function updateSplitDragHover(clientX, clientY) {
            const target = document.elementFromPoint(clientX, clientY)?.closest(".split-page-card[data-page-index]");
            clearSplitDropTargets();
            splitState.dragHoverPageIndex = null;
            if (!target || splitState.draggedPageIndex == null) return;

            const targetPageIndex = Number(target.dataset.pageIndex);
            if (!Number.isInteger(targetPageIndex) || targetPageIndex === splitState.draggedPageIndex) return;
            if (getSplitPageGroupIndex(targetPageIndex) === getSplitPageGroupIndex(splitState.draggedPageIndex)) return;

            target.classList.add("drop-target");
            splitState.dragHoverPageIndex = targetPageIndex;
          }

          function mergeSplitPageIntoGroup(dragPageIndex, targetPageIndex) {
            if (dragPageIndex === targetPageIndex) return false;
            const groups = getNormalizedSplitPageGroups();
            const dragGroupIndex = groups.findIndex((group) => group.includes(dragPageIndex));
            const targetGroupIndex = groups.findIndex((group) => group.includes(targetPageIndex));
            if (dragGroupIndex < 0 || targetGroupIndex < 0 || dragGroupIndex === targetGroupIndex) return false;

            const dragGroup = [...groups[dragGroupIndex]];
            const targetGroup = [...groups[targetGroupIndex]];
            const dragPagePosition = dragGroup.indexOf(dragPageIndex);
            if (dragPagePosition < 0) return false;

            dragGroup.splice(dragPagePosition, 1);
            const targetPagePosition = targetGroup.indexOf(targetPageIndex);
            targetGroup.splice(targetPagePosition + 1, 0, dragPageIndex);

            const nextGroups = groups
              .map((group, index) => {
                if (index === dragGroupIndex) return dragGroup;
                if (index === targetGroupIndex) return targetGroup;
                return group;
              })
              .filter((group) => group.length);

            splitState.pageGroups = nextGroups;
            return true;
          }

          function detachSplitPageFromGroup(pageIndex) {
            const groups = getNormalizedSplitPageGroups();
            const groupIndex = groups.findIndex((group) => group.includes(pageIndex));
            if (groupIndex < 0) return false;

            const sourceGroup = [...groups[groupIndex]];
            if (sourceGroup.length <= 1) return false;

            const pagePosition = sourceGroup.indexOf(pageIndex);
            if (pagePosition < 0) return false;
            sourceGroup.splice(pagePosition, 1);

            const nextGroups = [];
            groups.forEach((group, index) => {
              if (index === groupIndex) {
                nextGroups.push(sourceGroup);
                nextGroups.push([pageIndex]);
                return;
              }
              nextGroups.push(group);
            });

            splitState.pageGroups = nextGroups.filter((group) => group.length);
            return true;
          }

          function createSplitGroupFromRange(startPageIndex, endPageIndex) {
            return upsertSplitGroupFromRange("", startPageIndex, endPageIndex);
          }

          function upsertSplitGroupFromRange(targetGroupKey, startPageIndex, endPageIndex) {
            const targetPages = new Set();
            const newGroup = [];
            for (let pageIndex = startPageIndex; pageIndex <= endPageIndex; pageIndex += 1) {
              targetPages.add(pageIndex);
              newGroup.push(pageIndex);
            }

            if (newGroup.length < 2) return false;

            const groups = getNormalizedSplitPageGroups();
            const nextGroups = [];
            let handledTarget = false;

            groups.forEach((group) => {
              const groupKey = getSplitGroupSignature(group);
              if (targetGroupKey && groupKey === targetGroupKey && group.length > 1) {
                handledTarget = true;
                nextGroups.push(newGroup);
                group.forEach((pageIndex) => {
                  if (!targetPages.has(pageIndex)) {
                    nextGroups.push([pageIndex]);
                  }
                });
                return;
              }

              const remainingPages = group.filter((pageIndex) => !targetPages.has(pageIndex));
              if (remainingPages.length) {
                nextGroups.push(remainingPages);
              }
            });

            if (!targetGroupKey || !handledTarget) {
              nextGroups.push(newGroup);
            }

            splitState.pageGroups = nextGroups.filter((group) => group.length);
            return true;
          }

          function dissolveSplitGroupByKey(targetGroupKey) {
            if (!targetGroupKey) return false;
            const groups = getNormalizedSplitPageGroups();
            const nextGroups = [];
            let changed = false;

            groups.forEach((group) => {
              if (getSplitGroupSignature(group) === targetGroupKey && group.length > 1) {
                changed = true;
                group.forEach((pageIndex) => {
                  nextGroups.push([pageIndex]);
                });
                return;
              }
              nextGroups.push(group);
            });

            if (!changed) return false;
            splitState.pageGroups = nextGroups.filter((group) => group.length);
            return true;
          }

          function startSplitPointerDrag(pageIndex) {
            splitState.draggedPageIndex = pageIndex;
            splitState.dragPointerActive = true;
            splitState.dragDropCommitted = false;
            document.documentElement.classList.add("split-drag-active");
            ui.splitPagesList?.classList.add("drag-active");
            ui.splitPagesList?.querySelector(`.split-page-card[data-page-index="${pageIndex}"]`)?.classList.add("dragging");
            splitState.dragPreviewX = splitState.dragPointerOriginX;
            splitState.dragPreviewY = splitState.dragPointerOriginY;
            renderSplitDragPreview();
          }

          function syncSplitButtonsState() {
            const hasFile = Boolean(splitState.file);
            const hasPages = splitState.pageCount > 0;
            const hasActivePages = getActiveSplitPageIndexes().length > 0;
            const disabled = !hasFile || splitState.loadingPages || Boolean(splitState.pageLoadError) || !hasPages;
            ui.splitStartButton.disabled = disabled || !hasActivePages;
            ui.splitActivateAllButton.disabled = disabled;
            ui.splitDeactivateAllButton.disabled = disabled;
          }

          function renderRotateDocumentDegreesSelection() {
            const selectedDegrees = getUniformRotateSelection();
            ui.rotateDocumentDegreesButtons.forEach((button) => {
              const isActive = Number(button.dataset.rotation) === selectedDegrees;
              button.classList.toggle("active", isActive);
              button.setAttribute("aria-pressed", isActive ? "true" : "false");
              button.disabled = rotateState.loadingPages || !rotateState.file || !rotateState.pageRotations.length;
            });
          }

          function renderRotatePagesList() {
            const renderRotatePagesStatus = (message, tone = "muted") => {
              if (ui.rotatePagesHint) ui.rotatePagesHint.textContent = message;
              const status = document.createElement("div");
              status.className = `rotate-pages-status rotate-pages-status-${tone}`;
              status.textContent = message;
              ui.rotatePagesList.replaceChildren(status);
            };

            if (!rotateState.file) {
              if (ui.rotatePagesHint) ui.rotatePagesHint.textContent = "";
              ui.rotatePagesList.replaceChildren();
              return;
            }

            if (rotateState.loadingPages) {
              renderRotatePagesStatus("Seiten werden geladen …");
              return;
            }

            if (rotateState.pageLoadError) {
              renderRotatePagesStatus(rotateState.pageLoadError, "error");
              return;
            }

            if (!rotateState.pageRotations.length) {
              renderRotatePagesStatus("Keine Seiten gefunden.");
              return;
            }

            if (ui.rotatePagesHint) {
              ui.rotatePagesHint.textContent = `${formatPageCountLabel(rotateState.pageRotations.length)} geladen.`;
            }
            const fragment = document.createDocumentFragment();

            rotateState.pageRotations.forEach((selectedDegrees, pageIndex) => {
              const card = document.createElement("div");
              card.className = "rotate-page-card";

              const label = document.createElement("div");
              label.className = "rotate-page-label";
              label.textContent = `Seite ${pageIndex + 1}`;

              const choices = document.createElement("div");
              choices.className = "rotate-page-choices";
              choices.setAttribute("role", "group");
              choices.setAttribute("aria-label", `Drehung für Seite ${pageIndex + 1}`);

              [0, 90, 180, 270].forEach((degrees) => {
                choices.append(createRotateChoiceButton(
                  degrees,
                  selectedDegrees === degrees,
                  `Seite ${pageIndex + 1}`,
                  pageIndex
                ));
              });

              const previewShell = document.createElement("div");
              previewShell.className = "rotate-page-preview-shell";
              const previewAnimationFrom = rotateState.previewAnimationFrom[pageIndex];
              const previewStartDegrees = typeof previewAnimationFrom === "number"
                ? getPreviewAnimationStartAngle(previewAnimationFrom, selectedDegrees)
                : selectedDegrees;
              previewShell.style.setProperty("--preview-rotation", `${previewStartDegrees}deg`);

              const previewStage = document.createElement("div");
              previewStage.className = "rotate-page-preview-stage";
              const previewUrl = rotateState.previewUrls[pageIndex];
              if (previewUrl) {
                const previewImage = document.createElement("img");
                previewImage.className = "rotate-page-preview";
                previewImage.src = previewUrl;
                previewImage.alt = `Vorschau für Seite ${pageIndex + 1}`;
                previewStage.append(previewImage);
              } else {
                const previewPlaceholder = document.createElement("div");
                previewPlaceholder.className = "rotate-page-preview-placeholder";
                previewPlaceholder.textContent = rotateState.previewLoading
                  ? "Vorschau lädt …"
                  : (
                    rotateState.previewLoadError
                      ? "Keine Vorschau"
                      : `Seite ${pageIndex + 1}`
                  );
                previewStage.append(previewPlaceholder);
              }
              previewShell.append(previewStage);

              card.append(label, choices, previewShell);
              fragment.append(card);
            });

            ui.rotatePagesList.replaceChildren(fragment);
            requestAnimationFrame(() => {
              [...ui.rotatePagesList.querySelectorAll(".rotate-page-preview-shell")].forEach((element, pageIndex) => {
                element.style.setProperty("--preview-rotation", `${rotateState.pageRotations[pageIndex] || 0}deg`);
              });
              rotateState.previewAnimationFrom = [];
            });
          }

          async function loadRotatePagePreviews(file) {
            const token = ++rotateState.previewSetupToken;
            rotateState.previewLoading = true;
            rotateState.previewLoadError = "";
            rotateState.previewUrls = [];
            renderRotatePagesList();

            try {
              const pdfjsLib = await ensurePdfJsLoaded();
              if (token !== rotateState.previewSetupToken || rotateState.file !== file) return;

              const loadingTask = pdfjsLib.getDocument({
                data: await file.arrayBuffer(),
              });
              const pdfDocument = await loadingTask.promise;
              if (token !== rotateState.previewSetupToken || rotateState.file !== file) {
                await pdfDocument.destroy();
                return;
              }

              const previews = Array.from({ length: pdfDocument.numPages }, () => "");
              for (let pageIndex = 0; pageIndex < pdfDocument.numPages; pageIndex += 1) {
                const page = await pdfDocument.getPage(pageIndex + 1);
                if (token !== rotateState.previewSetupToken || rotateState.file !== file) {
                  await pdfDocument.destroy();
                  return;
                }
                const viewport = page.getViewport({ scale: 0.28 });
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d", { alpha: false });
                if (!context) {
                  throw new Error("Canvas-Kontext für PDF-Vorschau fehlt.");
                }
                canvas.width = Math.max(1, Math.round(viewport.width));
                canvas.height = Math.max(1, Math.round(viewport.height));
                await page.render({ canvasContext: context, viewport }).promise;
                previews[pageIndex] = canvas.toDataURL("image/png");
              }

              if (token !== rotateState.previewSetupToken || rotateState.file !== file) {
                await pdfDocument.destroy();
                return;
              }
              rotateState.previewUrls = previews;
              await pdfDocument.destroy();
            } catch (error) {
              console.warn("PDF-Vorschau konnte nicht geladen werden.", error);
              if (token !== rotateState.previewSetupToken || rotateState.file !== file) return;
              rotateState.previewLoadError = error && error.message ? error.message : "Vorschau konnte nicht geladen werden.";
            } finally {
              if (token !== rotateState.previewSetupToken || rotateState.file !== file) return;
              rotateState.previewLoading = false;
              renderRotatePagesList();
            }
          }

          async function initializeSplitPageSelections(file) {
            const token = ++splitState.pageSetupToken;
            splitState.loadingPages = true;
            splitState.pageLoadError = "";
            splitState.pageCount = 0;
            splitState.activePages = new Set();
            splitState.pageGroups = [];
            splitState.groupRowValues = new Map();
            splitState.draftGroupRow = { start: "", end: "" };
            renderSplitSelection();

            try {
              const { sourceDoc } = await loadPdfLibDocumentFromFile(file, "Aufteilen");
              const pageCount = sourceDoc.getPageCount();
              if (!Number.isInteger(pageCount) || pageCount < 1) {
                throw new Error("Die PDF enthält keine Seiten.");
              }
              if (token !== splitState.pageSetupToken || splitState.file !== file) return;
              splitState.pageCount = pageCount;
              splitState.activePages = new Set(Array.from({ length: pageCount }, (_, pageIndex) => pageIndex));
              splitState.pageGroups = Array.from({ length: pageCount }, (_, pageIndex) => [pageIndex]);
            } catch (error) {
              console.error(error);
              if (token !== splitState.pageSetupToken || splitState.file !== file) return;
              splitState.pageLoadError = error && error.message
                ? error.message
                : "Seiten konnten nicht geladen werden.";
            } finally {
              if (token !== splitState.pageSetupToken || splitState.file !== file) return;
              splitState.loadingPages = false;
              renderSplitSelection();
            }
          }

          async function loadSplitPagePreviews(file) {
            const token = ++splitState.previewSetupToken;
            splitState.previewLoading = true;
            splitState.previewLoadError = "";
            splitState.previewUrls = [];
            renderSplitPagesList();

            try {
              const pdfjsLib = await ensurePdfJsLoaded();
              if (token !== splitState.previewSetupToken || splitState.file !== file) return;

              const loadingTask = pdfjsLib.getDocument({
                data: await file.arrayBuffer(),
              });
              const pdfDocument = await loadingTask.promise;
              if (token !== splitState.previewSetupToken || splitState.file !== file) {
                await pdfDocument.destroy();
                return;
              }

              const previews = Array.from({ length: pdfDocument.numPages }, () => "");
              for (let pageIndex = 0; pageIndex < pdfDocument.numPages; pageIndex += 1) {
                const page = await pdfDocument.getPage(pageIndex + 1);
                if (token !== splitState.previewSetupToken || splitState.file !== file) {
                  await pdfDocument.destroy();
                  return;
                }
                const viewport = page.getViewport({ scale: 0.28 });
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d", { alpha: false });
                if (!context) {
                  throw new Error("Canvas-Kontext für PDF-Vorschau fehlt.");
                }
                canvas.width = Math.max(1, Math.round(viewport.width));
                canvas.height = Math.max(1, Math.round(viewport.height));
                await page.render({ canvasContext: context, viewport }).promise;
                previews[pageIndex] = canvas.toDataURL("image/png");
              }

              if (token !== splitState.previewSetupToken || splitState.file !== file) {
                await pdfDocument.destroy();
                return;
              }
              splitState.previewUrls = previews;
              await pdfDocument.destroy();
            } catch (error) {
              console.warn("PDF-Vorschau konnte nicht geladen werden.", error);
              if (token !== splitState.previewSetupToken || splitState.file !== file) return;
              splitState.previewLoadError = error && error.message ? error.message : "Vorschau konnte nicht geladen werden.";
            } finally {
              if (token !== splitState.previewSetupToken || splitState.file !== file) return;
              splitState.previewLoading = false;
              renderSplitPagesList();
            }
          }

          async function initializeRotatePageSelections(file) {
            const token = ++rotateState.pageSetupToken;
            rotateState.loadingPages = true;
            rotateState.pageLoadError = "";
            rotateState.basePageRotations = [];
            rotateState.documentRotation = 0;
            rotateState.pageRotations = [];
            renderRotateSelection();

            try {
              const { PDFLib, sourceDoc } = await loadPdfLibDocumentFromFile(file, "Drehen");
              const pageCount = sourceDoc.getPageCount();
              if (!Number.isInteger(pageCount) || pageCount < 1) {
                throw new Error("Die PDF enthält keine Seiten.");
              }
              if (token !== rotateState.pageSetupToken || rotateState.file !== file) return;
              rotateState.basePageRotations = Array.from({ length: pageCount }, (_, pageIndex) => {
                const page = sourceDoc.getPage(pageIndex);
                return normalizeRotationAngle(getPageRotationAngle(page));
              });
              rotateState.pageRotations = Array.from({ length: pageCount }, () => 0);
            } catch (error) {
              console.error(error);
              if (token !== rotateState.pageSetupToken || rotateState.file !== file) return;
              rotateState.pageLoadError = error && error.message
                ? error.message
                : "Seiten konnten nicht geladen werden.";
            } finally {
              if (token !== rotateState.pageSetupToken || rotateState.file !== file) return;
              rotateState.loadingPages = false;
              renderRotateSelection();
            }
          }

          function partitionPdfFiles(fileList) {
            const accepted = [];
            let rejectedCount = 0;
            for (const file of fileList || []) {
              if (isPdfFile(file)) accepted.push(file);
              else rejectedCount += 1;
            }
            return { accepted, rejectedCount };
          }

          function maybeShowFileSelectionWarning({ rejectedCount = 0, ignoredExtraCount = 0 } = {}) {
            const messages = [];
            if (rejectedCount > 0) {
              messages.push(
                rejectedCount === 1
                  ? "1 Datei wurde ignoriert, weil sie keine .pdf-Endung hat."
                  : `${rejectedCount} Dateien wurden ignoriert, weil sie keine .pdf-Endung haben.`
              );
            }
            if (ignoredExtraCount > 0) {
              messages.push(
                ignoredExtraCount === 1
                  ? "Es wurde nur die erste ausgewählte PDF übernommen."
                  : `Es wurde nur die erste PDF übernommen. ${ignoredExtraCount} weitere PDFs wurden ignoriert.`
              );
            }
            if (!messages.length) return;
            showResultDialog(messages.join("\n"), "warn", "Hinweis");
          }

          async function addMergeFiles(fileList) {
            if (!fileList || !fileList.length) return;
            const { accepted, rejectedCount } = partitionPdfFiles(fileList);
            maybeShowFileSelectionWarning({ rejectedCount });
            if (!accepted.length) return;
            mergeState.files = mergeState.files.concat(accepted);
            renderMergeFileList();
          }

          async function setSingleToolFile(tool, file) {
            if (!file) return;
            if (!isPdfFile(file)) {
              showResultDialog("Bitte eine Datei mit .pdf-Endung wählen.", "warn", "Hinweis");
              return;
            }

            const state = getToolFileState(tool);
            if (!state) return;
            state.file = file;
            if (tool === TOOL_LAYOUT) {
              renderLayoutSelection();
              await updateSpecialThreeModeAvailability(file);
              return;
            }
            if (tool === TOOL_ROTATE) {
              renderRotateSelection();
              await initializeRotatePageSelections(file);
              void loadRotatePagePreviews(file);
              return;
            }
            if (tool === TOOL_SPLIT) {
              renderSplitSelection();
              await initializeSplitPageSelections(file);
              void loadSplitPagePreviews(file);
              return;
            }
          }

          async function setSingleToolFileFromSelection(tool, fileList) {
            const { accepted, rejectedCount } = partitionPdfFiles(fileList);
            const ignoredExtraCount = Math.max(0, accepted.length - 1);
            maybeShowFileSelectionWarning({ rejectedCount, ignoredExtraCount });
            if (!accepted.length) return;
            await setSingleToolFile(tool, accepted[0]);
          }

          function openSharedPdfPicker(target) {
            pendingPickerTarget = target;
            ui.sharedPdfInput.multiple = Boolean(target?.multiple);
            ui.sharedPdfInput.value = "";
            window.setTimeout(() => {
              if (pendingPickerTarget !== target) return;
              ui.sharedPdfInput.click();
            }, 0);
          }

          function findMergeDragAfterElement(clientY) {
            const rows = [...ui.mergeAppendFileList.querySelectorAll(".file-item:not(.dragging)")];
            let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
            for (const row of rows) {
              const box = row.getBoundingClientRect();
              const offset = clientY - box.top - box.height / 2;
              if (offset < 0 && offset > closest.offset) {
                closest = { offset, element: row };
              }
            }
            return closest.element;
          }

          function syncMergeDragPlaceholderState() {
            if (!mergeState.dragPlaceholder || !mergeState.dragSourceRow) return;
            const atOrigin = mergeState.dragPlaceholder.previousElementSibling === mergeState.dragSourceRow;
            mergeState.dragPlaceholder.classList.toggle("at-origin", atOrigin);
          }

          function positionMergeDragPlaceholder(clientY) {
            if (!ui.mergeAppendFileList || !mergeState.dragPlaceholder) return;
            const after = findMergeDragAfterElement(clientY);
            if (!after) {
              ui.mergeAppendFileList.append(mergeState.dragPlaceholder);
              syncMergeDragPlaceholderState();
              return;
            }
            ui.mergeAppendFileList.insertBefore(mergeState.dragPlaceholder, after);
            syncMergeDragPlaceholderState();
          }

          function autoScrollMergeListDuringDrag(clientY) {
            if (!ui.mergeFileListShell) return;
            const rect = ui.mergeFileListShell.getBoundingClientRect();
            const threshold = 34;
            const step = 14;
            if (clientY < rect.top + threshold) {
              ui.mergeFileListShell.scrollTop -= step;
            } else if (clientY > rect.bottom - threshold) {
              ui.mergeFileListShell.scrollTop += step;
            }
          }

          function clearMergeDragState() {
            if (mergeState.dragSourceRow) {
              mergeState.dragSourceRow.classList.remove("dragging");
            }
            if (mergeState.dragPlaceholder && mergeState.dragPlaceholder.parentElement) {
              mergeState.dragPlaceholder.remove();
            }
            mergeState.dragIndex = null;
            mergeState.dropIndex = null;
            mergeState.dragSourceRow = null;
            mergeState.dragPlaceholder = null;
            mergeState.dragDropCommitted = false;
          }

          function applyMergeFileOrderFromDom() {
            const orderedFiles = [...ui.mergeAppendFileList.querySelectorAll(".file-item[data-file-index]")]
              .map((row) => mergeState.files[Number(row.dataset.fileIndex)])
              .filter(Boolean);
            if (orderedFiles.length !== mergeState.files.length) return;
            mergeState.files = orderedFiles;
          }

          function setPagesPerSheetSelection(value) {
            layoutState.pagesPerSheet = value;
            renderPagesPerSheetSelection();
            syncLayoutStartButtonState();
          }

          function renderPagesPerSheetSelection() {
            for (const button of ui.pagesButtons) {
              const active = !layoutState.specialThreeModeEnabled && Number(button.dataset.pages) === layoutState.pagesPerSheet;
              button.classList.toggle("active", active);
              button.setAttribute("aria-pressed", String(active));
            }
            ui.specialThreeModeButton.setAttribute("aria-pressed", String(layoutState.specialThreeModeEnabled));
          }

          function syncPagesButtonsDisabledState() {
            const disabled = !layoutState.file;
            for (const button of ui.pagesButtons) {
              button.disabled = disabled;
            }
            ui.specialThreeModeButton.disabled = disabled || !layoutState.specialThreeModeAvailable;
          }

          function setSpecialThreeModeAvailability(available) {
            layoutState.specialThreeModeAvailable = available;
            ui.specialThreeModeButton.disabled = !layoutState.file || !layoutState.specialThreeModeAvailable;
            ui.specialThreeModeButton.title = available
              ? "Spezialmodus für 3-seitige PDF: 1|1 + 2|3"
              : "Nur bei 3-seitiger PDF verfügbar";
            if (!available && layoutState.specialThreeModeEnabled) {
              layoutState.specialThreeModeEnabled = false;
              ui.specialThreeModeButton.setAttribute("aria-pressed", "false");
              renderPagesPerSheetSelection();
            }
            syncPagesButtonsDisabledState();
            syncLayoutStartButtonState();
          }

          async function updateSpecialThreeModeAvailability(file) {
            const token = ++layoutState.specialModeProbeToken;
            setSpecialThreeModeAvailability(false);
            if (!file) return;

            try {
              // Für die Seitenzahl-Prüfung möglichst dieselbe Engine nutzen wie später beim Start.
              if (!(window.PDFLib && window.PDFLib.PDFDocument)) {
                try {
                  await ensurePdfLibLoaded();
                } catch (_) {
                  // Fallback auf lokale Parser-Logik in loadSourceDocument.
                }
              }
              const arrayBuffer = await file.arrayBuffer();
              if (token !== layoutState.specialModeProbeToken || file !== layoutState.file) return;
              const inputBytes = new Uint8Array(arrayBuffer);
              const loaded = await loadSourceDocument(inputBytes);
              if (token !== layoutState.specialModeProbeToken || file !== layoutState.file) return;
              const pageCount = loaded.source.getPageCount();
              setSpecialThreeModeAvailability(pageCount === 3);
            } catch (error) {
              if (token !== layoutState.specialModeProbeToken || file !== layoutState.file) return;
              setSpecialThreeModeAvailability(false);
              maybeShowMacOSPermissionHint(error);
            }
          }

          function setLayoutOptionsEnabled(enabled) {
            ui.optionsPanel.classList.toggle("options-disabled", !enabled);
            ui.optionsPanel.setAttribute("aria-disabled", String(!enabled));
            syncPagesButtonsDisabledState();
            ui.autoOrientationToggle.disabled = !enabled;
            ui.studentCount.disabled = !enabled;
            syncNumberStepperState(ui.studentCount);
            for (const radio of ui.paddingModes) {
              radio.disabled = !enabled;
            }
            if (!enabled) setSpecialThreeModeAvailability(false);
            else ui.specialThreeModeButton.disabled = !layoutState.specialThreeModeAvailable;
            syncLayoutStartButtonState();
          }

          function triggerDownload(url, outputName) {
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = outputName;
            anchor.click();
          }

          async function deliverMultiplePdfs(outputs, successMessage) {
            for (let index = 0; index < outputs.length; index += 1) {
              const output = outputs[index];
              const url = URL.createObjectURL(new Blob([output.bytes], { type: "application/pdf" }));
              triggerDownload(url, output.name);
              setTimeout(() => URL.revokeObjectURL(url), 30_000);
              if (index < outputs.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 80));
              }
            }
            showResultDialog(successMessage, "ok", "");
          }

          async function deliverSinglePdf(bytes, outputName, successMessage) {
            const blob = new Blob([bytes], { type: "application/pdf" });
            const shareResult = await tryShareMergedPdfOnIOS(blob, outputName);

            if (shareResult.handled) {
              if (shareResult.status === "cancelled") {
                showResultDialog(`PDF wurde erstellt, Teilen wurde abgebrochen.\n${outputName}`, "warn", "Hinweis");
              } else {
                showResultDialog(successMessage, "ok", "");
              }
              return;
            }

            const url = URL.createObjectURL(blob);
            triggerDownload(url, outputName);
            setTimeout(() => URL.revokeObjectURL(url), 120_000);
            showResultDialog(successMessage, "ok", "", url);
          }

          async function ensurePdfLibForTool(operationLabel) {
            if (!(window.PDFLib && window.PDFLib.PDFDocument)) {
              showBusyDialog("PDF-Engine wird geladen ...");
              try {
                await ensurePdfLibLoaded();
              } catch (_error) {
                throw new Error(`${operationLabel} benötigt die PDF-Library. Bitte Internetverbindung prüfen und erneut versuchen.`);
              } finally {
                hideBusyDialog();
              }
            }

            const PDFLib = window.PDFLib;
            if (!(PDFLib && PDFLib.PDFDocument)) {
              throw new Error("Die PDF-Library konnte nicht geladen werden.");
            }
            return PDFLib;
          }

          async function loadPdfLibDocumentFromFile(file, operationLabel) {
            const PDFLib = await ensurePdfLibForTool(operationLabel);
            const bytes = new Uint8Array(await file.arrayBuffer());
            try {
              const sourceDoc = await PDFLib.PDFDocument.load(bytes);
              return { PDFLib, sourceDoc };
            } catch (_error) {
              throw new Error(`"${file.name}" konnte nicht gelesen werden (evtl. beschädigt oder verschlüsselt).`);
            }
          }

          async function createPdfFromPageIndexes(PDFLib, sourceDoc, pageIndexes) {
            const outputDoc = await PDFLib.PDFDocument.create();
            for (const pageIndex of pageIndexes) {
              const [copiedPage] = await outputDoc.copyPages(sourceDoc, [pageIndex]);
              outputDoc.addPage(copiedPage);
            }
            if (!outputDoc.getPageCount()) {
              throw new Error("Die Auswahl enthält keine Seiten.");
            }
            return outputDoc.save({ useObjectStreams: false });
          }

          async function handleLayoutStart() {
            if (!layoutState.file) {
              showResultDialog("Bitte zuerst eine PDF-Datei auswählen.", "warn", "Hinweis");
              return;
            }

            const studentText = ui.studentCount.value.trim();
            const studentCount = studentText ? Number(studentText) : null;
            if (studentText && (!Number.isInteger(studentCount) || studentCount <= 0)) {
              showResultDialog("Die Anzahl Lernende muss eine ganze Zahl größer 0 sein.", "warn", "Hinweis");
              return;
            }

            ui.layoutStartButton.disabled = true;

            try {
              if (!(window.PDFLib && window.PDFLib.PDFDocument)) {
                showBusyDialog("PDF-Engine wird geladen ...");
                try {
                  await ensurePdfLibLoaded();
                } catch (error) {
                  console.warn("PDF-Library konnte nicht vorab geladen werden:", error);
                } finally {
                  hideBusyDialog();
                }
              }

              const arrayBuffer = await layoutState.file.arrayBuffer();
              const inputBytes = new Uint8Array(arrayBuffer);
              const loaded = await loadSourceDocument(inputBytes);
              const source = loaded.source;
              const engine = loaded.engine;

              const pageCount = source.getPageCount();
              if (!pageCount) throw new Error("Die PDF enthaelt keine Seiten.");

              const effectivePaddingMode = layoutState.specialThreeModeEnabled
                ? getPaddingModeValue()
                : chooseEffectivePaddingMode(
                  pageCount,
                  layoutState.pagesPerSheet,
                  getPaddingModeValue()
                );

              if (effectivePaddingMode === "lcm" && !studentCount) {
                throw new Error("Für 'Auffüllen nach Anzahl der Lernenden' muss eine Anzahl Lernende eingetragen sein.");
              }
              const autoOrientationEnabled = ui.autoOrientationToggle.checked;

              let outBytes;
              if (engine === "pdf-lib") {
                outBytes = await imposeWithPdfLib(
                  source,
                  layoutState.pagesPerSheet,
                  effectivePaddingMode,
                  layoutState.specialThreeModeEnabled,
                  studentCount,
                  autoOrientationEnabled
                );
              } else {
                const imposer = new OfflineImposer(source);
                outBytes = imposer.impose(
                  layoutState.pagesPerSheet,
                  effectivePaddingMode,
                  layoutState.specialThreeModeEnabled,
                  studentCount,
                  autoOrientationEnabled
                );
              }

              const copyCount = deriveCopyCount(
                pageCount,
                layoutState.pagesPerSheet,
                studentCount,
                effectivePaddingMode,
                layoutState.specialThreeModeEnabled
              );

              const outputName = buildOutputName(getBaseName(layoutState.file.name), copyCount);
              await deliverSinglePdf(outBytes, outputName, "PDF erstellt.");
            } catch (error) {
              console.error(error);
              if (maybeShowMacOSPermissionHint(error)) return;
              const message = error && error.message ? error.message : "PDF konnte nicht verarbeitet werden.";
              showResultDialog(message, "error", "Fehler");
            } finally {
              syncLayoutStartButtonState();
            }
          }

          async function handleMergeStart() {
            if (mergeState.files.length < 2) {
              showResultDialog("Bitte mindestens zwei PDF-Dateien auswählen.", "warn", "Hinweis");
              return;
            }

            ui.mergeStartButton.disabled = true;
            try {
              const PDFLib = await ensurePdfLibForTool("Zusammenführen");
              const outputDoc = await PDFLib.PDFDocument.create();

              for (const file of mergeState.files) {
                const bytes = new Uint8Array(await file.arrayBuffer());
                let sourceDoc;
                try {
                  sourceDoc = await PDFLib.PDFDocument.load(bytes);
                } catch (_error) {
                  throw new Error(`"${file.name}" konnte nicht gelesen werden (evtl. beschädigt oder verschlüsselt).`);
                }

                const copiedPages = await outputDoc.copyPages(sourceDoc, sourceDoc.getPageIndices());
                for (const page of copiedPages) {
                  outputDoc.addPage(page);
                }
              }

              if (!outputDoc.getPageCount()) {
                throw new Error("Die ausgewählten PDFs enthalten keine Seiten.");
              }

              const outBytes = await outputDoc.save({ useObjectStreams: false });
              const outputName = buildAppendOutputName(mergeState.files);
              await deliverSinglePdf(outBytes, outputName, "PDFs zusammengeführt.");
            } catch (error) {
              console.error(error);
              if (maybeShowMacOSPermissionHint(error)) return;
              const message = error && error.message ? error.message : "PDFs konnten nicht zusammengeführt werden.";
              showResultDialog(message, "error", "Fehler");
            } finally {
              syncMergeStartButtonState();
            }
          }

          async function handleRotateStart() {
            if (!rotateState.file) {
              showResultDialog("Bitte zuerst eine PDF-Datei auswählen.", "warn", "Hinweis");
              return;
            }
            if (!rotateState.pageRotations.length) {
              showResultDialog("Die Seitenauswahl ist noch nicht bereit.", "warn", "Hinweis");
              return;
            }

            ui.rotateStartButton.disabled = true;
            try {
              const { PDFLib, sourceDoc } = await loadPdfLibDocumentFromFile(rotateState.file, "Drehen");
              const pageCount = sourceDoc.getPageCount();
              if (!pageCount) throw new Error("Die PDF enthält keine Seiten.");
              if (pageCount !== rotateState.pageRotations.length) {
                throw new Error("Die Seitenanzahl hat sich geändert. Bitte die PDF erneut auswählen.");
              }

              rotateState.pageRotations.forEach((degrees, pageIndex) => {
                const page = sourceDoc.getPage(pageIndex);
                const nextAngle = normalizeRotationAngle(getPageRotationAngle(page) + degrees);
                page.setRotation(PDFLib.degrees(nextAngle));
              });

              const outBytes = await sourceDoc.save({ useObjectStreams: false });
              await deliverSinglePdf(outBytes, buildRotatedOutputName(rotateState.file.name), "PDF gedreht.");
            } catch (error) {
              console.error(error);
              if (maybeShowMacOSPermissionHint(error)) return;
              const message = error && error.message ? error.message : "PDF konnte nicht gedreht werden.";
              showResultDialog(message, "error", "Fehler");
            } finally {
              syncRotateStartButtonState();
            }
          }

          async function handleSplitStart() {
            if (!splitState.file) {
              showResultDialog("Bitte zuerst eine PDF-Datei auswählen.", "warn", "Hinweis");
              return;
            }

            const activePageIndexes = getActiveSplitPageIndexes();
            if (!activePageIndexes.length) {
              showResultDialog("Bitte mindestens eine Seite aktivieren.", "warn", "Hinweis");
              return;
            }

            ui.splitStartButton.disabled = true;
            try {
              const { PDFLib, sourceDoc } = await loadPdfLibDocumentFromFile(splitState.file, "Aufteilen");
              const pageCount = sourceDoc.getPageCount();
              if (!pageCount) throw new Error("Die PDF enthält keine Seiten.");

              if (splitState.outputMode === "single") {
                const groups = getOrderedActiveSplitGroups();
                const outputs = [];
                for (let index = 0; index < groups.length; index += 1) {
                  const group = groups[index];
                  const bytes = await createPdfFromPageIndexes(PDFLib, sourceDoc, group);
                  outputs.push({
                    bytes,
                    name: group.length === 1
                      ? buildSplitSingleOutputName(
                        splitState.file.name,
                        group[0] + 1,
                        Math.max(2, String(pageCount).length)
                      )
                      : buildSplitPartOutputName(splitState.file.name, index, groups.length),
                  });
                }
                await deliverMultiplePdfs(
                  outputs,
                  outputs.length === 1 ? "PDF erstellt." : `${outputs.length} PDFs erstellt.`
                );
              } else {
                const outBytes = await createPdfFromPageIndexes(PDFLib, sourceDoc, getOrderedActiveSplitPageIndexes());
                await deliverSinglePdf(
                  outBytes,
                  buildSplitCombinedOutputName(splitState.file.name),
                  "PDF erstellt."
                );
              }
            } catch (error) {
              console.error(error);
              if (maybeShowMacOSPermissionHint(error)) return;
              const message = error && error.message ? error.message : "PDF konnte nicht aufgeteilt werden.";
              showResultDialog(message, "error", "Fehler");
            } finally {
              syncSplitButtonsState();
            }
          }

          function handleSplitGroupRowApply(rowKind, groupKey) {
            if (!splitState.file) {
              showResultDialog("Bitte zuerst eine PDF-Datei auswählen.", "warn", "Hinweis");
              return;
            }

            const values = rowKind === "existing"
              ? getSplitExistingGroupRowValues(groupKey)
              : splitState.draftGroupRow;
            const validation = getValidatedSplitRange(values.start, values.end);
            if (!validation.ok) {
              showResultDialog(validation.reason, "warn", "Hinweis");
              return;
            }

            const changed = rowKind === "existing"
              ? upsertSplitGroupFromRange(groupKey, validation.start, validation.end)
              : createSplitGroupFromRange(validation.start, validation.end);
            if (!changed) {
              showResultDialog("Eine Gruppe muss mindestens 2 Seiten umfassen.", "warn", "Hinweis");
              return;
            }

            if (rowKind === "draft") {
              splitState.draftGroupRow = { start: "", end: "" };
            }

            renderSplitSelection();
          }

          function handleSplitGroupRowDissolve(groupKey) {
            if (!splitState.file || splitState.pageCount < 1) {
              showResultDialog("Bitte zuerst eine PDF-Datei auswählen.", "warn", "Hinweis");
              return;
            }

            if (!dissolveSplitGroupByKey(groupKey)) {
              showResultDialog("Die Gruppe konnte nicht aufgelöst werden.", "warn", "Hinweis");
              return;
            }

            renderSplitSelection();
          }

          function bindFileDropZone({ dropZone, openPicker, onFilesDropped, shouldOpenPicker = null }) {
            dropZone.addEventListener("click", (event) => {
              if (event.target.closest("[data-clear-tool]")) {
                return;
              }
              if (typeof shouldOpenPicker === "function" && !shouldOpenPicker(event)) {
                return;
              }
              openPicker();
            });
            dropZone.addEventListener("keydown", (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openPicker();
              }
            });
            dropZone.addEventListener("dragover", (event) => {
              event.preventDefault();
              event.stopPropagation();
              dropZone.classList.add("dragover");
            });
            dropZone.addEventListener("dragleave", () => {
              dropZone.classList.remove("dragover");
            });
            dropZone.addEventListener("drop", async (event) => {
              event.preventDefault();
              event.stopPropagation();
              dropZone.classList.remove("dragover");
              const files = [...(event.dataTransfer?.files || [])];
              await onFilesDropped(files);
            });
          }

          ui.toolTabs.forEach((button) => {
            button.addEventListener("click", () => setActiveTool(button.dataset.tool));
          });
          ui.sharedPdfInput.addEventListener("change", async () => {
            const files = [...(ui.sharedPdfInput.files || [])];
            const target = pendingPickerTarget;
            ui.sharedPdfInput.value = "";
            pendingPickerTarget = null;
            if (!files.length || !target) return;
            if (target.tool === TOOL_MERGE) {
              await addMergeFiles(files);
              return;
            }
            await setSingleToolFileFromSelection(target.tool, files);
          });

          [ui.layoutDropSummary, ui.rotateDropSummary, ui.splitDropSummary].forEach((summary) => {
            summary?.addEventListener("click", (event) => {
              const removeButton = event.target.closest("button[data-clear-tool]");
              if (!removeButton) return;
              event.preventDefault();
              event.stopPropagation();
              clearSingleToolFile(removeButton.dataset.clearTool);
            });
          });

          bindFileDropZone({
            dropZone: ui.mergeDropZone,
            openPicker: () => openSharedPdfPicker({ tool: TOOL_MERGE, multiple: true }),
            onFilesDropped: addMergeFiles,
            shouldOpenPicker: (event) => !event.target.closest("#mergeFileListShell"),
          });
          bindFileDropZone({
            dropZone: ui.layoutDropZone,
            openPicker: () => openSharedPdfPicker({ tool: TOOL_LAYOUT, multiple: false }),
            onFilesDropped: (files) => setSingleToolFileFromSelection(TOOL_LAYOUT, files),
          });
          bindFileDropZone({
            dropZone: ui.rotateDropZone,
            openPicker: () => openSharedPdfPicker({ tool: TOOL_ROTATE, multiple: false }),
            onFilesDropped: (files) => setSingleToolFileFromSelection(TOOL_ROTATE, files),
          });
          bindFileDropZone({
            dropZone: ui.splitDropZone,
            openPicker: () => openSharedPdfPicker({ tool: TOOL_SPLIT, multiple: false }),
            onFilesDropped: (files) => setSingleToolFileFromSelection(TOOL_SPLIT, files),
          });
          ui.mergeAppendFileList.addEventListener("dragstart", (event) => {
            const row = event.target.closest(".file-item");
            if (!row) return;
            const index = Number(row.dataset.fileIndex);
            if (!Number.isInteger(index)) return;
            mergeState.dragIndex = index;
            mergeState.dropIndex = null;
            mergeState.dragSourceRow = row;
            mergeState.dragDropCommitted = false;
            row.classList.add("dragging");
            const rowHeight = Math.max(Math.round(row.getBoundingClientRect().height), 42);
            const placeholder = document.createElement("div");
            placeholder.className = "file-item file-drag-placeholder";
            placeholder.setAttribute("aria-hidden", "true");
            placeholder.style.height = `${rowHeight}px`;
            mergeState.dragPlaceholder = placeholder;
            ui.mergeAppendFileList.insertBefore(placeholder, row.nextSibling);
            syncMergeDragPlaceholderState();
            if (event.dataTransfer) {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", String(index));
            }
          });
          ui.mergeAppendFileList.addEventListener("dragover", (event) => {
            if (mergeState.dragIndex == null || !mergeState.dragSourceRow || !mergeState.dragPlaceholder) return;
            event.preventDefault();
            event.stopPropagation();
            ui.mergeDropZone.classList.remove("dragover");
            autoScrollMergeListDuringDrag(event.clientY);
            positionMergeDragPlaceholder(event.clientY);
            if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
          });
          ui.mergeAppendFileList.addEventListener("drop", (event) => {
            if (mergeState.dragIndex == null) return;
            event.preventDefault();
            event.stopPropagation();
            ui.mergeDropZone.classList.remove("dragover");
            mergeState.dragDropCommitted = true;
            positionMergeDragPlaceholder(event.clientY);
          });
          ui.mergeAppendFileList.addEventListener("dragend", () => {
            const shouldApply = Boolean(mergeState.dragIndex != null && mergeState.dragDropCommitted);
            if (
              shouldApply &&
              mergeState.dragSourceRow &&
              mergeState.dragPlaceholder &&
              mergeState.dragPlaceholder.parentElement === ui.mergeAppendFileList
            ) {
              ui.mergeAppendFileList.insertBefore(mergeState.dragSourceRow, mergeState.dragPlaceholder);
            }
            ui.mergeDropZone.classList.remove("dragover");
            clearMergeDragState();
            if (shouldApply) {
              applyMergeFileOrderFromDom();
              renderMergeFileList();
            }
          });
          ui.mergeAppendFileList.addEventListener("click", (event) => {
            event.stopPropagation();
            const removeButton = event.target.closest("button[data-remove-index]");
            if (!removeButton) return;
            const index = Number(removeButton.dataset.removeIndex);
            if (!Number.isInteger(index) || index < 0 || index >= mergeState.files.length) return;
            const [removedFile] = mergeState.files.splice(index, 1);
            mergeState.pageCountByFile.delete(removedFile);
            renderMergeFileList();
          });

          ui.studentCount.addEventListener("input", () => {
            const raw = ui.studentCount.value.trim();
            const hasValidCount = raw !== "" && Number(raw) > 0;
            const currentMode = getPaddingModeValue();

            if (hasValidCount && currentMode === "blank") {
              setPaddingModeValue("lcm");
            } else if (!hasValidCount && currentMode === "lcm") {
              setPaddingModeValue("blank");
            }
            syncNumberStepperState(ui.studentCount);
            syncLayoutStartButtonState();
          });
          ui.paddingModes.forEach((radio) => {
            radio.addEventListener("change", syncLayoutStartButtonState);
          });
          ui.pagesButtons.forEach((button) => {
            button.addEventListener("click", () => {
              if (layoutState.specialThreeModeEnabled) {
                layoutState.specialThreeModeEnabled = false;
                ui.specialThreeModeButton.setAttribute("aria-pressed", "false");
              }
              setPagesPerSheetSelection(Number(button.dataset.pages));
            });
          });
          ui.specialThreeModeButton.addEventListener("click", () => {
            if (ui.specialThreeModeButton.disabled) return;
            layoutState.specialThreeModeEnabled = !layoutState.specialThreeModeEnabled;
            ui.specialThreeModeButton.setAttribute("aria-pressed", String(layoutState.specialThreeModeEnabled));
            renderPagesPerSheetSelection();
            syncPagesButtonsDisabledState();
            syncLayoutStartButtonState();
          });

          ui.rotateDocumentDegreesButtons.forEach((button) => {
            button.addEventListener("click", () => {
              const degrees = Number(button.dataset.rotation);
              if (!rotateState.pageRotations.length) return;
              rotateState.previewAnimationFrom = [...rotateState.pageRotations];
              rotateState.pageRotations = rotateState.pageRotations.map(() => normalizeRotationAngle(degrees));
              renderRotateSelection();
            });
          });
          ui.rotatePagesList.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-page-index][data-rotation]");
            if (!button) return;
            const pageIndex = Number(button.dataset.pageIndex);
            const degrees = Number(button.dataset.rotation);
            if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= rotateState.pageRotations.length) return;
            rotateState.previewAnimationFrom = [...rotateState.pageRotations];
            rotateState.pageRotations[pageIndex] = normalizeRotationAngle(degrees);
            renderRotateSelection();
          });
          ui.splitOutputModeButtons.forEach((button) => {
            button.addEventListener("click", () => {
              if (!splitState.file || splitState.loadingPages) return;
              splitState.outputMode = button.dataset.splitOutputMode === "single" ? "single" : "combined";
              renderSplitSelection();
            });
          });
          ui.splitGroupRowsList?.addEventListener("input", (event) => {
            const input = event.target.closest('input[data-split-group-field][data-split-group-row-kind]');
            if (!input) return;

            const row = input.closest(".split-group-row");
            if (!row) return;

            const startInput = row.querySelector('input[data-split-group-field="start"]');
            const endInput = row.querySelector('input[data-split-group-field="end"]');
            if (!startInput || !endInput) return;

            const changedField = input.dataset.splitGroupField === "start" ? "start" : "end";
            const values = normalizeSplitGroupRowValues(startInput.value, endInput.value, changedField);
            const rowKind = row.dataset.splitGroupRowKind === "existing" ? "existing" : "draft";
            const groupKey = row.dataset.splitGroupKey || "";

            if (rowKind === "existing" && groupKey) {
              splitState.groupRowValues.set(groupKey, values);
            } else {
              splitState.draftGroupRow = values;
            }

            applySplitGroupRowInputState(row, values);
          });
          ui.splitGroupRowsList?.addEventListener("click", (event) => {
            const button = event.target.closest('button[data-split-group-action][data-split-group-row-kind]');
            if (!button) return;

            const rowKind = button.dataset.splitGroupRowKind === "existing" ? "existing" : "draft";
            const groupKey = button.dataset.splitGroupKey || "";
            const action = button.dataset.splitGroupAction;

            if (action === "apply") {
              handleSplitGroupRowApply(rowKind, groupKey);
              return;
            }
            if (action === "dissolve" && rowKind === "existing") {
              handleSplitGroupRowDissolve(groupKey);
            }
          });
          ui.splitPagesList?.addEventListener("click", (event) => {
            if (splitState.loadingPages || splitState.dragSettling) return;
            const card = event.target.closest(".split-page-card[data-page-index]");
            if (!card) return;
            const pageIndex = Number(card.dataset.pageIndex);
            if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= splitState.pageCount) return;
            if (splitState.activePages.has(pageIndex)) splitState.activePages.delete(pageIndex);
            else splitState.activePages.add(pageIndex);
            renderSplitSelection();
          });
          ui.splitPagesList?.addEventListener("pointerdown", (event) => {
            const card = event.target.closest(".split-page-card[data-page-index]");
            if (!card || event.button !== 0 || splitState.loadingPages) return;
            const pageIndex = Number(card.dataset.pageIndex);
            if (!Number.isInteger(pageIndex)) return;
            splitState.dragPointerId = event.pointerId;
            splitState.dragPointerOriginX = event.clientX;
            splitState.dragPointerOriginY = event.clientY;
            splitState.draggedPageIndex = pageIndex;
            splitState.dragDropCommitted = false;
            splitState.dragPointerActive = false;
            splitState.dragHoverPageIndex = null;
            card.setPointerCapture?.(event.pointerId);
          });
          ui.splitPagesList?.addEventListener("pointermove", (event) => {
            if (splitState.dragPointerId !== event.pointerId || splitState.draggedPageIndex == null) return;
            const deltaX = event.clientX - splitState.dragPointerOriginX;
            const deltaY = event.clientY - splitState.dragPointerOriginY;
            if (!splitState.dragPointerActive) {
              if (Math.hypot(deltaX, deltaY) < 6) return;
              startSplitPointerDrag(splitState.draggedPageIndex);
            }
            splitState.dragPreviewX = event.clientX;
            splitState.dragPreviewY = event.clientY;
            renderSplitDragPreview();
            updateSplitDragHover(event.clientX, event.clientY);
          });
          ui.splitPagesList?.addEventListener("pointerleave", (event) => {
            if (splitState.dragPointerId !== event.pointerId || !splitState.dragPointerActive) return;
            clearSplitDropTargets();
            splitState.dragHoverPageIndex = null;
          });
          ui.splitPagesList?.addEventListener("pointerup", (event) => {
            if (splitState.dragPointerId !== event.pointerId) return;
            const draggedPageIndex = splitState.draggedPageIndex;
            if (!splitState.dragPointerActive) {
              clearSplitPointerDragState();
              return;
            }

            const changed = Number.isInteger(draggedPageIndex) && Number.isInteger(splitState.dragHoverPageIndex)
              ? mergeSplitPageIntoGroup(draggedPageIndex, splitState.dragHoverPageIndex)
              : false;
            const shouldDetach = !changed
              && Number.isInteger(draggedPageIndex)
              && detachSplitPageFromGroup(draggedPageIndex);

            clearSplitPointerDragState();
            setSplitDragSettling();
            if (changed || shouldDetach) renderSplitSelection();
          });
          ui.splitPagesList?.addEventListener("pointercancel", (event) => {
            if (splitState.dragPointerId !== event.pointerId) return;
            clearSplitPointerDragState();
          });
          ui.splitActivateAllButton?.addEventListener("click", () => {
            if (!splitState.pageCount || splitState.loadingPages) return;
            splitState.activePages = new Set(Array.from({ length: splitState.pageCount }, (_, pageIndex) => pageIndex));
            renderSplitSelection();
          });
          ui.splitDeactivateAllButton?.addEventListener("click", () => {
            if (!splitState.pageCount || splitState.loadingPages) return;
            splitState.activePages = new Set();
            renderSplitSelection();
          });

          ui.layoutStartButton.addEventListener("click", handleLayoutStart);
          ui.mergeStartButton.addEventListener("click", handleMergeStart);
          ui.rotateStartButton.addEventListener("click", handleRotateStart);
          ui.splitStartButton?.addEventListener("click", handleSplitStart);
          ui.resultCloseButton.addEventListener("click", hideResultDialog);
          ui.resultOpenButton.addEventListener("click", () => {
            if (!resultOpenUrl) return;
            window.open(resultOpenUrl, "_blank", "noopener,noreferrer");
          });
          ui.resultDialog.addEventListener("close", () => {
            ui.resultDialog.classList.add("hidden");
            resultOpenUrl = null;
            ui.resultOpenButton.classList.add("hidden");
            syncDialogUiState();
          });
          ui.busyDialog.addEventListener("close", () => {
            ui.busyDialog.classList.add("hidden");
            syncDialogUiState();
          });

          renderPagesPerSheetSelection();
          renderMergeFileList();
          renderLayoutSelection();
          renderRotateSelection();
          renderSplitSelection();
          setActiveTool(TOOL_LAYOUT);

          return {
            applyShellLayout,
            dispose() {
              if (messageListener) {
                window.removeEventListener("message", messageListener);
                messageListener = null;
              }
              if (pdfJsWorkerBlobUrl) {
                URL.revokeObjectURL(pdfJsWorkerBlobUrl);
                pdfJsWorkerBlobUrl = null;
              }
              resultOpenUrl = null;
              if (runtimeChrome) {
                runtimeChrome.classList.remove("dialog-active");
                delete runtimeChrome.dataset.tool;
              }
              [ui.resultDialog, ui.busyDialog].forEach((dialog) => {
                if (!dialog) return;
                if (typeof dialog.close === "function" && dialog.open) {
                  dialog.close();
                } else {
                  dialog.removeAttribute("open");
                }
                dialog.classList.add("hidden");
              });
            },
          };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const autoInitRoot = document;
  if (autoInitRoot?.body && !window.__teachhelperMergerApp) {
    window.__teachhelperMergerApp = createMergerApp({ root: autoInitRoot });
  }
}
