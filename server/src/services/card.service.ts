import { eq } from 'drizzle-orm'
import { bots, cardHands } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'
import type { CardDefinition, HandCard, HandState } from '../types/index.js'
import { LEVEL_CONFIGS } from '../models/progression.js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load card definitions
const cardsData = JSON.parse(
  readFileSync(join(__dirname, '..', 'data', 'cards.json'), 'utf-8')
)
const CARD_DEFINITIONS: CardDefinition[] = cardsData.cards

// Build the card pool: each card appears `count` times
function buildCardPool(): CardDefinition[] {
  const pool: CardDefinition[] = []
  for (const def of CARD_DEFINITIONS) {
    for (let i = 0; i < def.count; i++) {
      pool.push(def)
    }
  }
  return pool
}

const CARD_POOL = buildCardPool()
const HAND_SIZE = 7

export class CardService {
  constructor(private db: DrizzleDb) {}

  /**
   * Get the current hand state for a bot. If no hand exists, auto-draw one.
   */
  getHandState(botId: number): HandState {
    let hand = this.db.select().from(cardHands).where(eq(cardHands.botId, botId)).get()

    if (!hand) {
      // Auto-draw first hand
      return this.drawHand(botId)
    }

    const cards: HandCard[] = JSON.parse(hand.handJson)
    return {
      cards,
      energy: hand.energy,
      maxEnergy: hand.maxEnergy,
      roundNumber: hand.roundNumber,
      cardsPlayed: hand.cardsPlayedThisRound,
    }
  }

  /**
   * Draw a new hand of 7 random cards. Energy starts at 0 (earned via Quick Spars).
   */
  drawHand(botId: number): HandState {
    const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
    if (!bot) throw new Error('Bot not found')

    const levelConfig = LEVEL_CONFIGS[bot.level]
    const maxEnergy = levelConfig?.trainingPoints ?? 10

    // Randomly select 7 level-filtered cards from the pool
    const hand = this.randomDrawFiltered(HAND_SIZE, bot.level)

    // Get current round number
    const existing = this.db.select().from(cardHands).where(eq(cardHands.botId, botId)).get()
    const roundNumber = existing ? existing.roundNumber + 1 : 1

    const handJson = JSON.stringify(hand)

    if (existing) {
      // Update existing hand
      this.db.update(cardHands)
        .set({
          handJson,
          energy: 0,
          maxEnergy,
          roundNumber,
          cardsPlayedThisRound: 0,
          createdAt: new Date(),
        })
        .where(eq(cardHands.botId, botId))
        .run()
    } else {
      // Insert new hand
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
    }
  }

  /**
   * Refresh hand — draws new cards using level-filtered pool but PRESERVES current energy.
   * Used by Rest card and "New Round" button.
   */
  refreshHand(botId: number): HandState {
    const existing = this.db.select().from(cardHands).where(eq(cardHands.botId, botId)).get()

    if (!existing) {
      // No hand exists yet — just draw a new one (energy starts at 0)
      return this.drawHand(botId)
    }

    const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
    if (!bot) throw new Error('Bot not found')

    const newCards = this.randomDrawFiltered(HAND_SIZE, bot.level)
    const handJson = JSON.stringify(newCards)

    this.db.update(cardHands)
      .set({
        handJson,
        // energy is NOT changed — preserved from current state
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
    }
  }

  /**
   * Increment energy in the card_hands row.
   */
  addEnergy(botId: number, amount: number): void {
    const existing = this.db.select().from(cardHands).where(eq(cardHands.botId, botId)).get()
    if (!existing) throw new Error('No hand found. Draw cards first.')

    this.db.update(cardHands)
      .set({
        energy: existing.energy + amount,
      })
      .where(eq(cardHands.botId, botId))
      .run()
  }

  /**
   * Append a card to the bot's hand if hand size < 10.
   * Returns true if added, false if hand is full.
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
   * Get win streak from card_hands row. Returns 0 if no hand exists.
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
   * Returns the card that was played and updated hand state.
   * Does NOT execute the card's effect — that's up to the caller.
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
      newEnergy = Math.min(handRow.maxEnergy + 2, handRow.energy + 1) // Allow going slightly over max
    } else {
      newEnergy -= card.energy
    }

    // Handle Rest card — discard hand and draw new one (level-filtered)
    if (card.key === 'rest') {
      const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
      const botLevel = bot?.level ?? 1
      const newCards = this.randomDrawFiltered(HAND_SIZE, botLevel)
      this.db.update(cardHands)
        .set({
          handJson: JSON.stringify(newCards),
          energy: newEnergy,
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
        },
      }
    }

    // Update hand in DB
    this.db.update(cardHands)
      .set({
        handJson: JSON.stringify(cards),
        energy: newEnergy,
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
      },
    }
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
    // Build a level-filtered pool respecting card counts
    const pool: CardDefinition[] = []
    for (const def of filteredDefs) {
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
        id: `${def.key}_${instanceCounts[def.key]}_${Date.now()}_${i}`,
        key: def.key,
        name: def.name,
        energy: def.energy,
        type: def.type as HandCard['type'],
        color: def.color,
        icon: def.icon,
        description: def.description,
        flavor: def.flavor,
      })
    }

    return hand
  }

  /**
   * Randomly draw `count` cards from the full pool (no level filtering).
   */
  private randomDraw(count: number): HandCard[] {
    const pool = [...CARD_POOL]
    const hand: HandCard[] = []
    const instanceCounts: Record<string, number> = {}

    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length)
      const def = pool.splice(idx, 1)[0]

      // Track instance number for unique IDs
      instanceCounts[def.key] = (instanceCounts[def.key] || 0) + 1

      hand.push({
        id: `${def.key}_${instanceCounts[def.key]}_${Date.now()}_${i}`,
        key: def.key,
        name: def.name,
        energy: def.energy,
        type: def.type as HandCard['type'],
        color: def.color,
        icon: def.icon,
        description: def.description,
        flavor: def.flavor,
      })
    }

    return hand
  }
}
