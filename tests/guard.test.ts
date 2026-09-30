import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  Guard,
  SEED_POSTED,
  SEED_WARNING,
  formatAdminNote,
  messageLink,
  type AdminNote,
  type GuardActions,
} from "../src/guard.js";
import { SCAM_MESSAGES } from "./fixtures.js";

const SEED_12 =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const GROUP = -1001234567890;

function fakeActions(deleteWorks = true) {
  const calls = { deleted: [] as number[], posts: [] as string[], notes: [] as AdminNote[] };
  const actions: GuardActions = {
    async deleteMessage(_chatId, messageId) {
      calls.deleted.push(messageId);
      return deleteWorks;
    },
    async postToGroup(_chatId, text) {
      calls.posts.push(text);
    },
    async notifyAdmins(note) {
      calls.notes.push(note);
      return 1;
    },
  };
  return { calls, actions };
}

describe("Guard", () => {
  it("starts in dry mode and never deletes or posts for a scam message", async () => {
    const guard = new Guard();
    const { calls, actions } = fakeActions();
    for (const lines of Object.values(SCAM_MESSAGES)) {
      for (const [i, text] of lines.entries()) {
        const outcome = await guard.handleGroupMessage({ chatId: GROUP, messageId: 100 + i, text }, actions);
        assert.equal(outcome.kind, "scam");
      }
    }
    assert.equal(guard.mode(GROUP), "dry");
    assert.deepEqual(calls.deleted, []);
    assert.deepEqual(calls.posts, []);
    assert.equal(calls.notes.length, 18);
  });

  it("admin note has pattern, why, and a message link", async () => {
    const guard = new Guard();
    const { calls, actions } = fakeActions();
    await guard.handleGroupMessage(
      { chatId: GROUP, chatTitle: "Sol Devs", messageId: 42, text: SCAM_MESSAGES.fake_airdrop[0] },
      actions,
    );
    const note = calls.notes[0];
    assert.equal(note.pattern, "fake_airdrop");
    assert.equal(note.link, "https://t.me/c/1234567890/42");
    const text = formatAdminNote(note);
    assert.match(text, /Pattern: fake airdrop/);
    assert.match(text, /Why: Unsolicited airdrop/);
    assert.match(text, /https:\/\/t\.me\/c\/1234567890\/42/);
    assert.match(text, /Dry mode: nothing was deleted/);
  });

  it("act mode deletes the flagged message and posts a short warning", async () => {
    const guard = new Guard();
    guard.setMode(GROUP, "act");
    const { calls, actions } = fakeActions();
    const outcome = await guard.handleGroupMessage(
      { chatId: GROUP, messageId: 7, text: SCAM_MESSAGES.authority_change[1] },
      actions,
    );
    assert.deepEqual(outcome, { kind: "scam", pattern: "authority_change", mode: "act", deleted: true, notified: 1 });
    assert.deepEqual(calls.deleted, [7]);
    assert.equal(calls.posts.length, 1);
    assert.match(calls.posts[0], /authority change/);
    guard.setMode(GROUP, "dry");
    await guard.handleGroupMessage({ chatId: GROUP, messageId: 8, text: SCAM_MESSAGES.authority_change[2] }, actions);
    assert.deepEqual(calls.deleted, [7]);
  });

  it("deletes a posted seed phrase in dry mode too, and warns", async () => {
    const guard = new Guard();
    const { calls, actions } = fakeActions();
    const outcome = await guard.handleGroupMessage({ chatId: GROUP, messageId: 9, text: `my words: ${SEED_12}` }, actions);
    assert.deepEqual(outcome, { kind: "seed", deleted: true });
    assert.deepEqual(calls.deleted, [9]);
    assert.deepEqual(calls.posts, [SEED_WARNING]);
    assert.equal(guard.statsFor(GROUP).flagged.get(SEED_POSTED), 1);
  });

  it("leaves normal chat alone", async () => {
    const guard = new Guard();
    const { calls, actions } = fakeActions();
    const outcome = await guard.handleGroupMessage(
      { chatId: GROUP, messageId: 1, text: "the airdrop snapshot was yesterday" },
      actions,
    );
    assert.deepEqual(outcome, { kind: "clean" });
    assert.equal(calls.notes.length + calls.deleted.length + calls.posts.length, 0);
  });

  it("counts seen, flagged per pattern, and Not a scam once per message", async () => {
    const guard = new Guard();
    const { actions } = fakeActions();
    await guard.handleGroupMessage({ chatId: GROUP, messageId: 1, text: "gm" }, actions);
    await guard.handleGroupMessage({ chatId: GROUP, messageId: 2, text: SCAM_MESSAGES.fake_support_dm[0] }, actions);
    assert.equal(guard.markNotScam(GROUP, 2), true);
    assert.equal(guard.markNotScam(GROUP, 2), false);
    const stats = guard.formatStats(GROUP);
    assert.match(stats, /Messages seen: 2/);
    assert.match(stats, /fake support DM: 1/);
    assert.match(stats, /fake airdrop: 0/);
    assert.match(stats, /Marked "Not a scam": 1/);
  });

  it("stores no message text", async () => {
    const guard = new Guard();
    const { actions } = fakeActions();
    const text = SCAM_MESSAGES.fake_airdrop[1];
    await guard.handleGroupMessage({ chatId: GROUP, messageId: 3, text }, actions);
    const dump = JSON.stringify(guard, (_key, value) =>
      value instanceof Map || value instanceof Set ? [...value] : value,
    );
    assert.ok(!dump.includes("eligible"), dump);
  });

  it("builds message links for public and private supergroups, none for basic groups", () => {
    assert.equal(messageLink(GROUP, "soldevs", 5), "https://t.me/soldevs/5");
    assert.equal(messageLink(GROUP, undefined, 5), "https://t.me/c/1234567890/5");
    assert.equal(messageLink(-4567, undefined, 5), null);
  });
});
