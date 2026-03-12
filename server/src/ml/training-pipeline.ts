import type { PositionRecord, CandidateMove, GameResult, AlignmentAttack, AlignmentStyle } from '../types/index.js'
import { extractFeatures } from './feature-extractor.js'
import { PreferenceModel, type TrainingSample, type TrainingResult } from './preference-model.js'
import { getOrCreateModel, saveModel } from './model-store.js'
import type { DrizzleDb } from '../db/connection.js'

const ALIGNMENT_ATTACK_MAP: Record<string, number> = { aggressive: 0, balanced: 1, defensive: 2 }
const ALIGNMENT_STYLE_MAP: Record<string, number> = { chaotic: 0, positional: 1, sacrificial: 2 }

interface BotAttributes {
  aggression: number
  positional: number
  tactical: number
  endgame: number
  creativity: number
  alignmentAttack: string
  alignmentStyle: string
}

/**
 * After a sparring game, extract training samples and update the bot's ML model.
 *
 * Labeling strategy:
 * - Winning game: moves matching top-2 engine candidates get label 0.9-1.0
 * - Drawing game: top moves get 0.6-0.7, others get 0.4
 * - Losing game: moves NOT in top-3 get label 0.0-0.2, top moves still get 0.5
 *
 * This teaches the bot to prefer moves that led to good outcomes
 * while still respecting engine analysis.
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
  const drew = result === '1/2-1/2'

  const alignAttack = ALIGNMENT_ATTACK_MAP[botAttributes.alignmentAttack] ?? 1
  const alignStyle = ALIGNMENT_STYLE_MAP[botAttributes.alignmentStyle] ?? 1

  for (const pos of positions) {
    if (pos.color !== botColor) continue

    const candidateRank = getCandidateRank(pos)

    let label: number
    if (botWon) {
      label = candidateRank <= 1 ? 0.95 : candidateRank <= 2 ? 0.75 : 0.4
    } else if (drew) {
      label = candidateRank <= 1 ? 0.65 : candidateRank <= 2 ? 0.5 : 0.35
    } else {
      // Bot lost
      label = candidateRank <= 1 ? 0.5 : candidateRank <= 2 ? 0.3 : 0.1
    }

    // Add some noise for regularization
    label = Math.max(0, Math.min(1, label + (Math.random() - 0.5) * 0.1))

    const features = extractFeatures(
      pos.fen,
      pos.movePlayed,
      candidateRank,
      Math.max(pos.candidateMoves.length, 1),
      pos.candidateMoves[0]?.centipawns || 0,
      botColor,
      botAttributes,
      alignAttack,
      alignStyle,
    )

    samples.push({ features, label })
  }

  return samples
}

/**
 * Find where the played move ranks among the Stockfish candidates.
 * Returns 0 if it's the top move, 1 for second-best, etc.
 * Returns 99 if not found in candidates.
 */
function getCandidateRank(pos: PositionRecord): number {
  if (pos.candidateMoves.length === 0) return 2 // No data, assume middling

  // Compare using UCI if available (candidateMoves[i].move is UCI format)
  const uci = pos.movePlayedUci
  if (uci) {
    for (let i = 0; i < pos.candidateMoves.length; i++) {
      if (pos.candidateMoves[i].move === uci) {
        return i
      }
    }
  }

  // Fallback: no UCI available (e.g. opening book moves, blunders)
  // Can't reliably compare SAN to UCI, so assume middling rank
  return 2
}

/**
 * Full training pipeline: extract samples from game, train model, save.
 */
export async function trainBotFromGame(
  db: DrizzleDb,
  botId: number,
  positions: PositionRecord[],
  result: GameResult,
  botColor: 'w' | 'b',
  botAttributes: BotAttributes,
): Promise<TrainingResult> {
  const samples = labelPositions(positions, result, botColor, botAttributes)

  if (samples.length === 0) {
    return { epochLosses: [], samplesUsed: 0 }
  }

  const model = await getOrCreateModel(db, botId)
  const trainingResult = await model.train(samples, 8)

  await saveModel(db, botId, model)

  return trainingResult
}
