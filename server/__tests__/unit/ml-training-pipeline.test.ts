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
  it('should label ALL candidates for bot positions (multi-candidate augmentation)', () => {
    const positions = [
      makePosition('w', 'e4', 0),
      makePosition('b', 'e5', 0),
      makePosition('w', 'd4', 0),
      makePosition('b', 'Nf6', 1),
    ]

    const samples = labelPositions(positions, '1-0', 'w', ATTRS)
    // With multi-candidate augmentation: 2 bot positions x 3 candidates = 6
    // Plus 2 opponent positions x 3 candidates = 6 (opponent learning)
    // Total: 12 samples
    expect(samples.length).toBe(12)
  })

  it('should produce more samples than positions (multi-candidate + opponent)', () => {
    const positions = [
      makePosition('w', 'bestmove', 0),
      makePosition('b', 'something', 0),
      makePosition('w', 'secondbest', 1),
    ]

    const samples = labelPositions(positions, '1-0', 'w', ATTRS)
    // 2 bot positions + 1 opponent position, each with 3 candidates
    expect(samples.length).toBe(9)
    // More samples than positions (the whole point of augmentation)
    expect(samples.length).toBeGreaterThan(positions.length)
  })

  it('should give higher labels to style-congruent moves that are engine-top', () => {
    const positions = [
      makePosition('w', 'bestmove', 0),
      makePosition('b', 'something', 0),
    ]

    const samples = labelPositions(positions, '1-0', 'w', ATTRS)
    // First 3 samples are from bot's position (candidates 0, 1, 2)
    // The first candidate (engine top, index 0) should generally score higher
    // due to 20% engine rank weighting (engineRank = 1.0 for index 0)
    const topCandidateLabels = samples.filter((_, i) => i % 3 === 0).map(s => s.label)
    const bottomCandidateLabels = samples.filter((_, i) => i % 3 === 2).map(s => s.label)

    // On average, top candidates should have higher labels
    const avgTop = topCandidateLabels.reduce((a, b) => a + b, 0) / topCandidateLabels.length
    const avgBottom = bottomCandidateLabels.reduce((a, b) => a + b, 0) / bottomCandidateLabels.length
    expect(avgTop).toBeGreaterThan(avgBottom)
  })

  it('should include outcome influence for bot positions but not opponent', () => {
    // In a winning game, bot position labels include outcome bonus
    const winSamples = labelPositions(
      [makePosition('w', 'e4', 0), makePosition('b', 'e5', 0)],
      '1-0', 'w', ATTRS,
    )
    const lossSamples = labelPositions(
      [makePosition('w', 'e4', 0), makePosition('b', 'e5', 0)],
      '0-1', 'w', ATTRS,
    )

    // Bot's position labels should differ between win and loss
    const winBotLabel = winSamples[0].label
    const lossBotLabel = lossSamples[0].label
    // Win should produce higher labels (due to 20% outcome factor)
    // Run this 10 times and check average to smooth noise
    let winSum = 0, lossSum = 0
    for (let i = 0; i < 20; i++) {
      const ws = labelPositions([makePosition('w', 'e4', 0)], '1-0', 'w', ATTRS)
      const ls = labelPositions([makePosition('w', 'e4', 0)], '0-1', 'w', ATTRS)
      winSum += ws[0].label
      lossSum += ls[0].label
    }
    expect(winSum / 20).toBeGreaterThan(lossSum / 20)
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

  it('should skip positions with no candidates', () => {
    const pos: PositionRecord = {
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      movePlayed: 'e4',
      candidateMoves: [],
      color: 'w',
    }
    const samples = labelPositions([pos], '1-0', 'w', ATTRS)
    expect(samples).toHaveLength(0)
  })
})
