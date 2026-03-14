import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { Chess } from 'chess.js'
import { bots, playSessions, gameRecords, botTactics } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'
import type { StockfishPool } from '../engine/stockfish-pool.js'
import { selectMove, type MoveSelectorContext } from '../engine/move-selector.js'
import { systemBotPlayParameters, botToPlayParameters } from '../models/bot-intelligence.js'
import { loadModel } from '../ml/model-store.js'
import { trainBotFromGame } from '../ml/training-pipeline.js'
import { getBestOpeningBook } from '../engine/opening-book.js'
import { calculateEloChange } from '../models/elo.js'
import { XP_PER_SPAR } from '../models/progression.js'
import type { PositionRecord, CandidateMove, GameResult } from '../types/index.js'

const ALIGNMENT_ATTACK_MAP: Record<string, number> = { aggressive: 0, balanced: 1, defensive: 2 }
const ALIGNMENT_STYLE_MAP: Record<string, number> = { chaotic: 0, positional: 1, sacrificial: 2 }

const PILOT_XP_MULTIPLIER = 1.5

export class PilotService {
  constructor(
    private db: DrizzleDb,
    private pool: StockfishPool,
  ) {}

  async startPilotGame(botId: number, opponentLevel: number, playerColor: 'w' | 'b') {
    const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
    if (!bot) throw new Error('Bot not found')

    if (opponentLevel < 1 || opponentLevel > 20) {
      throw new Error('Opponent level must be between 1 and 20')
    }

    const chess = new Chess()
    const sessionId = uuidv4()

    this.db.insert(playSessions).values({
      id: sessionId,
      botId,
      fen: chess.fen(),
      pgnSoFar: '',
      playerColor,
      status: 'active',
    }).run()

    // Get opening book suggestions for the bot
    const tactics = this.db.select().from(botTactics).where(eq(botTactics.botId, botId)).all()
    const openingBook = getBestOpeningBook(tactics)
    let suggestedMove: string | null = null
    if (openingBook && playerColor === chess.turn()) {
      suggestedMove = this.getBookMove(chess, openingBook)
    }

    let opponentMove: string | null = null
    // If player is black, opponent (white) moves first
    if (playerColor === 'b') {
      opponentMove = await this.makeOpponentMove(sessionId, opponentLevel)
      // Get book suggestion after opponent's first move
      const updatedSession = this.db.select().from(playSessions).where(eq(playSessions.id, sessionId)).get()
      if (updatedSession && openingBook) {
        const updatedChess = new Chess(updatedSession.fen)
        suggestedMove = this.getBookMove(updatedChess, openingBook)
      }
    }

    const session = this.db.select().from(playSessions).where(eq(playSessions.id, sessionId)).get()!

    return {
      sessionId,
      fen: session.fen,
      pgn: session.pgnSoFar,
      playerColor,
      opponentMove,
      opponentLevel,
      suggestedMove,
      status: 'active',
    }
  }

  async makePilotMove(sessionId: string, moveSan: string, opponentLevel: number) {
    const session = this.db.select().from(playSessions).where(eq(playSessions.id, sessionId)).get()
    if (!session) throw new Error('Session not found')
    if (session.status !== 'active') throw new Error('Game is not active')

    const chess = new Chess(session.fen)

    if (chess.turn() !== session.playerColor) {
      throw new Error("Not your turn")
    }

    // Make the player's move
    try {
      chess.move(moveSan)
    } catch {
      throw new Error(`Invalid move: ${moveSan}`)
    }

    // Check game over after player move
    if (chess.isGameOver()) {
      return this.finishPilotGame(sessionId, chess, opponentLevel)
    }

    // Update session
    this.db.update(playSessions)
      .set({ fen: chess.fen(), pgnSoFar: chess.pgn() })
      .where(eq(playSessions.id, sessionId))
      .run()

    // Opponent responds
    const opponentMove = await this.makeOpponentMove(sessionId, opponentLevel)

    const updated = this.db.select().from(playSessions).where(eq(playSessions.id, sessionId)).get()!

    // Get opening book suggestion for next player move
    const bot = this.db.select().from(bots).where(eq(bots.id, session.botId)).get()
    let suggestedMove: string | null = null
    if (bot && updated.status === 'active') {
      const tactics = this.db.select().from(botTactics).where(eq(botTactics.botId, bot.id)).all()
      const openingBook = getBestOpeningBook(tactics)
      if (openingBook) {
        const nextChess = new Chess(updated.fen)
        suggestedMove = this.getBookMove(nextChess, openingBook)
      }
    }

    return {
      sessionId,
      fen: updated.fen,
      pgn: updated.pgnSoFar,
      opponentMove,
      suggestedMove,
      status: updated.status,
      result: updated.result,
    }
  }

  async resignPilot(sessionId: string, opponentLevel: number) {
    const session = this.db.select().from(playSessions).where(eq(playSessions.id, sessionId)).get()
    if (!session) throw new Error('Session not found')
    if (session.status !== 'active') throw new Error('Game is not active')

    // Player resigns = opponent wins
    const result: GameResult = session.playerColor === 'w' ? '0-1' : '1-0'

    this.db.update(playSessions)
      .set({ status: 'complete', result })
      .where(eq(playSessions.id, sessionId))
      .run()

    const bot = this.db.select().from(bots).where(eq(bots.id, session.botId)).get()
    if (!bot) throw new Error('Bot not found')

    // Record game
    const botIsWhite = session.playerColor === 'w'
    this.db.insert(gameRecords).values({
      whiteBotId: botIsWhite ? bot.id : null,
      blackBotId: botIsWhite ? null : bot.id,
      whiteSystemLevel: botIsWhite ? null : opponentLevel,
      blackSystemLevel: botIsWhite ? opponentLevel : null,
      pgn: session.pgnSoFar,
      result,
      moveCount: (session.pgnSoFar.match(/\d+\./g) || []).length,
      context: 'human_play',
    }).run()

    // Still grant small XP for the attempt
    const xpGain = Math.round(XP_PER_SPAR * 0.5)
    this.db.update(bots)
      .set({
        xp: bot.xp + xpGain,
        gamesPlayed: bot.gamesPlayed + 1,
      })
      .where(eq(bots.id, bot.id))
      .run()

    return { sessionId, result, xpGain }
  }

  private async makeOpponentMove(sessionId: string, opponentLevel: number): Promise<string> {
    const session = this.db.select().from(playSessions).where(eq(playSessions.id, sessionId)).get()
    if (!session) throw new Error('Session not found')
    const chess = new Chess(session.fen)

    if (chess.isGameOver()) {
      this.finishPilotGame(sessionId, chess, opponentLevel)
      return ''
    }

    const params = systemBotPlayParameters(opponentLevel)
    const { san } = await selectMove(chess, params, this.pool)
    chess.move(san)

    if (chess.isGameOver()) {
      this.finishPilotGame(sessionId, chess, opponentLevel)
    } else {
      this.db.update(playSessions)
        .set({ fen: chess.fen(), pgnSoFar: chess.pgn() })
        .where(eq(playSessions.id, sessionId))
        .run()
    }

    return san
  }

  private async finishPilotGame(sessionId: string, chess: Chess, opponentLevel: number) {
    let result: GameResult
    if (chess.isCheckmate()) {
      result = chess.turn() === 'w' ? '0-1' : '1-0'
    } else {
      result = '1/2-1/2'
    }

    this.db.update(playSessions)
      .set({ fen: chess.fen(), pgnSoFar: chess.pgn(), status: 'complete', result })
      .where(eq(playSessions.id, sessionId))
      .run()

    const session = this.db.select().from(playSessions).where(eq(playSessions.id, sessionId)).get()!
    const bot = this.db.select().from(bots).where(eq(bots.id, session.botId)).get()
    if (!bot) throw new Error('Bot not found')

    const botIsWhite = session.playerColor === 'w'
    const botWon = (result === '1-0' && botIsWhite) || (result === '0-1' && !botIsWhite)
    const isDraw = result === '1/2-1/2'

    // Record game
    this.db.insert(gameRecords).values({
      whiteBotId: botIsWhite ? bot.id : null,
      blackBotId: botIsWhite ? null : bot.id,
      whiteSystemLevel: botIsWhite ? null : opponentLevel,
      blackSystemLevel: botIsWhite ? opponentLevel : null,
      pgn: chess.pgn(),
      result,
      moveCount: Math.ceil(chess.history().length / 2),
      context: 'human_play',
    }).run()

    // 1.5x XP for pilot mode
    const baseXp = XP_PER_SPAR
    const xpGain = Math.round(baseXp * PILOT_XP_MULTIPLIER)

    // Elo change
    const opponentElo = 400 + (opponentLevel - 1) * 100
    const eloChange = calculateEloChange(bot.elo, opponentElo, result, botIsWhite)

    this.db.update(bots)
      .set({
        xp: bot.xp + xpGain,
        elo: bot.elo + eloChange,
        gamesPlayed: bot.gamesPlayed + 1,
      })
      .where(eq(bots.id, bot.id))
      .run()

    // ML training from the human's game positions
    let mlTraining = null
    try {
      // Extract positions from the PGN for ML training
      const positions = this.extractPositionsFromPgn(chess, session.playerColor as 'w' | 'b')
      if (positions.length > 0) {
        const botAttributes = {
          aggression: bot.aggression,
          positional: bot.positional,
          tactical: bot.tactical,
          endgame: bot.endgame,
          creativity: bot.creativity,
          alignmentAttack: bot.alignmentAttack,
          alignmentStyle: bot.alignmentStyle,
        }
        const trainingResult = await trainBotFromGame(
          this.db,
          bot.id,
          positions,
          result,
          session.playerColor as 'w' | 'b',
          botAttributes,
          bot.mlReplayBuffer,
        )

        // Save updated replay buffer
        this.db.update(bots)
          .set({ mlReplayBuffer: trainingResult.updatedReplayBuffer })
          .where(eq(bots.id, bot.id))
          .run()

        mlTraining = {
          samplesUsed: trainingResult.samplesUsed,
          message: `Your bot learned from ${trainingResult.samplesUsed} positions!`,
        }
      }
    } catch { /* ML training is non-critical */ }

    // Increment daily quests
    try {
      const { DailyQuestService } = await import('./daily-quest.service.js')
      const questService = new DailyQuestService(this.db)
      if (botWon) {
        questService.incrementQuest(bot.id, 'win_spars', 1)
        questService.incrementQuest(bot.id, 'pilot_win', 1)
      }
    } catch { /* non-critical */ }

    return {
      sessionId,
      fen: chess.fen(),
      pgn: chess.pgn(),
      status: 'complete',
      result,
      botWon,
      xpGain,
      eloChange,
      mlTraining,
    }
  }

  /**
   * Extract position records from a completed game for ML training.
   * Since we don't have Stockfish candidates for human moves,
   * we create simplified records that the training pipeline can use.
   */
  private extractPositionsFromPgn(chess: Chess, botColor: 'w' | 'b'): PositionRecord[] {
    const positions: PositionRecord[] = []

    // Replay the game move by move
    const moves = chess.history({ verbose: true })
    const replayChess = new Chess()

    for (const move of moves) {
      const fen = replayChess.fen()
      const color = replayChess.turn()

      // Record the position with the move that was played
      // For ML training, we create a simple candidate list with just the played move
      const simpleCandidates: CandidateMove[] = [{
        move: move.from + move.to + (move.promotion || ''),
        centipawns: 0,
        mate: null,
        pv: [move.from + move.to + (move.promotion || '')],
      }]

      positions.push({
        fen,
        movePlayed: move.san,
        movePlayedUci: move.from + move.to + (move.promotion || ''),
        candidateMoves: simpleCandidates,
        color,
      })

      replayChess.move(move.san)
    }

    return positions
  }

  private getBookMove(chess: Chess, openingBook: { positions: Record<string, string>; proficiency: number }): string | null {
    const fenParts = chess.fen().split(' ').slice(0, 4).join(' ')
    const bookMove = openingBook.positions[fenParts]
    if (!bookMove) return null
    // Verify it's a legal move
    const legalMoves = chess.moves({ verbose: true })
    const match = legalMoves.find(m => m.san === bookMove)
    return match ? bookMove : null
  }
}
