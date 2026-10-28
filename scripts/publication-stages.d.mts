export type PublicationStage = [string, string[]];

export const LEADERBOARD_INPUT: string;
export const LEADERBOARD_COMMAND: string;
export const LEDGER_STAGE: PublicationStage;

export function publicationStages(options: {
  leaderboardPresent: boolean;
}): PublicationStage[];
