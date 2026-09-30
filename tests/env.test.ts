import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadEnv } from "../src/env.js";

describe("loadEnv", () => {
  it("does nothing when the file is missing", () => {
    assert.equal(loadEnv(join(tmpdir(), "iris-guard-missing.env")), false);
  });
  it("loads BOT_TOKEN from a .env file when it exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "iris-guard-"));
    const file = join(dir, ".env");
    writeFileSync(file, "IRIS_GUARD_TEST_TOKEN=abc123\n");
    assert.equal(loadEnv(file), true);
    assert.equal(process.env.IRIS_GUARD_TEST_TOKEN, "abc123");
  });
});
