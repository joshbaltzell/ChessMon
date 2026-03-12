export interface LevelConfig {
  searchDepth: number
  blunderRate: number
  trainingPoints: number
  testGames: number
  systemBotCount: number
  playerBotCount: number
  winsRequired: number
  eloTarget: number
}

export const LEVEL_CONFIGS: Record<number, LevelConfig> = {
  1:  { searchDepth: 3,  blunderRate: 0.15, trainingPoints: 10, testGames: 3, systemBotCount: 3, playerBotCount: 0, winsRequired: 2, eloTarget: 400 },
  2:  { searchDepth: 4,  blunderRate: 0.14, trainingPoints: 10, testGames: 3, systemBotCount: 3, playerBotCount: 0, winsRequired: 2, eloTarget: 500 },
  3:  { searchDepth: 4,  blunderRate: 0.13, trainingPoints: 10, testGames: 3, systemBotCount: 3, playerBotCount: 0, winsRequired: 2, eloTarget: 600 },
  4:  { searchDepth: 5,  blunderRate: 0.12, trainingPoints: 9,  testGames: 3, systemBotCount: 3, playerBotCount: 0, winsRequired: 2, eloTarget: 700 },
  5:  { searchDepth: 5,  blunderRate: 0.11, trainingPoints: 9,  testGames: 3, systemBotCount: 3, playerBotCount: 0, winsRequired: 2, eloTarget: 800 },
  6:  { searchDepth: 6,  blunderRate: 0.10, trainingPoints: 8,  testGames: 5, systemBotCount: 3, playerBotCount: 2, winsRequired: 3, eloTarget: 900 },
  7:  { searchDepth: 7,  blunderRate: 0.09, trainingPoints: 8,  testGames: 5, systemBotCount: 3, playerBotCount: 2, winsRequired: 3, eloTarget: 1000 },
  8:  { searchDepth: 7,  blunderRate: 0.08, trainingPoints: 8,  testGames: 5, systemBotCount: 3, playerBotCount: 2, winsRequired: 3, eloTarget: 1100 },
  9:  { searchDepth: 8,  blunderRate: 0.07, trainingPoints: 7,  testGames: 5, systemBotCount: 3, playerBotCount: 2, winsRequired: 3, eloTarget: 1200 },
  10: { searchDepth: 8,  blunderRate: 0.06, trainingPoints: 7,  testGames: 5, systemBotCount: 3, playerBotCount: 2, winsRequired: 3, eloTarget: 1300 },
  11: { searchDepth: 9,  blunderRate: 0.05, trainingPoints: 6,  testGames: 5, systemBotCount: 2, playerBotCount: 3, winsRequired: 3, eloTarget: 1400 },
  12: { searchDepth: 10, blunderRate: 0.04, trainingPoints: 6,  testGames: 5, systemBotCount: 2, playerBotCount: 3, winsRequired: 3, eloTarget: 1500 },
  13: { searchDepth: 10, blunderRate: 0.03, trainingPoints: 6,  testGames: 5, systemBotCount: 2, playerBotCount: 3, winsRequired: 3, eloTarget: 1600 },
  14: { searchDepth: 11, blunderRate: 0.02, trainingPoints: 6,  testGames: 5, systemBotCount: 2, playerBotCount: 3, winsRequired: 3, eloTarget: 1700 },
  15: { searchDepth: 12, blunderRate: 0.01, trainingPoints: 5,  testGames: 5, systemBotCount: 2, playerBotCount: 3, winsRequired: 3, eloTarget: 1800 },
  16: { searchDepth: 13, blunderRate: 0,    trainingPoints: 5,  testGames: 5, systemBotCount: 0, playerBotCount: 5, winsRequired: 3, eloTarget: 1900 },
  17: { searchDepth: 14, blunderRate: 0,    trainingPoints: 5,  testGames: 5, systemBotCount: 0, playerBotCount: 5, winsRequired: 3, eloTarget: 2000 },
  18: { searchDepth: 16, blunderRate: 0,    trainingPoints: 5,  testGames: 5, systemBotCount: 0, playerBotCount: 5, winsRequired: 3, eloTarget: 2100 },
  19: { searchDepth: 18, blunderRate: 0,    trainingPoints: 5,  testGames: 5, systemBotCount: 0, playerBotCount: 5, winsRequired: 4, eloTarget: 2200 },
  20: { searchDepth: 20, blunderRate: 0,    trainingPoints: 5,  testGames: 3, systemBotCount: 3, playerBotCount: 0, winsRequired: 1, eloTarget: 2400 },
}

export const SPAR_COST = 2
export const PURCHASE_TACTIC_COST = 3
export const DRILL_COST = 1
export const BONUS_POINTS_ON_FAILURE = 5
export const XP_PER_SPAR = 20
export const XP_PER_LEVEL_TEST = 50
