import type { PlayParameters, CandidateMove } from '../types/index.js'
import type { StockfishPool } from './stockfish-pool.js'
import type { PreferenceModel } from '../ml/preference-model.js'
import { extractFeaturesBatch } from '../ml/feature-extractor.js'
import { Chess } from 'chess.js'
import { tryLuckyBreak, type PowerupState } from './buff-resolver.js'

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
  powerupState?: PowerupState,
): Promise<{ san: string; uci?: string; candidates: CandidateMove[] }> {
  const legalMoves = chess.moves()
  if (legalMoves.length === 0) {
    throw new Error('No legal moves available')
  }

  if (legalMoves.length === 1) {
    return { san: legalMoves[0], candidates: [] }
  }

  // Step 1: Opening book check
  const fen = chess.fen()
  if (params.openingBook) {
    const fenPrefix = fen.split(' ').slice(0, 4).join(' ')
    const bookMove = params.openingBook.positions[fenPrefix]
    if (bookMove && Math.random() < params.openingBook.proficiency / 100) {
      if (legalMoves.includes(bookMove)) {
        return { san: bookMove, candidates: [] }
      }
    }
  }

  // Step 2: Blunder check
  // Lucky Break powerup: skip the blunder entirely
  if (params.blunderRate > 0 && Math.random() < params.blunderRate) {
    if (powerupState && tryLuckyBreak(powerupState)) {
      // Lucky Break consumed — skip this blunder
    } else if (params.aggressionFocused) {
      // Check if any forcing move (capture or check) exists — if so, skip the blunder
      const hasForcingMove = legalMoves.some(m => {
        try {
          const move = chess.move(m)
          const isForcing = move.captured !== undefined || move.san.includes('+') || move.san.includes('#')
          chess.undo()
          return isForcing
        } catch { return false }
      })
      if (hasForcingMove) {
        // Skip blunder — aggression focus saves us when we have initiative
      } else {
        return { san: legalMoves[Math.floor(Math.random() * legalMoves.length)], candidates: [] }
      }
    } else {
      return { san: legalMoves[Math.floor(Math.random() * legalMoves.length)], candidates: [] }
    }
  }

  // Step 3: Get Stockfish candidates
  // BALANCE: Endgame-focused bots get +1 depth in endgame positions
  const totalMaterial = estimateMaterialFromBoard(chess.board())
  const isEndgame = totalMaterial <= 24
  let effectiveDepth = params.searchDepth
  if (isEndgame && params.endgameFocused) {
    effectiveDepth = Math.min(effectiveDepth + 1, 22)
  }

  const candidates = await pool.analyze(fen, effectiveDepth, params.multiPv)

  if (candidates.length === 0) {
    return { san: legalMoves[Math.floor(Math.random() * legalMoves.length)], candidates: [] }
  }

  // Convert UCI moves to SAN — reuse single Chess instance with move/undo
  const candidatesWithSan: Array<CandidateMove & { san: string; moveObj: ReturnType<Chess['move']> }> = []
  for (const c of candidates) {
    try {
      const move = chess.move({ from: c.move.slice(0, 2), to: c.move.slice(2, 4), promotion: c.move[4] })
      candidatesWithSan.push({ ...c, san: move.san, moveObj: move })
      chess.undo()
    } catch {
      // invalid move from stockfish, skip
    }
  }

  if (candidatesWithSan.length === 0) {
    return { san: legalMoves[Math.floor(Math.random() * legalMoves.length)], candidates }
  }

  // Step 4: Attribute-based scoring
  const maxCp = Math.max(...candidatesWithSan.map(c => Math.abs(c.centipawns)), 1)
  const topCp = candidatesWithSan[0]?.centipawns || 0

  const scores = candidatesWithSan.map((c, idx) => {
    const baseScore = (c.centipawns + maxCp) / (2 * maxCp)

    const isCapture = c.moveObj.captured !== undefined
    const isCheck = c.san.includes('+') || c.san.includes('#')
    const isPromotion = c.moveObj.promotion !== undefined
    const isCastling = c.san === 'O-O' || c.san === 'O-O-O'

    // AGGRESSION: Rewards forcing moves (captures, checks, promotions)
    const aggressionBonus = params.aggressionWeight * (
      0.25 * (isCapture ? 1 : 0) +
      0.35 * (isCheck ? 1 : 0) +
      0.15 * (isPromotion ? 1 : 0) +
      0.10 * (c.moveObj.captured === 'q' ? 1 : c.moveObj.captured === 'r' ? 0.5 : 0) +
      0.15 * (isCapture && c.centipawns > topCp - 50 ? 1 : 0)
    )

    // POSITIONAL: Trusts engine evaluation, rewards quiet strong moves
    const positionalBonus = params.positionalWeight * (
      0.6 * baseScore +
      0.2 * (isCastling ? 1 : 0) +
      0.2 * (!isCapture && !isCheck && baseScore > 0.6 ? 1 : 0)
    )

    // TACTICAL: Rewards moves that create BIG eval swings (finding combos)
    // BALANCE FIX: Now rewards HIGH eval swings (tactical shots), not low ones
    const evalSwing = idx > 0
      ? Math.abs(c.centipawns - topCp) / maxCp
      : 0
    const tacticalBonus = params.tacticalWeight * (
      0.30 * (isCapture ? 1 : 0) +
      0.30 * (isCheck ? 1 : 0) +
      0.20 * (idx === 0 ? 1 : Math.max(0, 1 - evalSwing * 0.5)) + // top move or close to it
      0.20 * (isPromotion ? 1 : 0)
    )

    // ENDGAME: Amplifies engine accuracy in endgame, still useful in midgame
    // BALANCE FIX: Raised off-phase multiplier from 0.2 to 0.35
    const endgameBonus = isEndgame
      ? params.endgameWeight * baseScore * 0.8
      : params.endgameWeight * baseScore * 0.35

    // CREATIVITY: "Surprise bonus" for non-obvious moves that aren't terrible
    // BALANCE FIX: Gives creative bots a reward for picks that aren't the engine's top choice
    // but are still reasonable (within 100cp of best). This makes high-temp picks more strategic.
    let creativityBonus = 0
    if (params.creativityFocused && idx > 0) {
      const cpDiff = Math.abs(c.centipawns - topCp)
      if (cpDiff < 100) {
        // Reward non-obvious moves proportional to how close they are to best
        creativityBonus = 0.25 * (1 - cpDiff / 100)
      }
    }

    return baseScore + aggressionBonus + positionalBonus + tacticalBonus + endgameBonus + creativityBonus
  })

  // Step 5: ML preference adjustment — uses batch extraction (single Chess + board() call)
  // Blend weight scales with bot experience (0% for untrained, up to 40% for experienced)
  let finalScores = scores
  const mlBlendWeight = params.mlBlendWeight
  if (mlBlendWeight > 0 && context?.mlModel && context.botColor && context.botAttributes) {
    try {
      const featureBatch = extractFeaturesBatch(
        fen,
        candidatesWithSan.map((c, idx) => ({ san: c.san, centipawns: c.centipawns, index: idx })),
        candidatesWithSan.length,
        context.botColor, context.botAttributes,
        context.alignmentAttack ?? 1, context.alignmentStyle ?? 1,
      )
      const mlScores = context.mlModel.predict(featureBatch)
      finalScores = scores.map((s, i) => (1 - mlBlendWeight) * s + mlBlendWeight * mlScores[i])
    } catch {
      // ML prediction failed, use attribute scores only
    }
  }

  // Step 6: Softmax selection with temperature from creativity
  const temperature = Math.max(0.1, Math.min(2.0, params.temperature))
  const maxScore = Math.max(...finalScores)
  const expScores = finalScores.map(s => Math.exp((s - maxScore) / temperature))
  const sumExp = expScores.reduce((a, b) => a + b, 0)
  // Guard against division by zero (all scores underflowed)
  if (sumExp === 0) {
    return { san: candidatesWithSan[0].san, uci: candidatesWithSan[0].move, candidates }
  }
  const probabilities = expScores.map(e => e / sumExp)

  // Sample
  const roll = Math.random()
  let cumulative = 0
  for (let i = 0; i < probabilities.length; i++) {
    cumulative += probabilities[i]
    if (roll < cumulative) {
      return { san: candidatesWithSan[i].san, uci: candidatesWithSan[i].move, candidates }
    }
  }

  return { san: candidatesWithSan[0].san, uci: candidatesWithSan[0].move, candidates }
}

function estimateMaterialFromBoard(board: ReturnType<Chess['board']>): number {
  const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 }
  let total = 0
  for (const row of board) {
    for (const piece of row) {
      if (piece && piece.type !== 'k') {
        total += pieceValues[piece.type] || 0
      }
    }
  }
  return total
}
