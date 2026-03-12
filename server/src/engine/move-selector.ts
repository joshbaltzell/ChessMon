import type { PlayParameters, CandidateMove } from '../types/index.js'
import type { StockfishPool } from './stockfish-pool.js'
import type { PreferenceModel } from '../ml/preference-model.js'
import { extractFeatures } from '../ml/feature-extractor.js'
import { Chess } from 'chess.js'

export interface MoveSelectorContext {
  mlModel?: PreferenceModel | null
  botColor?: 'w' | 'b'
  botAttributes?: { aggression: number; positional: number; tactical: number; endgame: number; creativity: number }
  alignmentAttack?: number
  alignmentStyle?: number
}

export async function selectMove(
  chess: Chess,
  params: PlayParameters,
  pool: StockfishPool,
  context?: MoveSelectorContext,
): Promise<{ san: string; candidates: CandidateMove[] }> {
  const legalMoves = chess.moves()
  if (legalMoves.length === 0) {
    throw new Error('No legal moves available')
  }

  if (legalMoves.length === 1) {
    return { san: legalMoves[0], candidates: [] }
  }

  // Step 1: Opening book check
  if (params.openingBook) {
    const fenPrefix = chess.fen().split(' ').slice(0, 4).join(' ')
    const bookMove = params.openingBook.positions[fenPrefix]
    if (bookMove && Math.random() < params.openingBook.proficiency / 100) {
      if (legalMoves.includes(bookMove)) {
        return { san: bookMove, candidates: [] }
      }
    }
  }

  // Step 2: Blunder check
  if (params.blunderRate > 0 && Math.random() < params.blunderRate) {
    return { san: legalMoves[Math.floor(Math.random() * legalMoves.length)], candidates: [] }
  }

  // Step 3: Get Stockfish candidates
  const fen = chess.fen()
  const candidates = await pool.analyze(fen, params.searchDepth, params.multiPv)

  if (candidates.length === 0) {
    return { san: legalMoves[Math.floor(Math.random() * legalMoves.length)], candidates: [] }
  }

  // Convert UCI moves to SAN
  const candidatesWithSan = candidates.map(c => {
    try {
      const tempChess = new Chess(fen)
      const move = tempChess.move({ from: c.move.slice(0, 2), to: c.move.slice(2, 4), promotion: c.move[4] })
      return { ...c, san: move.san, moveObj: move }
    } catch {
      return null
    }
  }).filter((c): c is NonNullable<typeof c> => c !== null)

  if (candidatesWithSan.length === 0) {
    return { san: legalMoves[Math.floor(Math.random() * legalMoves.length)], candidates }
  }

  // Step 4: Attribute-based scoring
  const maxCp = Math.max(...candidatesWithSan.map(c => Math.abs(c.centipawns)), 1)

  const scores = candidatesWithSan.map((c, idx) => {
    const baseScore = (c.centipawns + maxCp) / (2 * maxCp) // 0-1

    const isCapture = c.moveObj.captured !== undefined
    const isCheck = c.san.includes('+') || c.san.includes('#')
    const isPromotion = c.moveObj.promotion !== undefined
    const isCastling = c.san === 'O-O' || c.san === 'O-O-O'

    // --- Aggression: rewards violent moves ---
    const aggressionBonus = params.aggressionWeight * (
      0.25 * (isCapture ? 1 : 0) +
      0.35 * (isCheck ? 1 : 0) +
      0.15 * (isPromotion ? 1 : 0) +
      0.10 * (c.moveObj.captured === 'q' ? 1 : c.moveObj.captured === 'r' ? 0.5 : 0) +
      0.15 * (isCapture && c.centipawns > (candidatesWithSan[0]?.centipawns || 0) - 50 ? 1 : 0)
    )

    // --- Positional: trusts engine evaluation, rewards quiet strong moves ---
    const positionalBonus = params.positionalWeight * (
      0.6 * baseScore +
      0.2 * (isCastling ? 1 : 0) +
      0.2 * (!isCapture && !isCheck && baseScore > 0.6 ? 1 : 0)
    )

    // --- Tactical: rewards combinations and eval swings ---
    const evalSwing = idx > 0
      ? Math.abs(c.centipawns - (candidatesWithSan[0]?.centipawns || 0)) / maxCp
      : 0
    const tacticalBonus = params.tacticalWeight * (
      0.3 * (isCapture ? 1 : 0) +
      0.3 * (isCheck ? 1 : 0) +
      0.2 * (1 - evalSwing) +
      0.2 * (isPromotion ? 1 : 0)
    )

    // --- Endgame: plays more accurately when fewer pieces ---
    const totalMaterial = estimateMaterial(chess)
    const isEndgame = totalMaterial <= 24
    const endgameBonus = isEndgame
      ? params.endgameWeight * baseScore * 0.8
      : params.endgameWeight * baseScore * 0.2

    return baseScore + aggressionBonus + positionalBonus + tacticalBonus + endgameBonus
  })

  // Step 5: ML preference adjustment
  let finalScores = scores
  if (context?.mlModel && context.botColor && context.botAttributes) {
    try {
      const featureBatch = candidatesWithSan.map((c, idx) =>
        extractFeatures(
          fen, c.san, idx, candidatesWithSan.length, c.centipawns,
          context.botColor!, context.botAttributes!,
          context.alignmentAttack ?? 1, context.alignmentStyle ?? 1,
        )
      )
      const mlScores = context.mlModel.predict(featureBatch)
      finalScores = scores.map((s, i) => 0.7 * s + 0.3 * mlScores[i])
    } catch {
      // ML prediction failed, use attribute scores only
    }
  }

  // Step 6: Softmax selection with temperature from creativity
  const temperature = Math.max(0.1, Math.min(2.0, params.temperature))
  const maxScore = Math.max(...finalScores)
  const expScores = finalScores.map(s => Math.exp((s - maxScore) / temperature))
  const sumExp = expScores.reduce((a, b) => a + b, 0)
  const probabilities = expScores.map(e => e / sumExp)

  // Sample
  const roll = Math.random()
  let cumulative = 0
  for (let i = 0; i < probabilities.length; i++) {
    cumulative += probabilities[i]
    if (roll < cumulative) {
      return { san: candidatesWithSan[i].san, candidates }
    }
  }

  return { san: candidatesWithSan[0].san, candidates }
}

function estimateMaterial(chess: Chess): number {
  const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 }
  let total = 0
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece && piece.type !== 'k') {
        total += pieceValues[piece.type] || 0
      }
    }
  }
  return total
}
