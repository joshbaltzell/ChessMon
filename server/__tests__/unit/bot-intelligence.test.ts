import { describe, it, expect } from 'vitest'
import { botToPlayParameters, type BotRecord } from '../../src/models/bot-intelligence.js'

function makeBot(overrides: Partial<BotRecord> = {}): BotRecord {
  return {
    id: 1,
    level: 5,
    aggression: 10,
    positional: 10,
    tactical: 10,
    endgame: 10,
    creativity: 10,
    alignmentAttack: 'balanced',
    alignmentStyle: 'positional',
    mlWeightsBlob: null,
    ...overrides,
  }
}

describe('Bot Intelligence - Attribute Balance', () => {
  it('should produce different parameters for aggression-focused vs positional-focused bots', () => {
    const aggrBot = makeBot({ aggression: 20, positional: 5, tactical: 10, endgame: 10, creativity: 5 })
    const posBot = makeBot({ aggression: 5, positional: 20, tactical: 10, endgame: 10, creativity: 5 })

    const aggrParams = botToPlayParameters(aggrBot)
    const posParams = botToPlayParameters(posBot)

    expect(aggrParams.aggressionWeight).toBeGreaterThan(posParams.aggressionWeight)
    expect(posParams.positionalWeight).toBeGreaterThan(aggrParams.positionalWeight)
  })

  it('should give focused attributes a bonus (not just linear scaling)', () => {
    const focused = makeBot({ tactical: 20, aggression: 10, positional: 10, endgame: 5, creativity: 5 })
    const unfocused = makeBot({ tactical: 12, aggression: 10, positional: 10, endgame: 10, creativity: 8 })

    const focusedParams = botToPlayParameters(focused)
    const unfocusedParams = botToPlayParameters(unfocused)

    // Focused bot (20 tactical) should have MORE than 20/12 ratio advantage
    const ratio = focusedParams.tacticalWeight / unfocusedParams.tacticalWeight
    expect(ratio).toBeGreaterThan(20 / 12) // Focus bonus makes it better than linear
  })

  it('positional focus should reduce blunder rate', () => {
    const posBot = makeBot({ positional: 18, aggression: 8, tactical: 8, endgame: 8, creativity: 8 })
    const genericBot = makeBot({ positional: 10, aggression: 10, tactical: 10, endgame: 10, creativity: 10 })

    const posParams = botToPlayParameters(posBot)
    const genericParams = botToPlayParameters(genericBot)

    expect(posParams.blunderRate).toBeLessThan(genericParams.blunderRate)
  })

  it('positional focus should grant deeper search', () => {
    const posBot = makeBot({ positional: 18, aggression: 8, tactical: 8, endgame: 8, creativity: 8 })
    const genericBot = makeBot({ positional: 10, aggression: 10, tactical: 10, endgame: 10, creativity: 10 })

    const posParams = botToPlayParameters(posBot)
    const genericParams = botToPlayParameters(genericBot)

    expect(posParams.searchDepth).toBeGreaterThanOrEqual(genericParams.searchDepth)
  })

  it('creativity should control temperature (unpredictability)', () => {
    const creativeBot = makeBot({ creativity: 20, aggression: 10, positional: 5, tactical: 10, endgame: 5 })
    const boringBot = makeBot({ creativity: 0, aggression: 10, positional: 15, tactical: 10, endgame: 15 })

    const creativeParams = botToPlayParameters(creativeBot)
    const boringParams = botToPlayParameters(boringBot)

    expect(creativeParams.temperature).toBeGreaterThan(boringParams.temperature)
    expect(creativeParams.temperature).toBeGreaterThan(0.5)
    expect(boringParams.temperature).toBeLessThan(0.5)
  })

  it('all-aggression bot should have viable parameters', () => {
    const bot = makeBot({
      aggression: 20, positional: 10, tactical: 10, endgame: 5, creativity: 5,
      alignmentAttack: 'aggressive', alignmentStyle: 'sacrificial',
    })
    const params = botToPlayParameters(bot)

    expect(params.aggressionWeight).toBeGreaterThan(1.0) // Focus bonus + alignment
    expect(params.searchDepth).toBeGreaterThan(0)
    expect(params.blunderRate).toBeLessThan(0.2)
  })

  it('all-positional bot should have viable parameters', () => {
    const bot = makeBot({
      positional: 20, aggression: 5, tactical: 10, endgame: 10, creativity: 5,
      alignmentAttack: 'defensive', alignmentStyle: 'positional',
    })
    const params = botToPlayParameters(bot)

    expect(params.positionalWeight).toBeGreaterThan(1.0) // Focus bonus + alignment
    expect(params.blunderRate).toBeLessThan(0.06) // Reduced blunders
  })

  it('all-tactical bot should have viable parameters', () => {
    const bot = makeBot({
      tactical: 20, aggression: 10, positional: 5, endgame: 10, creativity: 5,
      alignmentAttack: 'balanced', alignmentStyle: 'sacrificial',
    })
    const params = botToPlayParameters(bot)

    expect(params.tacticalWeight).toBeGreaterThan(1.0)
    expect(params.blunderRate).toBeLessThan(0.1) // Tactical focus reduces blunders
  })

  it('all-endgame bot should have viable parameters', () => {
    const bot = makeBot({
      endgame: 20, aggression: 5, positional: 10, tactical: 10, creativity: 5,
      alignmentAttack: 'defensive', alignmentStyle: 'positional',
    })
    const params = botToPlayParameters(bot)

    expect(params.endgameWeight).toBeGreaterThan(1.0)
  })

  it('all-creativity bot should have viable parameters', () => {
    const bot = makeBot({
      creativity: 20, aggression: 10, positional: 10, tactical: 5, endgame: 5,
      alignmentAttack: 'balanced', alignmentStyle: 'chaotic',
    })
    const params = botToPlayParameters(bot)

    expect(params.temperature).toBeGreaterThan(1.0) // Very unpredictable
    expect(params.temperature).toBeLessThanOrEqual(2.0) // But clamped
  })

  it('alignment should modify parameters correctly', () => {
    const base = makeBot({ alignmentAttack: 'balanced', alignmentStyle: 'positional' })
    const aggr = makeBot({ alignmentAttack: 'aggressive', alignmentStyle: 'positional' })
    const def = makeBot({ alignmentAttack: 'defensive', alignmentStyle: 'positional' })

    const baseParams = botToPlayParameters(base)
    const aggrParams = botToPlayParameters(aggr)
    const defParams = botToPlayParameters(def)

    expect(aggrParams.aggressionWeight).toBeGreaterThan(baseParams.aggressionWeight)
    expect(defParams.endgameWeight).toBeGreaterThan(baseParams.endgameWeight)
    expect(defParams.blunderRate).toBeLessThan(baseParams.blunderRate)
  })

  it('level should increase search depth and decrease blunder rate', () => {
    const lowLevel = makeBot({ level: 1 })
    const highLevel = makeBot({ level: 15 })

    const lowParams = botToPlayParameters(lowLevel)
    const highParams = botToPlayParameters(highLevel)

    expect(highParams.searchDepth).toBeGreaterThan(lowParams.searchDepth)
    expect(highParams.blunderRate).toBeLessThan(lowParams.blunderRate)
  })

  it('five different focused builds should all produce distinct viable parameter profiles', () => {
    const builds = [
      makeBot({ aggression: 20, positional: 10, tactical: 10, endgame: 5, creativity: 5, alignmentAttack: 'aggressive', alignmentStyle: 'chaotic' }),
      makeBot({ aggression: 5, positional: 20, tactical: 10, endgame: 10, creativity: 5, alignmentAttack: 'defensive', alignmentStyle: 'positional' }),
      makeBot({ aggression: 10, positional: 5, tactical: 20, endgame: 10, creativity: 5, alignmentAttack: 'balanced', alignmentStyle: 'sacrificial' }),
      makeBot({ aggression: 5, positional: 10, tactical: 5, endgame: 20, creativity: 10, alignmentAttack: 'defensive', alignmentStyle: 'positional' }),
      makeBot({ aggression: 10, positional: 10, tactical: 5, endgame: 5, creativity: 20, alignmentAttack: 'balanced', alignmentStyle: 'chaotic' }),
    ]

    const paramSets = builds.map(b => botToPlayParameters(b))

    // Each build should have its focused stat as the highest weight
    expect(paramSets[0].aggressionWeight).toBeGreaterThan(paramSets[0].positionalWeight)
    expect(paramSets[1].positionalWeight).toBeGreaterThan(paramSets[1].aggressionWeight)
    expect(paramSets[2].tacticalWeight).toBeGreaterThan(paramSets[2].positionalWeight)
    expect(paramSets[3].endgameWeight).toBeGreaterThan(paramSets[3].aggressionWeight)
    expect(paramSets[4].temperature).toBeGreaterThan(1.0) // Creativity = high temperature

    // All should have reasonable search depths (not handicapped)
    for (const params of paramSets) {
      expect(params.searchDepth).toBeGreaterThanOrEqual(3)
      expect(params.blunderRate).toBeLessThan(0.2)
    }
  })
})
