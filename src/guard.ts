import { checkScam } from "./scam.js";
import { looksLikeSeedPhrase } from "./refusals.js";

/** dry: tell admins privately, never delete or ban. act: delete the flagged message and warn the group. */
export type Mode = "dry" | "act";

/** Counter key for a message that contained a 12- or 24-word seed phrase. */
export const SEED_POSTED = "seed_phrase_posted";

export const PATTERN_LABELS: Record<string, string> = {
  [SEED_POSTED]: "seed phrase posted",
  seed_phrase_request: "seed phrase request",
  fake_support_dm: "fake support DM",
  fake_airdrop: "fake airdrop",
  unlimited_approval: "unlimited approval",
  authority_change: "authority change",
  urgent_verify_wallet_link: "urgent verify-wallet link",
};

export const SEED_WARNING =
  "I removed a message that looked like a wallet seed phrase. Those 12 or 24 words are the wallet: anyone who has them can take the funds. If they were yours, move your funds to a new wallet you create yourself. No admin, support desk, or bot will ever ask for them.";

export const SEED_WARNING_NOT_DELETED =
  "A message here looks like a wallet seed phrase and I could not delete it (I need the Delete messages permission). Admins, please remove it now. Anyone who has those words can take the wallet.";

export function scamWarning(pattern: string): string {
  const label = PATTERN_LABELS[pattern] ?? pattern;
  return `I removed a message that matched a known scam pattern (${label}). Do not open its links, do not connect a wallet, and never send anyone your recovery words.`;
}

export interface ChatStats {
  seen: number;
  flagged: Map<string, number>;
  notScam: number;
}

export interface GroupMessage {
  chatId: number;
  chatTitle?: string;
  chatUsername?: string;
  messageId: number;
  text: string;
}

export interface AdminNote {
  chatId: number;
  chatTitle?: string;
  messageId: number;
  pattern: string;
  why: string;
  link: string | null;
  mode: Mode;
  deleted: boolean;
}

/** Side effects the guard asks for. The grammY wiring lives in bot.ts; tests pass fakes. */
export interface GuardActions {
  deleteMessage(chatId: number, messageId: number): Promise<boolean>;
  postToGroup(chatId: number, text: string): Promise<void>;
  /** Send the note to admins of chatId who ran /start in a private chat. Returns how many got it. */
  notifyAdmins(note: AdminNote): Promise<number>;
}

export type Outcome =
  | { kind: "clean" }
  | { kind: "seed"; deleted: boolean }
  | { kind: "scam"; pattern: string; mode: Mode; deleted: boolean; notified: number };

/** Public link to a group message, when Telegram has one. Basic groups have no message links. */
export function messageLink(chatId: number, username: string | undefined, messageId: number): string | null {
  if (username) return `https://t.me/${username}/${messageId}`;
  const id = String(chatId);
  if (id.startsWith("-100")) return `https://t.me/c/${id.slice(4)}/${messageId}`;
  return null;
}

export function formatAdminNote(note: AdminNote): string {
  const label = PATTERN_LABELS[note.pattern] ?? note.pattern;
  const where = note.chatTitle ? `"${note.chatTitle}"` : `chat ${note.chatId}`;
  const action =
    note.mode === "dry"
      ? "Dry mode: nothing was deleted. Send /guard_on in the group to switch to act mode."
      : note.deleted
        ? "Act mode: the message was deleted and the group was warned."
        : "Act mode: I could not delete the message. Check that I have the Delete messages permission.";
  return [
    `Iris Guard flagged a message in ${where}.`,
    `Pattern: ${label} (${note.pattern})`,
    `Why: ${note.why}`,
    `Message: ${note.link ?? "no link (basic groups have no message links)"}`,
    action,
  ].join("\n");
}

/**
 * In-memory state and decisions. Stores counters, modes, and user/message ids.
 * It never stores message text.
 */
export class Guard {
  private readonly modes = new Map<number, Mode>();
  private readonly stats = new Map<number, ChatStats>();
  private readonly subscribers = new Set<number>();
  private readonly markedNotScam = new Set<string>();

  mode(chatId: number): Mode {
    return this.modes.get(chatId) ?? "dry";
  }

  setMode(chatId: number, mode: Mode): void {
    this.modes.set(chatId, mode);
  }

  /** An admin ran /start in a private chat, so the bot may message them. */
  subscribe(userId: number): void {
    this.subscribers.add(userId);
  }

  unsubscribe(userId: number): void {
    this.subscribers.delete(userId);
  }

  isSubscribed(userId: number): boolean {
    return this.subscribers.has(userId);
  }

  subscriberIds(): number[] {
    return [...this.subscribers];
  }

  forgetChat(chatId: number): void {
    this.modes.delete(chatId);
    this.stats.delete(chatId);
  }

  statsFor(chatId: number): ChatStats {
    let entry = this.stats.get(chatId);
    if (!entry) {
      entry = { seen: 0, flagged: new Map(), notScam: 0 };
      this.stats.set(chatId, entry);
    }
    return entry;
  }

  private bump(chatId: number, pattern: string): void {
    const flagged = this.statsFor(chatId).flagged;
    flagged.set(pattern, (flagged.get(pattern) ?? 0) + 1);
  }

  /** Returns false when this message was already marked. */
  markNotScam(chatId: number, messageId: number): boolean {
    const key = `${chatId}:${messageId}`;
    if (this.markedNotScam.has(key)) return false;
    this.markedNotScam.add(key);
    this.statsFor(chatId).notScam += 1;
    return true;
  }

  async handleGroupMessage(message: GroupMessage, actions: GuardActions): Promise<Outcome> {
    const { chatId, messageId, text } = message;
    this.statsFor(chatId).seen += 1;

    // A posted seed phrase is removed in both modes: leaving it up hands the wallet to every reader.
    if (looksLikeSeedPhrase(text)) {
      this.bump(chatId, SEED_POSTED);
      const deleted = await actions.deleteMessage(chatId, messageId);
      await actions.postToGroup(chatId, deleted ? SEED_WARNING : SEED_WARNING_NOT_DELETED);
      return { kind: "seed", deleted };
    }

    const report = checkScam(text);
    if (report.verdict !== "scam" || !report.pattern) return { kind: "clean" };

    const pattern = report.pattern;
    const mode = this.mode(chatId);
    this.bump(chatId, pattern);

    let deleted = false;
    if (mode === "act") {
      deleted = await actions.deleteMessage(chatId, messageId);
      if (deleted) await actions.postToGroup(chatId, scamWarning(pattern));
    }

    const notified = await actions.notifyAdmins({
      chatId,
      chatTitle: message.chatTitle,
      messageId,
      pattern,
      why: report.why,
      link: messageLink(chatId, message.chatUsername, messageId),
      mode,
      deleted,
    });
    return { kind: "scam", pattern, mode, deleted, notified };
  }

  formatStats(chatId: number): string {
    const entry = this.statsFor(chatId);
    const lines = [
      `Iris Guard stats (mode: ${this.mode(chatId)})`,
      `Messages seen: ${entry.seen}`,
      "Flagged per pattern:",
    ];
    for (const pattern of Object.keys(PATTERN_LABELS)) {
      lines.push(`- ${PATTERN_LABELS[pattern]}: ${entry.flagged.get(pattern) ?? 0}`);
    }
    lines.push(`Marked "Not a scam": ${entry.notScam}`);
    lines.push("Counters are kept in memory and reset when the bot restarts.");
    return lines.join("\n");
  }
}
