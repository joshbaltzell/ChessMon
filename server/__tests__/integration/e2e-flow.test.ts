import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initializeDb, getDb } from '../../src/db/connection.js'
import { BotService } from '../../src/services/bot.service.js'
import { AuthService } from '../../src/services/auth.service.js'
import { TrainingService } from '../../src/services/training.service.js'
import { LevelTestService } from '../../src/services/level-test.service.js'
import { StockfishPool } from '../../src/engine/stockfish-pool.js'
import { botToPlayParameters, systemBotPlayParameters } from '../../src/models/bot-intelligence.js'
import { simulateGame } from '../../src/engine/game-simulator.js'
import { loadModel } from '../../src/ml/model-store.js'
import { getBestOpeningBook, getOpeningBook, getAllOpenings } from '../../src/engine/opening-book.js'
import type { AlignmentAttack, AlignmentStyle } from '../../src/types/index.js'

const uid = () => Math.random().toString(36).slice(2, 10)

describe('E2E Integration: Full Player Journey', () => {
  let pool: StockfishPool

  beforeAll(async () => {
    // Use in-memory DB for tests
    process.env.DB_PATH = ':memory:'
    initializeDb()

    pool = new StockfishPool(2, { requestTimeoutMs: 15000 })
    await pool.initialize()
  }, 30000)

  afterAll(async () => {
    await pool.shutdown()
  })

  it('should complete register -> create bot -> spar -> full cycle', async () => {
    const db = getDb()
    const authService = new AuthService(db)
    const botService = new BotService(db)
    const trainingService = new TrainingService(db, pool)

    // 1. Register
    const username = `player_${uid()}`
    const player = await authService.register(username, 'password123')
    expect(player.id).toBeGreaterThan(0)
    expect(player.username).toBe(username)

    // 2. Login
    const loggedIn = await authService.login(username, 'password123')
    expect(loggedIn.id).toBe(player.id)

    // 3. Create bot with aggressive tactical build
    const botName = `Warrior_${uid()}`
    const bot = botService.create({
      playerId: player.id,
      name: botName,
      aggression: 15,
      positional: 5,
      tactical: 15,
      endgame: 5,
      creativity: 10,
      alignmentAttack: 'aggressive' as AlignmentAttack,
      alignmentStyle: 'sacrificial' as AlignmentStyle,
    })
    expect(bot.id).toBeGreaterThan(0)
    expect(bot.level).toBe(1)
    expect(bot.elo).toBe(400)
    expect(bot.trainingPointsRemaining).toBe(10)

    // 4. Get bot
    const retrieved = botService.getById(bot.id)
    expect(retrieved).toBeTruthy()
    expect(retrieved!.name).toBe(botName)

    // 5. Get player's bots
    const playerBots = botService.getByPlayerId(player.id)
    expect(playerBots).toHaveLength(1)

    // 6. Bot params should reflect attributes
    const params = botToPlayParameters(retrieved!)
    expect(params.searchDepth).toBe(4) // level 1 base 3 + tactical focus bonus
    expect(params.aggressionWeight).toBeGreaterThan(0.7) // 15/20 + focus bonus + alignment
    expect(params.temperature).toBeGreaterThan(0.3) // creativity 10 + chaotic nope, sacrificial

    // 7. Spar (costs 2 points)
    const sparResult = await trainingService.spar(bot.id, 'system', 1)
    expect(sparResult.game.result).toMatch(/^(1-0|0-1|1\/2-1\/2)$/)
    expect(sparResult.game.moveCount).toBeGreaterThan(0)
    expect(sparResult.xpGained).toBe(20)
    expect(sparResult.trainingPointsRemaining).toBe(8)
    expect(sparResult.emotion).toBeTruthy()
    expect(sparResult.mlTraining.samplesUsed).toBeGreaterThan(0)

    // 8. ML model should now exist
    const mlModel = await loadModel(db, bot.id)
    expect(mlModel).toBeTruthy()

    // 9. Spar again
    const spar2 = await trainingService.spar(bot.id, 'system', 1)
    expect(spar2.trainingPointsRemaining).toBe(6)

    // 10. Purchase a tactic
    const purchaseResult = await trainingService.purchaseTactic(bot.id, 'italian_game')
    expect(purchaseResult.tactic.key).toBe('italian_game')
    expect(purchaseResult.tactic.proficiency).toBe(20)
    expect(purchaseResult.trainingPointsRemaining).toBe(3)

    // 11. Drill the tactic
    const drillResult = await trainingService.drill(bot.id, 'italian_game')
    expect(drillResult.tactic.proficiency).toBe(35) // 20 + 15
    expect(drillResult.trainingPointsRemaining).toBe(2)

    // 12. Verify tactic is listed
    const tactics = botService.getTactics(bot.id)
    expect(tactics).toHaveLength(1)
    expect(tactics[0].tacticKey).toBe('italian_game')

    // 13. Opening book should work with the owned tactic
    const openingBook = getBestOpeningBook(tactics)
    expect(openingBook).toBeTruthy()
    expect(openingBook!.key).toBe('italian_game')
    expect(openingBook!.proficiency).toBe(35)

    // 14. Training log should have all entries
    const log = trainingService.getTrainingLog(bot.id)
    expect(log.length).toBe(4) // 2 spars + 1 purchase + 1 drill

    // 15. Leaderboard should show our bot
    const leaderboard = botService.getLeaderboard(100, 0)
    expect(leaderboard.length).toBeGreaterThan(0)
    expect(leaderboard.some(b => b.name === botName)).toBeTruthy()

    // 16. One more spar to use up points (costs 2, have 2)
    const spar3 = await trainingService.spar(bot.id, 'system', 1)
    expect(spar3.trainingPointsRemaining).toBe(0)

    // 17. Not enough points to spar again (0 left)
    await expect(trainingService.spar(bot.id, 'system', 1))
      .rejects.toThrow('Not enough training points')
  }, 120000) // Allow 2 min for Stockfish games

  it('should enforce 3-bot limit per player', async () => {
    const db = getDb()
    const authService = new AuthService(db)
    const botService = new BotService(db)

    const player = await authService.register(`multi_${uid()}`, 'password123')
    const prefix = uid()

    const makeBot = (name: string) => botService.create({
      playerId: player.id, name,
      aggression: 10, positional: 10, tactical: 10, endgame: 10, creativity: 10,
      alignmentAttack: 'balanced' as AlignmentAttack,
      alignmentStyle: 'positional' as AlignmentStyle,
    })

    makeBot(`${prefix}_Bot1`)
    makeBot(`${prefix}_Bot2`)
    makeBot(`${prefix}_Bot3`)

    expect(() => makeBot(`${prefix}_Bot4`)).toThrow('maximum')
  })

  it('should simulate a complete game between two parameter sets', async () => {
    const white = systemBotPlayParameters(3)
    const black = systemBotPlayParameters(3)

    const result = await simulateGame(white, black, pool, { maxMoves: 100 })

    expect(result.pgn).toBeTruthy()
    expect(result.result).toMatch(/^(1-0|0-1|1\/2-1\/2)$/)
    expect(result.moveCount).toBeGreaterThan(0)
    expect(result.positions.length).toBeGreaterThan(0)
    expect(result.positions[0].fen).toBeTruthy()
    expect(result.positions[0].movePlayed).toBeTruthy()
  }, 60000)

  it('should validate bot attributes correctly', () => {
    const db = getDb()
    const botService = new BotService(db)

    // Sum not 50
    expect(botService.validateAttributes({
      playerId: 1, name: 'test',
      aggression: 10, positional: 10, tactical: 10, endgame: 10, creativity: 5,
      alignmentAttack: 'balanced' as AlignmentAttack,
      alignmentStyle: 'positional' as AlignmentStyle,
    })).toContain('must sum to 50')

    // Attribute out of range
    expect(botService.validateAttributes({
      playerId: 1, name: 'test',
      aggression: 25, positional: 5, tactical: 10, endgame: 5, creativity: 5,
      alignmentAttack: 'balanced' as AlignmentAttack,
      alignmentStyle: 'positional' as AlignmentStyle,
    })).toContain('between')
  })

  it('should provide opening book catalog', () => {
    const openings = getAllOpenings()
    expect(openings.length).toBeGreaterThanOrEqual(15)
    expect(openings.every(o => o.key && o.name && o.category && o.positionCount > 0)).toBe(true)
  })

  it('should match opening keys to openings data', () => {
    // Italian game should be an opening
    const book = getOpeningBook('italian_game', 50)
    expect(book).toBeTruthy()
    expect(book!.positions).toBeTruthy()
    expect(Object.keys(book!.positions).length).toBeGreaterThan(0)

    // Unknown key returns null
    expect(getOpeningBook('nonexistent', 50)).toBeNull()
  })
})
