import { describe, it, expect, afterEach } from 'vitest'
import { PreferenceModel } from '../../src/ml/preference-model.js'
import { FEATURE_DIM } from '../../src/ml/feature-extractor.js'

function randomFeatures(): Float32Array {
  const f = new Float32Array(FEATURE_DIM)
  for (let i = 0; i < FEATURE_DIM; i++) {
    f[i] = Math.random()
  }
  return f
}

describe('PreferenceModel', () => {
  let model: PreferenceModel

  afterEach(() => {
    model?.dispose()
  })

  it('should create a model and produce predictions in [0, 1]', () => {
    model = new PreferenceModel()
    const batch = [randomFeatures(), randomFeatures(), randomFeatures()]
    const predictions = model.predict(batch)

    expect(predictions).toHaveLength(3)
    for (const p of predictions) {
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(1)
    }
  })

  it('should train and reduce loss over epochs', async () => {
    model = new PreferenceModel()

    // Create consistent training data: features with high values = label 1, low values = label 0
    const samples = []
    for (let i = 0; i < 50; i++) {
      const features = new Float32Array(FEATURE_DIM)
      const isPositive = Math.random() > 0.5
      for (let j = 0; j < FEATURE_DIM; j++) {
        features[j] = isPositive ? 0.5 + Math.random() * 0.5 : Math.random() * 0.5
      }
      samples.push({ features, label: isPositive ? 1.0 : 0.0 })
    }

    const result = await model.train(samples, 15)

    expect(result.samplesUsed).toBe(50)
    // May stop early due to early stopping, so check at least some epochs ran
    expect(result.epochLosses.length).toBeGreaterThanOrEqual(3)
    expect(result.epochLosses.length).toBeLessThanOrEqual(15)

    // Loss should decrease from first to last epoch
    const firstLoss = result.epochLosses[0]
    const lastLoss = result.epochLosses[result.epochLosses.length - 1]
    console.log(`Training loss: ${firstLoss.toFixed(4)} -> ${lastLoss.toFixed(4)}`)
    expect(lastLoss).toBeLessThanOrEqual(firstLoss)
  })

  it('should learn to distinguish positive from negative samples', async () => {
    model = new PreferenceModel()

    // Create clearly separable data
    const samples = []
    for (let i = 0; i < 100; i++) {
      const features = new Float32Array(FEATURE_DIM)
      const isPositive = i < 50
      // Use first feature as the discriminative signal
      features[0] = isPositive ? 0.9 : 0.1
      features[1] = isPositive ? 0.8 : 0.2
      // Fill rest with noise
      for (let j = 2; j < FEATURE_DIM; j++) {
        features[j] = Math.random() * 0.3
      }
      samples.push({ features, label: isPositive ? 1.0 : 0.0 })
    }

    await model.train(samples, 30)

    // Test: positive sample should score higher than negative
    const positiveFeatures = new Float32Array(FEATURE_DIM)
    positiveFeatures[0] = 0.9
    positiveFeatures[1] = 0.8
    for (let j = 2; j < FEATURE_DIM; j++) positiveFeatures[j] = 0.15

    const negativeFeatures = new Float32Array(FEATURE_DIM)
    negativeFeatures[0] = 0.1
    negativeFeatures[1] = 0.2
    for (let j = 2; j < FEATURE_DIM; j++) negativeFeatures[j] = 0.15

    const [posScore, negScore] = model.predict([positiveFeatures, negativeFeatures])
    console.log(`Positive score: ${posScore.toFixed(4)}, Negative score: ${negScore.toFixed(4)}`)
    expect(posScore).toBeGreaterThan(negScore)
  })

  it('should serialize and deserialize preserving predictions', async () => {
    model = new PreferenceModel()

    // Train it a bit so weights are non-random
    const samples = []
    for (let i = 0; i < 30; i++) {
      const features = new Float32Array(FEATURE_DIM)
      for (let j = 0; j < FEATURE_DIM; j++) features[j] = Math.random()
      samples.push({ features, label: Math.random() > 0.5 ? 1.0 : 0.0 })
    }
    await model.train(samples, 5)

    // Get predictions before serialization
    const testBatch = [randomFeatures(), randomFeatures()]
    const predBefore = model.predict(testBatch)

    // Serialize
    const blob = await model.serialize()
    expect(blob).toBeInstanceOf(Buffer)
    expect(blob.length).toBeGreaterThan(0)
    console.log(`Serialized model size: ${(blob.length / 1024).toFixed(1)} KB`)

    // Deserialize into a new model
    const model2 = new PreferenceModel()
    await model2.deserialize(blob)

    // Predictions should be identical (or very close due to floating point)
    const predAfter = model2.predict(testBatch)
    for (let i = 0; i < predBefore.length; i++) {
      expect(Math.abs(predBefore[i] - predAfter[i])).toBeLessThan(0.001)
    }

    model2.dispose()
  })

  it('should handle empty training data gracefully', async () => {
    model = new PreferenceModel()
    const result = await model.train([], 5)
    expect(result.samplesUsed).toBe(0)
    expect(result.epochLosses).toHaveLength(0)
  })

  it('should handle single sample training', async () => {
    model = new PreferenceModel()
    const features = randomFeatures()
    const result = await model.train([{ features, label: 1.0 }], 5)
    expect(result.samplesUsed).toBe(1)
    // May stop early due to early stopping on single sample
    expect(result.epochLosses.length).toBeGreaterThanOrEqual(1)
    expect(result.epochLosses.length).toBeLessThanOrEqual(5)
  })
})
