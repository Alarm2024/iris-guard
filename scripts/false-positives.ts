import { checkScam } from "../src/scam.js";
import { NORMAL_MESSAGES, SCAM_MESSAGES } from "../tests/fixtures.js";

const falsePositives = NORMAL_MESSAGES.filter((line) => checkScam(line).verdict === "scam");
const missed = Object.entries(SCAM_MESSAGES).flatMap(([pattern, lines]) =>
  lines.filter((line) => checkScam(line).pattern !== pattern).map((line) => `${pattern}: ${line} -> ${checkScam(line).pattern}`),
);
console.log(`false positives: ${falsePositives.length} of ${NORMAL_MESSAGES.length}`);
for (const line of falsePositives) console.log(`  flagged: ${line} -> ${checkScam(line).pattern}`);
console.log(`scam lines missed or mislabeled: ${missed.length}`);
for (const line of missed) console.log(`  ${line}`);
