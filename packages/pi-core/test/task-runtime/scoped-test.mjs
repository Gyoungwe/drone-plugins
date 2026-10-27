import { it as test } from "vitest";
import { createStandaloneRuntime, withRuntime } from "../../src/task-runtime/runtime-bridge.mjs";

/** The test body itself must enter the async scope, including parameterized cases. */
const inOwner = (run) => async (...args) => {
  const runtime = createStandaloneRuntime();
  try {
    return await withRuntime(runtime, () => run(...args));
  } finally {
    await runtime.dispose();
  }
};
export const it = (name, run, ...options) => test(name, inOwner(run), ...options);
it.each = (cases) => (name, run, ...options) => test.each(cases)(name, inOwner(run), ...options);
