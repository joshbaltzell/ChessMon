import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { Chess } from 'chess.js'
import { bots, playSessions, gameRecords } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'
import type { StockfishPool } from '../engine/stockfish-pool.js'
import { selectMove, type MoveSelectorContext } from '../engine/move-selector.js'
import { botToPlayParameters } from '../models/bot-intelligence.js'
import { loadModel } from '../ml/model-store.js'
import { generateEmotionResponse } from '../models/personality.js'
import type { GameResult } from '../types/index.js'

const ALIGNMENT_ATTACK_MAP: Record<string, number> = { aggressive: 0, balanced: 1, defensive: 2 }
const ALIGNMENT_STYLE_MAP: Record<string, number> = { chaotic: 0, positional: 1, sacrificial: 2 }

export class PlayService {
  constructor(
    private db: DrizzleDb,
    private pool: StockfishPool,
  ) {}

  async newGame(botId: number, playerColor: 'w' | 'b') {
    const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
    if (!bot) throw new Error('Bot not found')

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

    let botMove: string | null = null
    // If bot plays white, make the first move
    if (playerColor === 'b') {
      botMove = await this.makeBotMove(sessionId, bot)
    }

    const session = this.db.select().from(playSessions).where(eq(playSessions.id, sessionId)).get()
    if (!session) throw new Error('Session not found')

    return {
      sessionId,
      fen: session.fen,
      pgn: session.pgnSoFar,
      playerColor,
      botMove,
      status: 'active',
    }
  }

  async makePlayerMove(sessionId: string, moveSan: string) {
    const session = this.db.select().from(playSessions).where(eq(playSessions.id, sessionId)).get()
    if (!session) throw new Error('Session not found')
    if (session.status !== 'active') throw new Error('Game is not active')

    const chess = new Chess(session.fen)

    // Validate it's the player's turn
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
      return this.finishGame(sessionId, chess)
    }

    // Update session after player move
    this.db.update(playSessions)
      .set({ fen: chess.fen(), pgnSoFar: chess.pgn() })
      .where(eq(playSessions.id, sessionId))
      .run()

    // Bot responds
    const bot = this.db.select().from(bots).where(eq(bots.id, session.botId)).get()
    if (!bot) throw new Error('Bot not found')
    const botMove = await this.makeBotMove(sessionId, bot)

    // Re-read session after bot move
    const updated = this.db.select().from(playSessions).where(eq(playSessions.id, sessionId)).get()!

    return {
      sessionId,
      fen: updated.fen,
      pgn: updated.pgnSoFar,
      botMove,
      status: updated.status,
      result: updated.result,
    }
  }

  async resign(sessionId: string) {
    const session = this.db.select().from(playSessions).where(eq(playSessions.id, sessionId)).get()
    if (!session) throw new Error('Session not found')
    if (session.status !== 'active') throw new Error('Game is not active')

    // Player resigns = bot wins
    const result: GameResult = session.playerColor === 'w' ? '0-1' : '1-0'

    this.db.update(playSessions)
      .set({ status: 'complete', result })
      .where(eq(playSessions.id, sessionId))
      .run()

    // Record game
    const bot = this.db.select().from(bots).where(eq(bots.id, session.botId)).get()
    if (!bot) throw new Error('Bot not found')
    this.recordGame(session, bot, result)

    const emotion = generateEmotionResponse(
      'win', 'spar',
      bot.alignmentAttack, bot.alignmentStyle, bot.level,
    )

    return { sessionId, result, emotion }
  }

  getSession(sessionId: string) {
    return this.db.select().from(playSessions).where(eq(playSessions.id, sessionId)).get()
  }

  private async makeBotMove(sessionId: string, bot: typeof bots.$inferSelect): Promise<string> {
    const session = this.db.select().from(playSessions).where(eq(playSessions.id, sessionId)).get()
    if (!session) throw new Error('Session not found')
    const chess = new Chess(session.fen)

    if (chess.isGameOver()) {
      this.finishGame(sessionId, chess)
      return ''
    }

    const params = botToPlayParameters(bot)
    const mlModel = await loadModel(this.db, bot.id)
    const botColor = session.playerColor === 'w' ? 'b' as const : 'w' as const

    const context: MoveSelectorContext = {
      mlModel,
      botColor,
      botAttributes: {
        aggression: bot.aggression,
        positional: bot.positional,
        tactical: bot.tactical,
        endgame: bot.endgame,
        creativity: bot.creativity,
      },
      alignmentAttack: ALIGNMENT_ATTACK_MAP[bot.alignmentAttack] ?? 1,
      alignmentStyle: ALIGNMENT_STYLE_MAP[bot.alignmentStyle] ?? 1,
    }

    const { san } = await selectMove(chess, params, this.pool, context)
    chess.move(san)

    // Update session
    if (chess.isGameOver()) {
      this.finishGame(sessionId, chess)
    } else {
      this.db.update(playSessions)
        .set({ fen: chess.fen(), pgnSoFar: chess.pgn() })
        .where(eq(playSessions.id, sessionId))
        .run()
    }

    return san
  }

  private finishGame(sessionId: string, chess: Chess) {
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

    const session = this.db.select().from(playSessions).where(eq(playSessions.id, sessionId)).get()
    if (!session) throw new Error('Session not found')
    const bot = this.db.select().from(bots).where(eq(bots.id, session.botId)).get()
    if (!bot) throw new Error('Bot not found')

    this.recordGame(session, bot, result)

    const botWon = (result === '1-0' && session.playerColor === 'b') || (result === '0-1' && session.playerColor === 'w')
    const emotion = generateEmotionResponse(
      botWon ? 'win' : result === '1/2-1/2' ? 'draw' : 'loss',
      'spar',
      bot.alignmentAttack, bot.alignmentStyle, bot.level,
    )

    return {
      sessionId,
      fen: chess.fen(),
      pgn: chess.pgn(),
      status: 'complete',
      result,
      emotion,
    }
  }

  private recordGame(
    session: typeof playSessions.$inferSelect,
    bot: typeof bots.$inferSelect,
    result: GameResult,
  ) {
    const botIsWhite = session.playerColor === 'b'
    this.db.insert(gameRecords).values({
      whiteBotId: botIsWhite ? bot.id : null,
      blackBotId: botIsWhite ? null : bot.id,
      pgn: session.pgnSoFar,
      result,
      moveCount: (session.pgnSoFar.match(/\d+\./g) || []).length,
      context: 'human_play',
    }).run()
  }
}
