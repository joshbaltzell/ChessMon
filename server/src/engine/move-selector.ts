import type { PlayParameters, CandidateMove } from '../types/index.js'
import type { StockfishPool } from './stockfish-pool.js'
import { Chess } from 'chess.js'

export async function selectMove(
  chess: Chess,
  params: PlayParameters,
  pool: StockfishPool,
): Promise<string> {
  const legalMoves = chess.moves()
  if (legalMoves.length === 0) {
    throw new Error('No legal moves available')
  }

  if (legalMoves.length === 1) {
    return legalMoves[0]
  }

  // Step 1: Opening book check
  if (params.openingBook) {
    const fenPrefix = chess.fen().split(' ').slice(0, 4).join(' ')
    const bookMove = params.openingBook.positions[fenPrefix]
    if (bookMove && Math.random() < params.openingBook.proficiency / 100) {
      // Verify the book move is legal
      if (legalMoves.includes(bookMove)) {
        return bookMove
      }
    }
  }

  // Step 2: Blunder check
  if (params.blunderRate > 0 && Math.random() < params.blunderRate) {
    return legalMoves[Math.floor(Math.random() * legalMoves.length)]
  }

  // Step 3: Get Stockfish candidates
  const fen = chess.fen()
  const candidates = await pool.analyze(fen, params.searchDepth, params.multiPv)

  if (candidates.length === 0) {
    return legalMoves[Math.floor(Math.random() * legalMoves.length)]
  }

  // Convert UCI moves to SAN for matching
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
    return legalMoves[Math.floor(Math.random() * legalMoves.length)]
  }

  // Step 4: Score each candidate
  const maxCp = Math.max(...candidatesWithSan.map(c => Math.abs(c.centipawns)), 1)
  const scores = candidatesWithSan.map(c => {
    const baseScore = (c.centipawns + maxCp) / (2 * maxCp) // Normalize to 0-1

    const isCapture = c.moveObj.captured !== undefined
    const sanStr = c.san
    const isCheck = sanStr.includes('+') || sanStr.includes('#')
    const isPromotion = c.moveObj.promotion !== undefined

    const aggressionBonus = params.aggressionWeight * (
      0.3 * (isCapture ? 1 : 0) +
      0.4 * (isCheck ? 1 : 0) +
      0.2 * (isPromotion ? 1 : 0)
    )

    const positionalBonus = params.positionalWeight * baseScore

    const evalSwing = Math.abs(c.centipawns - (candidatesWithSan[0]?.centipawns || 0)) / maxCp
    const tacticalBonus = params.tacticalWeight * (
      0.4 * (isCapture ? 1 : 0) +
      0.4 * (isCheck ? 1 : 0) +
      0.2 * evalSwing
    )

    const endgameBonus = params.endgameWeight * baseScore * 0.5

    return baseScore + aggressionBonus + positionalBonus + tacticalBonus + endgameBonus
  })

  // Step 5: ML preference (placeholder - will be implemented in Phase 2)
  // For now, final scores = attribute scores

  // Step 6: Softmax selection
  const temperature = Math.max(0.1, Math.min(2.0, params.temperature))
  const expScores = scores.map(s => Math.exp(s / temperature))
  const sumExp = expScores.reduce((a, b) => a + b, 0)
  const probabilities = expScores.map(e => e / sumExp)

  // Sample from distribution
  const roll = Math.random()
  let cumulative = 0
  for (let i = 0; i < probabilities.length; i++) {
    cumulative += probabilities[i]
    if (roll < cumulative) {
      return candidatesWithSan[i].san
    }
  }

  // Fallback to best candidate
  return candidatesWithSan[0].san
}
