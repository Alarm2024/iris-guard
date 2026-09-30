import { existsSync } from "node:fs";

/** Load .env into process.env when the file exists. Never required. */
export function loadEnv(path = ".env"): boolean {
  if (!existsSync(path)) return false;
  process.loadEnvFile(path);
  return true;
}
