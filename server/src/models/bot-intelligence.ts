import type { PlayParameters, AlignmentAttack, AlignmentStyle } from '../types/index.js'

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
  id: number
}

/**
 * Convert a bot's attributes + alignment into concrete play parameters.
 *
 * BALANCE PHILOSOPHY:
 * Every attribute should be a viable "main stat" that can win games.
 * - Aggression (20): Plays forcing moves, capitalizes on initiative
 * - Positional (20): Trusts engine best moves, plays solidly
 * - Tactical (20): Finds combinations, plays engine-accurate when it matters
 * - Endgame (20): Dominates endgames where precision wins
 * - Creativity (20): Unpredictable, catches opponents off-guard
 *
 * A focused build (e.g. 20/10/10/5/5) should beat an even build (10/10/10/10/10)
 * in scenarios where the focused stat matters, creating rock-paper-scissors dynamics.
 */
export function botToPlayParameters(bot: BotRecord): PlayParameters {
  const level = bot.level

  // Search depth scales with level
  const depthByLevel = [0, 3, 4, 4, 5, 5, 6, 7, 7, 8, 8, 9, 10, 10, 11, 12, 13, 14, 16, 18, 20]
  let searchDepth = depthByLevel[Math.min(level, 20)] || 3

  // Blunder rate decreases with level AND with focused attributes
  let blunderRate = Math.max(0, 0.15 - level * 0.01)

  // Focused positional play reduces blunders (trusts engine more)
  if (bot.positional >= 15) {
    blunderRate *= 0.5
  }

  // Focused tactical play reduces blunders in critical moments
  if (bot.tactical >= 15) {
    blunderRate *= 0.6
  }

  // Focused endgame grants a small depth bonus in endgame positions
  // (handled in move-selector, but reflected here as a signal)

  // Base weights from attributes (0-20 -> 0.0-1.0)
  // Each weight directly controls how much that scoring dimension matters
  let aggressionWeight = bot.aggression / 20
  let positionalWeight = bot.positional / 20
  let tacticalWeight = bot.tactical / 20
  let endgameWeight = bot.endgame / 20

  // BALANCE: Give focused attributes extra power (diminishing returns are bad for balance)
  // A stat at 20 gets 1.0 base + 0.3 focus bonus = 1.3 effective weight
  // A stat at 10 gets 0.5 base + 0.0 focus bonus = 0.5 effective weight
  const focusBonus = (stat: number) => stat >= 15 ? 0.3 : stat >= 12 ? 0.15 : 0
  aggressionWeight += focusBonus(bot.aggression)
  positionalWeight += focusBonus(bot.positional)
  tacticalWeight += focusBonus(bot.tactical)
  endgameWeight += focusBonus(bot.endgame)

  // BALANCE: Positional focus also grants slightly deeper search
  // (trusting engine more = playing better objectively)
  if (bot.positional >= 15) {
    searchDepth = Math.min(searchDepth + 1, 22)
  }

  // BALANCE: Tactical focus grants deeper search for finding combinations
  if (bot.tactical >= 18) {
    searchDepth = Math.min(searchDepth + 1, 22)
  }

  // Temperature from creativity
  // Low creativity (0): temperature 0.2 = almost always picks best-scored
  // High creativity (20): temperature 1.7 = frequently picks surprising moves
  // The ADVANTAGE of high creativity: opponents can't prepare for you,
  // and occasionally the "wrong" move is actually brilliant
  let temperature = 0.2 + (bot.creativity / 20) * 1.5 - level * 0.015
  temperature = Math.max(0.1, Math.min(2.0, temperature))

  // BALANCE: High creativity reduces the opponent's benefit from pattern recognition
  // This is modeled by making the bot's OWN ML model train faster (more diverse data)
  // Handled in training pipeline

  // Alignment modifiers (smaller than Phase 1 to not overshadow attributes)
  const attack = bot.alignmentAttack as AlignmentAttack
  const style = bot.alignmentStyle as AlignmentStyle

  if (attack === 'aggressive') {
    aggressionWeight += 0.15
  } else if (attack === 'defensive') {
    endgameWeight += 0.15  // Defensive players excel at grinding endgames
    blunderRate *= 0.8     // More careful play
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
    openingBook: null,
    mlModel: bot.mlWeightsBlob ? { botId: bot.id, weightsBlob: bot.mlWeightsBlob } : null,
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
    openingBook: null,
    mlModel: null,
  }
}
