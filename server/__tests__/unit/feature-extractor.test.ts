import { describe, it, expect } from 'vitest'
import { extractFeatures, FEATURE_DIM } from '../../src/ml/feature-extractor.js'

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const MID_GAME_FEN = 'r1bqkb1r/pppppppp/2n2n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'

const DEFAULT_ATTRS = { aggression: 10, positional: 10, tactical: 10, endgame: 10, creativity: 10 }

describe('Feature Extractor', () => {
  it('should produce a 128-dimensional feature vector', () => {
    const features = extractFeatures(DEFAULT_FEN, 'e4', 0, 5, 30, 'w', DEFAULT_ATTRS, 1, 1)
    expect(features).toBeInstanceOf(Float32Array)
    expect(features.length).toBe(FEATURE_DIM)
  })

  it('should produce different features for different moves', () => {
    const f1 = extractFeatures(DEFAULT_FEN, 'e4', 0, 5, 30, 'w', DEFAULT_ATTRS, 1, 1)
    const f2 = extractFeatures(DEFAULT_FEN, 'd4', 1, 5, 25, 'w', DEFAULT_ATTRS, 1, 1)

    // Move features (indices 64-95) should differ
    let diff = 0
    for (let i = 64; i < 96; i++) {
      if (Math.abs(f1[i] - f2[i]) > 0.001) diff++
    }
    expect(diff).toBeGreaterThan(0)
  })

  it('should produce different features for different positions', () => {
    const f1 = extractFeatures(DEFAULT_FEN, 'e4', 0, 5, 30, 'w', DEFAULT_ATTRS, 1, 1)
    const f2 = extractFeatures(MID_GAME_FEN, 'Bb5', 0, 5, 50, 'w', DEFAULT_ATTRS, 1, 1)

    // Board features (indices 0-63) should differ
    let diff = 0
    for (let i = 0; i < 64; i++) {
      if (Math.abs(f1[i] - f2[i]) > 0.001) diff++
    }
    expect(diff).toBeGreaterThan(0)
  })

  it('should encode bot attributes into context features', () => {
    const aggroAttrs = { aggression: 20, positional: 5, tactical: 10, endgame: 10, creativity: 5 }
    const posAttrs = { aggression: 5, positional: 20, tactical: 10, endgame: 10, creativity: 5 }

    const f1 = extractFeatures(DEFAULT_FEN, 'e4', 0, 5, 30, 'w', aggroAttrs, 0, 0)
    const f2 = extractFeatures(DEFAULT_FEN, 'e4', 0, 5, 30, 'w', posAttrs, 1, 1)

    // Attribute features at indices 102-106 should differ
    expect(f1[102]).toBeCloseTo(1.0, 1)  // aggression=20 -> 1.0
    expect(f2[102]).toBeCloseTo(0.25, 1) // aggression=5 -> 0.25
    expect(f1[103]).toBeCloseTo(0.25, 1) // positional=5 -> 0.25
    expect(f2[103]).toBeCloseTo(1.0, 1)  // positional=20 -> 1.0

    // Alignment one-hot should differ
    expect(f1[107]).toBe(1) // aggressive alignment
    expect(f2[108]).toBe(1) // balanced alignment
  })

  it('should handle captures in feature encoding', () => {
    // Position where Nxe5 is a capture
    const captureFen = 'r1bqkbnr/pppppppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
    const features = extractFeatures(captureFen, 'Nxe5', 0, 5, 100, 'w', DEFAULT_ATTRS, 1, 1)

    // Capture flag should be set
    expect(features[75]).toBe(1) // is_capture
  })

  it('should produce valid ranges for all features', () => {
    const features = extractFeatures(DEFAULT_FEN, 'e4', 0, 5, 30, 'w', DEFAULT_ATTRS, 1, 1)
    for (let i = 0; i < FEATURE_DIM; i++) {
      expect(features[i]).toBeGreaterThanOrEqual(-1.1)
      expect(features[i]).toBeLessThanOrEqual(1.1)
    }
  })
})
