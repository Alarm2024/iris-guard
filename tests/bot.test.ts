import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Update } from "grammy/types";
import { createBot } from "../src/bot.js";
import { Guard } from "../src/guard.js";
import { SCAM_MESSAGES } from "./fixtures.js";

const GROUP = -1001234567890;
const ADMIN_SUBSCRIBED = 11;
const ADMIN_NOT_SUBSCRIBED = 12;
const MEMBER_SUBSCRIBED = 13;
const BOT_ID = 999;

type Call = { method: string; payload: Record<string, unknown> };

/** A bot whose Telegram API calls are recorded instead of sent. */
function harness() {
  const guard = new Guard();
  const bot = createBot("123:TEST", guard, {
    botInfo: {
      id: BOT_ID,
      is_bot: true,
      first_name: "Iris Guard",
      username: "iris_guard_test_bot",
      can_join_groups: true,
      can_read_all_group_messages: true,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
    } as never,
  });
  const calls: Call[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    let result: unknown = true;
    if (method === "getChatAdministrators") {
      result = [ADMIN_SUBSCRIBED, ADMIN_NOT_SUBSCRIBED].map((id) => ({
        status: "administrator",
        user: { id, is_bot: false, first_name: `admin${id}` },
      }));
    } else if (method === "sendMessage") {
      result = { message_id: 1, date: 0, chat: { id: payload && (payload as { chat_id: number }).chat_id, type: "private" } };
    }
    return { ok: true, result } as never;
  });
  let updateId = 0;
  const groupChat = { id: GROUP, type: "supergroup" as const, title: "Sol Devs" };
  const send = (update: Omit<Update, "update_id">) => bot.handleUpdate({ update_id: ++updateId, ...update } as Update);
  const groupText = (from: number, text: string, messageId = 50) => {
    const entities = text.startsWith("/")
      ? [{ type: "bot_command" as const, offset: 0, length: text.split(" ")[0].length }]
      : undefined;
    return send({
      message: {
        message_id: messageId,
        date: 0,
        chat: groupChat,
        from: { id: from, is_bot: false, first_name: "u" },
        text,
        entities,
      },
    });
  };
  const privateStart = (from: number) =>
    send({
      message: {
        message_id: 1,
        date: 0,
        chat: { id: from, type: "private", first_name: "u" },
        from: { id: from, is_bot: false, first_name: "u" },
        text: "/start",
        entities: [{ type: "bot_command", offset: 0, length: 6 }],
      },
    });
  return { bot, guard, calls, send, groupText, privateStart, groupChat };
}

describe("bot wiring", () => {
  it("dry mode: private note goes to admins who ran /start, nothing deleted", async () => {
    const h = harness();
    await h.privateStart(ADMIN_SUBSCRIBED);
    await h.privateStart(MEMBER_SUBSCRIBED);
    h.calls.length = 0;
    await h.groupText(777, SCAM_MESSAGES.urgent_verify_wallet_link[0]);
    const sends = h.calls.filter((call) => call.method === "sendMessage");
    assert.deepEqual(sends.map((call) => call.payload.chat_id), [ADMIN_SUBSCRIBED]);
    assert.match(String(sends[0].payload.text), /urgent verify-wallet link/);
    assert.ok(!h.calls.some((call) => call.method === "deleteMessage" || call.method.startsWith("ban")));
    const markup = sends[0].payload.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    assert.equal(markup.inline_keyboard[0][0].text, "Not a scam");
    assert.equal(markup.inline_keyboard[0][0].callback_data, `ns:${GROUP}:50`);
  });

  it("/guard_on is for admins; act mode deletes and warns", async () => {
    const h = harness();
    await h.groupText(777, "/guard_on");
    assert.equal(h.guard.mode(GROUP), "dry");
    await h.groupText(ADMIN_NOT_SUBSCRIBED, "/guard_on");
    assert.equal(h.guard.mode(GROUP), "act");
    h.calls.length = 0;
    await h.groupText(777, SCAM_MESSAGES.seed_phrase_request[1], 61);
    assert.ok(h.calls.some((call) => call.method === "deleteMessage" && call.payload.message_id === 61));
    assert.ok(h.calls.some((call) => call.method === "sendMessage" && call.payload.chat_id === GROUP));
    await h.groupText(ADMIN_NOT_SUBSCRIBED, "/guard_off");
    assert.equal(h.guard.mode(GROUP), "dry");
  });

  it("Not a scam button counts once and /stats reports it", async () => {
    const h = harness();
    await h.privateStart(ADMIN_SUBSCRIBED);
    await h.groupText(777, SCAM_MESSAGES.fake_airdrop[2], 70);
    const press = () =>
      h.send({
        callback_query: {
          id: "cb",
          chat_instance: "x",
          from: { id: ADMIN_SUBSCRIBED, is_bot: false, first_name: "a" },
          data: `ns:${GROUP}:70`,
          message: { message_id: 5, date: 0, chat: { id: ADMIN_SUBSCRIBED, type: "private", first_name: "a" } },
        },
      } as never);
    await press();
    await press();
    assert.equal(h.guard.statsFor(GROUP).notScam, 1);
    h.calls.length = 0;
    await h.groupText(ADMIN_SUBSCRIBED, "/stats");
    const reply = h.calls.find((call) => call.method === "sendMessage");
    assert.match(String(reply?.payload.text), /Marked "Not a scam": 1/);
    assert.match(String(reply?.payload.text), /fake airdrop: 1/);
  });

  it("leaves a group when a non-admin added it", async () => {
    const h = harness();
    await h.send({
      my_chat_member: {
        chat: h.groupChat,
        from: { id: 777, is_bot: false, first_name: "u" },
        date: 0,
        old_chat_member: { status: "left", user: { id: BOT_ID, is_bot: true, first_name: "Iris Guard" } },
        new_chat_member: { status: "member", user: { id: BOT_ID, is_bot: true, first_name: "Iris Guard" } },
      },
    });
    assert.ok(h.calls.some((call) => call.method === "leaveChat"));
  });

  it("stays and posts a dry-mode hello when an admin added it", async () => {
    const h = harness();
    await h.send({
      my_chat_member: {
        chat: h.groupChat,
        from: { id: ADMIN_SUBSCRIBED, is_bot: false, first_name: "a" },
        date: 0,
        old_chat_member: { status: "left", user: { id: BOT_ID, is_bot: true, first_name: "Iris Guard" } },
        new_chat_member: { status: "member", user: { id: BOT_ID, is_bot: true, first_name: "Iris Guard" } },
      },
    });
    assert.ok(!h.calls.some((call) => call.method === "leaveChat"));
    const hello = h.calls.find((call) => call.method === "sendMessage");
    assert.equal(hello?.payload.chat_id, GROUP);
    assert.match(String(hello?.payload.text), /dry mode/);
  });
});
