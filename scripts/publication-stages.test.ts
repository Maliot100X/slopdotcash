/** #1411 F5: a clean checkout has no generated ledger, and the publication
 * stages are what decide whether one is produced before the stage that reads
 * it. These cases pin the order, not the generators themselves.
 */
import { expect, test } from "bun:test";
import { LEDGER_STAGE, publicationStages } from "./publication-stages.mjs";

const paths = (leaderboardPresent: boolean) =>
  publicationStages({ leaderboardPresent }).map(([, args]) => args[0]);

test("an absent ledger is generated before the stage that reads it", () => {
  const stages = paths(false);
  expect(stages[0]).toBe("scripts/generate-leaderboard.ts");
  // generate-points reads the ledger, so its stage has to come after the generator.
  expect(stages.indexOf("scripts/generate-points.ts")).toBeGreaterThan(0);
  expect(stages).toContain("scripts/prepare-site.mjs");
  expect(stages).toContain("scripts/generate-profiles.ts");
});

test("the ledger stage is the exported one, by identity", () => {
  // The runner recognises the stage it has to wrap in an actionable failure with
  // `===`. A copy of the same array would pass every name-based assertion above
  // and still leave that path dead, so this compares the reference.
  const stages = publicationStages({ leaderboardPresent: false });
  expect(stages[0]).toBe(LEDGER_STAGE);
  expect(stages.includes(LEDGER_STAGE)).toBe(true);
  expect(
    publicationStages({ leaderboardPresent: true }).includes(LEDGER_STAGE),
  ).toBe(false);
});

test("a ledger that is already there is not regenerated", () => {
  const stages = paths(true);
  expect(stages).not.toContain("scripts/generate-leaderboard.ts");
  expect(stages[0]).toBe("scripts/prepare-site.mjs");
  expect(stages).toContain("scripts/generate-points.ts");
});
