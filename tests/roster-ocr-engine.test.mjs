import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'http://teachhelper.local';
const requests = [];

function localFile(ref, base = origin) {
  const url = new URL(ref, base);
  assert.equal(url.origin, origin, `External asset request: ${ref}`);
  requests.push(url.pathname);
  return { url, bytes: readFileSync(path.join(root, decodeURIComponent(url.pathname))) };
}

class LocalWorker {
  constructor(url) {
    this.children = [];
    this.dead = false;
    const worker = this;
    const sandbox = {
      console, URL, Blob, File, ArrayBuffer, DataView, WebAssembly,
      Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array,
      Int8Array, Int16Array, Int32Array, Float32Array, Float64Array,
      TextDecoder, TextEncoder, performance, atob, btoa, crypto, Response,
      setTimeout, clearTimeout, setInterval, clearInterval,
      WorkerGlobalScope: class {},
      location: { href: String(url) },
      navigator: { userAgent: 'Local test' },
      postMessage(data) {
        if (!worker.dead) setTimeout(() => worker.onmessage?.({ data }), 0);
      },
      close() {},
      fetch: async (ref) => new Response(localFile(ref).bytes),
      Worker: class extends LocalWorker {
        constructor(ref) {
          super(ref);
          worker.children.push(this);
        }
      },
    };
    sandbox.self = sandbox;
    sandbox.addEventListener = (type, callback) => {
      if (type === 'message') sandbox.onmessage = callback;
    };
    sandbox.importScripts = (...refs) => {
      for (const ref of refs) {
        const { url: scriptUrl, bytes } = localFile(ref, sandbox.location.href);
        vm.runInContext(bytes.toString('utf8'), worker.context, { filename: scriptUrl.pathname });
      }
    };
    this.context = vm.createContext(sandbox);
    sandbox.importScripts(url);
  }

  postMessage(data) {
    setTimeout(() => {
      if (this.dead) return;
      Promise.resolve(this.context.onmessage?.({ data })).catch((error) => {
        this.onerror?.({ message: error.message, preventDefault() {} });
      });
    }, 0);
  }

  terminate() {
    this.dead = true;
    this.children.forEach((child) => child.terminate());
  }
}

function syntheticNameImage() {
  const letters = {
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  };
  const width = 600;
  const height = 160;
  const pixels = Buffer.alloc(width * height, 255);
  let cursor = 40;
  for (const char of 'MEIER  MIA') {
    const glyph = letters[char];
    if (glyph) {
      for (let y = 0; y < 7; y += 1) {
        for (let x = 0; x < 5; x += 1) {
          if (glyph[y][x] !== '1') continue;
          for (let dy = 0; dy < 8; dy += 1) {
            for (let dx = 0; dx < 8; dx += 1) {
              pixels[(40 + y * 8 + dy) * width + cursor + x * 8 + dx] = 0;
            }
          }
        }
      }
    }
    cursor += 48;
  }
  return Buffer.concat([Buffer.from(`P5\n${width} ${height}\n255\n`), pixels]);
}

test('vendored OCR recognizes a synthetic name using only local assets and no persistent storage', async () => {
  const worker = new LocalWorker(`${origin}/src/shared/ocr-worker.js`);
  const image = syntheticNameImage();
  let timeout;
  try {
    const result = await new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(Error('OCR timed out')), 30_000);
      worker.onerror = ({ message }) => reject(Error(message));
      worker.onmessage = ({ data }) => {
        if (data.type !== 'progress') resolve(data);
      };
      worker.postMessage(image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength));
    });
    assert.equal(result.type, 'result');
    assert.match(result.text, /MEIER\s+MIA/);
    assert.ok(requests.some((url) => url.endsWith('/deu.traineddata.gz')));
    assert.ok(requests.some((url) => url.endsWith('-lstm.wasm.js')));
  } finally {
    clearTimeout(timeout);
    worker.terminate();
  }
  assert.ok(worker.children.every((child) => child.dead));
});
