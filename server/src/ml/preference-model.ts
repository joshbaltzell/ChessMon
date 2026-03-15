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

  /**
   * Probe the model with synthetic feature vectors to reveal learned preferences.
   * Creates controlled test inputs that isolate different move characteristics,
   * then compares the model's scores to show what it has learned to prefer.
   */
  probePreferences(
    attributes: { aggression: number; positional: number; tactical: number; endgame: number; creativity: number },
    alignmentAttack: number,
    alignmentStyle: number,
  ): MovePreferenceProfile {
    return tf.tidy(() => {
      // Build a base feature vector representing a typical midgame position
      const makeBase = () => {
        const f = new Float32Array(FEATURE_DIM)
        // Typical midgame board — some pieces present
        // Simplified: just set material features
        f[96] = 0.4   // move 16 of 40 — midgame
        f[97] = 0.6   // own material ~23/39
        f[98] = 0.6   // opp material ~23/39
        f[99] = 0.5   // material balance = even
        f[100] = 0.66  // midgame phase
        f[101] = 0     // not endgame
        // Attributes
        f[102] = attributes.aggression / 20
        f[103] = attributes.positional / 20
        f[104] = attributes.tactical / 20
        f[105] = attributes.endgame / 20
        f[106] = attributes.creativity / 20
        // Alignment one-hots
        f[107 + alignmentAttack] = 1
        f[110 + alignmentStyle] = 1
        f[113] = 1     // bot's turn
        f[114] = 1     // can castle kingside
        f[115] = 1     // can castle queenside
        f[118] = 0.5   // moderate mobility
        f[120] = 0.5   // own pieces
        f[121] = 0.5   // opp pieces
        f[122] = 0.5   // pawns
        f[123] = 0.5   // pawn file coverage
        f[124] = 0.5   // king safety
        f[125] = 1     // winning eval
        // Move basics — knight from center
        f[64] = 3/7; f[65] = 3/7  // from d4
        f[66] = 5/7; f[67] = 4/7  // to f5
        f[68] = 3/14  // distance
        f[70] = 1     // knight
        f[84] = 0.6   // positive eval (sigmoid of +40cp)
        f[85] = 0     // top candidate
        f[89] = 3/9   // knight value
        return f
      }

      // --- Probe 1: Captures vs Quiet Moves ---
      const capture = makeBase()
      capture[75] = 1   // is capture
      capture[78] = 1   // captured pawn
      capture[88] = 1/9 // captured piece value

      const quiet = makeBase()
      capture[86] = 1   // center move bonus for capture
      quiet[86] = 1     // center move for quiet too

      // --- Probe 2: Checks vs Non-checks ---
      const check = makeBase()
      check[76] = 1     // gives check
      check[91] = 1     // check flag duplicate

      const noCheck = makeBase()

      // --- Probe 3: Center vs Edge ---
      const center = makeBase()
      center[66] = 4/7; center[67] = 4/7 // to e5 (center)
      center[86] = 1

      const edge = makeBase()
      edge[66] = 0/7; edge[67] = 0/7 // to a1 (corner)
      edge[86] = 0

      // --- Probe 4: Top engine move vs 3rd best ---
      const topMove = makeBase()
      topMove[85] = 0   // index 0 = top candidate
      topMove[84] = 0.7 // good eval

      const thirdBest = makeBase()
      thirdBest[85] = 0.5 // index 2 of 5
      thirdBest[84] = 0.45 // lower eval

      // --- Probe 5: Opening vs Midgame vs Endgame ---
      const opening = makeBase()
      opening[96] = 0.1  // move 4
      opening[100] = 1   // full material
      opening[101] = 0

      const midgame = makeBase()
      // already midgame defaults

      const endgame = makeBase()
      endgame[96] = 0.8  // move 32
      endgame[97] = 0.2  // low material
      endgame[98] = 0.2
      endgame[100] = 0   // endgame phase
      endgame[101] = 1   // is endgame
      endgame[120] = 0.2
      endgame[121] = 0.2

      // --- Probe 6: Castling move ---
      const castling = makeBase()
      castling[87] = 1 // castling flag
      castling[69] = 0; castling[70] = 0; castling[74] = 1 // king piece

      // --- Probe 7: Pawn advance (promotion path) ---
      const pawnPush = makeBase()
      pawnPush[69] = 1 // pawn piece
      pawnPush[70] = 0 // not knight
      pawnPush[90] = 0.85 // close to promotion
      pawnPush[89] = 1/9

      // --- Probe 8: Sacrifice (high-value piece trades) ---
      const sacrifice = makeBase()
      sacrifice[75] = 1  // capture
      sacrifice[82] = 1  // captured queen
      sacrifice[88] = 9/9 // queen value captured
      sacrifice[89] = 3/9 // with a knight (piece for queen)

      // Build batch and predict
      const probes = [
        capture, quiet, check, noCheck, center, edge,
        topMove, thirdBest, opening, midgame, endgame,
        castling, pawnPush, sacrifice,
      ]

      const scores = this.predict(probes)

      return {
        // Move type preferences (higher = more preferred)
        captures: scores[0],
        quietMoves: scores[1],
        checks: scores[2],
        nonChecks: scores[3],
        centerMoves: scores[4],
        edgeMoves: scores[5],
        topEngineMoves: scores[6],
        nonTopMoves: scores[7],
        // Phase preferences
        openingPlay: scores[8],
        midgamePlay: scores[9],
        endgamePlay: scores[10],
        // Special move types
        castling: scores[11],
        pawnAdvances: scores[12],
        sacrifices: scores[13],
        // Derived insights
        aggressiveness: (scores[0] + scores[2] + scores[13]) / 3 - (scores[1] + scores[3]) / 2,
        engineTrust: scores[6] - scores[7],
        positionalPlay: (scores[4] + scores[11]) / 2 - scores[5],
        bestPhase: scores[8] >= scores[9] && scores[8] >= scores[10] ? 'opening'
          : scores[10] >= scores[9] ? 'endgame' : 'midgame',
      }
    })
  }

  dispose(): void {
    this.model.dispose()
  }
}

export interface MovePreferenceProfile {
  captures: number
  quietMoves: number
  checks: number
  nonChecks: number
  centerMoves: number
  edgeMoves: number
  topEngineMoves: number
  nonTopMoves: number
  openingPlay: number
  midgamePlay: number
  endgamePlay: number
  castling: number
  pawnAdvances: number
  sacrifices: number
  aggressiveness: number
  engineTrust: number
  positionalPlay: number
  bestPhase: string
}

interface SerializedWeights {
  version: number
  layers: Array<{
    name: string
    shape: number[]
    data: number[]
  }>
}
