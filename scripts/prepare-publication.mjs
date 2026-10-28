/** Assemble one publication from explicit inputs before Vite serves or builds it. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  LEADERBOARD_COMMAND,
  LEADERBOARD_INPUT,
  LEDGER_STAGE,
  publicationStages,
} from "./publication-stages.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const stages = publicationStages({
  leaderboardPresent: existsSync(
    new URL(`../${LEADERBOARD_INPUT}`, import.meta.url),
  ),
});
// The ledger stage is the only one that talks to the GitHub API, so a failure
// there is reported as the missing input it is rather than as whatever the
// script printed last.
const generating = stages.includes(LEDGER_STAGE);
if (generating) {
  console.log(
    `${LEADERBOARD_INPUT} is absent; generating the ledger first (it is a generated, git-ignored input).`,
  );
}
for (const stage of stages) {
  if (stage === LEDGER_STAGE) {
    try {
      execFileSync(stage[0], stage[1], { cwd: root, stdio: "inherit" });
    } catch {
      throw new Error(
        `${LEADERBOARD_COMMAND} could not produce ${LEADERBOARD_INPUT}, and scripts/generate-points.ts cannot run without it. It collects the rolling ledger from the GitHub API, so it needs a token and network access; CONTRIBUTING.md (Quality gate) and README.md (Local review checks) describe the prepared-snapshot path for a run without live ingestion.`,
      );
    }
    continue;
  }
  execFileSync(stage[0], stage[1], { cwd: root, stdio: "inherit" });
}
