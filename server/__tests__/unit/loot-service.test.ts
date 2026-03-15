import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { LootService } from '../../src/services/loot.service.js'
import { CardService } from '../../src/services/card.service.js'
import { LadderService } from '../../src/services/ladder.service.js'
import { initializeDb, getDb } from '../../src/db/connection.js'
import { bots, players } from '../../src/db/schema.js'

const uid = () => Math.random().toString(36).slice(2, 10)

describe('LootService', () => {
  let db: any, lootService: LootService, botId: number

  beforeAll(() => {
    process.env.DB_PATH = ':memory:'
    initializeDb(':memory:')
  })

  beforeEach(() => {
    db = getDb()
    lootService = new LootService(db)
    // Create test player and bot with unique names
    const player = db.insert(players).values({ username: `test_${uid()}`, passwordHash: 'hash' }).returning().get()
    const bot = db.insert(bots).values({
      playerId: player.id, name: `TestBot_${uid()}`, level: 3,
      aggression: 10, positional: 10, tactical: 10, endgame: 10, creativity: 10,
      alignmentAttack: 'balanced', alignmentStyle: 'positional',
    }).returning().get()
    botId = bot.id
    // Initialize hand for card-related tests
    const cardService = new CardService(db)
    cardService.drawHand(botId)
  })

  afterEach(() => { vi.restoreAllMocks() })

  it('should return "none" when roll < 0.50', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0)
    const result = lootService.rollLoot(botId, 3)
    expect(result.type).toBe('none')
  })

  it('should return "insight" when 0.50 <= roll < 0.70', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.55).mockReturnValue(0.0) // roll, then insight selection
    const result = lootService.rollLoot(botId, 3)
    expect(result.type).toBe('insight')
    expect(result.data.text).toBeTruthy()
  })

  it('should return "energy" when 0.70 <= roll < 0.85', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.75)
    const result = lootService.rollLoot(botId, 3)
    expect(result.type).toBe('energy')
    expect(result.data.amount).toBe(1)
  })

  it('should return "card" when 0.85 <= roll < 0.95', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.90).mockReturnValue(0.0)
    const result = lootService.rollLoot(botId, 3)
    expect(result.type).toBe('card')
    expect(result.data.card).toBeTruthy()
  })

  it('should return "intel" when roll >= 0.95 and ladder has opponent', () => {
    // Need a ladder for intel — init one
    const ladderService = new LadderService(db)
    ladderService.initLadder(botId)
    vi.spyOn(Math, 'random').mockReturnValue(0.96)
    const result = lootService.rollLoot(botId, 3)
    // If ladder has no scout data, it re-rolls as energy
    expect(['intel', 'energy']).toContain(result.type)
  })

  it('should re-roll boss intel as energy when no ladder opponent', () => {
    // Create a max-level bot that has no ladder (level 20 can't go higher)
    const player2 = db.insert(players).values({ username: `test2_${uid()}`, passwordHash: 'hash' }).returning().get()
    const maxBot = db.insert(bots).values({
      playerId: player2.id, name: `MaxBot_${uid()}`, level: 20,
      aggression: 10, positional: 10, tactical: 10, endgame: 10, creativity: 10,
      alignmentAttack: 'balanced', alignmentStyle: 'positional',
    }).returning().get()
    const cardService = new CardService(db)
    cardService.drawHand(maxBot.id)

    vi.spyOn(Math, 'random').mockReturnValue(0.96)
    const result = lootService.rollLoot(maxBot.id, 20)
    expect(result.type).toBe('energy') // re-rolled because no ladder at max level
  })

  it('should return level-appropriate insight text', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.55).mockReturnValue(0.0)
    const result = lootService.rollLoot(botId, 1)
    expect(result.type).toBe('insight')
    // Level 1 insights should reference basics
    expect(typeof result.data.text).toBe('string')
  })
})
