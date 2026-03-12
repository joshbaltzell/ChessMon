import type { PlayParameters, AlignmentAttack, AlignmentStyle } from '../types/index.js'

interface BotRecord {
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

export function botToPlayParameters(bot: BotRecord): PlayParameters {
  const level = bot.level

  // Search depth scales with level
  const depthByLevel = [0, 3, 4, 4, 5, 5, 6, 7, 7, 8, 8, 9, 10, 10, 11, 12, 13, 14, 16, 18, 20]
  const searchDepth = depthByLevel[Math.min(level, 20)] || 3

  // Blunder rate decreases with level
  const blunderRate = Math.max(0, 0.15 - level * 0.01)

  // Base weights from attributes (0-20 -> 0.0-1.0)
  let aggressionWeight = bot.aggression / 20
  let positionalWeight = bot.positional / 20
  const tacticalWeight = bot.tactical / 20
  const endgameWeight = bot.endgame / 20

  // Temperature from creativity
  let temperature = 0.2 + (bot.creativity / 20) * 1.5 - level * 0.02
  temperature = Math.max(0.1, Math.min(2.0, temperature))

  // Alignment modifiers
  const attack = bot.alignmentAttack as AlignmentAttack
  const style = bot.alignmentStyle as AlignmentStyle

  if (attack === 'aggressive') {
    aggressionWeight = Math.min(1.0, aggressionWeight + 0.3)
  } else if (attack === 'defensive') {
    positionalWeight = Math.min(1.0, positionalWeight + 0.2)
  }

  if (style === 'chaotic') {
    temperature = Math.min(2.0, temperature + 0.3)
  } else if (style === 'positional') {
    positionalWeight = Math.min(1.0, positionalWeight + 0.2)
  }
  // 'sacrificial' alignment is handled in move-selector scoring (Phase 2)

  return {
    searchDepth,
    multiPv: 5,
    temperature,
    blunderRate,
    aggressionWeight,
    positionalWeight,
    tacticalWeight,
    endgameWeight,
    openingBook: null, // Will be populated when opening books are loaded
    mlModel: bot.mlWeightsBlob ? { botId: bot.id, weightsBlob: bot.mlWeightsBlob } : null,
  }
}

export function systemBotPlayParameters(level: number): PlayParameters {
  const depthByLevel = [0, 3, 4, 4, 5, 5, 6, 7, 7, 8, 8, 9, 10, 10, 11, 12, 13, 14, 16, 18, 20]
  const blunderByLevel = [0, 0.15, 0.14, 0.13, 0.12, 0.11, 0.10, 0.09, 0.08, 0.07, 0.06,
    0.05, 0.04, 0.03, 0.02, 0.01, 0, 0, 0, 0, 0]

  return {
    searchDepth: depthByLevel[Math.min(level, 20)] || 3,
    multiPv: 1, // System bots just play the best move
    temperature: 0.3,
    blunderRate: blunderByLevel[Math.min(level, 20)] || 0,
    aggressionWeight: 0.5,
    positionalWeight: 0.8,
    tacticalWeight: 0.5,
    endgameWeight: 0.7,
    openingBook: null,
    mlModel: null,
  }
}
