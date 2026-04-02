        (() => {
          "use strict";

          const A4_WIDTH = 595.3;
          const A4_HEIGHT = 841.9;
          const A4_TOLERANCE = 3.0;
          const A3_WIDTH = A4_HEIGHT;
          const A3_HEIGHT = A4_WIDTH * 2.0;

          const ui = {
            sharedPdfInput: document.getElementById("sharedPdfInput"),
            dropZone: document.getElementById("dropZone"),
            dropHint: document.getElementById("dropHint"),
            inputFileList: document.getElementById("inputFileList"),
            selectedFileNameLine: document.getElementById("selectedFileNameLine"),
            appendTotalPages: document.getElementById("appendTotalPages"),
            appendFileList: document.getElementById("appendFileList"),
            appendStartButton: document.getElementById("appendStartButton"),
            optionsPanel: document.getElementById("optionsPanel"),
            pagesButtons: [...document.querySelectorAll("#pagesButtons button[data-pages]")],
            autoOrientationToggle: document.getElementById("autoOrientationToggle"),
            studentCount: document.getElementById("studentCount"),
            paddingModes: [...document.querySelectorAll('input[name="paddingMode"]')],
            specialThreeModeButton: document.getElementById("specialThreeModeButton"),
            startButton: document.getElementById("startButton"),
            resultDialog: document.getElementById("resultDialog"),
            resultTitle: document.getElementById("resultTitle"),
            resultMessage: document.getElementById("resultMessage"),
            resultOpenButton: document.getElementById("resultOpenButton"),
            resultCloseButton: document.getElementById("resultCloseButton"),
            busyDialog: document.getElementById("busyDialog"),
            busyTitle: document.getElementById("busyTitle"),
            busyMessage: document.getElementById("busyMessage"),
          };

          let selectedFile = null;
          let appendFiles = [];
          const appendPageCountByFile = new Map();
          let appendPageCountProbeToken = 0;
          let appendDragIndex = null;
          let appendDropIndex = null;
          let pagesPerSheet = 2;
          let specialThreeModeEnabled = false;
          let specialThreeModeAvailable = false;
          let optionsEnabled = false;
          let specialModeProbeToken = 0;
          let pdfLibLoadPromise = null;
          let resultOpenUrl = null;
          const PDF_LIB_CDN_URL = "https://cdn.jsdelivr.net/npm/pdf-lib/dist/pdf-lib.min.js";
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

          function syncDialogUiState() {
            const resultOpen = ui.resultDialog.open || ui.resultDialog.hasAttribute("open") || !ui.resultDialog.classList.contains("hidden");
            const busyOpen = ui.busyDialog.open || ui.busyDialog.hasAttribute("open") || !ui.busyDialog.classList.contains("hidden");
            document.body.classList.toggle("dialog-active", resultOpen || busyOpen);
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

          async function ensurePdfLibLoaded() {
            const PDFLib = window.PDFLib;
            if (PDFLib && PDFLib.PDFDocument) return;
            if (!pdfLibLoadPromise) {
              pdfLibLoadPromise = new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src = PDF_LIB_CDN_URL;
                script.onload = () => {
                  const loaded = window.PDFLib && window.PDFLib.PDFDocument;
                  if (loaded) resolve();
                  else reject(new Error("PDF-Library wurde geladen, ist aber unvollstaendig."));
                };
                script.onerror = () => reject(new Error("PDF-Library konnte nicht geladen werden."));
                document.head.appendChild(script);
              });
            }
            return pdfLibLoadPromise;
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

          function buildTwoUpPairs(pageCount, enableThreePageSpecialMode) {
            if (pageCount <= 0) return [];
            if (enableThreePageSpecialMode && pageCount === 3) {
              return [[0, 0], [1, 2], [1, 2]];
            }

            const pairs = [];
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
                  if (!slot) return null;
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
                  : buildTwoUpPairs(pageCount, false);

                for (const [leftIndex, rightIndex] of pairs) {
                  const leftPage = pageInfos[leftIndex];
                  const rightPage = pageInfos[rightIndex];

                  let outWidth, outHeight, halfWidth;
                  if (isA4) {
                    halfWidth = A4_WIDTH;
                    outHeight = A4_HEIGHT;
                    outWidth = A4_WIDTH * 2;
                  } else {
                    halfWidth = Math.max(leftPage.width, rightPage.width);
                    outHeight = Math.max(leftPage.height, rightPage.height);
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
                : buildTwoUpPairs(pageCount, false);

              for (const [leftIndex, rightIndex] of pairs) {
                const left = sourceSizes[leftIndex];
                const right = sourceSizes[rightIndex];

                let outWidth;
                let outHeight;
                let halfWidth;
                if (isA4) {
                  halfWidth = A4_WIDTH;
                  outHeight = A4_HEIGHT;
                  outWidth = A4_WIDTH * 2;
                } else {
                  halfWidth = Math.max(left.width, right.width);
                  outHeight = Math.max(left.height, right.height);
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

          function getPaddingModeValue() {
            const selected = ui.paddingModes.find((radio) => radio.checked);
            return selected ? selected.value : "blank";
          }

          function setPaddingModeValue(mode) {
            const target = ui.paddingModes.find((radio) => radio.value === mode);
            if (target) target.checked = true;
          }

          function syncStartButtonState() {
            if (!optionsEnabled || !selectedFile) {
              ui.startButton.disabled = true;
              return;
            }
            const isLcmWithoutStudentCount = getPaddingModeValue() === "lcm" && !ui.studentCount.value.trim();
            ui.startButton.disabled = isLcmWithoutStudentCount;
          }

          function syncAppendStartButtonState() {
            ui.appendStartButton.disabled = appendFiles.length < 2;
          }

          function setAppendTotalPagesText(value) {
            ui.appendTotalPages.textContent = `(Gesamtseitenanzahl: ${value})`;
          }

          function getAppendTotalPagesFromCache() {
            let total = 0;
            for (const file of appendFiles) {
              const pageCount = appendPageCountByFile.get(file);
              if (typeof pageCount === "number") total += pageCount;
            }
            return total;
          }

          async function loadAppendPageCount(file) {
            if (appendPageCountByFile.has(file)) {
              return appendPageCountByFile.get(file);
            }
            const inputBytes = new Uint8Array(await file.arrayBuffer());
            try {
              const loaded = await loadSourceDocument(inputBytes);
              const pageCount = loaded.source.getPageCount();
              if (!Number.isInteger(pageCount) || pageCount < 0) {
                throw new Error("Ungueltige Seitenzahl.");
              }
              appendPageCountByFile.set(file, pageCount);
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
                  appendPageCountByFile.set(file, pageCount);
                  return pageCount;
                } catch (secondError) {
                  console.warn(`Seitenzahl konnte nicht ermittelt werden: ${file.name}`, secondError);
                }
              } else {
                console.warn(`Seitenzahl konnte nicht ermittelt werden: ${file.name}`, firstError);
              }
              appendPageCountByFile.set(file, null);
              return null;
            }
          }

          async function refreshAppendTotalPages() {
            const token = ++appendPageCountProbeToken;
            if (!appendFiles.length) {
              setAppendTotalPagesText("0");
              return;
            }

            setAppendTotalPagesText(String(getAppendTotalPagesFromCache()));

            for (const file of appendFiles) {
              if (!appendPageCountByFile.has(file)) {
                await loadAppendPageCount(file);
                if (token !== appendPageCountProbeToken) return;
              }
            }

            if (token !== appendPageCountProbeToken) return;
            setAppendTotalPagesText(String(getAppendTotalPagesFromCache()));
          }

          function renderAppendFileList() {
            const inputFragment = document.createDocumentFragment();
            appendFiles.forEach((file, index) => {
              const row = document.createElement("div");
              row.className = "file-item";
              row.draggable = false;
              row.dataset.fileIndex = String(index);
              row.title = file.name;

              const name = document.createElement("span");
              name.className = "file-item-name";
              name.textContent = file.name;
              if (file === selectedFile) name.classList.add("selected");

              const removeButton = document.createElement("button");
              removeButton.type = "button";
              removeButton.className = "file-delete";
              removeButton.dataset.removeIndex = String(index);
              removeButton.setAttribute("aria-label", `${file.name} entfernen`);
              removeButton.title = "Datei entfernen";
              removeButton.textContent = "🗑";
              removeButton.draggable = false;

              row.append(name, removeButton);
              inputFragment.append(row);
            });
            ui.inputFileList.replaceChildren(inputFragment);

            const fragment = document.createDocumentFragment();
            appendFiles.forEach((file, index) => {
              const row = document.createElement("div");
              row.className = "file-item";
              row.draggable = true;
              row.dataset.fileIndex = String(index);
              row.title = "Reihenfolge per Drag-and-Drop ändern";

              const dragHint = document.createElement("span");
              dragHint.className = "file-drag";
              dragHint.textContent = "⋮⋮";
              dragHint.setAttribute("aria-hidden", "true");

              const name = document.createElement("span");
              name.className = "file-item-name";
              name.textContent = `${index + 1}. ${file.name}`;

              row.append(dragHint, name);
              fragment.append(row);
            });

            ui.appendFileList.replaceChildren(fragment);
            syncAppendStartButtonState();
            void refreshAppendTotalPages();
          }

          async function addSharedFiles(fileList) {
            if (!fileList || !fileList.length) return;

            const accepted = [];
            let rejectedCount = 0;
            for (const file of fileList) {
              if (isPdfFile(file)) accepted.push(file);
              else rejectedCount += 1;
            }

            if (rejectedCount > 0) {
              const text = rejectedCount === 1
                ? "1 Datei wurde ignoriert, weil sie keine .pdf-Endung hat."
                : `${rejectedCount} Dateien wurden ignoriert, weil sie keine .pdf-Endung haben.`;
              showResultDialog(text, "warn", "Hinweis");
            }

            if (!accepted.length) return;

            appendFiles = appendFiles.concat(accepted);
            renderAppendFileList();
            await setSelectedFile(accepted[0]);
          }

          function openSharedPdfPicker() {
            ui.sharedPdfInput.click();
          }

          function clearAppendDropMarkers() {
            for (const row of ui.appendFileList.querySelectorAll(".file-item")) {
              row.classList.remove("drop-before", "drop-after", "dragging");
            }
          }

          function computeAppendDropIndex(clientY) {
            const rows = [...ui.appendFileList.querySelectorAll(".file-item:not(.dragging)")];
            let index = rows.length;
            for (let i = 0; i < rows.length; i += 1) {
              const rect = rows[i].getBoundingClientRect();
              if (clientY < rect.top + rect.height / 2) {
                index = i;
                break;
              }
            }
            return index;
          }

          function renderAppendDropMarker(index) {
            const rows = [...ui.appendFileList.querySelectorAll(".file-item:not(.dragging)")];
            rows.forEach((row) => row.classList.remove("drop-before", "drop-after"));
            if (!rows.length) return;
            if (index >= rows.length) {
              rows[rows.length - 1].classList.add("drop-after");
            } else {
              rows[index].classList.add("drop-before");
            }
          }

          function setPagesPerSheetSelection(value) {
            pagesPerSheet = value;
            renderPagesPerSheetSelection();
          }

          function renderPagesPerSheetSelection() {
            for (const button of ui.pagesButtons) {
              const active = !specialThreeModeEnabled && Number(button.dataset.pages) === pagesPerSheet;
              button.classList.toggle("active", active);
              button.setAttribute("aria-pressed", String(active));
            }
          }

          function syncPagesButtonsDisabledState() {
            for (const button of ui.pagesButtons) {
              button.disabled = !optionsEnabled;
            }
          }

          function setSpecialThreeModeAvailability(available) {
            specialThreeModeAvailable = available;
            ui.specialThreeModeButton.disabled = !optionsEnabled || !specialThreeModeAvailable;
            ui.specialThreeModeButton.title = available
              ? "Spezialmodus für 3-seitige PDF: 1|1 + 2|3"
              : "Nur bei 3-seitiger PDF verfügbar";
            if (!available && specialThreeModeEnabled) {
              specialThreeModeEnabled = false;
              ui.specialThreeModeButton.setAttribute("aria-pressed", "false");
              renderPagesPerSheetSelection();
            }
            syncPagesButtonsDisabledState();
          }

          async function updateSpecialThreeModeAvailability(file) {
            const token = ++specialModeProbeToken;
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
              if (token !== specialModeProbeToken || file !== selectedFile) return;
              const inputBytes = new Uint8Array(arrayBuffer);
              const loaded = await loadSourceDocument(inputBytes);
              if (token !== specialModeProbeToken || file !== selectedFile) return;
              const pageCount = loaded.source.getPageCount();
              setSpecialThreeModeAvailability(pageCount === 3);
            } catch (error) {
              if (token !== specialModeProbeToken || file !== selectedFile) return;
              setSpecialThreeModeAvailability(false);
              maybeShowMacOSPermissionHint(error);
            }
          }

          function setOptionsEnabled(enabled) {
            optionsEnabled = enabled;
            ui.optionsPanel.classList.toggle("options-disabled", !enabled);
            ui.optionsPanel.setAttribute("aria-disabled", String(!enabled));
            ui.dropZone.classList.toggle("awaiting-file", !enabled);
            ui.dropHint.classList.toggle("hidden", enabled);
            syncPagesButtonsDisabledState();
            ui.autoOrientationToggle.disabled = !enabled;
            ui.studentCount.disabled = !enabled;
            for (const radio of ui.paddingModes) {
              radio.disabled = !enabled;
            }
            if (!enabled) setSpecialThreeModeAvailability(false);
            else ui.specialThreeModeButton.disabled = !specialThreeModeAvailable;
            syncStartButtonState();
          }

          async function handleStart() {
            if (!selectedFile) {
              showResultDialog("Bitte zuerst eine PDF-Datei auswaehlen.", "warn", "Hinweis");
              return;
            }

            const studentText = ui.studentCount.value.trim();
            const studentCount = studentText ? Number(studentText) : null;
            if (studentText && (!Number.isInteger(studentCount) || studentCount <= 0)) {
              showResultDialog("Die Anzahl Lernende muss eine ganze Zahl groesser 0 sein.", "warn", "Hinweis");
              return;
            }

            ui.startButton.disabled = true;

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

              const arrayBuffer = await selectedFile.arrayBuffer();
              const inputBytes = new Uint8Array(arrayBuffer);
              const loaded = await loadSourceDocument(inputBytes);
              const source = loaded.source;
              const engine = loaded.engine;

              const pageCount = source.getPageCount();
              if (!pageCount) throw new Error("Die PDF enthaelt keine Seiten.");

              const effectivePaddingMode = specialThreeModeEnabled
                ? getPaddingModeValue()
                : chooseEffectivePaddingMode(
                  pageCount,
                  pagesPerSheet,
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
                  pagesPerSheet,
                  effectivePaddingMode,
                  specialThreeModeEnabled,
                  studentCount,
                  autoOrientationEnabled
                );
              } else {
                const imposer = new OfflineImposer(source);
                outBytes = imposer.impose(
                  pagesPerSheet,
                  effectivePaddingMode,
                  specialThreeModeEnabled,
                  studentCount,
                  autoOrientationEnabled
                );
              }

              const copyCount = deriveCopyCount(
                pageCount,
                pagesPerSheet,
                studentCount,
                effectivePaddingMode,
                specialThreeModeEnabled
              );

              const outputName = buildOutputName(getBaseName(selectedFile.name), copyCount);
              const blob = new Blob([outBytes], { type: "application/pdf" });
              const shareResult = await tryShareMergedPdfOnIOS(blob, outputName);

              if (shareResult.handled) {
                if (shareResult.status === "cancelled") {
                  showResultDialog(`PDF wurde erstellt, Teilen wurde abgebrochen.\n${outputName}`, "warn", "Hinweis");
                } else {
                  showResultDialog("PDF erstellt.", "ok", "");
                }
                return;
              }

              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = outputName;
              anchor.click();

              setTimeout(() => URL.revokeObjectURL(url), 120_000);
              showResultDialog("PDF erstellt.", "ok", "", url);
            } catch (error) {
              console.error(error);
              if (maybeShowMacOSPermissionHint(error)) return;
              const message = error && error.message ? error.message : "PDF konnte nicht verarbeitet werden.";
              showResultDialog(message, "error", "Fehler");
            } finally {
              syncStartButtonState();
            }
          }

          async function handleAppendStart() {
            if (appendFiles.length < 2) {
              showResultDialog("Bitte mindestens zwei PDF-Dateien auswaehlen.", "warn", "Hinweis");
              return;
            }

            ui.appendStartButton.disabled = true;
            try {
              if (!(window.PDFLib && window.PDFLib.PDFDocument)) {
                showBusyDialog("PDF-Engine wird geladen ...");
                await ensurePdfLibLoaded();
                hideBusyDialog();
              }

              const PDFLib = window.PDFLib;
              if (!(PDFLib && PDFLib.PDFDocument)) {
                throw new Error("Die PDF-Library konnte nicht geladen werden.");
              }

              const outputDoc = await PDFLib.PDFDocument.create();
              for (const file of appendFiles) {
                const bytes = new Uint8Array(await file.arrayBuffer());
                let sourceDoc;
                try {
                  sourceDoc = await PDFLib.PDFDocument.load(bytes);
                } catch (_) {
                  throw new Error(`"${file.name}" konnte nicht gelesen werden (evtl. beschaedigt oder verschluesselt).`);
                }

                const copiedPages = await outputDoc.copyPages(sourceDoc, sourceDoc.getPageIndices());
                for (const page of copiedPages) {
                  outputDoc.addPage(page);
                }
              }

              if (!outputDoc.getPageCount()) {
                throw new Error("Die ausgewaehlten PDFs enthalten keine Seiten.");
              }

              const outBytes = await outputDoc.save({ useObjectStreams: false });
              const outputName = buildAppendOutputName(appendFiles);
              const blob = new Blob([outBytes], { type: "application/pdf" });
              const shareResult = await tryShareMergedPdfOnIOS(blob, outputName);

              if (shareResult.handled) {
                if (shareResult.status === "cancelled") {
                  showResultDialog(`PDF wurde erstellt, Teilen wurde abgebrochen.\n${outputName}`, "warn", "Hinweis");
                } else {
                  showResultDialog("PDFs zusammengeführt.", "ok", "");
                }
                return;
              }

              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = outputName;
              anchor.click();

              setTimeout(() => URL.revokeObjectURL(url), 10_000);
              showResultDialog("PDFs zusammengeführt.", "ok", "");
            } catch (error) {
              console.error(error);
              if (maybeShowMacOSPermissionHint(error)) return;
              const message = error && error.message ? error.message : "PDFs konnten nicht zusammengefuehrt werden.";
              showResultDialog(message, "error", "Fehler");
            } finally {
              hideBusyDialog();
              syncAppendStartButtonState();
            }
          }

          async function setSelectedFile(file) {
            if (!file) return;
            if (!isPdfFile(file)) {
              showResultDialog("Bitte eine Datei mit .pdf-Endung waehlen.", "warn", "Hinweis");
              return;
            }
            selectedFile = file;
            ui.selectedFileNameLine.textContent = file.name;
            renderAppendFileList();
            setOptionsEnabled(true);
            await updateSpecialThreeModeAvailability(file);
          }

          ui.dropZone.addEventListener("click", (event) => {
            if (event.target.closest("#inputFileList")) return;
            openSharedPdfPicker();
          });
          ui.dropZone.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openSharedPdfPicker();
            }
          });

          ui.sharedPdfInput.addEventListener("change", async () => {
            const files = [...(ui.sharedPdfInput.files || [])];
            if (!files.length) return;
            await addSharedFiles(files);
            ui.sharedPdfInput.value = "";
          });
          ui.appendFileList.addEventListener("dragstart", (event) => {
            const row = event.target.closest(".file-item");
            if (!row) return;
            const index = Number(row.dataset.fileIndex);
            if (!Number.isInteger(index)) return;
            appendDragIndex = index;
            appendDropIndex = null;
            row.classList.add("dragging");
            if (event.dataTransfer) {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", String(index));
            }
          });
          ui.appendFileList.addEventListener("dragover", (event) => {
            if (appendDragIndex == null) {
              const files = [...(event.dataTransfer?.files || [])];
              if (files.length) {
                event.preventDefault();
                if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
              }
              return;
            }
            event.preventDefault();
            appendDropIndex = computeAppendDropIndex(event.clientY);
            renderAppendDropMarker(appendDropIndex);
            if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
          });
          ui.appendFileList.addEventListener("drop", (event) => {
            if (appendDragIndex == null) {
              const files = [...(event.dataTransfer?.files || [])];
              if (!files.length) return;
              event.preventDefault();
              event.stopPropagation();
              showResultDialog("Bitte PDFs im gemeinsamen Feld links hinzufügen.", "warn", "Hinweis");
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            const toIndex = appendDropIndex == null
              ? computeAppendDropIndex(event.clientY)
              : appendDropIndex;

            clearAppendDropMarkers();
            appendDropIndex = null;

            if (!Number.isInteger(appendDragIndex) || !Number.isInteger(toIndex)) {
              appendDragIndex = null;
              return;
            }
            if (appendDragIndex < 0 || appendDragIndex >= appendFiles.length) {
              appendDragIndex = null;
              return;
            }
            if (toIndex < 0 || toIndex > appendFiles.length - 1) {
              appendDragIndex = null;
              return;
            }

            const movedFile = appendFiles[appendDragIndex];
            appendFiles.splice(appendDragIndex, 1);
            appendFiles.splice(toIndex, 0, movedFile);
            appendDragIndex = null;
            renderAppendFileList();
          });
          ui.appendFileList.addEventListener("dragend", () => {
            appendDragIndex = null;
            appendDropIndex = null;
            clearAppendDropMarkers();
          });
          ui.inputFileList.addEventListener("click", (event) => {
            event.stopPropagation();
            const removeButton = event.target.closest("button[data-remove-index]");
            if (removeButton) {
              const index = Number(removeButton.dataset.removeIndex);
              if (!Number.isInteger(index)) return;
              if (index < 0 || index >= appendFiles.length) return;
              const [removedFile] = appendFiles.splice(index, 1);
              if (removedFile === selectedFile) {
                selectedFile = appendFiles[0] || null;
                if (selectedFile) {
                  void setSelectedFile(selectedFile);
                } else {
                  ui.selectedFileNameLine.textContent = "Keine Datei ausgewählt";
                  setOptionsEnabled(false);
                }
              }
              renderAppendFileList();
              return;
            }

            const row = event.target.closest(".file-item[data-file-index]");
            if (!row) return;
            const index = Number(row.dataset.fileIndex);
            if (!Number.isInteger(index)) return;
            if (index < 0 || index >= appendFiles.length) return;
            void setSelectedFile(appendFiles[index]);
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
            syncStartButtonState();
          });

          for (const radio of ui.paddingModes) {
            radio.addEventListener("change", syncStartButtonState);
          }

          ui.dropZone.addEventListener("dragover", (event) => {
            event.preventDefault();
            event.stopPropagation();
            ui.dropZone.classList.add("dragover");
          });

          ui.dropZone.addEventListener("dragleave", () => {
            ui.dropZone.classList.remove("dragover");
          });

          ui.dropZone.addEventListener("drop", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            ui.dropZone.classList.remove("dragover");
            const files = [...(event.dataTransfer?.files || [])];
            await addSharedFiles(files);
          });

          for (const button of ui.pagesButtons) {
            button.addEventListener("click", () => {
              if (specialThreeModeEnabled) {
                specialThreeModeEnabled = false;
                ui.specialThreeModeButton.setAttribute("aria-pressed", "false");
              }
              setPagesPerSheetSelection(Number(button.dataset.pages));
            });
          }
          ui.specialThreeModeButton.addEventListener("click", () => {
            specialThreeModeEnabled = !specialThreeModeEnabled;
            ui.specialThreeModeButton.setAttribute("aria-pressed", String(specialThreeModeEnabled));
            renderPagesPerSheetSelection();
            syncPagesButtonsDisabledState();
          });
          ui.startButton.addEventListener("click", handleStart);
          ui.appendStartButton.addEventListener("click", handleAppendStart);
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

          setOptionsEnabled(false);
          renderAppendFileList();
        })();
