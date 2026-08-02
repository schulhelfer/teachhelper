function asUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

export function createSerialOperationQueue() {
  let tail = Promise.resolve();
  let serial = 0;

  return {
    enqueue(label, operation) {
      if (typeof operation !== "function") {
        return Promise.reject(new Error("Ungültige serialisierte Operation."));
      }
      serial += 1;
      const operationSerial = serial;
      const run = tail
        .catch(() => undefined)
        .then(() => operation({ label: String(label || "operation"), serial: operationSerial }));
      tail = run.catch(() => undefined);
      return run;
    },
    whenIdle() {
      return tail;
    },
    getSerial() {
      return serial;
    }
  };
}

async function readHandleBytes(handle) {
  const file = await handle.getFile();
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("Datei konnte nicht erneut gelesen werden.");
  }
  return new Uint8Array(await file.arrayBuffer());
}

function equalBytes(left, right) {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array) || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

async function restoreAndVerifyOriginalBytes(handle, originalBytes, expectedFailedBytes) {
  try {
    const current = await readHandleBytes(handle);
    if (equalBytes(current, originalBytes)) return true;
    
    
    if (!equalBytes(current, expectedFailedBytes)) return false;
  } catch (_readError) {
    
    return false;
  }

  let restoreWritable = null;
  let restoreClosed = false;
  try {
    restoreWritable = await handle.createWritable();
    await restoreWritable.write(originalBytes);
    await restoreWritable.close();
    restoreClosed = true;
    return equalBytes(await readHandleBytes(handle), originalBytes);
  } catch (_restoreError) {
    if (restoreWritable && !restoreClosed && typeof restoreWritable.abort === "function") {
      try {
        await restoreWritable.abort();
      } catch (_abortError) {
        
      }
    }
    return false;
  }
}

export async function writeAndVerifyFileBytes(handle, sourceBytes, verify, {
  validateOriginal = null
} = {}) {
  const bytes = asUint8Array(sourceBytes);
  if (
    !handle
    || typeof handle.createWritable !== "function"
    || typeof handle.getFile !== "function"
    || !bytes
    || typeof verify !== "function"
  ) {
    return { ok: false, stage: "input", error: null, bytes: null, rolledBack: false };
  }

  let originalBytes;
  try {
    originalBytes = await readHandleBytes(handle);
    if (typeof validateOriginal === "function" && await validateOriginal(originalBytes) !== true) {
      return { ok: false, stage: "precondition", error: null, bytes: null, rolledBack: true };
    }
  } catch (error) {
    return { ok: false, stage: "pre-read", error, bytes: null, rolledBack: false };
  }

  let writable = null;
  let closed = false;
  try {
    writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    closed = true;

    const persistedBytes = await readHandleBytes(handle);
    const verified = await verify(persistedBytes);
    if (verified !== true) {
      const rolledBack = await restoreAndVerifyOriginalBytes(
        handle,
        originalBytes,
        persistedBytes
      );
      return { ok: false, stage: "verify", error: null, bytes: persistedBytes, rolledBack };
    }
    return {
      ok: true,
      stage: "verified",
      error: null,
      bytes: persistedBytes,
      rolledBack: false
    };
  } catch (error) {
    if (writable && !closed && typeof writable.abort === "function") {
      try {
        await writable.abort();
      } catch (_abortError) {
        
      }
    }
    const rolledBack = await restoreAndVerifyOriginalBytes(handle, originalBytes, bytes);
    return {
      ok: false,
      stage: closed ? "read-or-verify" : "write",
      error,
      bytes: null,
      rolledBack
    };
  }
}
