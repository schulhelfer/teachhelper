import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function importEsmSource(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const {
  createSerialOperationQueue,
  writeAndVerifyFileBytes
} = await importEsmSource("../src/shared/school-data/sync-safety.js");
const { getThdb1FileHash } = await importEsmSource("../src/shared/school-data/thdb.js");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class FakeFileHandle {
  constructor(initialBytes = new Uint8Array()) {
    this.bytes = new Uint8Array(initialBytes);
    this.closeGate = null;
    this.failWrite = false;
    this.failWriteAt = 0;
    this.writeCount = 0;
    this.failRead = false;
    this.failReadAt = 0;
    this.readCount = 0;
    this.mutateSameLengthOnRead = false;
    this.abortCount = 0;
  }

  async createWritable() {
    let draft = new Uint8Array();
    let aborted = false;
    return {
      write: async (bytes) => {
        this.writeCount += 1;
        if (this.failWrite || this.writeCount === this.failWriteAt) throw new Error("write failed");
        draft = new Uint8Array(bytes);
      },
      close: async () => {
        if (this.closeGate) await this.closeGate.promise;
        if (!aborted) this.bytes = draft;
      },
      abort: async () => {
        aborted = true;
        this.abortCount += 1;
      }
    };
  }

  async getFile() {
    this.readCount += 1;
    if (this.failRead || this.readCount === this.failReadAt) throw new Error("read failed");
    let snapshot = new Uint8Array(this.bytes);
    if (this.mutateSameLengthOnRead && snapshot.length > 0) {
      snapshot[0] ^= 0xff;
    }
    return {
      size: snapshot.length,
      arrayBuffer: async () => snapshot.buffer.slice(
        snapshot.byteOffset,
        snapshot.byteOffset + snapshot.byteLength
      )
    };
  }
}

test("serial operation queue prevents overlapping delayed saves", async () => {
  const queue = createSerialOperationQueue();
  const gate = deferred();
  const started = deferred();
  const events = [];
  const first = queue.enqueue("first", async () => {
    events.push("first:start");
    started.resolve();
    await gate.promise;
    events.push("first:end");
  });
  const second = queue.enqueue("second", async () => {
    events.push("second:start");
    events.push("second:end");
  });

  await started.promise;
  assert.deepEqual(events, ["first:start"]);
  gate.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first:start", "first:end", "second:start", "second:end"]);
});

test("a rejected queue item does not deadlock later saves", async () => {
  const queue = createSerialOperationQueue();
  const failed = queue.enqueue("failed", async () => {
    throw new Error("expected");
  });
  const next = queue.enqueue("next", async () => "saved");
  await assert.rejects(failed, /expected/);
  assert.equal(await next, "saved");
  await queue.whenIdle();
});

test("queued verified writes retain the newest complete save", async () => {
  const queue = createSerialOperationQueue();
  const handle = new FakeFileHandle();
  const firstGate = deferred();
  handle.closeGate = firstGate;
  const firstBytes = new Uint8Array([1, 2, 3, 4]);
  const secondBytes = new Uint8Array([9, 8, 7, 6]);
  const verify = (expected) => (actual) => getThdb1FileHash(actual) === getThdb1FileHash(expected);

  const first = queue.enqueue("first-write", () => (
    writeAndVerifyFileBytes(handle, firstBytes, verify(firstBytes))
  ));
  const second = queue.enqueue("second-write", async () => {
    handle.closeGate = null;
    return writeAndVerifyFileBytes(handle, secondBytes, verify(secondBytes));
  });
  await Promise.resolve();
  firstGate.resolve();
  assert.equal((await first).ok, true);
  assert.equal((await second).ok, true);
  assert.deepEqual([...handle.bytes], [...secondBytes]);
});

test("write errors abort and preserve the previous file", async () => {
  const original = new Uint8Array([4, 4, 4, 4]);
  const handle = new FakeFileHandle(original);
  handle.failWrite = true;
  const result = await writeAndVerifyFileBytes(
    handle,
    new Uint8Array([1, 1, 1, 1]),
    () => true
  );
  assert.equal(result.ok, false);
  assert.equal(result.stage, "write");
  assert.equal(result.rolledBack, true);
  assert.equal(handle.abortCount, 1);
  assert.deepEqual([...handle.bytes], [...original]);
});

test("read/verify errors never report a save as successful", async () => {
  const original = new Uint8Array([7, 7, 7]);
  const handle = new FakeFileHandle(original);
  handle.failReadAt = 2;
  const result = await writeAndVerifyFileBytes(
    handle,
    new Uint8Array([1, 2, 3]),
    () => true
  );
  assert.equal(result.ok, false);
  assert.equal(result.stage, "read-or-verify");
  assert.equal(result.rolledBack, true);
  assert.deepEqual([...handle.bytes], [...original]);
});

test("same-length external changes are detected by full-content verification", async () => {
  const expected = new Uint8Array([10, 20, 30, 40, 50]);
  const handle = new FakeFileHandle();
  handle.mutateSameLengthOnRead = true;
  const expectedHash = getThdb1FileHash(expected);
  const result = await writeAndVerifyFileBytes(
    handle,
    expected,
    (actual) => getThdb1FileHash(actual) === expectedHash
  );
  assert.equal(result.ok, false);
  assert.equal(result.stage, "verify");
  assert.equal(result.rolledBack, true);
  assert.equal(result.bytes.length, expected.length);
  assert.equal(handle.bytes.length, 0);
});

test("same-length pre-write changes fail the CAS precondition without overwriting", async () => {
  const external = new Uint8Array([1, 2, 3, 4]);
  const expectedPrevious = new Uint8Array([1, 2, 3, 5]);
  const replacement = new Uint8Array([9, 9, 9, 9]);
  const handle = new FakeFileHandle(external);
  const expectedPreviousHash = getThdb1FileHash(expectedPrevious);
  const result = await writeAndVerifyFileBytes(
    handle,
    replacement,
    () => true,
    {
      validateOriginal: (actual) => getThdb1FileHash(actual) === expectedPreviousHash
    }
  );
  assert.equal(result.ok, false);
  assert.equal(result.stage, "precondition");
  assert.equal(result.rolledBack, true);
  assert.deepEqual([...handle.bytes], [...external]);
});

test("an unverifiable failed restore is reported as blocked", async () => {
  const original = new Uint8Array([3, 3, 3]);
  const replacement = new Uint8Array([8, 8, 8]);
  const handle = new FakeFileHandle(original);
  handle.failWriteAt = 2;
  const result = await writeAndVerifyFileBytes(
    handle,
    replacement,
    () => false
  );
  assert.equal(result.ok, false);
  assert.equal(result.stage, "verify");
  assert.equal(result.rolledBack, false);
  assert.deepEqual([...handle.bytes], [...replacement]);
});

test("rollback uses CAS and never overwrites a newer external version", async () => {
  const original = new Uint8Array([1, 1, 1, 1]);
  const replacement = new Uint8Array([2, 2, 2, 2]);
  const external = new Uint8Array([3, 3, 3, 3]);
  const handle = new FakeFileHandle(original);
  const result = await writeAndVerifyFileBytes(
    handle,
    replacement,
    () => {
      handle.bytes = new Uint8Array(external);
      return false;
    }
  );
  assert.equal(result.ok, false);
  assert.equal(result.stage, "verify");
  assert.equal(result.rolledBack, false);
  assert.deepEqual([...handle.bytes], [...external]);
});
