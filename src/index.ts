import { createBot } from "./bot.js";
import { loadEnv } from "./env.js";

loadEnv();

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN is not set. Put it in the environment or in a .env file (see .env.example).");
  process.exit(1);
}

const bot = createBot(token);

bot.catch((error) => {
  console.error("update failed:", error.error);
});

process.once("SIGINT", () => void bot.stop());
process.once("SIGTERM", () => void bot.stop());

await bot.api.setMyCommands([
  { command: "start", description: "Get private scam notes (in a private chat)" },
  { command: "guard_on", description: "Act mode: delete flagged messages (admins)" },
  { command: "guard_off", description: "Dry mode: notes to admins, no deletes (admins)" },
  { command: "stats", description: "Messages seen and flagged (admins)" },
]);

await bot.start({
  allowed_updates: ["message", "edited_message", "callback_query", "my_chat_member"],
  onStart: (me) => console.log(`Iris Guard running as @${me.username} with long polling`),
});
