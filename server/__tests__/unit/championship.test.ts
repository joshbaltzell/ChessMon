import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { ChampionshipService } from '../../src/services/championship.service.js'
import { CardService } from '../../src/services/card.service.js'
import { LadderService } from '../../src/services/ladder.service.js'
import { initializeDb, getDb } from '../../src/db/connection.js'
import { bots, players, championshipBouts, cardHands, ladderProgress } from '../../src/db/schema.js'
import { eq } from 'drizzle-orm'

const uid = () => Math.random().toString(36).slice(2, 10)

// Mock the TrainingService.cardSpar to avoid needing Stockfish
let mockCardSparResult: any = null

vi.mock('../../src/services/training.service.js', () => {
  class MockTrainingService {
    constructor(_db: any, _pool: any) {}
    async cardSpar() {
      if (!mockCardSparResult) throw new Error('mockCardSparResult not set')
      return mockCardSparResult
    }
  }
  return { TrainingService: MockTrainingService }
})

function makeCardSparResult(overrides: { result?: string; botPlayedWhite?: boolean; gameId?: number } = {}) {
  const result = overrides.result ?? '1-0'
  const botPlayedWhite = overrides.botPlayedWhite ?? true
  const gameId = overrides.gameId ?? Math.floor(Math.random() * 10000)
  return {
    game: {
      id: gameId,
      result,
      moveCount: 40,
      pgn: '1. e4 e5 2. Nf3 Nc6',
      botPlayedWhite,
      opponent: 'System Bot Level 2',
    },
    eloChange: 10,
    newElo: 410,
    xpGained: 5,
    mlTraining: { samplesUsed: 10, finalLoss: 0.5 },
    emotion: { text: 'Good game!', mood: 'happy' },
    recap: { summary: 'A close match.', keyMoments: [] },
  }
}

describe('ChampionshipService', () => {
  let db: any
  let service: ChampionshipService
  let cardService: CardService
  let ladderService: LadderService
  let botId: number
  const mockPool = {} as any

  beforeAll(() => {
    process.env.DB_PATH = ':memory:'
    initializeDb(':memory:')
  })

  beforeEach(() => {
    db = getDb()
    service = new ChampionshipService(db, mockPool)
    cardService = new CardService(db)
    ladderService = new LadderService(db)

    // Create test player and bot
    const player = db.insert(players).values({ username: `test_${uid()}`, passwordHash: 'hash' }).returning().get()
    const bot = db.insert(bots).values({
      playerId: player.id, name: `TestBot_${uid()}`, level: 1,
      aggression: 10, positional: 10, tactical: 10, endgame: 10, creativity: 10,
      alignmentAttack: 'balanced', alignmentStyle: 'positional',
    }).returning().get()
    botId = bot.id

    // Initialize hand for card service
    cardService.drawHand(botId)

    // Reset mock
    mockCardSparResult = null
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should not start bout if ladder is incomplete', () => {
    // Ladder auto-inits but none are defeated
    ladderService.initLadder(botId)
    expect(() => service.startBout(botId)).toThrow('Ladder is not complete')
  })

  it('should not start bout if one is already active', () => {
    // Complete the ladder first
    completeLadder(db, botId)

    service.startBout(botId)
    expect(() => service.startBout(botId)).toThrow('A championship bout is already active.')
  })

  it('should create active bout with round 1', () => {
    completeLadder(db, botId)

    const bout = service.startBout(botId)
    expect(bout.status).toBe('active')
    expect(bout.currentRound).toBe(1)
    expect(bout.gamesPlayed).toBe(0)
    expect(bout.gamesWon).toBe(0)
    expect(bout.targetLevel).toBe(2)
    expect(bout.roundTitle).toBe('The Opening')
  })

  it('should return null when no active bout exists', () => {
    const bout = service.getActiveBout(botId)
    expect(bout).toBeNull()
  })

  it('should allow resuming an active bout', () => {
    completeLadder(db, botId)
    const created = service.startBout(botId)

    const retrieved = service.getActiveBout(botId)
    expect(retrieved).not.toBeNull()
    expect(retrieved!.id).toBe(created.id)
    expect(retrieved!.status).toBe('active')
  })

  it('should play a round and record result', async () => {
    completeLadder(db, botId)
    service.startBout(botId)

    // Bot wins round 1
    mockCardSparResult = makeCardSparResult({ result: '1-0', botPlayedWhite: true, gameId: 101 })
    const result = await service.playRound(botId)

    expect(result.roundResult).toBe('win')
    expect(result.roundTitle).toBe('The Opening')
    expect(result.bout.gamesPlayed).toBe(1)
    expect(result.bout.gamesWon).toBe(1)
    expect(result.bout.status).toBe('active')
    expect(result.levelUp).toBe(false)
  })

  it('should declare won after 2 wins (level up)', async () => {
    completeLadder(db, botId)
    service.startBout(botId)

    // Win round 1
    mockCardSparResult = makeCardSparResult({ result: '1-0', botPlayedWhite: true, gameId: 201 })
    await service.playRound(botId)

    // Win round 2
    mockCardSparResult = makeCardSparResult({ result: '0-1', botPlayedWhite: false, gameId: 202 })
    const result = await service.playRound(botId)

    expect(result.bout.status).toBe('won')
    expect(result.bout.gamesWon).toBe(2)
    expect(result.levelUp).toBe(true)
    expect(result.newLevel).toBe(2)

    // Bot should have leveled up
    const bot = db.select().from(bots).where(eq(bots.id, botId)).get()
    expect(bot.level).toBe(2)
  })

  it('should declare lost after 2 losses (ladder reset)', async () => {
    completeLadder(db, botId)
    service.startBout(botId)

    // Lose round 1
    mockCardSparResult = makeCardSparResult({ result: '0-1', botPlayedWhite: true, gameId: 301 })
    await service.playRound(botId)

    // Lose round 2
    mockCardSparResult = makeCardSparResult({ result: '1-0', botPlayedWhite: false, gameId: 302 })
    const result = await service.playRound(botId)

    expect(result.bout.status).toBe('lost')
    expect(result.bout.gamesWon).toBe(0)
    expect(result.levelUp).toBe(false)

    // Bot should NOT have leveled up
    const bot = db.select().from(bots).where(eq(bots.id, botId)).get()
    expect(bot.level).toBe(1)
  })

  it('should grant +3 energy on loss', async () => {
    completeLadder(db, botId)
    service.startBout(botId)

    // Get energy before
    const handBefore = db.select().from(cardHands).where(eq(cardHands.botId, botId)).get()
    const energyBefore = handBefore.energy

    // Lose 2 rounds
    mockCardSparResult = makeCardSparResult({ result: '0-1', botPlayedWhite: true, gameId: 401 })
    await service.playRound(botId)
    mockCardSparResult = makeCardSparResult({ result: '1-0', botPlayedWhite: false, gameId: 402 })
    await service.playRound(botId)

    const handAfter = db.select().from(cardHands).where(eq(cardHands.botId, botId)).get()
    expect(handAfter.energy).toBe(energyBefore + 3)
  })

  it('should reset energy to 0 and refresh hand on win', async () => {
    completeLadder(db, botId)
    service.startBout(botId)

    // Add some energy first
    cardService.addEnergy(botId, 5)
    const handBefore = db.select().from(cardHands).where(eq(cardHands.botId, botId)).get()
    expect(handBefore.energy).toBe(5)

    // Win 2 rounds
    mockCardSparResult = makeCardSparResult({ result: '1-0', botPlayedWhite: true, gameId: 501 })
    await service.playRound(botId)
    mockCardSparResult = makeCardSparResult({ result: '0-1', botPlayedWhite: false, gameId: 502 })
    await service.playRound(botId)

    // Energy should be 0 after drawHand reset
    const handAfter = db.select().from(cardHands).where(eq(cardHands.botId, botId)).get()
    expect(handAfter.energy).toBe(0)
  })

  it('should return correct round narrative titles', async () => {
    completeLadder(db, botId)
    service.startBout(botId)

    // Round 1: "The Opening"
    mockCardSparResult = makeCardSparResult({ result: '1-0', botPlayedWhite: true, gameId: 601 })
    const r1 = await service.playRound(botId)
    expect(r1.roundTitle).toBe('The Opening')

    // Round 2: "The Counter"
    mockCardSparResult = makeCardSparResult({ result: '0-1', botPlayedWhite: true, gameId: 602 })
    const r2 = await service.playRound(botId)
    expect(r2.roundTitle).toBe('The Counter')

    // Round 3: "The Decider"
    mockCardSparResult = makeCardSparResult({ result: '1-0', botPlayedWhite: true, gameId: 603 })
    const r3 = await service.playRound(botId)
    expect(r3.roundTitle).toBe('The Decider')
  })

  it('should throw when playing round with no active bout', async () => {
    await expect(service.playRound(botId)).rejects.toThrow('No active championship bout.')
  })

  it('should handle win-loss-win sequence (3 games)', async () => {
    completeLadder(db, botId)
    service.startBout(botId)

    // Win
    mockCardSparResult = makeCardSparResult({ result: '1-0', botPlayedWhite: true, gameId: 701 })
    const r1 = await service.playRound(botId)
    expect(r1.bout.status).toBe('active')

    // Loss
    mockCardSparResult = makeCardSparResult({ result: '0-1', botPlayedWhite: true, gameId: 702 })
    const r2 = await service.playRound(botId)
    expect(r2.bout.status).toBe('active')
    expect(r2.bout.gamesWon).toBe(1)

    // Win -> bout won
    mockCardSparResult = makeCardSparResult({ result: '1-0', botPlayedWhite: true, gameId: 703 })
    const r3 = await service.playRound(botId)
    expect(r3.bout.status).toBe('won')
    expect(r3.bout.gamesWon).toBe(2)
    expect(r3.levelUp).toBe(true)
  })
})

/**
 * Helper: mark all ladder opponents as defeated so the ladder is complete.
 */
function completeLadder(db: any, botId: number) {
  const ladderService = new LadderService(db)
  ladderService.initLadder(botId)

  // Mark all 3 opponents as defeated
  const rows = db.select().from(ladderProgress).where(eq(ladderProgress.botId, botId)).all()
  for (const row of rows) {
    db.update(ladderProgress)
      .set({ defeated: 1, gameRecordId: row.id })
      .where(eq(ladderProgress.id, row.id))
      .run()
  }
}
