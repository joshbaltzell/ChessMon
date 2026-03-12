import { describe, it, expect } from 'vitest'
import {
  LEVEL_CONFIGS, SPAR_COST, PURCHASE_TACTIC_COST, DRILL_COST,
  BONUS_POINTS_ON_FAILURE, XP_PER_SPAR, XP_PER_LEVEL_TEST,
} from '../../src/models/progression.js'

describe('Progression System', () => {
  it('should have configs for all 20 levels', () => {
    for (let level = 1; level <= 20; level++) {
      expect(LEVEL_CONFIGS[level]).toBeDefined()
      expect(LEVEL_CONFIGS[level].searchDepth).toBeGreaterThan(0)
      expect(LEVEL_CONFIGS[level].trainingPoints).toBeGreaterThan(0)
    }
  })

  it('should have increasing search depth across levels', () => {
    for (let level = 2; level <= 20; level++) {
      expect(LEVEL_CONFIGS[level].searchDepth).toBeGreaterThanOrEqual(LEVEL_CONFIGS[level - 1].searchDepth)
    }
  })

  it('should have decreasing blunder rate across levels', () => {
    for (let level = 2; level <= 20; level++) {
      expect(LEVEL_CONFIGS[level].blunderRate).toBeLessThanOrEqual(LEVEL_CONFIGS[level - 1].blunderRate)
    }
  })

  it('should have zero blunder rate at high levels', () => {
    expect(LEVEL_CONFIGS[16].blunderRate).toBe(0)
    expect(LEVEL_CONFIGS[20].blunderRate).toBe(0)
  })

  it('should have increasing elo targets', () => {
    for (let level = 2; level <= 20; level++) {
      expect(LEVEL_CONFIGS[level].eloTarget).toBeGreaterThan(LEVEL_CONFIGS[level - 1].eloTarget)
    }
  })

  it('should have valid test game configurations', () => {
    for (let level = 1; level <= 20; level++) {
      const config = LEVEL_CONFIGS[level]
      expect(config.testGames).toBe(config.systemBotCount + config.playerBotCount)
      expect(config.winsRequired).toBeLessThanOrEqual(config.testGames)
      expect(config.winsRequired).toBeGreaterThan(0)
    }
  })

  it('early levels should use only system bots for testing', () => {
    for (let level = 1; level <= 5; level++) {
      expect(LEVEL_CONFIGS[level].playerBotCount).toBe(0)
      expect(LEVEL_CONFIGS[level].systemBotCount).toBeGreaterThan(0)
    }
  })

  it('mid levels should mix system and player bots', () => {
    for (let level = 6; level <= 10; level++) {
      expect(LEVEL_CONFIGS[level].playerBotCount).toBeGreaterThan(0)
      expect(LEVEL_CONFIGS[level].systemBotCount).toBeGreaterThan(0)
    }
  })

  it('high levels should use mostly player bots', () => {
    for (let level = 16; level <= 19; level++) {
      expect(LEVEL_CONFIGS[level].playerBotCount).toBe(5)
      expect(LEVEL_CONFIGS[level].systemBotCount).toBe(0)
    }
  })

  it('level 20 is special ceiling test', () => {
    const config = LEVEL_CONFIGS[20]
    expect(config.searchDepth).toBe(20)
    expect(config.winsRequired).toBe(1) // Only need 1 win/draw
    expect(config.systemBotCount).toBe(3) // All system bots (ceiling)
  })

  it('training costs should be defined correctly', () => {
    expect(SPAR_COST).toBe(2)
    expect(PURCHASE_TACTIC_COST).toBe(3)
    expect(DRILL_COST).toBe(1)
    expect(BONUS_POINTS_ON_FAILURE).toBe(5)
    expect(XP_PER_SPAR).toBe(20)
    expect(XP_PER_LEVEL_TEST).toBe(50)
  })

  it('training points should be enough for at least 2 spars per level', () => {
    for (let level = 1; level <= 20; level++) {
      expect(LEVEL_CONFIGS[level].trainingPoints).toBeGreaterThanOrEqual(SPAR_COST * 2)
    }
  })
})
