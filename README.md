# Iris Guard v0

A Telegram group bot that flags scam messages for the group's admins.

Iris Guard reads messages in groups where an admin added it, checks each one against six fixed scam patterns, and tells the admins. It does not use an AI model. It keeps counters in memory and stores no message text.

## What it does

- **Seed phrases.** If a message contains a 12- or 24-word run of English BIP-39 words, the bot deletes it (in both modes) and posts a warning. It needs the *Delete messages* admin permission for this. Without it, the bot posts a warning asking an admin to remove the message.
- **Scam patterns.** Every other message is checked against six patterns:
  1. seed-phrase request
  2. fake support DM
  3. fake airdrop
  4. unlimited approval
  5. authority change (SetAuthority)
  6. urgent verify-wallet link
- **Admin notes.** When a message matches, each admin who has sent `/start` to the bot in a private chat gets a note with the pattern, why it matched, and a link to the message. Each note has a **Not a scam** button.
- **Stats.** `/stats` (admins) shows messages seen, flagged per pattern, and how many were marked "Not a scam". Counters reset when the bot restarts.
- Edited messages and media captions are checked too.

## Dry mode and act mode

| | Dry mode (default) | Act mode |
|---|---|---|
| Scam pattern match | Private note to admins | Delete the message, post a short warning, private note to admins |
| Seed phrase posted | Delete + warning | Delete + warning |
| Bans | Never | Never |

- `/guard_on` (admins) switches the group to act mode.
- `/guard_off` (admins) switches back to dry mode.
- Mode is kept per group, in memory. After a restart every group is back in dry mode.

## What it refuses

- It never messages a user first. Private notes go to admins who sent `/start` to the bot, and `/stop` turns them off.
- It stays in a group when an admin added it. If a non-admin adds it, it leaves.
- It never bans anyone, and it never deletes anything in dry mode except a posted seed phrase.
- It does not store message text. It keeps counters, the group mode, and user and message ids.
- In a private chat it does not give price or market advice, cannot connect a wallet, sign, or approve anything, and deletes a seed phrase sent to it (the refusals come from `src/refusals.ts`).
- No AI model, no payments, no wallet access.

A "no match" is not a clearance. The six patterns are fixed text rules and will miss scams worded in new ways.

## Run it with long polling

Requirements: Node 22 or newer.

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.
2. In BotFather, turn **Group Privacy** off (`/setprivacy` -> Disable) so the bot can read group messages. Making the bot a group admin also works.
3. Set the token:
   ```sh
   cp .env.example .env    # then put your token after BOT_TOKEN=
   ```
   Or export `BOT_TOKEN` in your shell. The bot loads `.env` with `process.loadEnvFile()` when the file exists. `.env` is in `.gitignore`; do not commit it.
4. Install and start:
   ```sh
   npm install
   npm start
   ```
   The bot uses long polling (`bot.start()`), so it needs no public URL or webhook.
5. Add the bot to your group as an admin with the *Delete messages* permission.
6. Each admin who wants notes opens a private chat with the bot and sends `/start`.

## Tests

```sh
npm test          # node:test via tsx
npm run typecheck
npm run fp        # prints the false-positive count on the normal chat lines
```

The tests use 3 realistic scam messages for each of the six patterns and 10 normal crypto chat lines that must not be flagged (for example "the airdrop snapshot was yesterday"). They also cover dry mode (no deletes), act mode, seed phrase removal, the Not a scam button, `/stats`, the admin checks, and `.env` loading. Telegram API calls are recorded by a fake, so tests need no token or network.

## Where the code comes from

`src/scam.ts`, `src/refusals.ts`, and `vendor/bip39-english.txt` are copied from [Alarm2024/desk-alexa-mcp](https://github.com/Alarm2024/desk-alexa-mcp), branch `cursor/iris-alexa-mcp-07bb`, commit `65928ab3356461ad2d16a7b70e163f689d969aae`.

Changes after the copy:

- `src/scam.ts`: the copied rules flagged 4 of the 10 normal chat lines. The rules now need a request, claim, or action next to the key words, and safety advice such as "never share your seed phrase" or "admins will never DM you" is removed before matching. The six pattern ids and their "why" text are unchanged.
- `src/refusals.ts`: the price refusal reason is renamed to `price_advice` and its message reworded. The seed phrase check is unchanged.
- `vendor/bip39-english.txt`: unchanged. It is the standard 2048-word English BIP-39 list and is needed for seed phrase detection.

## Layout

```
src/index.ts      entry point: loads .env, starts long polling
src/bot.ts        grammY wiring: commands, group messages, admin notes, button
src/guard.ts      modes, counters, and decisions (no Telegram calls)
src/scam.ts       six fixed scam patterns (copied, rules adjusted)
src/refusals.ts   seed phrase detection and private-chat refusals (copied)
src/env.ts        optional .env loading
tests/            node:test suites and fixtures
```
