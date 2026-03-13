import type { PositionRecord, CandidateMove, GameResult, AlignmentAttack, AlignmentStyle } from '../types/index.js'
import { extractFeatures } from './feature-extractor.js'
import { PreferenceModel, type TrainingSample, type TrainingResult } from './preference-model.js'
import { getOrCreateModel, saveModel } from './model-store.js'
import type { DrizzleDb } from '../db/connection.js'

const ALIGNMENT_ATTACK_MAP: Record<string, number> = { aggressive: 0, balanced: 1, defensive: 2 }
const ALIGNMENT_STYLE_MAP: Record<string, number> = { chaotic: 0, positional: 1, sacrificial: 2 }

export interface BotAttributes {
  aggression: number
  positional: number
  tactical: number
  endgame: number
  creativity: number
  alignmentAttack: string
  alignmentStyle: string
}

/**
 * Compute a style-fit score for a candidate move based on bot attributes.
 * Uses the same logic as move-selector attribute scoring so the ML model
 * learns to amplify the bot's natural style, not fight it.
 *
 * Returns a value in [0, 1] representing how well the move matches the bot's style.
 */
function computeStyleFit(
  candidate: CandidateMove,
  candidateIndex: number,
  allCandidates: CandidateMove[],
  attributes: BotAttributes,
  isEndgame: boolean,
): number {
  const maxCp = Math.max(...allCandidates.map(c => Math.abs(c.centipawns)), 1)
  const topCp = allCandidates[0]?.centipawns || 0
  const baseScore = (candidate.centipawns + maxCp) / (2 * maxCp)

  // Detect move properties from the PV/move string
  // UCI move format: e2e4, e7e8q (promotion), etc.
  const move = candidate.move
  const isPromotion = move.length === 5

  // We can't detect captures/checks from UCI alone without board state,
  // but we can use eval differences as proxy signals
  const evalSwing = candidateIndex > 0
    ? Math.abs(candidate.centipawns - topCp) / Math.max(maxCp, 1)
    : 0
  const isLikelyForcing = Math.abs(candidate.centipawns) > Math.abs(topCp) + 50 || isPromotion
  const isCloseToTop = Math.abs(candidate.centipawns - topCp) < 30

  // Normalize attribute weights
  const total = attributes.aggression + attributes.positional + attributes.tactical + attributes.endgame + attributes.creativity
  const norm = total > 0 ? total : 1

  // Aggression: favors forcing moves, large eval advantages
  const aggressionFit = (
    0.4 * (isLikelyForcing ? 1 : 0) +
    0.3 * (isPromotion ? 1 : 0) +
    0.3 * Math.max(0, candidate.centipawns / Math.max(maxCp, 1))
  )

  // Positional: favors engine's top choices (trust the eval)
  const positionalFit = (
    0.7 * baseScore +
    0.3 * (isCloseToTop && !isLikelyForcing ? 1 : 0)
  )

  // Tactical: favors moves with strong eval that create complications
  const tacticalFit = (
    0.4 * (1 - evalSwing) + // close to top eval
    0.3 * (isLikelyForcing ? 1 : 0) +
    0.3 * (isPromotion ? 1 : 0)
  )

  // Endgame: favors engine accuracy in endgame, less so in opening
  const endgameFit = isEndgame
    ? 0.8 * baseScore
    : 0.3 * baseScore

  // Creativity: favors non-obvious moves that are still decent
  const creativityFit = candidateIndex > 0 && isCloseToTop
    ? 0.7 + 0.3 * (1 - evalSwing)
    : candidateIndex === 0 ? 0.3 : 0.2

  // Weighted combination based on bot's actual attribute distribution
  const styleFit = (
    attributes.aggression / norm * aggressionFit +
    attributes.positional / norm * positionalFit +
    attributes.tactical / norm * tacticalFit +
    attributes.endgame / norm * endgameFit +
    attributes.creativity / norm * creativityFit
  )

  return Math.max(0, Math.min(1, styleFit))
}

/**
 * Estimate total material from candidate eval for endgame detection.
 * Heuristic: if all evals are low magnitude, likely endgame.
 */
function estimateEndgame(candidates: CandidateMove[], moveNumber: number): boolean {
  return moveNumber > 30
}

/**
 * After a sparring game, extract training samples from ALL candidate moves
 * at each position (not just the played move). Labels are style-congruent:
 * 60% style fit + 20% engine rank + 20% outcome.
 *
 * This produces ~5x more samples than the old approach and teaches the model
 * "what moves match MY style" instead of just "what moves win."
 */
export function labelPositions(
  positions: PositionRecord[],
  result: GameResult,
  botColor: 'w' | 'b',
  botAttributes: BotAttributes,
): TrainingSample[] {
  const samples: TrainingSample[] = []
  const botWon = (result === '1-0' && botColor === 'w') || (result === '0-1' && botColor === 'b')
  const botLost = (result === '1-0' && botColor === 'b') || (result === '0-1' && botColor === 'w')

  const alignAttack = ALIGNMENT_ATTACK_MAP[botAttributes.alignmentAttack] ?? 1
  const alignStyle = ALIGNMENT_STYLE_MAP[botAttributes.alignmentStyle] ?? 1

  // Outcome factor: small modifier based on game result
  const outcomeFactor = botWon ? 0.85 : botLost ? 0.25 : 0.55

  let moveNumber = 0
  for (const pos of positions) {
    moveNumber++

    // Process both bot positions AND opponent positions (Phase 5a: opponent learning)
    // For opponent positions, we generate synthetic "what would MY bot prefer" labels
    const isBotPosition = pos.color === botColor
    if (pos.candidateMoves.length === 0) continue

    const isEndgame = estimateEndgame(pos.candidateMoves, moveNumber)

    // Label ALL candidates for this position (Phase 2b: multi-candidate augmentation)
    for (let i = 0; i < pos.candidateMoves.length; i++) {
      const candidate = pos.candidateMoves[i]

      // Style fit: how well does this move match the bot's attributes?
      const styleFit = computeStyleFit(candidate, i, pos.candidateMoves, botAttributes, isEndgame)

      // Engine rank score: top move = 1.0, worst = 0.0
      const engineRank = pos.candidateMoves.length > 1
        ? 1 - i / (pos.candidateMoves.length - 1)
        : 1.0

      // Composite label: 60% style + 20% engine + 20% outcome
      // For opponent positions, reduce outcome influence (we don't know how our bot would do)
      let label: number
      if (isBotPosition) {
        label = 0.6 * styleFit + 0.2 * engineRank + 0.2 * outcomeFactor
      } else {
        // Opponent positions: pure style + engine, no outcome bias
        label = 0.7 * styleFit + 0.3 * engineRank
      }

      // Regularization noise
      label = Math.max(0, Math.min(1, label + (Math.random() - 0.5) * 0.08))

      // Determine the SAN for this candidate — for the played move we have it,
      // for other candidates we use UCI (feature extractor handles both)
      const moveSan = (isBotPosition && i === getCandidateIndex(pos))
        ? pos.movePlayed
        : candidate.move // UCI — extractFeatures handles this via try/catch

      const features = extractFeatures(
        pos.fen,
        moveSan,
        i,
        pos.candidateMoves.length,
        candidate.centipawns,
        botColor,
        botAttributes,
        alignAttack,
        alignStyle,
      )

      samples.push({ features, label })
    }
  }

  return samples
}

/**
 * Find where the played move ranks among the Stockfish candidates.
 * Returns 0 if it's the top move, 1 for second-best, etc.
 * Returns -1 if not found.
 */
function getCandidateIndex(pos: PositionRecord): number {
  if (pos.candidateMoves.length === 0) return -1

  const uci = pos.movePlayedUci
  if (uci) {
    for (let i = 0; i < pos.candidateMoves.length; i++) {
      if (pos.candidateMoves[i].move === uci) return i
    }
  }
  return -1
}

/**
 * Serialize training samples for replay buffer storage.
 */
export function serializeReplayBuffer(samples: TrainingSample[]): Buffer {
  const data = samples.map(s => ({
    f: Array.from(s.features),
    l: s.label,
  }))
  return Buffer.from(JSON.stringify(data))
}

/**
 * Deserialize training samples from replay buffer.
 */
export function deserializeReplayBuffer(blob: Buffer): TrainingSample[] {
  const data = JSON.parse(blob.toString()) as Array<{ f: number[]; l: number }>
  return data.map(d => ({
    features: new Float32Array(d.f),
    label: d.l,
  }))
}

const MAX_REPLAY_BUFFER_SIZE = 2000

/**
 * Full training pipeline: extract samples from game, merge with replay buffer, train, save.
 */
export async function trainBotFromGame(
  db: DrizzleDb,
  botId: number,
  positions: PositionRecord[],
  result: GameResult,
  botColor: 'w' | 'b',
  botAttributes: BotAttributes,
  existingReplayBuffer?: Buffer | null,
): Promise<TrainingResult & { updatedReplayBuffer: Buffer }> {
  const newSamples = labelPositions(positions, result, botColor, botAttributes)

  // Merge with replay buffer
  let replaySamples: TrainingSample[] = []
  if (existingReplayBuffer && existingReplayBuffer.length > 0) {
    try {
      replaySamples = deserializeReplayBuffer(existingReplayBuffer)
    } catch {
      // Corrupted buffer, start fresh
    }
  }

  // Training set: all new samples + 50% randomly sampled from replay
  const replaySubset = sampleArray(replaySamples, Math.min(replaySamples.length, Math.floor(newSamples.length * 0.5)))
  const trainingSamples = [...newSamples, ...replaySubset]

  // Update replay buffer: append new, trim to max size
  const updatedReplay = [...replaySamples, ...newSamples]
  if (updatedReplay.length > MAX_REPLAY_BUFFER_SIZE) {
    updatedReplay.splice(0, updatedReplay.length - MAX_REPLAY_BUFFER_SIZE)
  }
  const updatedReplayBuffer = serializeReplayBuffer(updatedReplay)

  if (trainingSamples.length === 0) {
    return { epochLosses: [], samplesUsed: 0, updatedReplayBuffer }
  }

  const model = await getOrCreateModel(db, botId, botAttributes.alignmentAttack, botAttributes.alignmentStyle)
  const trainingResult = await model.train(trainingSamples)

  await saveModel(db, botId, model)

  return {
    ...trainingResult,
    updatedReplayBuffer,
  }
}

/** Randomly sample n items from an array without replacement. */
function sampleArray<T>(arr: T[], n: number): T[] {
  if (n >= arr.length) return [...arr]
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, n)
}
