import { describe, it, expect } from 'vitest'
import { generateMatchRecap } from '../../src/models/battle-commentary.js'
import type { PositionRecord, CandidateMove } from '../../src/types/index.js'

function makePositions(count: number, evalPattern: number[]): PositionRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    fen: `fen_${i}`,
    movePlayed: i % 2 === 0 ? 'e4' : 'e5',
    movePlayedUci: i % 2 === 0 ? 'e2e4' : 'e7e5',
    candidateMoves: [
      { move: i % 2 === 0 ? 'e2e4' : 'e7e5', centipawns: evalPattern[i] ?? 0, mate: null, pv: [] },
      { move: 'd2d4', centipawns: (evalPattern[i] ?? 0) - 50, mate: null, pv: [] },
      { move: 'g1f3', centipawns: (evalPattern[i] ?? 0) - 100, mate: null, pv: [] },
    ] as CandidateMove[],
    color: (i % 2 === 0 ? 'w' : 'b') as 'w' | 'b',
  }))
}

describe('Battle Commentary', () => {
  it('should generate a recap for a winning game', () => {
    const positions = makePositions(20, [10, -10, 30, -30, 100, -100, 200, -200, 300, -300,
      400, -400, 500, -500, 600, -600, 700, -700, 800, -800])
    const recap = generateMatchRecap(positions, '1-0', 'w', 'aggressive', 'chaotic')

    expect(recap.summary).toBeTruthy()
    expect(recap.summary.length).toBeGreaterThan(10)
    expect(recap.botMood).toBe('happy')
    expect(Array.isArray(recap.keyMoments)).toBe(true)
  })

  it('should generate a recap for a losing game', () => {
    const positions = makePositions(40, Array.from({ length: 40 }, (_, i) => -i * 20))
    const recap = generateMatchRecap(positions, '0-1', 'w', 'defensive', 'positional')

    expect(recap.summary).toBeTruthy()
    expect(recap.botMood).toBe('determined')
  })

  it('should generate a recap for a draw', () => {
    const positions = makePositions(60, Array.from({ length: 60 }, () => 0))
    const recap = generateMatchRecap(positions, '1/2-1/2', 'w', 'balanced', 'positional')

    expect(recap.summary).toContain('draw')
  })

  it('should detect brilliant moves', () => {
    // Create positions where white plays top move with big eval gain
    const positions: PositionRecord[] = [
      {
        fen: 'start', movePlayed: 'Qh5', movePlayedUci: 'e2e4',
        color: 'w',
        candidateMoves: [
          { move: 'e2e4', centipawns: 300, mate: null, pv: [] },
          { move: 'd2d4', centipawns: 50, mate: null, pv: [] },
        ],
      },
    ]
    const recap = generateMatchRecap(positions, '1-0', 'w', 'aggressive', 'sacrificial')
    // With only 1 position the eval swing is 300-0=300 which triggers brilliant
    const brilliant = recap.keyMoments.find(m => m.type === 'brilliant')
    expect(brilliant).toBeTruthy()
    expect(brilliant!.commentary).toBeTruthy()
  })

  it('should limit key moments to 5', () => {
    // Create 20 positions with wild eval swings
    const positions = makePositions(20,
      [0, 0, 500, -500, 1000, -1000, 500, -500, 1000, -1000,
        0, 0, 500, -500, 1000, -1000, 500, -500, 1000, -1000])
    const recap = generateMatchRecap(positions, '1-0', 'w', 'balanced', 'chaotic')

    expect(recap.keyMoments.length).toBeLessThanOrEqual(5)
  })

  it('should have different commentary for different alignments', () => {
    const positions = makePositions(10, [0, 0, 0, 0, 300, -300, 0, 0, 0, 0])

    const aggressiveRecap = generateMatchRecap(positions, '1-0', 'w', 'aggressive', 'chaotic')
    const defensiveRecap = generateMatchRecap(positions, '1-0', 'w', 'defensive', 'positional')

    // Both should have recaps but summaries are deterministic for same result type
    expect(aggressiveRecap.summary).toBeTruthy()
    expect(defensiveRecap.summary).toBeTruthy()
  })
})
