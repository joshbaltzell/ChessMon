import { eq, and } from 'drizzle-orm'
import { bots, championshipBouts } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'
import type { StockfishPool } from '../engine/stockfish-pool.js'
import { TrainingService } from './training.service.js'
import { CardService } from './card.service.js'
import { LadderService } from './ladder.service.js'

const ROUND_TITLES = ['The Opening', 'The Counter', 'The Decider']

export class ChampionshipService {
  constructor(private db: DrizzleDb, private pool: StockfishPool) {}

  /**
   * Get active championship bout for a bot, or null if none active.
   */
  getActiveBout(botId: number) {
    return this.db.select().from(championshipBouts)
      .where(and(
        eq(championshipBouts.botId, botId),
        eq(championshipBouts.status, 'active'),
      ))
      .get() ?? null
  }

  /**
   * Start a new championship bout. Requires ladder to be complete and no active bout.
   */
  startBout(botId: number) {
    const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
    if (!bot) throw new Error('Bot not found')

    const ladderService = new LadderService(this.db)
    if (!ladderService.isLadderComplete(botId)) {
      throw new Error('Ladder is not complete. Defeat all 3 opponents first.')
    }

    // Check no active bout exists
    const activeBout = this.getActiveBout(botId)
    if (activeBout) {
      throw new Error('A championship bout is already active.')
    }

    const targetLevel = bot.level + 1

    const bout = this.db.insert(championshipBouts).values({
      botId,
      targetLevel,
      gamesPlayed: 0,
      gamesWon: 0,
      currentRound: 1,
      status: 'active',
      gameRecordIdsJson: '[]',
    }).returning().get()

    return {
      id: bout.id,
      botId,
      targetLevel,
      gamesPlayed: 0,
      gamesWon: 0,
      currentRound: 1,
      status: 'active',
      roundTitle: ROUND_TITLES[0],
    }
  }

  /**
   * Play a round of the active championship bout. Runs a full game vs target-level system bot.
   * Returns the round result and updated bout state.
   */
  async playRound(botId: number) {
    const bout = this.getActiveBout(botId)
    if (!bout) throw new Error('No active championship bout.')

    const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
    if (!bot) throw new Error('Bot not found')

    // Run game vs target-level system bot using cardSpar (1x XP for championship)
    const trainingService = new TrainingService(this.db, this.pool)
    const gameResult = await trainingService.cardSpar(botId, bout.targetLevel, 1)

    // Determine if bot won this round
    const botWon = gameResult.game.result === '1-0' && gameResult.game.botPlayedWhite ||
                   gameResult.game.result === '0-1' && !gameResult.game.botPlayedWhite

    const newGamesPlayed = bout.gamesPlayed + 1
    const newGamesWon = botWon ? bout.gamesWon + 1 : bout.gamesWon
    const newGamesLost = newGamesPlayed - newGamesWon
    const roundTitle = ROUND_TITLES[bout.currentRound - 1] || `Round ${bout.currentRound}`

    // Update game record IDs
    const gameRecordIds = JSON.parse(bout.gameRecordIdsJson) as number[]
    gameRecordIds.push(gameResult.game.id)

    // Check if bout is decided (first to 2)
    let newStatus: 'active' | 'won' | 'lost' = 'active'
    if (newGamesWon >= 2) newStatus = 'won'
    else if (newGamesLost >= 2) newStatus = 'lost'

    // Update bout in DB
    this.db.update(championshipBouts)
      .set({
        gamesPlayed: newGamesPlayed,
        gamesWon: newGamesWon,
        currentRound: bout.currentRound + 1,
        status: newStatus,
        gameRecordIdsJson: JSON.stringify(gameRecordIds),
      })
      .where(eq(championshipBouts.id, bout.id))
      .run()

    const cardService = new CardService(this.db)
    const ladderService = new LadderService(this.db)
    let levelUp = false
    let newLevel: number | undefined
    let bossLossAdvice = null

    // Handle bout completion
    if (newStatus === 'won') {
      // Level up!
      levelUp = true
      newLevel = bout.targetLevel
      this.db.update(bots)
        .set({ level: bout.targetLevel })
        .where(eq(bots.id, botId))
        .run()

      // Draw new hand with new level's card pool (energy resets to 0)
      cardService.drawHand(botId)

      // Reset ladder and init for next level
      ladderService.resetLadder(botId, bout.targetLevel + 1)
      ladderService.initLadder(botId)
    } else if (newStatus === 'lost') {
      // Consolation: +3 bonus energy
      cardService.addEnergy(botId, 3)

      // Reset ladder at same target level (must re-defeat all 3)
      ladderService.resetLadder(botId, bout.targetLevel)
      ladderService.initLadder(botId)

      bossLossAdvice = ladderService.getBossLossAdvice(botId)
    }

    return {
      roundResult: botWon ? 'win' : 'loss',
      roundTitle,
      game: gameResult.game,
      bout: {
        gamesPlayed: newGamesPlayed,
        gamesWon: newGamesWon,
        currentRound: bout.currentRound + 1,
        status: newStatus,
      },
      levelUp,
      newLevel,
      bossLossAdvice,
      emotion: gameResult.emotion,
      recap: gameResult.recap,
    }
  }
}
