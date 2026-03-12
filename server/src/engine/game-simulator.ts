import { Chess } from 'chess.js'
import type { PlayParameters, SimulatedGameResult, PositionRecord, GameResult } from '../types/index.js'
import type { StockfishPool } from './stockfish-pool.js'
import { selectMove, type MoveSelectorContext } from './move-selector.js'

export async function simulateGame(
  whiteParams: PlayParameters,
  blackParams: PlayParameters,
  pool: StockfishPool,
  options: {
    maxMoves?: number
    whiteContext?: MoveSelectorContext
    blackContext?: MoveSelectorContext
  } = {},
): Promise<SimulatedGameResult> {
  const maxMoves = options.maxMoves || 200
  const chess = new Chess()
  const positions: PositionRecord[] = []
  let moveCount = 0

  while (!chess.isGameOver() && moveCount < maxMoves) {
    const isWhite = chess.turn() === 'w'
    const currentParams = isWhite ? whiteParams : blackParams
    const currentContext = isWhite ? options.whiteContext : options.blackContext
    const fen = chess.fen()

    let san: string
    let candidates: typeof positions[0]['candidateMoves']
    try {
      const result = await selectMove(chess, currentParams, pool, currentContext)
      san = result.san
      candidates = result.candidates
    } catch {
      // Engine failure mid-game (timeout, etc.) — end game as draw
      break
    }
    chess.move(san)

    positions.push({
      fen,
      movePlayed: san,
      candidateMoves: candidates,
      color: isWhite ? 'w' : 'b',
    })

    moveCount++
  }

  let result: GameResult
  if (chess.isCheckmate()) {
    result = chess.turn() === 'w' ? '0-1' : '1-0'
  } else if (chess.isDraw()) {
    result = '1/2-1/2'
  } else {
    result = '1/2-1/2'
  }

  return {
    pgn: chess.pgn(),
    result,
    moveCount: Math.ceil(moveCount / 2),
    positions,
  }
}
