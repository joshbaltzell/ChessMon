import { describe, it, expect } from 'vitest'
import {
  SPAR_COST, PURCHASE_TACTIC_COST, DRILL_COST,
  LEVEL_CONFIGS, BONUS_POINTS_ON_FAILURE,
} from '../../src/models/progression.js'

describe('Training Point Accounting', () => {
  it('spar should cost 2 points', () => {
    expect(SPAR_COST).toBe(2)
  })

  it('purchase tactic should cost 3 points', () => {
    expect(PURCHASE_TACTIC_COST).toBe(3)
  })

  it('drill should cost 1 point', () => {
    expect(DRILL_COST).toBe(1)
  })

  it('level 1 bot should be able to do at least 3 spars and 1 purchase', () => {
    const points = LEVEL_CONFIGS[1].trainingPoints
    expect(points).toBeGreaterThanOrEqual(SPAR_COST * 3 + PURCHASE_TACTIC_COST)
  })

  it('optimal training strategies should be possible at every level', () => {
    for (let level = 1; level <= 20; level++) {
      const points = LEVEL_CONFIGS[level].trainingPoints
      // At minimum: 2 spars + 1 drill
      const minStrategy = SPAR_COST * 2 + DRILL_COST
      expect(points).toBeGreaterThanOrEqual(minStrategy)
    }
  })

  it('failure bonus should allow meaningful additional training', () => {
    // Bonus should allow at least 2 spars
    expect(BONUS_POINTS_ON_FAILURE).toBeGreaterThanOrEqual(SPAR_COST * 2)
  })

  it('training point budget should decrease at higher levels', () => {
    // Higher level = fewer training points (harder)
    expect(LEVEL_CONFIGS[1].trainingPoints).toBeGreaterThanOrEqual(LEVEL_CONFIGS[10].trainingPoints)
    expect(LEVEL_CONFIGS[10].trainingPoints).toBeGreaterThanOrEqual(LEVEL_CONFIGS[20].trainingPoints)
  })

  it('should simulate training point spending scenarios', () => {
    // All-spar strategy
    const allSpar = Math.floor(10 / SPAR_COST)
    expect(allSpar).toBe(5)

    // Mixed strategy: 2 spars + 1 purchase + 1 drill
    const mixedCost = SPAR_COST * 2 + PURCHASE_TACTIC_COST + DRILL_COST
    expect(mixedCost).toBe(8) // 4+3+1 = 8
    expect(10 - mixedCost).toBe(2) // 2 points left for another spar

    // All-drill strategy (for maxing proficiency)
    const allDrill = Math.floor(10 / DRILL_COST)
    expect(allDrill).toBe(10)
  })
})
