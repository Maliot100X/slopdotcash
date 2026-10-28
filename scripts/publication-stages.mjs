/**
 * The stages that assemble one publication, in the order Vite needs them.
 *
 * Kept in its own module so the ordering rules can be tested without running
 * the generators, and so `scripts/prepare-publication.mjs` stays a runner.
 */

/** `scripts/generate-points.ts` reads this file and cannot run without it. */
export const LEADERBOARD_INPUT = "public/data/leaderboard.json";

/** The command that produces it, quoted in the failure and in the guides. */
export const LEADERBOARD_COMMAND = "bun run leaderboard:generate";

/**
 * The stage that produces the ledger. Exported as the same array the stage list
 * carries, so a caller can tell which stage failed without re-deriving it.
 */
export const LEDGER_STAGE = ["bun", ["scripts/generate-leaderboard.ts"]];

/**
 * A clean checkout does not have `public/data/leaderboard.json`: it is a
 * generated input and `git check-ignore` lists it (`.gitignore:33`). Only the
 * deploy workflow generates it before a build, so a local `bun run build` —
 * and therefore `bun run verify`, which ends in `build` — died inside
 * `generate-points.ts` on a missing file. When the input is absent the ledger
 * is generated first, before the stage that reads it.
 *
 * The ledger generator is invoked by path rather than through the package
 * script so this stays one process tree with one exit code.
 */
export function publicationStages({ leaderboardPresent }) {
  const stages = [];
  if (!leaderboardPresent) stages.push(LEDGER_STAGE);
  stages.push(
    [process.execPath, ["scripts/prepare-site.mjs"]],
    ["bun", ["scripts/generate-points.ts"]],
    [
      "bun",
      [
        "scripts/generate-profiles.ts",
        "--input",
        process.env.SLOP_PROFILES_INPUT ?? "data/profiles/seed.json",
      ],
    ],
  );
  return stages;
}
