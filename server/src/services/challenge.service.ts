import { eq } from 'drizzle-orm'
import { bots, botTactics, gameRecords } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'
import type { StockfishPool } from '../engine/stockfish-pool.js'
import { simulateGame } from '../engine/game-simulator.js'
import { botToPlayParameters } from '../models/bot-intelligence.js'
import { calculateEloChange } from '../models/elo.js'
import { XP_PER_SPAR } from '../models/progression.js'
import { trainBotFromGame } from '../ml/training-pipeline.js'
import { loadModel } from '../ml/model-store.js'
import { getBestOpeningBook } from '../engine/opening-book.js'
import { generateMatchRecap } from '../models/battle-commentary.js'
import { generateEmotionResponse } from '../models/personality.js'
import { ALIGNMENT_ATTACK_MAP, ALIGNMENT_STYLE_MAP } from '../types/index.js'
import type { MoveSelectorContext } from '../engine/move-selector.js'

export class ChallengeService {
  constructor(
    private db: DrizzleDb,
    private pool: StockfishPool,
  ) {}

  async challenge(challengerBotId: number, opponentBotId: number) {
    // Load both bots
    const challenger = this.db.select().from(bots).where(eq(bots.id, challengerBotId)).get()
    if (!challenger) throw Object.assign(new Error('Challenger bot not found'), { statusCode: 404, code: 'BOT_NOT_FOUND' })

    const opponent = this.db.select().from(bots).where(eq(bots.id, opponentBotId)).get()
    if (!opponent) throw Object.assign(new Error('Opponent bot not found'), { statusCode: 404, code: 'BOT_NOT_FOUND' })

    // Verify different players
    if (challenger.playerId === opponent.playerId) {
      throw Object.assign(new Error('Cannot challenge your own bot'), { statusCode: 400, code: 'SAME_PLAYER' })
    }

    // Load tactics and opening books for both
    const challengerTactics = this.db.select().from(botTactics).where(eq(botTactics.botId, challengerBotId)).all()
    const opponentTactics = this.db.select().from(botTactics).where(eq(botTactics.botId, opponentBotId)).all()
    const challengerBook = getBestOpeningBook(challengerTactics)
    const opponentBook = getBestOpeningBook(opponentTactics)

    const challengerParams = botToPlayParameters(challenger, challengerBook)
    const opponentParams = botToPlayParameters(opponent, opponentBook)

    // Load ML models
    const challengerModel = await loadModel(this.db, challengerBotId)
    const opponentModel = await loadModel(this.db, opponentBotId)

    // Randomly assign colors
    const challengerIsWhite = Math.random() < 0.5
    const challengerColor = challengerIsWhite ? 'w' as const : 'b' as const
    const opponentColor = challengerIsWhite ? 'b' as const : 'w' as const

    const challengerContext: MoveSelectorContext = {
      mlModel: challengerModel,
      botColor: challengerColor,
      botAttributes: {
        aggression: challenger.aggression, positional: challenger.positional,
        tactical: challenger.tactical, endgame: challenger.endgame, creativity: challenger.creativity,
      },
      alignmentAttack: ALIGNMENT_ATTACK_MAP[challenger.alignmentAttack] ?? 1,
      alignmentStyle: ALIGNMENT_STYLE_MAP[challenger.alignmentStyle] ?? 1,
    }

    const opponentContext: MoveSelectorContext = {
      mlModel: opponentModel,
      botColor: opponentColor,
      botAttributes: {
        aggression: opponent.aggression, positional: opponent.positional,
        tactical: opponent.tactical, endgame: opponent.endgame, creativity: opponent.creativity,
      },
      alignmentAttack: ALIGNMENT_ATTACK_MAP[opponent.alignmentAttack] ?? 1,
      alignmentStyle: ALIGNMENT_STYLE_MAP[opponent.alignmentStyle] ?? 1,
    }

    const whiteParams = challengerIsWhite ? challengerParams : opponentParams
    const blackParams = challengerIsWhite ? opponentParams : challengerParams

    const gameResult = await simulateGame(whiteParams, blackParams, this.pool, {
      whiteContext: challengerIsWhite ? challengerContext : opponentContext,
      blackContext: challengerIsWhite ? opponentContext : challengerContext,
    })

    // Train both bots from the game
    const challengerMlResult = await trainBotFromGame(
      this.db, challengerBotId, gameResult.positions, gameResult.result, challengerColor,
      {
        aggression: challenger.aggression, positional: challenger.positional,
        tactical: challenger.tactical, endgame: challenger.endgame, creativity: challenger.creativity,
        alignmentAttack: challenger.alignmentAttack, alignmentStyle: challenger.alignmentStyle,
      },
      challenger.mlReplayBuffer,
    )

    const opponentMlResult = await trainBotFromGame(
      this.db, opponentBotId, gameResult.positions, gameResult.result, opponentColor,
      {
        aggression: opponent.aggression, positional: opponent.positional,
        tactical: opponent.tactical, endgame: opponent.endgame, creativity: opponent.creativity,
        alignmentAttack: opponent.alignmentAttack, alignmentStyle: opponent.alignmentStyle,
      },
      opponent.mlReplayBuffer,
    )

    // Calculate Elo changes
    const challengerEloChange = calculateEloChange(challenger.elo, opponent.elo, gameResult.result, challengerIsWhite)
    const opponentEloChange = calculateEloChange(opponent.elo, challenger.elo, gameResult.result, !challengerIsWhite)

    const newChallengerElo = Math.max(100, challenger.elo + challengerEloChange)
    const newOpponentElo = Math.max(100, opponent.elo + opponentEloChange)

    // Generate recap
    const recap = generateMatchRecap(
      gameResult.positions, gameResult.result, challengerColor,
      challenger.alignmentAttack, challenger.alignmentStyle,
    )

    // Store game record
    const gameRecord = this.db.insert(gameRecords).values({
      whiteBotId: challengerIsWhite ? challengerBotId : opponentBotId,
      blackBotId: challengerIsWhite ? opponentBotId : challengerBotId,
      pgn: gameResult.pgn,
      result: gameResult.result,
      moveCount: gameResult.moveCount,
      context: 'pvp',
      recapJson: JSON.stringify(recap),
    }).returning().get()

    // Update both bots
    this.db.update(bots)
      .set({
        elo: newChallengerElo,
        gamesPlayed: challenger.gamesPlayed + 1,
        xp: challenger.xp + XP_PER_SPAR,
        mlReplayBuffer: challengerMlResult.updatedReplayBuffer,
      })
      .where(eq(bots.id, challengerBotId))
      .run()

    this.db.update(bots)
      .set({
        elo: newOpponentElo,
        gamesPlayed: opponent.gamesPlayed + 1,
        xp: opponent.xp + XP_PER_SPAR,
        mlReplayBuffer: opponentMlResult.updatedReplayBuffer,
      })
      .where(eq(bots.id, opponentBotId))
      .run()

    // Determine outcome for challenger
    const challengerWon = (gameResult.result === '1-0' && challengerIsWhite) || (gameResult.result === '0-1' && !challengerIsWhite)
    const isDraw = gameResult.result === '1/2-1/2'

    const challengerEmotion = generateEmotionResponse(
      challengerWon ? 'win' : isDraw ? 'draw' : 'loss', 'spar',
      challenger.alignmentAttack, challenger.alignmentStyle, challenger.level, gameResult.moveCount,
    )

    return {
      game: {
        id: gameRecord.id,
        result: gameResult.result,
        moveCount: gameResult.moveCount,
        pgn: gameResult.pgn,
        challengerPlayedWhite: challengerIsWhite,
        challengerName: challenger.name,
        opponentName: opponent.name,
      },
      challengerEloChange,
      opponentEloChange,
      challengerNewElo: newChallengerElo,
      opponentNewElo: newOpponentElo,
      challengerWon,
      emotion: challengerEmotion,
      recap,
    }
  }
}
