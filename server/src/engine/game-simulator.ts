import { Chess } from 'chess.js'
import type { PlayParameters, SimulatedGameResult, PositionRecord, GameResult } from '../types/index.js'
import type { StockfishPool } from './stockfish-pool.js'
import { selectMove } from './move-selector.js'

export async function simulateGame(
  whiteParams: PlayParameters,
  blackParams: PlayParameters,
  pool: StockfishPool,
  options: { maxMoves?: number } = {},
): Promise<SimulatedGameResult> {
  const maxMoves = options.maxMoves || 200
  const chess = new Chess()
  const positions: PositionRecord[] = []
  let moveCount = 0

  while (!chess.isGameOver() && moveCount < maxMoves) {
    const currentParams = chess.turn() === 'w' ? whiteParams : blackParams
    const fen = chess.fen()

    const moveSan = await selectMove(chess, currentParams, pool)
    chess.move(moveSan)

    positions.push({
      fen,
      movePlayed: moveSan,
      candidateMoves: [], // Populated if we want ML training data
      color: moveCount % 2 === 0 ? 'w' : 'b',
    })

    moveCount++
  }

  let result: GameResult
  if (chess.isCheckmate()) {
    result = chess.turn() === 'w' ? '0-1' : '1-0'
  } else if (chess.isDraw()) {
    result = '1/2-1/2'
  } else {
    // Max moves reached, adjudicate as draw
    result = '1/2-1/2'
  }

  return {
    pgn: chess.pgn(),
    result,
    moveCount: Math.ceil(moveCount / 2),
    positions,
  }
}
