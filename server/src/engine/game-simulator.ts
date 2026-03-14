import { Chess } from 'chess.js'
import type { PlayParameters, SimulatedGameResult, PositionRecord, GameResult } from '../types/index.js'
import type { StockfishPool } from './stockfish-pool.js'
import { selectMove, type MoveSelectorContext } from './move-selector.js'
import { type PowerupState, resolvePowerupsForMove, initPowerupState, type ActivePowerup } from './buff-resolver.js'

export async function simulateGame(
  whiteParams: PlayParameters,
  blackParams: PlayParameters,
  pool: StockfishPool,
  options: {
    maxMoves?: number
    whiteContext?: MoveSelectorContext
    blackContext?: MoveSelectorContext
    /** Powerups for the bot (applied to whichever side the bot plays) */
    botPowerups?: ActivePowerup[]
    /** Which color the bot is playing */
    botColor?: 'w' | 'b'
  } = {},
): Promise<SimulatedGameResult> {
  const maxMoves = options.maxMoves || 200
  const chess = new Chess()
  const positions: PositionRecord[] = []
  let moveCount = 0

  // Initialize powerup state if provided
  const powerupState: PowerupState | null = options.botPowerups && options.botPowerups.length > 0
    ? initPowerupState(options.botPowerups)
    : null

  while (!chess.isGameOver() && moveCount < maxMoves) {
    const isWhite = chess.turn() === 'w'
    let currentParams = isWhite ? whiteParams : blackParams
    const currentContext = isWhite ? options.whiteContext : options.blackContext
    const fen = chess.fen()

    // Apply powerup effects for bot's moves
    const isBotTurn = options.botColor ? (isWhite ? options.botColor === 'w' : options.botColor === 'b') : false
    if (powerupState && isBotTurn) {
      const halfMoveNumber = Math.ceil(moveCount / 2) + 1
      // Determine if bot is losing (simple heuristic: use last candidate eval)
      const isLosing = false // Will be determined by previous position evals
      const { modifiedParams } = resolvePowerupsForMove(
        powerupState, halfMoveNumber, currentParams, isLosing,
      )
      currentParams = modifiedParams
    }

    let san: string
    let uci: string | undefined
    let candidates: typeof positions[0]['candidateMoves']
    try {
      const result = await selectMove(chess, currentParams, pool, currentContext, powerupState && isBotTurn ? powerupState : undefined)
      san = result.san
      uci = result.uci
      candidates = result.candidates
    } catch {
      // Engine failure mid-game (timeout, etc.) — end game as draw
      break
    }
    chess.move(san)

    positions.push({
      fen,
      movePlayed: san,
      movePlayedUci: uci,
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
