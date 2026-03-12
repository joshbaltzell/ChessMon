import { describe, it, expect } from 'vitest'
import { labelPositions } from '../../src/ml/training-pipeline.js'
import type { PositionRecord, CandidateMove } from '../../src/types/index.js'

function makePosition(
  color: 'w' | 'b',
  movePlayed: string,
  candidateRank: number = 0,
): PositionRecord {
  const candidates: CandidateMove[] = [
    { move: 'e2e4', centipawns: 100, mate: null, pv: ['e2e4'] },
    { move: 'd2d4', centipawns: 50, mate: null, pv: ['d2d4'] },
    { move: 'g1f3', centipawns: 0, mate: null, pv: ['g1f3'] },
  ]

  // Set movePlayedUci to match the expected rank in candidates
  const movePlayedUci = candidateRank < candidates.length
    ? candidates[candidateRank].move
    : 'unknown'

  return {
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    movePlayed,
    movePlayedUci,
    candidateMoves: candidates,
    color,
  }
}

const ATTRS = {
  aggression: 10, positional: 10, tactical: 10, endgame: 10, creativity: 10,
  alignmentAttack: 'balanced', alignmentStyle: 'positional',
}

describe('ML Training Pipeline - Label Positions', () => {
  it('should only label positions where the bot moved', () => {
    const positions = [
      makePosition('w', 'e4', 0),
      makePosition('b', 'e5', 0),
      makePosition('w', 'd4', 0),
      makePosition('b', 'Nf6', 1),
    ]

    const samples = labelPositions(positions, '1-0', 'w', ATTRS)
    // Should only have 2 samples (white's moves)
    expect(samples.length).toBe(2)
  })

  it('should give high labels for top moves in winning games', () => {
    const positions = [
      makePosition('w', 'bestmove', 0),
      makePosition('b', 'something', 0),
      makePosition('w', 'secondbest', 1),
    ]

    const samples = labelPositions(positions, '1-0', 'w', ATTRS)
    expect(samples.length).toBe(2)

    // Top move in a win should have high label (around 0.95 ± noise)
    expect(samples[0].label).toBeGreaterThan(0.7)
    // Second-best move in a win should still be decent
    expect(samples[1].label).toBeGreaterThan(0.5)
  })

  it('should give low labels for bad moves in losing games', () => {
    const positions = [
      makePosition('w', 'badmove', 99), // Not in top candidates
      makePosition('b', 'something', 0),
    ]

    const samples = labelPositions(positions, '0-1', 'w', ATTRS)
    expect(samples.length).toBe(1)
    // Bad move in a loss should have low label (0.1-0.35 range with noise)
    expect(samples[0].label).toBeLessThan(0.4)
  })

  it('should give moderate labels for draws', () => {
    const positions = [
      makePosition('w', 'bestmove', 0),
      makePosition('b', 'something', 0),
    ]

    const samples = labelPositions(positions, '1/2-1/2', 'w', ATTRS)
    expect(samples.length).toBe(1)
    // Top move in a draw should have moderate label
    expect(samples[0].label).toBeGreaterThan(0.3)
    expect(samples[0].label).toBeLessThan(0.9)
  })

  it('should produce correct feature dimensions for each sample', () => {
    const positions = [
      makePosition('w', 'bestmove', 0),
      makePosition('b', 'something', 0),
      makePosition('w', 'secondbest', 1),
    ]

    const samples = labelPositions(positions, '1-0', 'w', ATTRS)
    for (const sample of samples) {
      expect(sample.features).toBeInstanceOf(Float32Array)
      expect(sample.features.length).toBe(128)
      expect(sample.label).toBeGreaterThanOrEqual(0)
      expect(sample.label).toBeLessThanOrEqual(1)
    }
  })

  it('should handle empty positions gracefully', () => {
    const samples = labelPositions([], '1-0', 'w', ATTRS)
    expect(samples).toHaveLength(0)
  })
})
