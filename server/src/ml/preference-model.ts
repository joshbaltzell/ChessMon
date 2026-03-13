import * as tf from '@tensorflow/tfjs-node'
import { FEATURE_DIM } from './feature-extractor.js'

export interface TrainingSample {
  features: Float32Array
  label: number // 0.0 (bad move) to 1.0 (great move)
}

export interface TrainingResult {
  epochLosses: number[]
  samplesUsed: number
}

export const MODEL_VERSION = 2

export class PreferenceModel {
  private model: tf.Sequential

  constructor() {
    this.model = tf.sequential()
    this.model.add(tf.layers.dense({
      units: 32,
      activation: 'relu',
      inputShape: [FEATURE_DIM],
      kernelInitializer: 'glorotNormal',
    }))
    this.model.add(tf.layers.dropout({ rate: 0.15 }))
    this.model.add(tf.layers.dense({
      units: 16,
      activation: 'relu',
      kernelInitializer: 'glorotNormal',
    }))
    this.model.add(tf.layers.dropout({ rate: 0.1 }))
    this.model.add(tf.layers.dense({
      units: 1,
      activation: 'sigmoid',
    }))

    this.model.compile({
      optimizer: tf.train.adam(0.002),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy'],
    })
  }

  /**
   * Predict preference scores for a batch of candidate moves.
   * Returns array of scores in [0, 1] where higher = more preferred.
   */
  predict(featureBatch: Float32Array[]): number[] {
    return tf.tidy(() => {
      // Concatenate Float32Arrays directly into a single buffer — avoids Array.from() overhead
      const flat = new Float32Array(featureBatch.length * FEATURE_DIM)
      for (let i = 0; i < featureBatch.length; i++) {
        flat.set(featureBatch[i], i * FEATURE_DIM)
      }
      const input = tf.tensor2d(flat, [featureBatch.length, FEATURE_DIM])
      const output = this.model.predict(input) as tf.Tensor
      return Array.from(output.dataSync())
    })
  }

  /**
   * Train the model on labeled (position, move) pairs from a game.
   */
  async train(samples: TrainingSample[], epochs: number = 12): Promise<TrainingResult> {
    if (samples.length === 0) {
      return { epochLosses: [], samplesUsed: 0 }
    }

    // Concatenate into flat typed arrays — avoids per-sample Array.from() allocations
    const xFlat = new Float32Array(samples.length * FEATURE_DIM)
    const yFlat = new Float32Array(samples.length)
    for (let i = 0; i < samples.length; i++) {
      xFlat.set(samples[i].features, i * FEATURE_DIM)
      yFlat[i] = samples[i].label
    }
    const xs = tf.tensor2d(xFlat, [samples.length, FEATURE_DIM])
    const ys = tf.tensor2d(yFlat, [samples.length, 1])

    // Train with early stopping: halt if loss doesn't improve for 3 epochs
    const allLosses: number[] = []
    let bestLoss = Infinity
    let noImprovementCount = 0
    const PATIENCE = 3

    try {
      for (let epoch = 0; epoch < epochs; epoch++) {
        const history = await this.model.fit(xs, ys, {
          epochs: 1,
          batchSize: Math.min(32, samples.length),
          shuffle: true,
          verbose: 0,
        })
        const loss = (history.history.loss as number[])[0]
        allLosses.push(loss)

        if (loss < bestLoss - 0.001) {
          bestLoss = loss
          noImprovementCount = 0
        } else {
          noImprovementCount++
          if (noImprovementCount >= PATIENCE) break
        }
      }
    } finally {
      xs.dispose()
      ys.dispose()
    }

    return {
      epochLosses: allLosses,
      samplesUsed: samples.length,
    }
  }

  /**
   * Serialize model weights to a Buffer for database storage.
   */
  async serialize(): Promise<Buffer> {
    const weightData = await this.getWeightData()
    return Buffer.from(JSON.stringify(weightData))
  }

  /**
   * Load model weights from a Buffer.
   */
  async deserialize(blob: Buffer): Promise<void> {
    const weightData = JSON.parse(blob.toString()) as SerializedWeights
    await this.setWeightData(weightData)
  }

  private async getWeightData(): Promise<SerializedWeights> {
    const weights = this.model.getWeights()
    const serialized: SerializedWeights = {
      version: MODEL_VERSION,
      layers: [],
    }

    for (let i = 0; i < weights.length; i++) {
      const w = weights[i]
      serialized.layers.push({
        name: `weight_${i}`,
        shape: w.shape,
        data: Array.from(w.dataSync()),
      })
    }

    return serialized
  }

  private async setWeightData(data: SerializedWeights): Promise<void> {
    // Version migration: v1 weights are incompatible (different architecture)
    // Discard and keep fresh random weights — archetype loading will handle initialization
    if (data.version !== MODEL_VERSION) {
      return
    }

    const tensors = data.layers.map(layer =>
      tf.tensor(layer.data, layer.shape)
    )
    this.model.setWeights(tensors)
    tensors.forEach(t => t.dispose())
  }

  dispose(): void {
    this.model.dispose()
  }
}

interface SerializedWeights {
  version: number
  layers: Array<{
    name: string
    shape: number[]
    data: number[]
  }>
}
