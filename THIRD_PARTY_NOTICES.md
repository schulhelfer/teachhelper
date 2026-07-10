# Third-Party Notices

Teachhelper vendors the following third-party JavaScript libraries for offline use.

Integrity hashes and update metadata are tracked in `vendor-manifest.json`.

## Dependency and Supply-Chain Process

- `vendor-manifest.json` is the authoritative list of vendored third-party artifacts.
- When updating a vendored package, fetch artifacts from the recorded upstream source, replace local files, refresh SHA-256 hashes in `vendor-manifest.json`, update `sbom.cdx.json`, and run `python3 scripts/audit.py`.
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

## pdf-lib

- Version: 1.17.1
- License: MIT
- Source: https://www.npmjs.com/package/pdf-lib/v/1.17.1
- Local files:
  - `src/vendor/pdf-lib/1.17.1/pdf-lib.min.js`
  - `src/vendor/pdf-lib/1.17.1/LICENSE.md`
- Upstream NOTICE: none published in the npm package.

## pdfjs-dist

- Version: 6.1.200
- License: Apache-2.0
- Source: https://www.npmjs.com/package/pdfjs-dist/v/6.1.200
- Local files:
  - `src/vendor/pdfjs-dist/6.1.200/build/pdf.mjs`
  - `src/vendor/pdfjs-dist/6.1.200/build/pdf.worker.mjs`
  - `src/vendor/pdfjs-dist/6.1.200/LICENSE`
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
