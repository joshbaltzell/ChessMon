import { describe, it, expect, afterEach } from 'vitest'
import { PreferenceModel, type TrainingSample } from '../../src/ml/preference-model.js'
import { FEATURE_DIM } from '../../src/ml/feature-extractor.js'

describe('ML Learning Verification', () => {
  let model: PreferenceModel

  afterEach(() => {
    model?.dispose()
  })

  it('should shift predictions toward labeled data after training', async () => {
    model = new PreferenceModel()

    // Create a "good move" feature pattern: high centipawn eval, is capture
    const goodMoveFeatures = new Float32Array(FEATURE_DIM)
    goodMoveFeatures[84] = 0.8  // high centipawn eval
    goodMoveFeatures[75] = 1.0  // is capture
    goodMoveFeatures[85] = 0.0  // best candidate
    goodMoveFeatures[97] = 0.7  // high own material

    // Create a "bad move" feature pattern: low eval, not a capture
    const badMoveFeatures = new Float32Array(FEATURE_DIM)
    badMoveFeatures[84] = 0.2   // low centipawn eval
    badMoveFeatures[75] = 0.0   // not capture
    badMoveFeatures[85] = 0.8   // low-ranked candidate
    badMoveFeatures[97] = 0.3   // low own material

    // Get pre-training predictions
    const [preGood, preBad] = model.predict([goodMoveFeatures, badMoveFeatures])
    console.log(`Pre-training: good=${preGood.toFixed(4)}, bad=${preBad.toFixed(4)}`)

    // Train on 200 samples to establish clear pattern
    const samples: TrainingSample[] = []
    for (let i = 0; i < 200; i++) {
      const isGood = Math.random() > 0.5
      const features = new Float32Array(FEATURE_DIM)
      // Copy base pattern with noise
      const source = isGood ? goodMoveFeatures : badMoveFeatures
      for (let j = 0; j < FEATURE_DIM; j++) {
        features[j] = source[j] + (Math.random() - 0.5) * 0.2
      }
      samples.push({ features, label: isGood ? 0.9 : 0.1 })
    }

    const result = await model.train(samples, 20)
    console.log(`Training: ${result.epochLosses[0].toFixed(4)} -> ${result.epochLosses[result.epochLosses.length - 1].toFixed(4)}`)

    // Post-training: good moves should score higher than bad moves
    const [postGood, postBad] = model.predict([goodMoveFeatures, badMoveFeatures])
    console.log(`Post-training: good=${postGood.toFixed(4)}, bad=${postBad.toFixed(4)}`)

    expect(postGood).toBeGreaterThan(postBad)
    // The gap should be meaningful (at least 0.1 difference)
    expect(postGood - postBad).toBeGreaterThan(0.1)
  })

  it('should learn to prefer aggressive moves when trained on aggressive winning data', async () => {
    model = new PreferenceModel()

    // Simulate an aggressive bot's training data:
    // Captures and checks that led to wins get high labels
    const samples: TrainingSample[] = []
    for (let i = 0; i < 150; i++) {
      const features = new Float32Array(FEATURE_DIM)
      const isAggressive = Math.random() > 0.5

      features[75] = isAggressive ? 1.0 : 0.0  // is_capture
      features[76] = isAggressive ? (Math.random() > 0.5 ? 1 : 0) : 0  // is_check
      features[84] = 0.5 + (Math.random() - 0.5) * 0.3  // eval (mixed)
      features[102] = 1.0  // high aggression attribute

      // Noise in other features
      for (let j = 0; j < 64; j++) features[j] = (Math.random() - 0.5) * 0.3
      for (let j = 96; j < 128; j++) {
        if (features[j] === 0) features[j] = Math.random() * 0.3
      }

      samples.push({
        features,
        label: isAggressive ? 0.85 : 0.3,  // Aggressive moves labeled as good
      })
    }

    await model.train(samples, 20)

    // Test: capture move should now score higher than quiet move
    const captureMove = new Float32Array(FEATURE_DIM)
    captureMove[75] = 1.0   // capture
    captureMove[84] = 0.5   // decent eval
    captureMove[102] = 1.0  // aggression stat

    const quietMove = new Float32Array(FEATURE_DIM)
    quietMove[75] = 0.0     // not capture
    quietMove[84] = 0.5     // same eval
    quietMove[102] = 1.0    // same aggression stat

    const [captureScore, quietScore] = model.predict([captureMove, quietMove])
    console.log(`Aggressive training: capture=${captureScore.toFixed(4)}, quiet=${quietScore.toFixed(4)}`)
    expect(captureScore).toBeGreaterThan(quietScore)
  })

  it('should progressively improve with more training data (simulating multiple spars)', async () => {
    model = new PreferenceModel()

    // Track how well the model distinguishes good from bad across rounds
    const gaps: number[] = []

    // Good pattern: high eval, good candidate rank
    const goodTest = new Float32Array(FEATURE_DIM)
    goodTest[84] = 0.85
    goodTest[85] = 0.0
    goodTest[75] = 1.0

    // Bad pattern: low eval, bad rank
    const badTest = new Float32Array(FEATURE_DIM)
    badTest[84] = 0.15
    badTest[85] = 0.9
    badTest[75] = 0.0

    // Simulate 5 training rounds (like 5 spars)
    for (let round = 0; round < 5; round++) {
      const samples: TrainingSample[] = []
      for (let i = 0; i < 40; i++) {
        const features = new Float32Array(FEATURE_DIM)
        const isGood = Math.random() > 0.5
        const source = isGood ? goodTest : badTest
        for (let j = 0; j < FEATURE_DIM; j++) {
          features[j] = source[j] + (Math.random() - 0.5) * 0.15
        }
        samples.push({ features, label: isGood ? 0.9 : 0.1 })
      }

      await model.train(samples, 8)

      const [g, b] = model.predict([goodTest, badTest])
      gaps.push(g - b)
      console.log(`Round ${round + 1}: gap = ${(g - b).toFixed(4)} (good=${g.toFixed(4)}, bad=${b.toFixed(4)})`)
    }

    // The discrimination gap should generally increase with more training
    // (allow for some variance, but final should be better than initial)
    expect(gaps[gaps.length - 1]).toBeGreaterThan(gaps[0])
    expect(gaps[gaps.length - 1]).toBeGreaterThan(0.15)
  })

  it('model should survive serialization and continue learning', async () => {
    model = new PreferenceModel()

    // Use multiple discriminative features for clearer signal
    function makeSamples(count: number): TrainingSample[] {
      const out: TrainingSample[] = []
      for (let i = 0; i < count; i++) {
        const features = new Float32Array(FEATURE_DIM)
        const isGood = i < count / 2
        // Use several features as discriminative signals
        features[0] = isGood ? 0.9 : 0.1
        features[1] = isGood ? 0.8 : 0.2
        features[84] = isGood ? 0.85 : 0.15 // centipawn eval feature
        features[75] = isGood ? 1.0 : 0.0    // capture flag
        for (let j = 2; j < FEATURE_DIM; j++) {
          if (features[j] === 0) features[j] = Math.random() * 0.15
        }
        out.push({ features, label: isGood ? 1.0 : 0.0 })
      }
      return out
    }

    // Train round 1
    await model.train(makeSamples(100), 15)

    // Check discrimination
    const goodF = new Float32Array(FEATURE_DIM)
    goodF[0] = 0.9; goodF[1] = 0.8; goodF[84] = 0.85; goodF[75] = 1.0
    const badF = new Float32Array(FEATURE_DIM)
    badF[0] = 0.1; badF[1] = 0.2; badF[84] = 0.15; badF[75] = 0.0

    const [g1, b1] = model.predict([goodF, badF])
    const gap1 = g1 - b1

    // Serialize and load into new model
    const blob = await model.serialize()
    const model2 = new PreferenceModel()
    await model2.deserialize(blob)

    // Verify deserialized model maintains predictions
    const [g1b, b1b] = model2.predict([goodF, badF])
    expect(Math.abs(g1 - g1b)).toBeLessThan(0.01)
    expect(Math.abs(b1 - b1b)).toBeLessThan(0.01)

    // Continue training round 2
    await model2.train(makeSamples(100), 15)

    const [g2, b2] = model2.predict([goodF, badF])
    const gap2 = g2 - b2
    console.log(`Before serialize: gap=${gap1.toFixed(4)}, After more training: gap=${gap2.toFixed(4)}`)

    // After additional training, discrimination should hold
    expect(gap2).toBeGreaterThan(0)
    // And the model should still correctly order good > bad
    expect(g2).toBeGreaterThan(b2)
    model2.dispose()
  })
})
