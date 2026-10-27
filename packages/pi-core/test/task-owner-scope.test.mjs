import assert from "node:assert/strict";
import test from "node:test";
import { createStandaloneRuntime, currentRuntime, withRuntime } from "../src/task-runtime/runtime-bridge.mjs";

test("task runtime requires an explicit owner and preserves its scope across awaited work", async () => {
  assert.throws(currentRuntime, /unavailable outside a session owner/);
  const runtime = createStandaloneRuntime();
  try {
    await withRuntime(runtime, async () => {
      await Promise.resolve();
      assert.equal(currentRuntime(), runtime);
    });
    assert.throws(currentRuntime, /unavailable outside a session owner/);
  } finally {
    await runtime.dispose();
  }
});
