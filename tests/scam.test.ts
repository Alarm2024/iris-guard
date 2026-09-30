import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkScam } from "../src/scam.js";
import { NORMAL_MESSAGES, SCAM_MESSAGES } from "./fixtures.js";

describe("checkScam: scam messages", () => {
  for (const [pattern, messages] of Object.entries(SCAM_MESSAGES)) {
    it(`has three examples for ${pattern}`, () => {
      assert.equal(messages.length, 3);
    });
    for (const message of messages) {
      it(`${pattern}: ${message}`, () => {
        const report = checkScam(message);
        assert.equal(report.verdict, "scam");
        assert.equal(report.pattern, pattern);
      });
    }
  }
});

describe("checkScam: normal crypto chat is not flagged", () => {
  it("has ten normal lines", () => {
    assert.equal(NORMAL_MESSAGES.length, 10);
  });
  for (const message of NORMAL_MESSAGES) {
    it(`not flagged: ${message}`, () => {
      const report = checkScam(message);
      assert.equal(report.verdict, "no_pattern", `flagged as ${report.pattern}`);
    });
  }
});
