import type { PlayParameters, AlignmentAttack, AlignmentStyle, OpeningBookEntry } from '../types/index.js'

export interface BotRecord {
  level: number
  aggression: number
  positional: number
  tactical: number
  endgame: number
  creativity: number
  alignmentAttack: string
  alignmentStyle: string
  mlWeightsBlob: Buffer | null
  gamesPlayed: number
  id: number
}

/**
 * Compute how much influence the ML model should have on move selection.
 * Scales with experience: untrained bots use pure attribute scoring,
 * experienced bots blend up to 40% ML influence.
 */
export function computeMlBlendWeight(gamesPlayed: number): number {
  if (gamesPlayed <= 0) return 0.0
  if (gamesPlayed <= 2) return 0.10
  if (gamesPlayed <= 5) return 0.20
  if (gamesPlayed <= 10) return 0.30
  if (gamesPlayed <= 20) return 0.35
  return 0.40
}

/**
 * Convert a bot's attributes + alignment into concrete play parameters.
 *
 * BALANCE PHILOSOPHY:
 * Every attribute should be a viable "main stat" that can win games.
 * No single stat should dominate — each has a unique win condition.
 *
 * - Aggression (20): Plays forcing moves, immune to blunders when forcing moves exist.
 *   WIN CONDITION: Initiative-based wins through checks and captures.
 *
 * - Positional (20): Trusts engine best moves, deeper search.
 *   WIN CONDITION: Solid, mistake-free play that grinds out advantages.
 *
 * - Tactical (20): Finds combinations via eval swings, deeper search.
 *   WIN CONDITION: Winning material through tactical shots and combinations.
 *
 * - Endgame (20): Dominates endgames with precision + extra depth.
 *   WIN CONDITION: Converting small advantages in simplified positions.
 *
 * - Creativity (20): Unpredictable moves with a "surprise bonus," faster ML learning.
 *   WIN CONDITION: Unique play style that improves faster via ML training.
 *
 * SECONDARY BONUSES (each stat gets ONE unique bonus at ≥15):
 * - Aggression ≥15: Blunder immunity when a forcing move is available
 * - Positional ≥15: +1 search depth (sees deeper)
 * - Tactical ≥15: +1 search depth (finds combos) + blunder rate ×0.7
 * - Endgame ≥15: +1 search depth in endgame positions
 * - Creativity ≥15: ML learning ×1.3 + surprise bonus in move scoring
 */
export function botToPlayParameters(bot: BotRecord, openingBook?: OpeningBookEntry | null): PlayParameters {
  const level = bot.level

  // Search depth scales with level
  const depthByLevel = [0, 3, 4, 4, 5, 5, 6, 7, 7, 8, 8, 9, 10, 10, 11, 12, 13, 14, 16, 18, 20]
  let searchDepth = depthByLevel[Math.min(level, 20)] || 3

  // Blunder rate decreases with level
  let blunderRate = Math.max(0, 0.15 - level * 0.01)

  // BALANCE: Positional focus reduces blunders moderately (was ×0.5, now ×0.7)
  if (bot.positional >= 15) {
    blunderRate *= 0.7
  }

  // BALANCE: Tactical focus reduces blunders moderately (was ×0.6, now ×0.7)
  if (bot.tactical >= 15) {
    blunderRate *= 0.7
  }

  // Base weights from attributes (0-20 -> 0.0-1.0)
  let aggressionWeight = bot.aggression / 20
  let positionalWeight = bot.positional / 20
  let tacticalWeight = bot.tactical / 20
  let endgameWeight = bot.endgame / 20

  // BALANCE: Give focused attributes extra power
  const focusBonus = (stat: number) => stat >= 15 ? 0.3 : stat >= 12 ? 0.15 : 0
  aggressionWeight += focusBonus(bot.aggression)
  positionalWeight += focusBonus(bot.positional)
  tacticalWeight += focusBonus(bot.tactical)
  endgameWeight += focusBonus(bot.endgame)

  // BALANCE: Positional focus grants deeper search (trusts engine more)
  if (bot.positional >= 15) {
    searchDepth = Math.min(searchDepth + 1, 22)
  }

  // BALANCE: Tactical focus grants deeper search (finds combinations)
  // Lowered threshold from 18 to 15 to match positional
  if (bot.tactical >= 15) {
    searchDepth = Math.min(searchDepth + 1, 22)
  }

  // Temperature from creativity
  // Low creativity (0): temperature 0.2 = almost always picks best-scored
  // High creativity (20): temperature 1.7 = frequently picks surprising moves
  let temperature = 0.2 + (bot.creativity / 20) * 1.5 - level * 0.015
  temperature = Math.max(0.1, Math.min(2.0, temperature))

  // BALANCE: High creativity improves ML training speed (more diverse data)
  // Also provides "surprise bonus" in move scoring (handled in move-selector)
  const mlLearningMultiplier = 1.0 + (bot.creativity >= 15 ? 0.3 : bot.creativity >= 10 ? 0.15 : 0)

  // Alignment modifiers (smaller than attributes to not overshadow them)
  const attack = bot.alignmentAttack as AlignmentAttack
  const style = bot.alignmentStyle as AlignmentStyle

  if (attack === 'aggressive') {
    aggressionWeight += 0.15
  } else if (attack === 'defensive') {
    endgameWeight += 0.15  // Defensive players excel at grinding endgames
    blunderRate *= 0.85    // Slightly more careful play (was ×0.8)
  }
  // 'balanced' = no modifier, a valid choice for flexibility

  if (style === 'chaotic') {
    temperature += 0.2
  } else if (style === 'positional') {
    positionalWeight += 0.15
  } else if (style === 'sacrificial') {
    aggressionWeight += 0.1
    tacticalWeight += 0.1
  }

  return {
    searchDepth,
    multiPv: 5,
    temperature: Math.max(0.1, Math.min(2.0, temperature)),
    blunderRate: Math.max(0, blunderRate),
    aggressionWeight: Math.min(1.5, aggressionWeight),
    positionalWeight: Math.min(1.5, positionalWeight),
    tacticalWeight: Math.min(1.5, tacticalWeight),
    endgameWeight: Math.min(1.5, endgameWeight),
    mlBlendWeight: computeMlBlendWeight(bot.gamesPlayed),
    openingBook: openingBook ?? null,
    mlModel: bot.mlWeightsBlob ? { botId: bot.id, weightsBlob: bot.mlWeightsBlob } : null,
    // Balance additions
    aggressionFocused: bot.aggression >= 15,
    endgameFocused: bot.endgame >= 15,
    creativityFocused: bot.creativity >= 15,
    mlLearningMultiplier,
  }
}

export function systemBotPlayParameters(level: number): PlayParameters {
  const depthByLevel = [0, 3, 4, 4, 5, 5, 6, 7, 7, 8, 8, 9, 10, 10, 11, 12, 13, 14, 16, 18, 20]
  const blunderByLevel = [0, 0.15, 0.14, 0.13, 0.12, 0.11, 0.10, 0.09, 0.08, 0.07, 0.06,
    0.05, 0.04, 0.03, 0.02, 0.01, 0, 0, 0, 0, 0]

  return {
    searchDepth: depthByLevel[Math.min(level, 20)] || 3,
    multiPv: 1,
    temperature: 0.3,
    blunderRate: blunderByLevel[Math.min(level, 20)] || 0,
    aggressionWeight: 0.5,
    positionalWeight: 0.7,
    tacticalWeight: 0.5,
    endgameWeight: 0.6,
    mlBlendWeight: 0,
    openingBook: null,
    mlModel: null,
    aggressionFocused: false,
    endgameFocused: false,
    creativityFocused: false,
    mlLearningMultiplier: 1.0,
  }
}
