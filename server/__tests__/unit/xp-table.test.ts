import { describe, it, expect } from 'vitest'
import { getXpForSpar, QUICK_SPAR_XP } from '../../src/models/progression.js'

describe('XP Table', () => {
  it('should return correct XP for level 1 win', () => {
    expect(getXpForSpar(1, 'win', 1)).toBe(15)
  })
  it('should return correct XP for level 1 loss', () => {
    expect(getXpForSpar(1, 'loss', 1)).toBe(5)
  })
  it('should return draw XP as midpoint', () => {
    expect(getXpForSpar(1, 'draw', 1)).toBe(10)
  })
  it('should apply 2x multiplier for card spar', () => {
    expect(getXpForSpar(1, 'win', 2)).toBe(30)
  })
  it('should apply 4x multiplier for power spar', () => {
    expect(getXpForSpar(1, 'win', 4)).toBe(60)
  })
  it('should return correct XP for all levels 1-5', () => {
    expect(getXpForSpar(2, 'win', 1)).toBe(18)
    expect(getXpForSpar(3, 'win', 1)).toBe(20)
    expect(getXpForSpar(4, 'win', 1)).toBe(22)
    expect(getXpForSpar(5, 'win', 1)).toBe(25)
  })
  it('should fall back to level 5 XP for levels 6+', () => {
    expect(getXpForSpar(10, 'win', 1)).toBe(25)
  })
  it('should export QUICK_SPAR_XP table', () => {
    expect(QUICK_SPAR_XP[1]).toEqual({ win: 15, loss: 5 })
  })
})
