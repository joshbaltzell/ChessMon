import { eq } from 'drizzle-orm'
import { bots, cardHands } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'
import type { CardDefinition, HandCard, HandState } from '../types/index.js'
import type { ActiveBuff, ActivePowerup } from '../engine/buff-resolver.js'
import { LEVEL_CONFIGS } from '../models/progression.js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load card definitions (v2 — preparation + powerup + utility)
const cardsData = JSON.parse(
  readFileSync(join(__dirname, '..', 'data', 'cards-v2.json'), 'utf-8')
)
const CARD_DEFINITIONS: CardDefinition[] = cardsData.cards

const HAND_SIZE = 7

export class CardService {
  constructor(private db: DrizzleDb) {}

  /**
   * Get the current hand state for a bot. If no hand exists, auto-draw one.
   */
  getHandState(botId: number): HandState {
    let hand = this.db.select().from(cardHands).where(eq(cardHands.botId, botId)).get()

    if (!hand) {
      return this.drawHand(botId)
    }

    const cards: HandCard[] = JSON.parse(hand.handJson)
    const activeBuffs: ActiveBuff[] = JSON.parse(hand.activeBuffsJson || '[]')
    const activePowerups: ActivePowerup[] = JSON.parse(hand.activePowerupsJson || '[]')
    return {
      cards,
      energy: hand.energy,
      maxEnergy: hand.maxEnergy,
      roundNumber: hand.roundNumber,
      cardsPlayed: hand.cardsPlayedThisRound,
      activeBuffs,
      activePowerups,
    }
  }

  /**
   * Draw a new hand of 7 random cards. Energy starts at 0.
   */
  drawHand(botId: number): HandState {
    const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
    if (!bot) throw new Error('Bot not found')

    const levelConfig = LEVEL_CONFIGS[bot.level]
    const maxEnergy = levelConfig?.trainingPoints ?? 10

    const hand = this.randomDrawFiltered(HAND_SIZE, bot.level)

    const existing = this.db.select().from(cardHands).where(eq(cardHands.botId, botId)).get()
    const roundNumber = existing ? existing.roundNumber + 1 : 1

    const handJson = JSON.stringify(hand)

    if (existing) {
      this.db.update(cardHands)
        .set({
          handJson,
          energy: 0,
          maxEnergy,
          roundNumber,
          cardsPlayedThisRound: 0,
          activeBuffsJson: '[]',
          activePowerupsJson: '[]',
          createdAt: new Date(),
        })
        .where(eq(cardHands.botId, botId))
        .run()
    } else {
      this.db.insert(cardHands).values({
        botId,
        roundNumber,
        energy: 0,
        maxEnergy,
        handJson,
        cardsPlayedThisRound: 0,
      }).run()
    }

    return {
      cards: hand,
      energy: 0,
      maxEnergy,
      roundNumber,
      cardsPlayed: 0,
      activeBuffs: [],
      activePowerups: [],
    }
  }

  /**
   * Refresh hand — draws new cards but PRESERVES energy and queued buffs/powerups.
   */
  refreshHand(botId: number): HandState {
    const existing = this.db.select().from(cardHands).where(eq(cardHands.botId, botId)).get()

    if (!existing) {
      return this.drawHand(botId)
    }

    const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
    if (!bot) throw new Error('Bot not found')

    const newCards = this.randomDrawFiltered(HAND_SIZE, bot.level)
    const handJson = JSON.stringify(newCards)

    this.db.update(cardHands)
      .set({
        handJson,
        cardsPlayedThisRound: existing.cardsPlayedThisRound,
      })
      .where(eq(cardHands.botId, botId))
      .run()

    return {
      cards: newCards,
      energy: existing.energy,
      maxEnergy: existing.maxEnergy,
      roundNumber: existing.roundNumber,
      cardsPlayed: existing.cardsPlayedThisRound,
      activeBuffs: JSON.parse(existing.activeBuffsJson || '[]'),
      activePowerups: JSON.parse(existing.activePowerupsJson || '[]'),
    }
  }

  /**
   * Increment energy in the card_hands row.
   */
  addEnergy(botId: number, amount: number): void {
    let existing = this.db.select().from(cardHands).where(eq(cardHands.botId, botId)).get()
    if (!existing) {
      this.drawHand(botId)
      existing = this.db.select().from(cardHands).where(eq(cardHands.botId, botId)).get()
      if (!existing) return
    }

    this.db.update(cardHands)
      .set({
        energy: existing.energy + amount,
      })
      .where(eq(cardHands.botId, botId))
      .run()
  }

  /**
   * Append a card to the bot's hand if hand size < 10.
   */
  addCardToHand(botId: number, card: HandCard): boolean {
    const existing = this.db.select().from(cardHands).where(eq(cardHands.botId, botId)).get()
    if (!existing) return false

    const cards: HandCard[] = JSON.parse(existing.handJson)
    if (cards.length >= 10) return false

    cards.push(card)

    this.db.update(cardHands)
      .set({
        handJson: JSON.stringify(cards),
      })
      .where(eq(cardHands.botId, botId))
      .run()

    return true
  }

  /**
   * Get win streak from card_hands row.
   */
  getWinStreak(botId: number): number {
    const existing = this.db.select().from(cardHands).where(eq(cardHands.botId, botId)).get()
    if (!existing) return 0
    return existing.winStreak ?? 0
  }

  /**
   * Set win streak in card_hands row.
   */
  setWinStreak(botId: number, streak: number): void {
    this.db.update(cardHands)
      .set({ winStreak: streak })
      .where(eq(cardHands.botId, botId))
      .run()
  }

  /**
   * Play a card from the hand by card instance ID.
   * For prep/powerup cards, queues buffs/powerups instead of executing immediately.
   * For utility cards, executes immediately (focus, rest, scout).
   */
  playCard(botId: number, cardId: string): { card: HandCard; hand: HandState } {
    const handRow = this.db.select().from(cardHands).where(eq(cardHands.botId, botId)).get()
    if (!handRow) throw new Error('No hand found. Draw cards first.')

    const cards: HandCard[] = JSON.parse(handRow.handJson)
    const cardIndex = cards.findIndex(c => c.id === cardId)
    if (cardIndex === -1) throw new Error('Card not found in hand')

    const card = cards[cardIndex]

    // Check energy (Focus card adds energy instead of consuming it)
    if (card.key === 'focus') {
      // Focus gives +1 energy, costs 0
    } else if (handRow.energy < card.energy) {
      throw new Error(`Not enough energy. Need ${card.energy}, have ${handRow.energy}.`)
    }

    // Remove card from hand
    cards.splice(cardIndex, 1)

    // Update energy
    let newEnergy = handRow.energy
    if (card.key === 'focus') {
      newEnergy = Math.min(handRow.maxEnergy + 2, handRow.energy + 1)
    } else {
      newEnergy -= card.energy
    }

    // Parse current buffs/powerups
    const activeBuffs: ActiveBuff[] = JSON.parse(handRow.activeBuffsJson || '[]')
    const activePowerups: ActivePowerup[] = JSON.parse(handRow.activePowerupsJson || '[]')

    // Handle card by category
    if (card.category === 'preparation' && card.effect?.buff) {
      // Queue a preparation buff
      activeBuffs.push({
        id: card.id,
        key: card.key,
        name: card.name,
        icon: card.icon,
        buff: card.effect.buff,
        value: card.effect.value,
      })
    } else if (card.category === 'powerup' && card.effect?.powerup) {
      // Queue a powerup
      activePowerups.push({
        id: card.id,
        key: card.key,
        name: card.name,
        icon: card.icon,
        powerup: card.effect.powerup,
        depthBonus: card.effect.depthBonus,
        triggerMove: card.effect.triggerMove,
        uses: card.effect.uses,
        moves: card.effect.moves,
        multiPv: card.effect.multiPv,
      })
    }

    // Handle Rest card — discard hand and draw new one
    if (card.key === 'rest') {
      const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
      const botLevel = bot?.level ?? 1
      const newCards = this.randomDrawFiltered(HAND_SIZE, botLevel)
      this.db.update(cardHands)
        .set({
          handJson: JSON.stringify(newCards),
          energy: newEnergy,
          activeBuffsJson: JSON.stringify(activeBuffs),
          activePowerupsJson: JSON.stringify(activePowerups),
          cardsPlayedThisRound: handRow.cardsPlayedThisRound + 1,
        })
        .where(eq(cardHands.botId, botId))
        .run()

      return {
        card,
        hand: {
          cards: newCards,
          energy: newEnergy,
          maxEnergy: handRow.maxEnergy,
          roundNumber: handRow.roundNumber,
          cardsPlayed: handRow.cardsPlayedThisRound + 1,
          activeBuffs,
          activePowerups,
        },
      }
    }

    // Update hand in DB
    this.db.update(cardHands)
      .set({
        handJson: JSON.stringify(cards),
        energy: newEnergy,
        activeBuffsJson: JSON.stringify(activeBuffs),
        activePowerupsJson: JSON.stringify(activePowerups),
        cardsPlayedThisRound: handRow.cardsPlayedThisRound + 1,
      })
      .where(eq(cardHands.botId, botId))
      .run()

    return {
      card,
      hand: {
        cards,
        energy: newEnergy,
        maxEnergy: handRow.maxEnergy,
        roundNumber: handRow.roundNumber,
        cardsPlayed: handRow.cardsPlayedThisRound + 1,
        activeBuffs,
        activePowerups,
      },
    }
  }

  /**
   * Consume all active buffs and powerups for a fight.
   * Returns the buffs and powerups, then clears them from the DB.
   */
  consumeBuffsForFight(botId: number): { buffs: ActiveBuff[]; powerups: ActivePowerup[] } {
    const handRow = this.db.select().from(cardHands).where(eq(cardHands.botId, botId)).get()
    if (!handRow) return { buffs: [], powerups: [] }

    const buffs: ActiveBuff[] = JSON.parse(handRow.activeBuffsJson || '[]')
    const powerups: ActivePowerup[] = JSON.parse(handRow.activePowerupsJson || '[]')

    // Clear buffs and powerups after consumption
    if (buffs.length > 0 || powerups.length > 0) {
      this.db.update(cardHands)
        .set({
          activeBuffsJson: '[]',
          activePowerupsJson: '[]',
        })
        .where(eq(cardHands.botId, botId))
        .run()
    }

    return { buffs, powerups }
  }

  /**
   * Get all card definitions (for catalog/UI).
   */
  getCardDefinitions(): CardDefinition[] {
    return CARD_DEFINITIONS
  }

  /**
   * Draw `count` cards from the pool, filtered to only cards unlocked at or below `botLevel`.
   */
  randomDrawFiltered(count: number, botLevel: number): HandCard[] {
    const filteredDefs = CARD_DEFINITIONS.filter(def => (def.unlockedAtLevel || 1) <= botLevel)
    return this.drawFromPool(count, filteredDefs)
  }

  /**
   * Core draw logic: builds a weighted pool from definitions and draws cards.
   */
  private drawFromPool(count: number, definitions: CardDefinition[]): HandCard[] {
    const pool: CardDefinition[] = []
    for (const def of definitions) {
      for (let i = 0; i < def.count; i++) {
        pool.push(def)
      }
    }

    const hand: HandCard[] = []
    const instanceCounts: Record<string, number> = {}

    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length)
      const def = pool.splice(idx, 1)[0]

      instanceCounts[def.key] = (instanceCounts[def.key] || 0) + 1

      hand.push({
        id: `${def.key}_${instanceCounts[def.key]}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${i}`,
        key: def.key,
        name: def.name,
        energy: def.energy,
        category: def.category,
        type: def.type as HandCard['type'],
        color: def.color,
        icon: def.icon,
        description: def.description,
        flavor: def.flavor,
        effect: def.effect,
      })
    }

    return hand
  }
}
