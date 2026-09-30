import { Bot, GrammyError, InlineKeyboard, type BotConfig, type Context } from "grammy";
import type { Chat } from "grammy/types";
import { Guard, formatAdminNote, type AdminNote, type GuardActions } from "./guard.js";
import { refusalFor } from "./refusals.js";

/** Telegram's placeholder user for anonymous group admins. */
const ANONYMOUS_ADMIN_BOT_ID = 1087968824;
const ADMIN_CACHE_MS = 5 * 60 * 1000;

export const PRIVATE_START_TEXT = [
  "Iris Guard flags scam messages in Telegram groups for the group's admins.",
  "",
  "You ran /start, so I can send you private notes when a message in a group you admin matches a scam pattern. I never message anyone who has not done this. Send /stop to turn the notes off.",
  "",
  "To use me: add me to a group as an admin (with the Delete messages permission). I start in dry mode: I tell admins, and I do not delete or ban. An admin can send /guard_on in the group for act mode, and /guard_off to go back.",
].join("\n");

export const PRIVATE_HELP_TEXT =
  "I work in groups. I do not give price or market advice, I cannot connect a wallet or sign anything, and I do not store message text. Send /start for setup notes.";

const PRIVATE_REFUSALS: Record<string, string> = {
  seed_phrase:
    "That looks like a wallet seed phrase. I did not store it and I tried to delete it from this chat. Anyone who has those words can take the wallet. If they are real, move your funds to a new wallet you create yourself.",
  wallet_connect: "I cannot connect a wallet, sign, or approve anything. Do not connect a wallet because a message told you to.",
  price_advice: "I do not give price or market advice. I flag scam messages in groups for admins.",
};

function isGroup(chat: Chat | undefined): chat is Chat.GroupChat | Chat.SupergroupChat {
  return chat?.type === "group" || chat?.type === "supergroup";
}

export function createBot(token: string, guard = new Guard(), config?: BotConfig<Context>): Bot {
  const bot = new Bot(token, config);
  const adminCache = new Map<number, { ids: Set<number>; at: number }>();

  async function adminIds(chatId: number): Promise<Set<number>> {
    const cached = adminCache.get(chatId);
    if (cached && Date.now() - cached.at < ADMIN_CACHE_MS) return cached.ids;
    const admins = await bot.api.getChatAdministrators(chatId);
    const ids = new Set(admins.map((member) => member.user.id));
    adminCache.set(chatId, { ids, at: Date.now() });
    return ids;
  }

  async function isAdmin(chatId: number, userId: number): Promise<boolean> {
    try {
      return (await adminIds(chatId)).has(userId);
    } catch {
      return false;
    }
  }

  /** True for a real admin, or an anonymous admin posting as the group itself. */
  async function senderIsAdmin(ctx: Context): Promise<boolean> {
    const chat = ctx.chat;
    const message = ctx.message;
    if (!isGroup(chat) || !ctx.from) return false;
    if (ctx.from.id === ANONYMOUS_ADMIN_BOT_ID && message?.sender_chat?.id === chat.id) return true;
    return isAdmin(chat.id, ctx.from.id);
  }

  const actions: GuardActions = {
    async deleteMessage(chatId, messageId) {
      try {
        return await bot.api.deleteMessage(chatId, messageId);
      } catch (error) {
        console.warn(`delete failed in ${chatId}: ${describe(error)}`);
        return false;
      }
    },
    async postToGroup(chatId, text) {
      try {
        await bot.api.sendMessage(chatId, text);
      } catch (error) {
        console.warn(`group post failed in ${chatId}: ${describe(error)}`);
      }
    },
    async notifyAdmins(note: AdminNote) {
      let admins: Set<number>;
      try {
        admins = await adminIds(note.chatId);
      } catch (error) {
        console.warn(`could not read admins of ${note.chatId}: ${describe(error)}`);
        return 0;
      }
      const keyboard = new InlineKeyboard().text("Not a scam", `ns:${note.chatId}:${note.messageId}`);
      let sent = 0;
      // Private notes go to admins who ran /start with the bot. Nobody else is messaged.
      for (const userId of guard.subscriberIds()) {
        if (!admins.has(userId)) continue;
        try {
          await bot.api.sendMessage(userId, formatAdminNote(note), {
            reply_markup: keyboard,
            link_preview_options: { is_disabled: true },
          });
          sent += 1;
        } catch (error) {
          console.warn(`admin note to ${userId} failed: ${describe(error)}`);
        }
      }
      return sent;
    },
  };

  // Joining a group: stay when an admin added the bot, leave otherwise.
  bot.on("my_chat_member", async (ctx) => {
    const chat = ctx.chat;
    if (!isGroup(chat)) return;
    const before = ctx.myChatMember.old_chat_member.status;
    const after = ctx.myChatMember.new_chat_member.status;
    const wasOut = before === "left" || before === "kicked";
    const isIn = after === "member" || after === "administrator";
    if (!isIn) {
      guard.forgetChat(chat.id);
      adminCache.delete(chat.id);
      return;
    }
    if (!wasOut) {
      adminCache.delete(chat.id);
      return;
    }
    adminCache.delete(chat.id);
    if (!(await isAdmin(chat.id, ctx.from.id))) {
      console.warn(`added to ${chat.id} by a non-admin; leaving`);
      await ctx.leaveChat().catch(() => undefined);
      return;
    }
    await ctx.reply(
      "Iris Guard is here in dry mode: I send admins a private note about messages that match a scam pattern, and I do not delete or ban. Admins: send me /start in a private chat to get the notes. /guard_on switches to act mode.",
    );
  });

  const priv = bot.chatType("private");
  priv.command("start", async (ctx) => {
    guard.subscribe(ctx.from.id);
    await ctx.reply(PRIVATE_START_TEXT);
  });
  priv.command("stop", async (ctx) => {
    guard.unsubscribe(ctx.from.id);
    await ctx.reply("Done. I will not send you notes. Send /start to turn them back on.");
  });
  priv.on("message", async (ctx) => {
    const text = ctx.message.text ?? ctx.message.caption ?? "";
    const refusal = text ? refusalFor(text) : null;
    if (refusal?.reason === "seed_phrase") {
      await ctx.deleteMessage().catch(() => undefined);
    }
    await ctx.reply(refusal ? PRIVATE_REFUSALS[refusal.reason] : PRIVATE_HELP_TEXT);
  });

  const group = bot.chatType(["group", "supergroup"]);
  group.command("start", async (ctx) => {
    await ctx.reply("Admins: open a private chat with me and send /start there, so I can send you notes.");
  });
  group.command(["guard_on", "guard_off"], async (ctx) => {
    if (!(await senderIsAdmin(ctx))) {
      await ctx.reply("Group admins can change the mode.");
      return;
    }
    const on = ctx.message.text.startsWith("/guard_on");
    guard.setMode(ctx.chat.id, on ? "act" : "dry");
    await ctx.reply(
      on
        ? "Act mode: I will delete messages that match a scam pattern and post a short warning."
        : "Dry mode: I will send admins a private note and will not delete or ban.",
    );
  });
  group.command("stats", async (ctx) => {
    if (!(await senderIsAdmin(ctx))) {
      await ctx.reply("Group admins can see the stats.");
      return;
    }
    await ctx.reply(guard.formatStats(ctx.chat.id));
  });

  // Every other group message, including captions and edits (scammers edit messages after posting).
  group.on(["message", "edited_message"], async (ctx) => {
    const message = ctx.msg;
    const text = message.text ?? message.caption;
    if (!text || message.from?.is_bot) return;
    await guard.handleGroupMessage(
      {
        chatId: ctx.chat.id,
        chatTitle: ctx.chat.title,
        chatUsername: "username" in ctx.chat ? ctx.chat.username : undefined,
        messageId: message.message_id,
        text,
      },
      actions,
    );
  });

  bot.callbackQuery(/^ns:(-?\d+):(\d+)$/, async (ctx) => {
    const chatId = Number(ctx.match[1]);
    const messageId = Number(ctx.match[2]);
    if (!(await isAdmin(chatId, ctx.from.id))) {
      await ctx.answerCallbackQuery({ text: "Group admins can mark this." });
      return;
    }
    const counted = guard.markNotScam(chatId, messageId);
    await ctx.answerCallbackQuery({ text: counted ? "Marked: Not a scam" : "Already marked" });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
  });

  return bot;
}

function describe(error: unknown): string {
  if (error instanceof GrammyError) return `${error.error_code} ${error.description}`;
  return error instanceof Error ? error.message : String(error);
}
