import { describe, it, expect } from 'vitest'
import { calculateEloChange } from '../../src/models/elo.js'

describe('Elo Rating', () => {
  it('should give positive change for a win', () => {
    const change = calculateEloChange(400, 400, '1-0', true)
    expect(change).toBe(16) // K=32, expected=0.5, score=1 -> 32*(1-0.5)=16
  })

  it('should give negative change for a loss', () => {
    const change = calculateEloChange(400, 400, '0-1', true)
    expect(change).toBe(-16)
  })

  it('should give zero change for a draw between equal players', () => {
    const change = calculateEloChange(400, 400, '1/2-1/2', true)
    expect(change).toBe(0)
  })

  it('should give bigger reward for beating higher-rated opponent', () => {
    const changeUp = calculateEloChange(400, 800, '1-0', true) // Upset win
    const changeEven = calculateEloChange(400, 400, '1-0', true) // Even win
    expect(changeUp).toBeGreaterThan(changeEven)
  })

  it('should give smaller penalty for losing to higher-rated opponent', () => {
    const changeBig = calculateEloChange(400, 400, '0-1', true) // Even loss
    const changeSmall = calculateEloChange(400, 800, '0-1', true) // Expected loss
    expect(Math.abs(changeSmall)).toBeLessThan(Math.abs(changeBig))
  })

  it('should handle black wins correctly', () => {
    const change = calculateEloChange(400, 400, '0-1', false)
    expect(change).toBe(16) // Black won, player is black -> win
  })
})
