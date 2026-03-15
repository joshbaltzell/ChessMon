import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initializeDb, getDb } from '../../src/db/connection.js'
import { CardService } from '../../src/services/card.service.js'
import { AuthService } from '../../src/services/auth.service.js'
import { BotService } from '../../src/services/bot.service.js'
import type { AlignmentAttack, AlignmentStyle } from '../../src/types/index.js'

const uid = () => Math.random().toString(36).slice(2, 10)

describe('CardService level filtering', () => {
  let cardService: CardService
  let botService: BotService
  let authService: AuthService
  let botId: number
  let playerId: number

  beforeAll(() => {
    process.env.DB_PATH = ':memory:'
    initializeDb(':memory:')
  })

  beforeEach(async () => {
    const db = getDb()
    cardService = new CardService(db)
    botService = new BotService(db)
    authService = new AuthService(db)

    // Create a test player and bot
    const player = await authService.register(`test_${uid()}`, 'password123')
    playerId = player.id
    const bot = botService.create({
      playerId,
      name: `TestBot_${uid()}`,
      aggression: 10, positional: 10, tactical: 10, endgame: 10, creativity: 10,
      alignmentAttack: 'balanced' as AlignmentAttack,
      alignmentStyle: 'positional' as AlignmentStyle,
    })
    botId = bot.id
  })

  describe('randomDrawFiltered', () => {
    it('level 1 bot should only draw sharpen, focus, rest cards', () => {
      const cards = cardService.randomDrawFiltered(100, 1)
      const uniqueKeys = new Set(cards.map(c => c.key))
      expect(uniqueKeys).toContain('sharpen')
      expect(uniqueKeys).toContain('focus')
      expect(uniqueKeys).toContain('rest')
      expect(uniqueKeys).not.toContain('iron_defense')     // unlocked at L2
      expect(uniqueKeys).not.toContain('tactical_focus')   // unlocked at L3
      expect(uniqueKeys).not.toContain('meditation')       // unlocked at L5
    })

    it('level 2 bot should also draw iron_defense, opening_prep, lucky_break', () => {
      const cards = cardService.randomDrawFiltered(100, 2)
      const uniqueKeys = new Set(cards.map(c => c.key))
      expect(uniqueKeys).toContain('sharpen')
      expect(uniqueKeys).toContain('focus')
      expect(uniqueKeys).toContain('rest')
      expect(uniqueKeys).toContain('iron_defense')
      expect(uniqueKeys).toContain('opening_prep')
      expect(uniqueKeys).toContain('lucky_break')
      expect(uniqueKeys).not.toContain('tactical_focus')   // unlocked at L3
    })

    it('level 3 bot should also draw tactical_focus, aggression_surge, scout, haste', () => {
      const cards = cardService.randomDrawFiltered(100, 3)
      const uniqueKeys = new Set(cards.map(c => c.key))
      expect(uniqueKeys).toContain('tactical_focus')
      expect(uniqueKeys).toContain('aggression_surge')
      expect(uniqueKeys).toContain('scout')
      expect(uniqueKeys).toContain('haste')
      expect(uniqueKeys).not.toContain('endgame_study')    // unlocked at L4
    })

    it('level 4 bot should also draw endgame_study and second_wind', () => {
      const cards = cardService.randomDrawFiltered(100, 4)
      const uniqueKeys = new Set(cards.map(c => c.key))
      expect(uniqueKeys).toContain('endgame_study')
      expect(uniqueKeys).toContain('second_wind')
      expect(uniqueKeys).not.toContain('meditation')       // unlocked at L5
      expect(uniqueKeys).not.toContain('adrenaline')       // unlocked at L5
    })

    it('level 5 bot should also draw meditation and adrenaline', () => {
      const cards = cardService.randomDrawFiltered(200, 5)
      const uniqueKeys = new Set(cards.map(c => c.key))
      expect(uniqueKeys).toContain('meditation')
      expect(uniqueKeys).toContain('adrenaline')
      expect(uniqueKeys).not.toContain('deep_thought')     // unlocked at L6
      expect(uniqueKeys.size).toBe(14)
    })

    it('level 6+ bot should draw all 15 card types', () => {
      const cards = cardService.randomDrawFiltered(200, 6)
      const uniqueKeys = new Set(cards.map(c => c.key))
      expect(uniqueKeys).toContain('deep_thought')
      expect(uniqueKeys.size).toBe(15)
    })

    it('should return HandCard objects with all required fields', () => {
      const cards = cardService.randomDrawFiltered(3, 1)
      expect(cards.length).toBe(3)
      for (const card of cards) {
        expect(card.id).toBeTruthy()
        expect(card.key).toBeTruthy()
        expect(card.name).toBeTruthy()
        expect(typeof card.energy).toBe('number')
        expect(card.type).toBeTruthy()
        expect(card.category).toBeTruthy()
        expect(card.color).toBeTruthy()
        expect(card.description).toBeTruthy()
      }
    })

    it('should return empty array when count is 0', () => {
      const cards = cardService.randomDrawFiltered(0, 5)
      expect(cards).toEqual([])
    })
  })

  describe('drawHand', () => {
    it('should start energy at 0', () => {
      const hand = cardService.drawHand(botId)
      expect(hand.energy).toBe(0)
    })

    it('should draw 7 cards', () => {
      const hand = cardService.drawHand(botId)
      expect(hand.cards.length).toBe(7)
    })

    it('should only draw level-appropriate cards for level 1 bot', () => {
      const hand = cardService.drawHand(botId)
      const invalidKeys = hand.cards.filter(c =>
        !['sharpen', 'focus', 'rest'].includes(c.key)
      )
      expect(invalidKeys).toHaveLength(0)
    })

    it('should throw for non-existent bot', () => {
      expect(() => cardService.drawHand(99999)).toThrow('Bot not found')
    })

    it('should include activeBuffs and activePowerups in state', () => {
      const hand = cardService.drawHand(botId)
      expect(hand.activeBuffs).toEqual([])
      expect(hand.activePowerups).toEqual([])
    })
  })

  describe('refreshHand', () => {
    it('should preserve current energy', () => {
      cardService.drawHand(botId)
      cardService.addEnergy(botId, 5)
      const hand = cardService.refreshHand(botId)
      expect(hand.energy).toBe(5)
      expect(hand.cards.length).toBe(7)
    })

    it('should draw new cards', () => {
      const original = cardService.drawHand(botId)
      const originalIds = original.cards.map(c => c.id)
      const refreshed = cardService.refreshHand(botId)
      const refreshedIds = refreshed.cards.map(c => c.id)
      // Cards should be different (new instance IDs)
      expect(refreshedIds).not.toEqual(originalIds)
    })

    it('should keep same round number', () => {
      const original = cardService.drawHand(botId)
      const refreshed = cardService.refreshHand(botId)
      expect(refreshed.roundNumber).toBe(original.roundNumber)
    })

    it('should auto-draw if no hand exists', () => {
      // No drawHand called first
      const hand = cardService.refreshHand(botId)
      expect(hand.cards.length).toBe(7)
      expect(hand.energy).toBe(0)
    })
  })

  describe('addEnergy', () => {
    it('should increment energy', () => {
      cardService.drawHand(botId)
      cardService.addEnergy(botId, 3)
      const hand = cardService.getHandState(botId)
      expect(hand.energy).toBe(3)
    })

    it('should accumulate energy across multiple calls', () => {
      cardService.drawHand(botId)
      cardService.addEnergy(botId, 2)
      cardService.addEnergy(botId, 3)
      const hand = cardService.getHandState(botId)
      expect(hand.energy).toBe(5)
    })

    it('should auto-create hand if none exists', () => {
      // No drawHand called first — addEnergy should handle it
      cardService.addEnergy(botId, 2)
      const hand = cardService.getHandState(botId)
      expect(hand.energy).toBe(2)
    })
  })

  describe('addCardToHand', () => {
    it('should add card when hand < 10', () => {
      cardService.drawHand(botId) // 7 cards
      const testCard = cardService.randomDrawFiltered(1, 1)[0]
      const added = cardService.addCardToHand(botId, testCard)
      expect(added).toBe(true)
      const hand = cardService.getHandState(botId)
      expect(hand.cards.length).toBe(8)
    })

    it('should return false when hand has 10 cards', () => {
      cardService.drawHand(botId) // 7 cards
      // Add 3 more to reach 10
      for (let i = 0; i < 3; i++) {
        const card = cardService.randomDrawFiltered(1, 1)[0]
        cardService.addCardToHand(botId, card)
      }
      const hand = cardService.getHandState(botId)
      expect(hand.cards.length).toBe(10)
      const result = cardService.addCardToHand(botId, cardService.randomDrawFiltered(1, 1)[0])
      expect(result).toBe(false)
      // Hand should still have 10
      const handAfter = cardService.getHandState(botId)
      expect(handAfter.cards.length).toBe(10)
    })

    it('added card should appear in hand state', () => {
      cardService.drawHand(botId)
      const testCard = cardService.randomDrawFiltered(1, 1)[0]
      cardService.addCardToHand(botId, testCard)
      const hand = cardService.getHandState(botId)
      const found = hand.cards.find(c => c.id === testCard.id)
      expect(found).toBeTruthy()
    })
  })

  describe('getWinStreak', () => {
    it('should return 0 for new bot hand', () => {
      cardService.drawHand(botId)
      expect(cardService.getWinStreak(botId)).toBe(0)
    })

    it('should return 0 if no hand exists', () => {
      expect(cardService.getWinStreak(botId)).toBe(0)
    })
  })

  describe('setWinStreak', () => {
    it('should update streak value', () => {
      cardService.drawHand(botId)
      cardService.setWinStreak(botId, 5)
      expect(cardService.getWinStreak(botId)).toBe(5)
    })

    it('should be able to reset streak to 0', () => {
      cardService.drawHand(botId)
      cardService.setWinStreak(botId, 3)
      cardService.setWinStreak(botId, 0)
      expect(cardService.getWinStreak(botId)).toBe(0)
    })
  })

  describe('consumeBuffsForFight', () => {
    it('should return empty buffs/powerups when none queued', () => {
      cardService.drawHand(botId)
      const { buffs, powerups } = cardService.consumeBuffsForFight(botId)
      expect(buffs).toEqual([])
      expect(powerups).toEqual([])
    })

    it('should return empty when no hand exists', () => {
      const { buffs, powerups } = cardService.consumeBuffsForFight(botId)
      expect(buffs).toEqual([])
      expect(powerups).toEqual([])
    })
  })
})
