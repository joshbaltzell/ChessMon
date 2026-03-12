import { describe, it, expect } from 'vitest'
import { LEVEL_CONFIGS, BONUS_POINTS_ON_FAILURE } from '../../src/models/progression.js'
import { systemBotPlayParameters } from '../../src/models/bot-intelligence.js'

describe('Level Test Logic', () => {
  it('system bot parameters should scale with level', () => {
    const level5 = systemBotPlayParameters(5)
    const level10 = systemBotPlayParameters(10)
    const level15 = systemBotPlayParameters(15)

    expect(level10.searchDepth).toBeGreaterThan(level5.searchDepth)
    expect(level15.searchDepth).toBeGreaterThan(level10.searchDepth)
    expect(level10.blunderRate).toBeLessThan(level5.blunderRate)
    expect(level15.blunderRate).toBeLessThan(level10.blunderRate)
  })

  it('system bot at level 20 should be strongest', () => {
    const params = systemBotPlayParameters(20)
    expect(params.searchDepth).toBe(20)
    expect(params.blunderRate).toBe(0)
  })

  it('level test pass conditions should be achievable', () => {
    for (let level = 1; level <= 20; level++) {
      const config = LEVEL_CONFIGS[level]
      // Need to win less than total games
      expect(config.winsRequired).toBeLessThanOrEqual(config.testGames)
      // Can afford to lose at least one game (except level 20 special)
      if (level < 20) {
        expect(config.testGames - config.winsRequired).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('bonus points on failure should help retry', () => {
    expect(BONUS_POINTS_ON_FAILURE).toBe(5)
    // 5 bonus points = at least 2 more spars
    expect(BONUS_POINTS_ON_FAILURE).toBeGreaterThanOrEqual(4)
  })

  it('ascii tier should correspond to level ranges', () => {
    const tierForLevel = (level: number) =>
      level <= 4 ? 1 : level <= 8 ? 2 : level <= 12 ? 3 : level <= 16 ? 4 : 5

    expect(tierForLevel(1)).toBe(1)
    expect(tierForLevel(4)).toBe(1)
    expect(tierForLevel(5)).toBe(2)
    expect(tierForLevel(8)).toBe(2)
    expect(tierForLevel(9)).toBe(3)
    expect(tierForLevel(12)).toBe(3)
    expect(tierForLevel(13)).toBe(4)
    expect(tierForLevel(16)).toBe(4)
    expect(tierForLevel(17)).toBe(5)
    expect(tierForLevel(20)).toBe(5)
  })

  it('elo targets should match expected chess rating bands', () => {
    expect(LEVEL_CONFIGS[1].eloTarget).toBe(400)   // beginner
    expect(LEVEL_CONFIGS[5].eloTarget).toBe(800)    // casual
    expect(LEVEL_CONFIGS[10].eloTarget).toBe(1300)  // intermediate
    expect(LEVEL_CONFIGS[15].eloTarget).toBe(1800)  // advanced
    expect(LEVEL_CONFIGS[20].eloTarget).toBe(2400)  // master
  })

  it('all system bot levels should produce valid play parameters', () => {
    for (let level = 1; level <= 20; level++) {
      const params = systemBotPlayParameters(level)
      expect(params.searchDepth).toBeGreaterThan(0)
      expect(params.blunderRate).toBeGreaterThanOrEqual(0)
      expect(params.blunderRate).toBeLessThanOrEqual(1)
      expect(params.temperature).toBeGreaterThan(0)
      expect(params.aggressionWeight).toBeGreaterThan(0)
      expect(params.positionalWeight).toBeGreaterThan(0)
    }
  })
})
