# Third-Party Notices

Teachhelper vendors the following third-party libraries and OCR language data for offline use.

Integrity hashes and update metadata are tracked in `vendor-manifest.json`.

## Dependency and Supply-Chain Process

- `vendor-manifest.json` is the authoritative list of vendored third-party artifacts.
- When updating a vendored package, fetch artifacts from the recorded upstream source, replace local files, refresh SHA-256 hashes in `vendor-manifest.json`, and run `python3 scripts/audit.py`.
- Use `python3 scripts/check-vendor-updates.py` to compare npm-backed vendored packages with npm `latest`.
- Follow PDF.js releases and security advisories closely because PDF parsing handles user-provided files.
- QR vendor files are traced to npm package releases and should be updated from the recorded distribution sources.

## JSZip

- Version: 3.10.1
- License: (MIT OR GPL-3.0-or-later)
- Source: https://www.npmjs.com/package/jszip/v/3.10.1
- Local files:
  - `src/vendor/jszip/3.10.1/jszip.min.js`
  - `src/vendor/jszip/3.10.1/LICENSE.markdown`
- Upstream NOTICE: none published in the npm package.

## @cantoo/pdf-lib

- Version: 2.9.1
- License: MIT
- Source: https://www.npmjs.com/package/@cantoo/pdf-lib/v/2.9.1
- Local files:
  - `src/vendor/cantoo-pdf-lib/2.9.1/pdf-lib.min.js`
  - `src/vendor/cantoo-pdf-lib/2.9.1/LICENSE.md`
- Upstream NOTICE: none published in the npm package.
- Maintained fork of `pdf-lib` (Copyright (c) 2019 Andrew Dillon, MIT) at https://github.com/cantoo-scribe/pdf-lib; the vendored UMD build still exposes the global `PDFLib`.

## pdfjs-dist

- Version: 6.3.289
- License: Apache-2.0
- Source: https://www.npmjs.com/package/pdfjs-dist/v/6.3.289
- Local files:
  - `src/vendor/pdfjs-dist/6.3.289/build/pdf.mjs`
  - `src/vendor/pdfjs-dist/6.3.289/build/pdf.worker.mjs`
  - `src/vendor/pdfjs-dist/6.3.289/LICENSE`
- Upstream NOTICE: none published in the npm package.

## qrcode.min.js

- Version: 1.5.4
- License: MIT
- Source: https://www.npmjs.com/package/qrcode/v/1.5.4
- Local files:
  - `src/modules/qr/vendor/qrcode.min.js`
- Upstream NOTICE: none published in the npm package.

## jsQR

- Version: 1.4.0
- License: Apache-2.0
- Source: https://www.npmjs.com/package/jsqr/v/1.4.0
- Local files:
  - `src/modules/qr/vendor/jsQR.js`
- Upstream NOTICE: none published in the npm package.

## Tesseract.js

- Version: 7.0.0
- License: Apache-2.0; bundled dependency notices are retained alongside both JavaScript bundles.
- Source: https://www.npmjs.com/package/tesseract.js/v/7.0.0
- Local directory: `src/vendor/tesseract.js/7.0.0/` (`tesseract.min.js`, `worker.min.js`, `LICENSE.md`, and both `.LICENSE.txt` files).
- Upstream NOTICE: no separate NOTICE published in the npm package.

## Tesseract.js Core

- Version: 7.0.0
- License: Apache-2.0
- Source: https://www.npmjs.com/package/tesseract.js-core/v/7.0.0
- Local directory: `src/vendor/tesseract.js-core/7.0.0/` (LSTM, SIMD-LSTM and Relaxed-SIMD-LSTM `.wasm.js` builds with embedded WASM binaries, and `LICENSE`).
- Upstream NOTICE: none published in the npm package.
- Only the LSTM engine is enabled; legacy engine builds are not required.

## German Tesseract language model

- Package: `@tesseract.js-data/deu`, version 1.0.0; model variant `4.0.0_best_int`.
- Source: https://www.npmjs.com/package/@tesseract.js-data/deu/v/1.0.0
- Model provenance: https://github.com/naptha/tessdata and https://github.com/tesseract-ocr/tessdata
- License: Apache-2.0 for the Tesseract language data. The npm wrapper declares MIT but ships no license file; no wrapper code is included.
- Local files: `src/vendor/tesseract.js-data-deu/1.0.0/deu.traineddata.gz` and `LICENSE`.
- License source: https://github.com/tesseract-ocr/tessdata/blob/4.1.0/LICENSE
- Upstream NOTICE: none published in the npm package.

OCR assets are loaded exclusively from local URLs and included in the deferred offline cache. Updating OCR requires refreshing all manifest hashes and checking recognition with networking disabled. User images and OCR results are never included in these caches.
